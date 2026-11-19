import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonImg,
  IonInput,
  IonItem,
  IonList,
  IonNote,
  IonTitle,
  IonToolbar,
  IonText,
} from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { PgDataService } from '../../core/pg-data.service';
import { RepoService } from '../../core/repo.service';
import { UiService } from '../../core/ui.service';
import { AnalyticsService } from '../../core/analytics.service';
import { computeDues, monthKey, upiLink } from '../../core/dues';
import type { Payment } from '../../core/models';

/**
 * Rent is paid outside the app via any UPI app (no store billing needed: it's a real-world service).
 * Step 1: open UPI app with amount pre-filled. Step 2: enter UTR and/or attach screenshot. Owner confirms.
 */
@Component({
  selector: 'app-pay',
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent, IonList, IonItem, IonInput, IonButton, IonIcon, IonNote, IonImg, IonText,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/renter/home"></ion-back-button></ion-buttons>
        <ion-title>Pay rent</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      @if (property(); as p) {
        <h2>Step 1 · Pay ₹{{ amount }} to {{ p.name }}</h2>
        <p>UPI ID: <strong>{{ p.upiId }}</strong></p>
        <ion-button expand="block" [href]="link()" (click)="opened.set(true)">
          <ion-icon slot="start" name="wallet-outline" aria-hidden="true"></ion-icon> Open UPI app
        </ion-button>
        <ion-note>Opens Google Pay, PhonePe, Paytm or BHIM with the amount filled in.</ion-note>

        <h2 class="ion-margin-top">Step 2 · Tell your owner</h2>
        <ion-list>
          <ion-item><ion-input label="Amount paid (₹)" labelPlacement="stacked" type="number" [(ngModel)]="amount" min="1"></ion-input></ion-item>
          <ion-item>
            <ion-input label="UPI reference / UTR (12 digits)" labelPlacement="stacked" inputmode="numeric" maxlength="12" [(ngModel)]="utr"
              helperText="Find it in your UPI app's transaction details"></ion-input>
          </ion-item>
        </ion-list>
        <ion-button fill="outline" (click)="attach()">
          <ion-icon slot="start" name="camera-outline" aria-hidden="true"></ion-icon> {{ photo() ? 'Change screenshot' : 'Attach screenshot' }}
        </ion-button>
        @if (photo()) { <ion-img [src]="photo()" alt="Payment screenshot preview" class="preview"></ion-img> }
        @if (!valid()) { <ion-text color="medium"><p>Add the 12-digit UTR or a screenshot.</p></ion-text> }
        <ion-button expand="block" class="ion-margin-top" [disabled]="!valid()" (click)="submit()">I've paid, notify owner</ion-button>
      }
    </ion-content>
  `,
  styles: `.preview { max-height: 220px; margin-top: 8px; }`,
})
export class PayPage {
  private readonly auth = inject(AuthService);
  private readonly data = inject(PgDataService);
  private readonly repo = inject(RepoService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);
  private readonly analytics = inject(AnalyticsService);
  readonly property = toSignal(this.data.property$());
  private readonly privates = toSignal(this.data.privates$(), { initialValue: [] });
  private readonly payments = toSignal(this.data.payments$(), { initialValue: [] });
  private readonly skips = toSignal(this.data.skips$(), { initialValue: [] });

  readonly photo = signal<string | null>(null);
  readonly opened = signal(false);
  utr = '';
  amount = 0;
  private readonly month = monthKey(new Date());

  private readonly me = computed(() => this.privates().find((p) => p.id === this.auth.session()?.renterId));
  private readonly due = computed(() => {
    const p = this.property();
    const me = this.me();
    if (!p || !me) return 0;
    const d = computeDues(p, me, this.payments(), this.skips(), this.month);
    return Math.max(0, d.balance - d.awaiting);
  });

  private prefilled = false;

  constructor() {
    // Pre-fill the amount once dues have loaded from the local DB.
    effect(() => {
      const d = this.due();
      if (d > 0 && !this.prefilled) {
        this.amount = d;
        this.prefilled = true;
      }
    });
  }

  link(): string {
    const p = this.property();
    if (!p) return '#';
    return upiLink(p.upiId, p.name, Number(this.amount) || 0, `Rent ${this.month} ${this.me()?.inviteCode ?? ''}`.trim());
  }

  valid(): boolean {
    return Number(this.amount) > 0 && (/^\d{12}$/.test(this.utr) || !!this.photo());
  }

  async attach(): Promise<void> {
    const p = await this.ui.photo('Attach payment screenshot');
    if (p) this.photo.set(p);
  }

  async submit(): Promise<void> {
    const s = this.auth.session()!;
    await this.repo.save<Payment>('payments', {
      propertyId: s.propertyId,
      audience: 'subject',
      subjectUserId: s.userId,
      renterId: s.renterId!,
      month: this.month,
      amount: Number(this.amount),
      method: 'upi',
      utr: this.utr || null,
      proofPhoto: this.photo(),
      status: 'pending',
      createdBy: 'renter',
      createdAt: new Date().toISOString(),
      receiptNo: null,
      decidedAt: null,
      rejectReason: null,
    });
    this.analytics.track('payment_submitted', { has_utr: !!this.utr, has_photo: !!this.photo() });
    await this.ui.toast('Sent! Your owner will confirm it.');
    await this.router.navigateByUrl('/renter/home', { replaceUrl: true });
  }
}
