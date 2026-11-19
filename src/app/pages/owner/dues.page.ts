import { Component, computed, inject, signal } from '@angular/core';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { NgStyle } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  IonButtons,
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonRow,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
  IonRefresher,
  IonRefresherContent,
  IonText,
  IonIcon,
} from '@ionic/angular';
import { PgDataService, type RenterRow } from '../../core/pg-data.service';
import { SyncService } from '../../core/sync.service';
import { monthKey } from '../../core/dues';
import { StatusChipComponent } from '../../components/status-chip.component';
import { SyncBadgeComponent } from '../../components/sync-badge.component';

type Filter = 'all' | 'pending' | 'paid';

/** Owner home: who has paid, who hasn't, for the selected month. */
@Component({
  selector: 'app-dues',
  imports: [
    FormsModule, RouterLink, NgStyle, StatusChipComponent, SyncBadgeComponent,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonContent, IonGrid, IonRow, IonCol, IonSegment, IonSegmentButton,
    IonLabel, IonList, IonItem, IonNote, IonSearchbar, IonRefresher, IonRefresherContent, IonText, IonIcon,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Rent dues</ion-title>
        <ion-buttons slot="end"><app-sync-badge /></ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [(ngModel)]="month" (ionChange)="monthSig.set(month)" aria-label="Month">
          @for (m of months; track m.key) {
            <ion-segment-button [value]="m.key"><ion-label>{{ m.label }}</ion-label></ion-segment-button>
          }
        </ion-segment>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content /></ion-refresher>

      <ion-grid class="summary" role="group" aria-label="This month summary">
        <ion-row>
          <ion-col size="4"><div class="stat"><span class="num">{{ fmt(summary().collected) }}</span><span>Collected</span></div></ion-col>
          <ion-col size="4"><div class="stat"><span class="num danger">{{ fmt(summary().pending) }}</span><span>Pending</span></div></ion-col>
          <ion-col size="4"><div class="stat"><span class="num">{{ summary().paidCount }}/{{ rows().length }}</span><span>Renters paid</span></div></ion-col>
        </ion-row>
        <ion-row>
          <ion-col>
            <div class="bar" role="progressbar" [attr.aria-valuenow]="summary().pct" aria-valuemin="0" aria-valuemax="100" aria-label="Collection progress">
              <div class="bar-fill" [ngStyle]="{ width: summary().pct + '%' }"></div>
            </div>
          </ion-col>
        </ion-row>
      </ion-grid>

      @if (summary().awaitingCount > 0) {
        <ion-item button detail routerLink="/owner/notifications" lines="none" class="awaiting">
          <ion-icon slot="start" name="notifications-outline" color="warning" aria-hidden="true"></ion-icon>
          <ion-label class="text-warning"><strong>{{ summary().awaitingCount }} payment(s) waiting for your approval</strong></ion-label>
        </ion-item>
      }

      <ion-searchbar [(ngModel)]="query" placeholder="Search name or room" aria-label="Search renters"></ion-searchbar>
      <ion-segment [(ngModel)]="filter" aria-label="Filter">
        <ion-segment-button value="pending"><ion-label>Pending</ion-label></ion-segment-button>
        <ion-segment-button value="paid"><ion-label>Paid</ion-label></ion-segment-button>
        <ion-segment-button value="all"><ion-label>All</ion-label></ion-segment-button>
      </ion-segment>

      <ion-list>
        @for (r of visible(); track r.renter.id) {
          <ion-item [routerLink]="['/owner/renter', r.renter.id]" detail>
            <ion-label>
              <h2>{{ r.renter.name }}</h2>
              <p>Room {{ r.room?.number }} · Rent {{ fmt(r.dues?.rent ?? 0) }} + Mess {{ fmt(r.dues?.mess ?? 0) }}</p>
              @if (r.dues?.possibleDuplicate) { <p><ion-text color="danger">⚠ Possible duplicate payment</ion-text></p> }
            </ion-label>
            <div slot="end" class="ion-text-end">
              <app-status-chip [status]="r.dues?.status ?? 'due'" />
              @if (r.dues && r.dues.balance > 0) { <ion-note class="bal">{{ fmt(r.dues.balance) }}</ion-note> }
            </div>
          </ion-item>
        } @empty {
          <ion-item><ion-label class="ion-text-center"><p>No renters match.</p></ion-label></ion-item>
        }
      </ion-list>
    </ion-content>
  `,
  styles: `
    .summary .stat { display:flex; flex-direction:column; align-items:center; text-align:center; }
    .stat .num { font-size:1.3em; font-weight:700; }
    .stat .danger { color: var(--ion-color-danger); }
    .stat span:last-child { font-size:0.8em; color: var(--ion-color-medium-shade); }
    .bar { height:8px; border-radius:4px; background: var(--ion-color-light-shade); overflow:hidden; }
    .bar-fill { height:100%; background: var(--ion-color-success); transition: width .3s; }
    .bal { display:block; font-weight:600; margin-top:4px; }
  `,
})
export class DuesPage {
  private readonly data = inject(PgDataService);
  private readonly sync = inject(SyncService);

  readonly months = [-1, 0, 1].map((off) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + off);
    return { key: monthKey(d), label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) };
  });
  month = monthKey(new Date());
  readonly monthSig = signal(this.month);
  filter: Filter = 'pending';
  query = '';

  readonly rows = toSignal(toObservable(this.monthSig).pipe(switchMap((m) => this.data.renterRows$(m))), {
    initialValue: [] as RenterRow[],
  });

  readonly summary = computed(() => {
    const rows = this.rows();
    const collected = rows.reduce((a, r) => a + (r.dues?.paid ?? 0), 0);
    const pending = rows.reduce((a, r) => a + (r.dues?.balance ?? 0), 0);
    const total = collected + pending;
    return {
      collected,
      pending,
      paidCount: rows.filter((r) => r.dues?.status === 'paid').length,
      awaitingCount: rows.filter((r) => (r.dues?.awaiting ?? 0) > 0).length,
      pct: total ? Math.round((collected / total) * 100) : 0,
    };
  });

  // Plain method (not computed) so it re-runs when ngModel-bound fields change.
  visible(): RenterRow[] {
    const q = this.query.trim().toLowerCase();
    return this.rows().filter((r) => {
      if (this.filter === 'paid' && r.dues?.status !== 'paid') return false;
      if (this.filter === 'pending' && r.dues?.status === 'paid') return false;
      return !q || r.renter.name.toLowerCase().includes(q) || (r.room?.number ?? '').includes(q);
    });
  }

  fmt(n: number): string {
    return '₹' + n.toLocaleString('en-IN');
  }

  async refresh(ev: CustomEvent): Promise<void> {
    await this.sync.syncNow();
    (ev.target as HTMLIonRefresherElement).complete();
  }
}
