import { Injectable, inject } from '@angular/core';
import { ActionSheetController, AlertController } from '@ionic/angular';
import { RepoService } from './repo.service';
import { UiService } from './ui.service';
import { AnalyticsService } from './analytics.service';
import type { Payment } from './models';

export const REJECT_REASONS = [
  'Amount not received in my account',
  'Wrong amount paid',
  'Screenshot or UTR unclear',
  'Duplicate of another payment',
];

/**
 * The one place where an owner approves or rejects a payment, so the notification screen,
 * the payment screen and the renter's page all behave the same.
 * Writing decidedAt + rejectReason is what makes the renter's notification appear (see inbox.ts).
 */
@Injectable({ providedIn: 'root' })
export class PaymentDecisionService {
  private readonly repo = inject(RepoService);
  private readonly ui = inject(UiService);
  private readonly analytics = inject(AnalyticsService);
  private readonly alertCtrl = inject(AlertController);
  private readonly sheetCtrl = inject(ActionSheetController);

  /** Confirm with the owner, then approve. Returns true if approved. */
  async approve(p: Payment, renterName: string): Promise<boolean> {
    const ok = await this.ui.confirm(
      'Approve payment?',
      `₹${p.amount.toLocaleString('en-IN')} from ${renterName}${p.utr ? ` (UTR ${p.utr})` : ''}. A receipt will be sent to the renter.`,
      'Approve',
    );
    if (!ok) return false;
    await this.repo.save<Payment>('payments', {
      id: p.id,
      status: 'confirmed',
      decidedAt: new Date().toISOString(),
      rejectReason: null,
      receiptNo: p.receiptNo ?? `RCPT-${p.month.replace('-', '')}-${p.id.slice(0, 6).toUpperCase()}`,
    });
    this.analytics.track('payment_confirmed');
    await this.ui.toast('Approved. Renter notified and receipt created.');
    return true;
  }

  /** Ask for a reason (action sheet of common reasons, or type one), then reject. Returns true if rejected. */
  async reject(p: Payment): Promise<boolean> {
    const sheet = await this.sheetCtrl.create({
      header: 'Why are you rejecting it?',
      subHeader: 'The renter will see this reason.',
      buttons: [
        ...REJECT_REASONS.map((r) => ({ text: r, data: r })),
        { text: 'Other reason…', data: '__other__' },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data, role } = await sheet.onDidDismiss<string>();
    if (role === 'cancel' || role === 'backdrop' || !data) return false;

    let reason = data;
    if (data === '__other__') {
      const alert = await this.alertCtrl.create({
        header: 'Reason for rejecting',
        inputs: [{ name: 'reason', type: 'textarea', placeholder: 'e.g. Paid ₹500 less than due' }],
        buttons: [{ text: 'Cancel', role: 'cancel' }, { text: 'Reject', role: 'confirm' }],
      });
      await alert.present();
      const res = await alert.onDidDismiss();
      reason = String(res.data?.values?.reason ?? '').trim();
      if (res.role !== 'confirm' || !reason) return false;
    }

    await this.repo.save<Payment>('payments', {
      id: p.id,
      status: 'rejected',
      decidedAt: new Date().toISOString(),
      rejectReason: reason,
      receiptNo: null,
    });
    this.analytics.track('payment_rejected');
    await this.ui.toast('Rejected. Renter notified with your reason.', 'medium');
    return true;
  }
}
