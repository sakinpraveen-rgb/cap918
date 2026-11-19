import { Injectable, inject } from '@angular/core';
import { liveQuery } from 'dexie';
import { from, type Observable } from 'rxjs';
import { DbService } from './db.service';
import { Hlc } from './hlc';
import { mergeRecord, stamp } from './merge';
import type { SyncedRecord, TableName } from './models';

export function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Single write path for all domain data.
 * Each write: stamps changed fields with an HLC, merges into the local row, and queues an outbox entry
 * for the SyncService. Works identically online and offline.
 */
@Injectable({ providedIn: 'root' })
export class RepoService {
  private readonly db = inject(DbService);
  readonly hlc = new Hlc(this.deviceId());

  /** Observable that re-emits whenever the underlying IndexedDB data changes. */
  live<T>(query: () => Promise<T>): Observable<T> {
    return from(liveQuery(query));
  }

  async save<T extends SyncedRecord>(table: TableName, patch: Partial<T> & { id?: string }): Promise<T> {
    const id = patch.id ?? uuid();
    const tbl = this.db.tbl<T>(table);
    const { _hlc: _ignored, ...fields } = patch as Partial<T> & { _hlc?: unknown };
    const incoming = { ...fields, id, _hlc: stamp(fields, () => this.hlc.now()) } as unknown as T;

    await this.db.transaction('rw', tbl, this.db.outbox, async () => {
      const existing = await tbl.get(id);
      await tbl.put(mergeRecord(existing, incoming));
      await this.db.outbox.add({ table, id, createdAt: Date.now() });
    });
    return (await tbl.get(id)) as T;
  }

  /** Soft delete, so the deletion itself syncs and merges like any other field. */
  remove(table: TableName, id: string): Promise<SyncedRecord> {
    return this.save(table, { id, deleted: true } as Partial<SyncedRecord> & { id: string });
  }

  private deviceId(): string {
    const KEY = 'pg.deviceId';
    try {
      let id = localStorage.getItem(KEY);
      if (!id) {
        id = uuid().slice(0, 8);
        localStorage.setItem(KEY, id);
      }
      return id;
    } catch {
      return uuid().slice(0, 8);
    }
  }
}
