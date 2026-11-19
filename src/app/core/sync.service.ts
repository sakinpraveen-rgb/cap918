import { Injectable, inject, signal } from '@angular/core';
import { Network } from '@capacitor/network';
import { App } from '@capacitor/app';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { DbService } from './db.service';
import { mergeRecord } from './merge';
import { SYNCED_TABLES, type SyncedRecord, type TableName } from './models';
import { RepoService } from './repo.service';
import { SupabaseService } from './supabase.service';
import { CrashService } from './crash.service';

interface ServerRow {
  table_name: TableName;
  id: string;
  data: SyncedRecord;
  field_hlc: Record<string, string>;
  server_seq: number;
}

const PAGE = 500;

/**
 * Outbox/pull sync against the `records` table in Supabase (see supabase/migrations).
 *  push: send every queued record; the server merges field-by-field with the same HLC rule.
 *  pull: fetch rows with server_seq > cursor and merge them into IndexedDB.
 * Runs on app start, when the network comes back, every 60 s while open, and after each local write.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly db = inject(DbService);
  private readonly repo = inject(RepoService);
  private readonly sb = inject(SupabaseService);
  private readonly crash = inject(CrashService);

  readonly online = signal(true);
  readonly syncing = signal(false);
  readonly pending = signal(0);
  readonly lastSyncedAt = signal<Date | null>(null);
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  private listening = false;
  private channel: RealtimeChannel | null = null;

  /**
   * Start syncing for one PG. Triggers, fastest first:
   *  1. Supabase Realtime: another device wrote to this PG → pull within ~1 s (owner approves → renter sees it).
   *  2. Local write → push after 1.5 s (debounced).
   *  3. App returns to the foreground, or the network comes back.
   *  4. Every 60 s as a safety net.
   */
  async start(propertyId: string): Promise<void> {
    const status = await Network.getStatus();
    this.online.set(status.connected);
    if (!this.listening) {
      this.listening = true;
      await Network.addListener('networkStatusChange', (s) => {
        this.online.set(s.connected);
        if (s.connected) void this.syncNow();
      });
      await App.addListener('resume', () => void this.syncNow());
      this.db.outbox.hook('creating', () => {
        setTimeout(() => void this.refreshPending().then(() => this.syncSoon()), 0);
      });
    }
    this.subscribeRealtime(propertyId);
    this.timer ??= setInterval(() => void this.syncNow(), 60_000);
    await this.refreshPending();
    void this.syncNow();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.channel) void this.sb.client?.removeChannel(this.channel);
    this.channel = null;
  }

  /** Row-level security applies to Realtime too, so a renter is only woken by rows they may read. */
  private subscribeRealtime(propertyId: string): void {
    if (!this.sb.client || this.channel) return;
    this.channel = this.sb.client
      .channel(`pg-${propertyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `property_id=eq.${propertyId}` }, () =>
        this.pullSoon(),
      )
      .subscribe();
  }

  private pullDebounce: ReturnType<typeof setTimeout> | null = null;
  private pullSoon(): void {
    if (this.pullDebounce) clearTimeout(this.pullDebounce);
    this.pullDebounce = setTimeout(() => void this.syncNow(), 300);
  }

  private debounce: ReturnType<typeof setTimeout> | null = null;
  private syncSoon(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.syncNow(), 1500);
  }

  /** Safe to call any time; concurrent calls share one run. */
  syncNow(): Promise<void> {
    if (!this.sb.client || !this.online()) return Promise.resolve();
    this.running ??= this.run().finally(() => (this.running = null));
    return this.running;
  }

  private async run(): Promise<void> {
    this.syncing.set(true);
    try {
      await this.push();
      await this.pull();
      this.lastSyncedAt.set(new Date());
    } catch (e) {
      this.crash.capture(e, { area: 'sync' });
    } finally {
      this.syncing.set(false);
      await this.refreshPending();
    }
  }

  private async push(): Promise<void> {
    const entries = await this.db.outbox.orderBy('seq').limit(PAGE).toArray();
    if (!entries.length) return;

    // Collapse many edits of the same record into one upload of its current merged state.
    const unique = new Map<string, { table: TableName; id: string }>();
    for (const e of entries) unique.set(`${e.table}:${e.id}`, e);

    const changes = [];
    for (const { table, id } of unique.values()) {
      const row = await this.db.tbl<SyncedRecord>(table).get(id);
      if (row) changes.push({ table_name: table, id, data: row, field_hlc: row._hlc });
    }

    const { error } = await this.sb.client!.rpc('sync_push', { changes });
    if (error) throw error;

    const maxSeq = entries[entries.length - 1].seq!;
    await this.db.outbox.where('seq').belowOrEqual(maxSeq).delete();
    if (entries.length === PAGE) await this.push();
  }

  private async pull(): Promise<void> {
    let cursor = (await this.db.getMeta<number>('sync.cursor')) ?? 0;
    for (;;) {
      const { data, error } = await this.sb
        .client!.from('records')
        .select('table_name,id,data,field_hlc,server_seq')
        .gt('server_seq', cursor)
        .order('server_seq')
        .limit(PAGE);
      if (error) throw error;
      const rows = (data ?? []) as ServerRow[];
      if (!rows.length) break;

      await this.db.transaction('rw', [...SYNCED_TABLES.map((t) => this.db.tbl(t)), this.db.meta], async () => {
        for (const r of rows) {
          if (!SYNCED_TABLES.includes(r.table_name)) continue;
          const remote = { ...r.data, id: r.id, _hlc: r.field_hlc } as SyncedRecord;
          const tbl = this.db.tbl<SyncedRecord>(r.table_name);
          await tbl.put(mergeRecord(await tbl.get(r.id), remote));
          for (const h of Object.values(r.field_hlc)) this.repo.hlc.receive(h);
        }
        cursor = rows[rows.length - 1].server_seq;
        await this.db.setMeta('sync.cursor', cursor);
      });
      if (rows.length < PAGE) break;
    }
  }

  private async refreshPending(): Promise<void> {
    this.pending.set(await this.db.outbox.count());
  }
}
