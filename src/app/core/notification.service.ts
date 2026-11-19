import { Injectable, inject } from '@angular/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { AnalyticsService } from './analytics.service';
import type { Dues } from './dues';

const OWNER_DIGEST_ID = 5001;
const RENTER_EARLY_ID = 6001;
const RENTER_DUE_ID = 6002;

/**
 * Reminders are scheduled on the device with local notifications, so they fire even with no internet.
 *  - Owner: one digest 5 days before the due day: "6 of 24 renters pending, ₹38,500".
 *    Content changes as people pay, so it's re-scheduled whenever dues change.
 *  - Renter: monthly reminder 5 days before + on the due day (only if something is still due).
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly analytics = inject(AnalyticsService);
  private lastKey = '';

  async ensurePermission(): Promise<boolean> {
    try {
      const p = await LocalNotifications.checkPermissions();
      if (p.display === 'granted') return true;
      return (await LocalNotifications.requestPermissions()).display === 'granted';
    } catch {
      return false; // web without Notification API
    }
  }

  async scheduleOwnerDigest(dueDay: number, pendingCount: number, totalRenters: number, pendingAmount: number): Promise<void> {
    const at = nextOccurrence(dueDay - 5);
    const key = `o:${at.toISOString()}:${pendingCount}:${pendingAmount}`;
    if (key === this.lastKey || !(await this.ensurePermission())) return;
    this.lastKey = key;
    await this.cancel([OWNER_DIGEST_ID]);
    await LocalNotifications.schedule({
      notifications: [
        {
          id: OWNER_DIGEST_ID,
          title: 'Rent due in 5 days',
          body:
            pendingCount === 0
              ? 'Everyone has paid this month 🎉'
              : `${pendingCount} of ${totalRenters} renters pending · ₹${pendingAmount.toLocaleString('en-IN')}`,
          schedule: { at, allowWhileIdle: true },
          extra: { route: '/owner/dues' },
        },
      ],
    });
    this.analytics.track('reminder_scheduled', { kind: 'owner_digest' });
  }

  async scheduleRenterReminders(dueDay: number, dues: Dues | null): Promise<void> {
    const key = `r:${dueDay}:${dues?.balance ?? 0}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    await this.cancel([RENTER_EARLY_ID, RENTER_DUE_ID]);
    if (!dues || dues.balance === 0 || !(await this.ensurePermission())) return;
    const amt = `₹${dues.balance.toLocaleString('en-IN')}`;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: RENTER_EARLY_ID,
          title: 'Rent due in 5 days',
          body: `${amt} (rent + mess) is due on the ${ordinal(dueDay)}. Tap to pay via UPI.`,
          schedule: { at: nextOccurrence(dueDay - 5), allowWhileIdle: true },
          extra: { route: '/renter/home' },
        },
        {
          id: RENTER_DUE_ID,
          title: 'Rent due today',
          body: `${amt} is due today. Pay now to avoid a late fee.`,
          schedule: { at: nextOccurrence(dueDay), allowWhileIdle: true },
          extra: { route: '/renter/home' },
        },
      ],
    });
    this.analytics.track('reminder_scheduled', { kind: 'renter' });
  }

  private async cancel(ids: number[]): Promise<void> {
    try {
      await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
    } catch {
      /* nothing scheduled */
    }
  }
}

/** Next date (9 am) falling on `day` of a month. Day ≤ 0 rolls back into the previous month. */
export function nextOccurrence(day: number, from: Date = new Date()): Date {
  for (let add = 0; add < 3; add++) {
    const d = new Date(from.getFullYear(), from.getMonth() + add, day, 9, 0, 0);
    if (d > from) return d;
  }
  return new Date(from.getTime() + 86_400_000);
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
