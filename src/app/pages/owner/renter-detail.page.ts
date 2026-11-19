import { Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  ActionSheetController,
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonTitle,
  IonToolbar,
  IonText,
  IonThumbnail,
} from '@ionic/angular';
import { PgDataService } from '../../core/pg-data.service';
import { RepoService } from '../../core/repo.service';
import { UiService } from '../../core/ui.service';
import { AnalyticsService } from '../../core/analytics.service';
import { DeepLinkService } from '../../core/deeplink.service';
import { computeDues, monthKey } from '../../core/dues';
import type { Payment, RenterPublic } from '../../core/models';
import { RenterCardComponent } from '../../components/renter-card.component';
import { StatusChipComponent } from '../../components/status-chip.component';

/** Owner view of one renter: ID card, dues, payment history, confirm UPI / record cash, invite link. */
@Component({
  selector: 'app-renter-detail',
  imports: [
    DatePipe, RouterLink, RenterCardComponent, StatusChipComponent,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonButton, IonContent, IonList, IonListHeader,
    IonItem, IonLabel, IonNote, IonIcon, IonText, IonThumbnail,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/owner/renters"></ion-back-button></ion-buttons>
        <ion-title>{{ renter()?.name ?? 'Renter' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="more()" aria-label="More actions"><ion-icon slot="icon-only" name="ellipsis-horizontal"></ion-icon></ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (renter(); as r) {
        <app-renter-card [renter]="r" [room]="room()" [priv]="priv()">
          <div actions>
            <ion-button size="small" fill="outline" (click)="shareInvite()">
              <ion-icon slot="start" name="share-social-outline" aria-hidden="true"></ion-icon> Share invite link
            </ion-button>
          </div>
        </app-renter-card>

        @if (dues(); as d) {
          <ion-list inset>
            <ion-list-header><ion-label>This month</ion-label><app-status-chip [status]="d.status" /></ion-list-header>
            <ion-item><ion-label>Rent</ion-label><ion-note slot="end">₹{{ d.rent.toLocaleString("en-IN") }}</ion-note></ion-item>
            <ion-item><ion-label>Mess ({{ mealsText() }})</ion-label><ion-note slot="end">₹{{ d.mess.toLocaleString("en-IN") }}</ion-note></ion-item>
            @if (d.skipRebate) { <ion-item><ion-label>Skipped meals rebate</ion-label><ion-note slot="end">−₹{{ d.skipRebate }}</ion-note></ion-item> }
            @if (d.lateFee) { <ion-item><ion-label color="danger">Late fee</ion-label><ion-note slot="end" color="danger">₹{{ d.lateFee }}</ion-note></ion-item> }
            <ion-item><ion-label><strong>Balance</strong></ion-label><ion-note slot="end"><strong>₹{{ d.balance.toLocaleString("en-IN") }}</strong></ion-note></ion-item>
            @if (d.possibleDuplicate) {
              <ion-item lines="none"><ion-text color="danger"><p>⚠ Paid ₹{{ d.paid }} against ₹{{ d.total }}. A cash entry and a UPI payment may both be recorded. Reject one below.</p></ion-text></ion-item>
            }
          </ion-list>
          <div class="ion-padding-horizontal">
            <ion-button expand="block" fill="outline" (click)="recordCash(d.balance)">
              <ion-icon slot="start" name="cash-outline" aria-hidden="true"></ion-icon> Record cash payment
            </ion-button>
          </div>
        }

        <ion-list inset>
          <ion-list-header><ion-label>Payments</ion-label></ion-list-header>
          @for (p of payments(); track p.id) {
            <ion-item>
              @if (p.proofPhoto) { <ion-thumbnail slot="start"><img [src]="p.proofPhoto" alt="Payment screenshot" /></ion-thumbnail> }
              <ion-label class="ion-text-wrap">
                <h3>₹{{ p.amount }} · {{ p.method === 'upi' ? 'UPI' : 'Cash' }} · {{ monthLabel(p.month) }}</h3>
                <p>{{ p.createdAt | date: 'd MMM y' }} @if (p.utr) { · UTR {{ p.utr }} }</p>
                <ion-button size="small" [fill]="p.status === 'pending' ? 'solid' : 'clear'" [routerLink]="['/payment', p.id]">
                  {{ p.status === 'pending' ? 'Review and approve' : 'View' }}
                </ion-button>
                @if (p.status === 'confirmed') {
                  <ion-button size="small" fill="clear" [routerLink]="['/receipt', p.id]">Receipt</ion-button>
                }
              </ion-label>
              <app-status-chip slot="end" [status]="p.status" />
            </ion-item>
          } @empty {
            <ion-item><ion-label><p>No payments yet.</p></ion-label></ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class RenterDetailPage {
  readonly id = input.required<string>();
  private readonly data = inject(PgDataService);
  private readonly repo = inject(RepoService);
  private readonly ui = inject(UiService);
  private readonly analytics = inject(AnalyticsService);
  private readonly alertCtrl = inject(AlertController);
  private readonly sheetCtrl = inject(ActionSheetController);
  private readonly router = inject(Router);

  private readonly renters = toSignal(this.data.renters$(), { initialValue: [] });
  private readonly privates = toSignal(this.data.privates$(), { initialValue: [] });
  private readonly rooms = toSignal(this.data.rooms$(), { initialValue: [] });
  private readonly allPayments = toSignal(this.data.payments$(), { initialValue: [] });
  private readonly skips = toSignal(this.data.skips$(), { initialValue: [] });
  private readonly property = toSignal(this.data.property$());

  readonly renter = computed(() => this.renters().find((r) => r.id === this.id()));
  readonly priv = computed(() => this.privates().find((r) => r.id === this.id()));
  readonly room = computed(() => this.rooms().find((r) => r.id === this.renter()?.roomId));
  readonly payments = computed(() => this.allPayments().filter((p) => p.renterId === this.id()));
  readonly dues = computed(() => {
    const p = this.property();
    const priv = this.priv();
    return p && priv ? computeDues(p, priv, this.allPayments(), this.skips(), monthKey(new Date())) : null;
  });
  readonly mealsText = computed(() => {
    const m = this.priv()?.meals;
    const parts = m ? (['breakfast', 'lunch', 'dinner'] as const).filter((k) => m[k]) : [];
    return parts.length ? parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(' + ') : 'No meals';
  });

  monthLabel(m: string): string {
    return new Date(`${m}-01`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  }

  async recordCash(suggested: number): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Record cash payment',
      inputs: [{ name: 'amount', type: 'number', value: suggested || '', placeholder: 'Amount in ₹', min: 1 }],
      buttons: [{ text: 'Cancel', role: 'cancel' }, { text: 'Save', role: 'confirm' }],
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss();
    const amount = Number(data?.values?.amount);
    if (role !== 'confirm' || !(amount > 0)) return;
    const r = this.renter()!;
    const month = monthKey(new Date());
    const id = crypto.randomUUID();
    await this.repo.save<Payment>('payments', {
      id,
      propertyId: r.propertyId,
      audience: 'subject',
      subjectUserId: this.priv()?.subjectUserId ?? null,
      renterId: r.id,
      month,
      amount,
      method: 'cash',
      utr: null,
      proofPhoto: null,
      status: 'confirmed',
      createdBy: 'owner',
      createdAt: new Date().toISOString(),
      receiptNo: `RCPT-${month.replace('-', '')}-${id.slice(0, 6).toUpperCase()}`,
      decidedAt: new Date().toISOString(),
      rejectReason: null,
    });
    this.analytics.track('cash_recorded');
    await this.ui.toast(`₹${amount} cash recorded`);
  }

  async shareInvite(): Promise<void> {
    const code = this.priv()?.inviteCode;
    if (!code) return;
    await this.ui.share(
      'Join our PG on PG Manager',
      `Hi ${this.renter()!.name.split(' ')[0]}, see your rent, mess and complaints here. Invite code: ${code}`,
      DeepLinkService.inviteUrl(code),
    );
  }

  async more(): Promise<void> {
    const r = this.renter();
    if (!r) return;
    const sheet = await this.sheetCtrl.create({
      header: r.name,
      buttons: [
        { text: 'Change room', icon: 'bed-outline', handler: () => void this.changeRoom(r) },
        { text: 'Mark as moved out', icon: 'log-out-outline', role: 'destructive', handler: () => void this.moveOut(r) },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async changeRoom(r: RenterPublic): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Move to room',
      inputs: this.rooms().map((room) => ({ type: 'radio' as const, label: `Room ${room.number}`, value: room.id, checked: room.id === r.roomId })),
      buttons: [{ text: 'Cancel', role: 'cancel' }, { text: 'Move', role: 'confirm' }],
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss();
    if (role === 'confirm' && data?.values) await this.repo.save<RenterPublic>('renters', { id: r.id, roomId: data.values });
  }

  private async moveOut(r: RenterPublic): Promise<void> {
    if (!(await this.ui.confirm('Mark as moved out?', `${r.name} will be removed from the active list.`, 'Move out'))) return;
    await this.repo.save<RenterPublic>('renters', { id: r.id, active: false });
    await this.router.navigateByUrl('/owner/renters');
  }
}
