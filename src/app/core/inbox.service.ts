import { Injectable, computed, effect, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, map, of, switchMap } from 'rxjs';
import { LocalNotifications } from '@capacitor/local-notifications';
import { AuthService } from './auth.service';
import { DbService } from './db.service';
import { PgDataService } from './pg-data.service';
import { RepoService } from './repo.service';
import { buildNotifications } from './inbox';
import type { AppNotification } from './models';

/**
 * The notification centre for the logged-in user.
 *  - `items` is a live signal: it updates the moment a payment changes locally or arrives through sync.
 *  - Read state is stored per user on the device (DB meta key `inbox.read.<userId>`).
 *  - New notifications that arrive while the app is open also pop up as a phone notification.
 */
@Injectable({ providedIn: 'root' })
export class InboxService {
  private readonly auth = inject(AuthService);
  private readonly db = inject(DbService);
  private readonly data = inject(PgDataService);
  private readonly repo = inject(RepoService);

  private readKey = (userId: string) => `inbox.read.${userId}`;
  private alertedKey = (userId: string) => `inbox.alerted.${userId}`;

  readonly items = toSignal(
    toObservable(this.auth.session).pipe(
      switchMap((s) => {
        if (!s) return of([] as AppNotification[]);
        const read$ = this.repo.live(async () => new Set((await this.db.getMeta<string[]>(this.readKey(s.userId))) ?? []));
        return combineLatest([this.data.payments$(), this.data.renters$(), this.data.rooms$(), read$]).pipe(
          map(([payments, renters, rooms, read]) => buildNotifications(s.role, s.renterId, payments, renters, rooms, read)),
        );
      }),
    ),
    { initialValue: [] as AppNotification[] },
  );

  readonly unreadCount = computed(() => this.items().filter((n) => !n.read).length);
  readonly actionCount = computed(() => this.items().filter((n) => n.actionNeeded).length);

  constructor() {
    effect(() => void this.alertNew(this.items()));
  }

  async markRead(ids: string[]): Promise<void> {
    const s = this.auth.session();
    if (!s || !ids.length) return;
    const key = this.readKey(s.userId);
    const read = new Set((await this.db.getMeta<string[]>(key)) ?? []);
    const before = read.size;
    ids.forEach((id) => read.add(id));
    if (read.size !== before) await this.db.setMeta(key, [...read]);
  }

  markAllRead(): Promise<void> {
    return this.markRead(this.items().filter((n) => !n.read).map((n) => n.id));
  }

  /** Mark every notification about one payment as read (used when the payment screen is opened). */
  markPaymentRead(paymentId: string): Promise<void> {
    return this.markRead(this.items().filter((n) => n.paymentId === paymentId && !n.read).map((n) => n.id));
  }

  /**
   * Phone notification for items that appeared since we last looked.
   * On the first run for a user everything existing is treated as already alerted (no flood of old items).
   */
  private async alertNew(items: AppNotification[]): Promise<void> {
    const s = this.auth.session();
    if (!s) return;
    const key = this.alertedKey(s.userId);
    const known = await this.db.getMeta<string[]>(key);
    const ids = items.map((n) => n.id);
    if (!known) {
      await this.db.setMeta(key, ids);
      return;
    }
    const knownSet = new Set(known);
    const fresh = items.filter((n) => !knownSet.has(n.id) && !n.read);
    if (!fresh.length) return;
    await this.db.setMeta(key, [...knownSet, ...fresh.map((n) => n.id)]);
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') return;
      await LocalNotifications.schedule({
        notifications: fresh.slice(0, 5).map((n) => ({
          id: Math.abs(hash(n.id)),
          title: n.title,
          body: n.body,
          extra: { route: `/payment/${n.paymentId}` },
        })),
      });
    } catch {
      /* notifications unavailable (e.g. browser without permission); the in-app inbox still shows them */
    }
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h % 2_000_000_000;
}
