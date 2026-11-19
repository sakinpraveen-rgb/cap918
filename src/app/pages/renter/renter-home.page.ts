import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonThumbnail,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { PgDataService } from '../../core/pg-data.service';
import { NotificationService } from '../../core/notification.service';
import { computeDues, monthKey } from '../../core/dues';
import { StatusChipComponent } from '../../components/status-chip.component';
import { SyncBadgeComponent } from '../../components/sync-badge.component';

/** Renter home: rent + mess due, pay button, latest notices, receipts. */
@Component({
  selector: 'app-renter-home',
  imports: [
    DatePipe, RouterLink, StatusChipComponent, SyncBadgeComponent,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle,
    IonCardContent, IonList, IonListHeader, IonItem, IonLabel, IonNote, IonIcon, IonThumbnail,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>{{ property()?.name ?? 'My PG' }}</ion-title>
        <ion-buttons slot="end">
          <app-sync-badge />
          <ion-button routerLink="/settings" aria-label="Settings"><ion-icon slot="icon-only" name="settings-outline"></ion-icon></ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (dues(); as d) {
        <ion-card>
          <ion-card-header>
            <ion-card-subtitle>{{ monthLabel }} · due {{ d.dueDate | date: 'd MMM' }}</ion-card-subtitle>
            <ion-card-title class="amount">₹{{ d.balance.toLocaleString('en-IN') }}</ion-card-title>
            <app-status-chip [status]="d.status" />
          </ion-card-header>
          <ion-card-content>
            <ion-list lines="none">
              <ion-item><ion-label>Rent</ion-label><ion-note slot="end">₹{{ d.rent.toLocaleString("en-IN") }}</ion-note></ion-item>
              <ion-item><ion-label>Mess</ion-label><ion-note slot="end">₹{{ d.mess.toLocaleString("en-IN") }}</ion-note></ion-item>
              @if (d.skipRebate) { <ion-item><ion-label>Skipped meals</ion-label><ion-note slot="end">−₹{{ d.skipRebate }}</ion-note></ion-item> }
              @if (d.lateFee) { <ion-item><ion-label color="danger">Late fee</ion-label><ion-note slot="end" color="danger">₹{{ d.lateFee }}</ion-note></ion-item> }
              @if (d.paid) { <ion-item><ion-label>Paid</ion-label><ion-note slot="end" color="success">−₹{{ d.paid.toLocaleString("en-IN") }}</ion-note></ion-item> }
            </ion-list>
            @if (lastRejected(); as r) {
              <ion-item button detail lines="none" class="rejected" [routerLink]="['/payment', r.id]">
                <ion-icon slot="start" name="close-circle-outline" color="danger" aria-hidden="true"></ion-icon>
                <ion-label class="ion-text-wrap">
                  <h3>₹{{ r.amount.toLocaleString('en-IN') }} payment rejected</h3>
                  <p>{{ r.rejectReason || 'No reason given' }}</p>
                </ion-label>
              </ion-item>
            }
            @if (pendingPayment(); as pp) {
              <ion-item button detail lines="none" [routerLink]="['/payment', pp.id]">
                <ion-icon slot="start" name="time-outline" color="warning" aria-hidden="true"></ion-icon>
                <ion-label class="ion-text-wrap text-warning">₹{{ d.awaiting.toLocaleString('en-IN') }} sent, waiting for owner's approval</ion-label>
              </ion-item>
            }
            @if (d.balance > 0 && d.awaiting < d.balance) {
              <ion-button expand="block" routerLink="/renter/pay">
                <ion-icon slot="start" name="wallet-outline" aria-hidden="true"></ion-icon> Pay ₹{{ (d.balance - d.awaiting).toLocaleString("en-IN") }} via UPI
              </ion-button>
            }
          </ion-card-content>
        </ion-card>
      }

      @if (notices().length) {
        <ion-list inset>
          <ion-list-header><ion-label>Notice board</ion-label><ion-button routerLink="/notices">See all</ion-button></ion-list-header>
          @for (n of notices().slice(0, 2); track n.id) {
            <ion-item routerLink="/notices">
              <ion-icon slot="start" [name]="n.pinned ? 'pin-outline' : 'megaphone-outline'" aria-hidden="true"></ion-icon>
              <ion-label class="ion-text-wrap"><h3>{{ n.title }}</h3><p>{{ n.createdAt | date: 'd MMM' }}</p></ion-label>
            </ion-item>
          }
        </ion-list>
      }

      <ion-list inset>
        <ion-list-header><ion-label>Receipts</ion-label></ion-list-header>
        @for (p of receipts(); track p.id) {
          <ion-item [routerLink]="['/receipt', p.id]" detail>
            <ion-icon slot="start" name="receipt-outline" aria-hidden="true"></ion-icon>
            <ion-label><h3>{{ monthName(p.month) }} · ₹{{ p.amount.toLocaleString('en-IN') }}</h3><p>{{ p.receiptNo }}</p></ion-label>
            @if (p.proofPhoto) { <ion-thumbnail slot="end"><img [src]="p.proofPhoto" alt="Your payment screenshot" /></ion-thumbnail> }
          </ion-item>
        } @empty {
          <ion-item><ion-label><p>Receipts appear here once the owner confirms a payment.</p></ion-label></ion-item>
        }
      </ion-list>
    </ion-content>
  `,
  styles: `
    .amount { font-size: 2.2em; font-weight: 800; }
    ion-item.rejected { --background: #ffe5e5; border-radius: 8px; margin-bottom: 8px; }
  `,
})
export class RenterHomePage {
  private readonly auth = inject(AuthService);
  private readonly data = inject(PgDataService);
  private readonly notify = inject(NotificationService);
  readonly property = toSignal(this.data.property$());
  private readonly privates = toSignal(this.data.privates$(), { initialValue: [] });
  private readonly payments = toSignal(this.data.payments$(), { initialValue: [] });
  private readonly skips = toSignal(this.data.skips$(), { initialValue: [] });
  readonly notices = toSignal(this.data.notices$(), { initialValue: [] });

  readonly monthLabel = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  private readonly me = computed(() => this.privates().find((p) => p.id === this.auth.session()?.renterId));

  readonly dues = computed(() => {
    const p = this.property();
    const me = this.me();
    return p && me ? computeDues(p, me, this.payments(), this.skips(), monthKey(new Date())) : null;
  });

  private readonly myThisMonth = computed(() =>
    this.payments().filter((p) => p.renterId === this.auth.session()?.renterId && p.month === monthKey(new Date())),
  );
  /** Latest pending UPI payment this month (opens its status screen). */
  readonly pendingPayment = computed(() => this.myThisMonth().find((p) => p.status === 'pending'));
  /** A rejection is shown until something newer (pending / approved) supersedes it. */
  readonly lastRejected = computed(() => {
    const mine = [...this.myThisMonth()].sort((a, b) => (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt));
    const latest = mine[0];
    return latest?.status === 'rejected' && (this.dues()?.balance ?? 0) > 0 ? latest : null;
  });

  readonly receipts = computed(() =>
    this.payments().filter((p) => p.renterId === this.auth.session()?.renterId && p.status === 'confirmed'),
  );

  constructor() {
    effect(() => {
      const p = this.property();
      if (p) void this.notify.scheduleRenterReminders(p.rentDueDay, this.dues());
    });
  }

  monthName(m: string): string {
    return new Date(`${m}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }
}
