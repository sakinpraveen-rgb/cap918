import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe, NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { PgDataService } from '../../core/pg-data.service';
import { InboxService } from '../../core/inbox.service';
import { PaymentDecisionService } from '../../core/payment-decision.service';
import { computeDues } from '../../core/dues';
import { StatusChipComponent } from '../../components/status-chip.component';

/**
 * One payment, for both roles.
 *  Owner + pending:  proof screenshot (tap to enlarge), UTR, this month's dues → Approve / Reject.
 *  Renter:           where the payment is (Submitted → Approved / Rejected), reason, receipt, "Pay again".
 * Opening this screen marks its notifications as read.
 */
@Component({
  selector: 'app-payment',
  imports: [
    DatePipe, NgClass, RouterLink, StatusChipComponent,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonButton, IonContent, IonCard, IonCardContent, IonList,
    IonItem, IonLabel, IonNote, IonIcon, IonText, IonModal, IonSpinner,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button [defaultHref]="isOwner() ? '/owner/notifications' : '/renter/notifications'"></ion-back-button></ion-buttons>
        <ion-title>Payment</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (payment(); as p) {
        <ion-card>
          <ion-card-content>
            <div class="head">
              <div>
                <p class="who">{{ renterName() }} · Room {{ roomNumber() }}</p>
                <h1>₹{{ p.amount.toLocaleString('en-IN') }}</h1>
                <p>{{ monthName() }} rent + mess</p>
              </div>
              <app-status-chip [status]="p.status" />
            </div>

            <!-- progress: Submitted → Approved / Rejected -->
            <ol class="steps" aria-label="Payment progress">
              <li class="done">
                <span class="dot"></span>
                <div><strong>{{ p.method === 'cash' ? 'Cash recorded by owner' : 'Submitted by renter' }}</strong><br />
                  <small>{{ p.createdAt | date: 'd MMM, h:mm a' }}</small></div>
              </li>
              <li [ngClass]="{ done: p.status !== 'pending', bad: p.status === 'rejected', waiting: p.status === 'pending' }">
                <span class="dot"></span>
                <div>
                  @switch (p.status) {
                    @case ('pending') { <strong>Waiting for owner's approval</strong> }
                    @case ('confirmed') { <strong>Approved</strong> }
                    @case ('rejected') { <strong>Rejected</strong> }
                  }
                  @if (p.decidedAt) { <br /><small>{{ p.decidedAt | date: 'd MMM, h:mm a' }}</small> }
                </div>
              </li>
            </ol>

            @if (p.status === 'rejected' && p.rejectReason) {
              <div class="reason" role="alert"><strong>Reason:</strong> {{ p.rejectReason }}</div>
            }
          </ion-card-content>
        </ion-card>

        <ion-list inset>
          <ion-item><ion-label>Method</ion-label><ion-note slot="end">{{ p.method === 'upi' ? 'UPI' : 'Cash' }}</ion-note></ion-item>
          @if (p.utr) { <ion-item><ion-label>UPI reference (UTR)</ion-label><ion-note slot="end" class="mono">{{ p.utr }}</ion-note></ion-item> }
          @if (p.receiptNo && p.status === 'confirmed') {
            <ion-item [routerLink]="['/receipt', p.id]" detail><ion-icon slot="start" name="receipt-outline" aria-hidden="true"></ion-icon><ion-label>Receipt {{ p.receiptNo }}</ion-label></ion-item>
          }
        </ion-list>

        @if (p.proofPhoto) {
          <h3 class="ion-padding-horizontal">Payment proof</h3>
          <button type="button" class="proof" (click)="zoom.set(true)" aria-label="Open payment screenshot full screen">
            <img [src]="p.proofPhoto" alt="Payment screenshot attached by the renter" />
            <span>Tap to enlarge</span>
          </button>
        } @else if (p.method === 'upi') {
          <p class="ion-padding-horizontal"><ion-text color="medium">No screenshot attached. Check the UTR in your bank or UPI app.</ion-text></p>
        }

        <!-- owner: context + decision -->
        @if (isOwner() && dues(); as d) {
          <ion-list inset>
            <ion-item><ion-label>Due this month</ion-label><ion-note slot="end">₹{{ d.total.toLocaleString('en-IN') }}</ion-note></ion-item>
            <ion-item><ion-label>Already approved</ion-label><ion-note slot="end">₹{{ d.paid.toLocaleString('en-IN') }}</ion-note></ion-item>
            @if (p.status === 'pending' && p.amount !== d.balance) {
              <ion-item lines="none"><ion-text class="text-warning"><p>⚠ Amount differs from the balance (₹{{ d.balance.toLocaleString('en-IN') }}).</p></ion-text></ion-item>
            }
          </ion-list>
        }

        <div class="ion-padding actions">
          @if (isOwner()) {
            @if (p.status === 'pending') {
              <ion-button expand="block" color="success" (click)="approve()" [disabled]="busy()">
                <ion-icon slot="start" name="checkmark-circle-outline" aria-hidden="true"></ion-icon> Approve
              </ion-button>
              <ion-button expand="block" color="danger" fill="outline" (click)="reject()" [disabled]="busy()">
                <ion-icon slot="start" name="close-circle-outline" aria-hidden="true"></ion-icon> Reject
              </ion-button>
            } @else if (p.status === 'confirmed') {
              <ion-button expand="block" color="danger" fill="clear" (click)="reject()" [disabled]="busy()">Reject instead</ion-button>
            } @else {
              <ion-button expand="block" color="success" fill="clear" (click)="approve()" [disabled]="busy()">Approve instead</ion-button>
            }
          } @else if (p.status === 'rejected') {
            <ion-button expand="block" routerLink="/renter/pay">
              <ion-icon slot="start" name="wallet-outline" aria-hidden="true"></ion-icon> Pay again
            </ion-button>
          }
          @if (busy()) { <div class="ion-text-center"><ion-spinner aria-label="Saving"></ion-spinner></div> }
        </div>

        <ion-modal [isOpen]="zoom()" (didDismiss)="zoom.set(false)">
          <ng-template>
            <ion-header>
              <ion-toolbar color="dark">
                <ion-title>Payment proof</ion-title>
                <ion-buttons slot="end"><ion-button (click)="zoom.set(false)">Close</ion-button></ion-buttons>
              </ion-toolbar>
            </ion-header>
            <ion-content color="dark">
              <img class="full" [src]="p.proofPhoto" alt="Payment screenshot, full size" />
            </ion-content>
          </ng-template>
        </ion-modal>
      } @else {
        <p class="ion-padding ion-text-center"><ion-text color="medium">This payment is not available.</ion-text></p>
      }
    </ion-content>
  `,
  styles: `
    ion-card { color: var(--ion-text-color); }
    .head { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; }
    .head h1 { font-size:2em; font-weight:800; margin:4px 0; color: var(--ion-text-color); }
    .who { font-weight:600; margin:0; }
    .steps { list-style:none; padding:0; margin:16px 0 0; }
    .steps li { display:flex; gap:12px; align-items:flex-start; padding-bottom:12px; position:relative; color: var(--ion-color-medium-shade); }
    .steps li:not(:last-child)::after { content:''; position:absolute; left:6px; top:16px; bottom:0; width:2px; background: var(--ion-color-light-shade); }
    .steps .dot { width:14px; height:14px; border-radius:50%; background: var(--ion-color-light-shade); flex:none; margin-top:3px; }
    .steps li.done { color: var(--ion-text-color); }
    .steps li.done .dot { background: var(--ion-color-success); }
    .steps li.bad .dot { background: var(--ion-color-danger); }
    .steps li.waiting .dot { background: #e0a800; }
    .reason { margin-top:8px; padding:10px 12px; border-radius:8px; background:#ffd6d6; color:#6b0000; }
    .mono { font-family: monospace; }
    .proof { display:block; width:calc(100% - 32px); margin:0 16px; padding:0; border:1px solid var(--ion-color-light-shade); border-radius:12px; overflow:hidden; background:none; position:relative; }
    .proof img { display:block; width:100%; max-height:320px; object-fit:contain; background:#f4f4f4; }
    .proof span { position:absolute; right:8px; bottom:8px; background:rgba(0,0,0,.6); color:#fff; padding:2px 8px; border-radius:999px; font-size:.8em; }
    .full { width:100%; height:100%; object-fit:contain; }
  `,
})
export class PaymentPage {
  readonly id = input.required<string>();
  private readonly auth = inject(AuthService);
  private readonly data = inject(PgDataService);
  private readonly inbox = inject(InboxService);
  private readonly decide = inject(PaymentDecisionService);

  private readonly payments = toSignal(this.data.payments$(), { initialValue: [] });
  private readonly renters = toSignal(this.data.renters$(), { initialValue: [] });
  private readonly rooms = toSignal(this.data.rooms$(), { initialValue: [] });
  private readonly privates = toSignal(this.data.privates$(), { initialValue: [] });
  private readonly skips = toSignal(this.data.skips$(), { initialValue: [] });
  private readonly property = toSignal(this.data.property$());

  readonly busy = signal(false);
  readonly zoom = signal(false);
  readonly isOwner = computed(() => this.auth.role() === 'owner');
  readonly payment = computed(() => this.payments().find((p) => p.id === this.id()));
  private readonly renter = computed(() => this.renters().find((r) => r.id === this.payment()?.renterId));
  readonly renterName = computed(() => this.renter()?.name ?? 'Renter');
  readonly roomNumber = computed(() => this.rooms().find((r) => r.id === this.renter()?.roomId)?.number ?? '?');
  readonly monthName = computed(() => {
    const m = this.payment()?.month;
    return m ? new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '';
  });
  readonly dues = computed(() => {
    const p = this.payment();
    const prop = this.property();
    const priv = this.privates().find((x) => x.id === p?.renterId);
    return p && prop && priv ? computeDues(prop, priv, this.payments(), this.skips(), p.month) : null;
  });

  constructor() {
    // Opening the payment = reading its notifications. Re-runs when a new decision arrives by sync.
    effect(() => {
      const p = this.payment();
      if (p && this.inbox.items().some((n) => n.paymentId === p.id && !n.read)) void this.inbox.markPaymentRead(p.id);
    });
  }

  async approve(): Promise<void> {
    const p = this.payment();
    if (!p) return;
    this.busy.set(true);
    try {
      await this.decide.approve(p, this.renterName());
    } finally {
      this.busy.set(false);
    }
  }

  async reject(): Promise<void> {
    const p = this.payment();
    if (!p) return;
    this.busy.set(true);
    try {
      await this.decide.reject(p);
    } finally {
      this.busy.set(false);
    }
  }
}
