import { Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { PgDataService } from '../../core/pg-data.service';
import { UiService } from '../../core/ui.service';
import { AnalyticsService } from '../../core/analytics.service';
import { dataUrlBase64, renderReceiptPng, type ReceiptInfo } from '../../core/receipt-image';

/**
 * Rent receipt (useful for HRA claims), including the payment screenshot.
 * "Share image" / "Download image" produce a PNG of the receipt (drawn on a canvas, see core/receipt-image.ts);
 * on phones it is written with Capacitor Filesystem and shared with Capacitor Share.
 */
@Component({
  selector: 'app-receipt',
  imports: [DatePipe, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent, IonButton, IonIcon, IonModal, IonSpinner],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/"></ion-back-button></ion-buttons>
        <ion-title>Rent receipt</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      @if (payment(); as p) {
        <div class="receipt" role="document" aria-label="Rent receipt">
          <div class="band">
            <h2>RENT RECEIPT</h2>
            <p>{{ property()?.name }}</p>
            <small>{{ p.receiptNo }}</small>
          </div>
          <div class="amount">
            <div><small>Amount received</small><strong>₹{{ p.amount.toLocaleString('en-IN') }}</strong></div>
            <span class="stamp" aria-label="Paid">PAID</span>
          </div>
          <table>
            <tr><td>Received from</td><td>{{ renterName() }}</td></tr>
            <tr><td>Room</td><td>{{ roomNumber() }}</td></tr>
            <tr><td>Period</td><td>{{ monthName() }}</td></tr>
            <tr><td>Payment mode</td><td>{{ p.method === 'upi' ? 'UPI' : 'Cash' }}</td></tr>
            @if (p.utr) { <tr><td>UPI reference</td><td>{{ p.utr }}</td></tr> }
            <tr><td>Paid on</td><td>{{ p.createdAt | date: 'd MMM y' }}</td></tr>
            @if (p.decidedAt) { <tr><td>Approved on</td><td>{{ p.decidedAt | date: 'd MMM y' }}</td></tr> }
            <tr><td>Premises</td><td>{{ property()?.name }}, {{ property()?.address }}</td></tr>
          </table>

          @if (p.proofPhoto) {
            <h3>Payment proof</h3>
            <button type="button" class="proof" (click)="zoom.set(true)" aria-label="Open payment screenshot full screen">
              <img [src]="p.proofPhoto" alt="Payment screenshot attached by the renter" />
              <span>Tap to enlarge</span>
            </button>
          }
          <p class="sig">Received with thanks. Confirmed digitally by the owner via PG Manager.</p>
        </div>

        <ion-button expand="block" (click)="shareImage()" [disabled]="busy()">
          <ion-icon slot="start" name="share-social-outline" aria-hidden="true"></ion-icon> Share image
        </ion-button>
        <ion-button expand="block" fill="outline" (click)="downloadImage()" [disabled]="busy()">
          <ion-icon slot="start" name="download-outline" aria-hidden="true"></ion-icon> Download image
        </ion-button>
        @if (busy()) { <div class="ion-text-center"><ion-spinner aria-label="Creating image"></ion-spinner></div> }

        <ion-modal [isOpen]="zoom()" (didDismiss)="zoom.set(false)">
          <ng-template>
            <ion-header>
              <ion-toolbar color="dark">
                <ion-title>Payment proof</ion-title>
                <ion-buttons slot="end"><ion-button (click)="zoom.set(false)">Close</ion-button></ion-buttons>
              </ion-toolbar>
            </ion-header>
            <ion-content color="dark"><img class="full" [src]="p.proofPhoto" alt="Payment screenshot, full size" /></ion-content>
          </ng-template>
        </ion-modal>
      } @else {
        <p class="ion-text-center">A receipt is available once the owner approves the payment.</p>
      }
    </ion-content>
  `,
  styles: `
    .receipt { border:1px solid var(--ion-color-light-shade); border-radius:12px; overflow:hidden; margin-bottom:16px; color: var(--ion-text-color); }
    .band { background: var(--ion-color-primary); color:#fff; text-align:center; padding:16px; }
    .band h2 { letter-spacing:2px; margin:0; font-weight:800; }
    .band p { margin:4px 0 2px; } .band small { opacity:.85; }
    .amount { display:flex; justify-content:space-between; align-items:center; padding:16px; border-bottom:1px dashed var(--ion-color-light-shade); }
    .amount small { display:block; color: var(--ion-color-medium-shade); }
    .amount strong { font-size:2em; font-weight:800; }
    .stamp { border:3px solid #1e8e3e; color:#1e8e3e; font-weight:800; font-size:1.3em; padding:2px 12px; border-radius:8px; transform:rotate(-10deg); }
    table { width:100%; padding:8px 16px; border-collapse:separate; border-spacing:0 6px; }
    td { vertical-align:top; } td:first-child { color: var(--ion-color-medium-shade); padding-right:12px; white-space:nowrap; }
    td:last-child { text-align:right; font-weight:600; }
    h3 { margin:8px 16px; font-size:1em; font-weight:700; }
    .proof { display:block; width:calc(100% - 32px); margin:0 16px; padding:0; border:1px solid var(--ion-color-light-shade); border-radius:8px; overflow:hidden; background:#f4f4f4; position:relative; }
    .proof img { display:block; width:100%; max-height:360px; object-fit:contain; }
    .proof span { position:absolute; right:8px; bottom:8px; background:rgba(0,0,0,.6); color:#fff; padding:2px 8px; border-radius:999px; font-size:.8em; }
    .sig { font-size:.8em; color: var(--ion-color-medium-shade); text-align:center; padding:8px 16px 16px; margin:0; }
    .full { width:100%; height:100%; object-fit:contain; }
  `,
})
export class ReceiptPage {
  readonly id = input.required<string>();
  private readonly auth = inject(AuthService);
  private readonly data = inject(PgDataService);
  private readonly ui = inject(UiService);
  private readonly analytics = inject(AnalyticsService);
  readonly property = toSignal(this.data.property$());
  private readonly payments = toSignal(this.data.payments$(), { initialValue: [] });
  private readonly renters = toSignal(this.data.renters$(), { initialValue: [] });
  private readonly rooms = toSignal(this.data.rooms$(), { initialValue: [] });
  readonly busy = signal(false);
  readonly zoom = signal(false);

  readonly payment = computed(() => this.payments().find((p) => p.id === this.id() && p.status === 'confirmed'));
  private readonly renter = computed(() => this.renters().find((r) => r.id === this.payment()?.renterId));
  readonly renterName = computed(() => this.renter()?.name ?? '');
  readonly roomNumber = computed(() => this.rooms().find((r) => r.id === this.renter()?.roomId)?.number ?? '–');
  readonly monthName = computed(() => {
    const m = this.payment()?.month;
    return m ? new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '';
  });

  private info(): ReceiptInfo {
    const p = this.payment()!;
    return {
      receiptNo: p.receiptNo ?? '',
      pgName: this.property()?.name ?? '',
      pgAddress: this.property()?.address ?? '',
      renterName: this.renterName(),
      roomNumber: this.roomNumber(),
      period: this.monthName(),
      amount: p.amount,
      method: p.method,
      utr: p.utr,
      paidOn: p.createdAt,
      approvedOn: p.decidedAt ?? null,
      proofPhoto: p.proofPhoto,
    };
  }

  private fileName(): string {
    return `${this.payment()?.receiptNo || 'rent-receipt'}.png`;
  }

  /** Share the PNG with WhatsApp, Gmail, Drive… (native share sheet, or the browser's if it supports files). */
  async shareImage(): Promise<void> {
    await this.withBusy(async () => {
      const png = await renderReceiptPng(this.info());
      this.analytics.track('receipt_shared', { role: this.auth.role() ?? '', as: 'image' });
      if (Capacitor.isNativePlatform()) {
        const file = await Filesystem.writeFile({ path: this.fileName(), data: dataUrlBase64(png), directory: Directory.Cache });
        await Share.share({ title: 'Rent receipt', files: [file.uri], dialogTitle: 'Share receipt' });
        return;
      }
      const blob = await (await fetch(png)).blob();
      const file = new File([blob], this.fileName(), { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Rent receipt' });
      } else {
        this.downloadInBrowser(png);
        await this.ui.toast('Sharing images is not supported here, so the receipt was downloaded instead.', 'medium');
      }
    });
  }

  /** Save the PNG: Documents/receipts on a phone, the Downloads folder in a browser. */
  async downloadImage(): Promise<void> {
    await this.withBusy(async () => {
      const png = await renderReceiptPng(this.info());
      if (Capacitor.isNativePlatform()) {
        await Filesystem.writeFile({
          path: `receipts/${this.fileName()}`,
          data: dataUrlBase64(png),
          directory: Directory.Documents,
          recursive: true,
        });
        await this.ui.toast(`Saved to Documents/receipts/${this.fileName()}`);
      } else {
        this.downloadInBrowser(png);
        await this.ui.toast('Receipt image downloaded');
      }
    });
  }

  private downloadInBrowser(dataUrl: string): void {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = this.fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  private async withBusy(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await fn();
    } catch (e) {
      if (!/abort|cancel/i.test(String((e as Error)?.message ?? e))) await this.ui.toast('Could not create the receipt image.', 'danger');
    } finally {
      this.busy.set(false);
    }
  }
}
