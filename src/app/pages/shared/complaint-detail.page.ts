import { Component, computed, inject, input } from '@angular/core';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { DatePipe } from '@angular/common';
import {
  ActionSheetController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonImg,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar,
  IonText,
} from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { PgDataService } from '../../core/pg-data.service';
import { RepoService } from '../../core/repo.service';
import { UiService } from '../../core/ui.service';
import { AnalyticsService } from '../../core/analytics.service';
import { COMPLAINT_CATEGORIES, type Complaint, type ComplaintStatus } from '../../core/models';
import { StatusChipComponent } from '../../components/status-chip.component';

/** One complaint. Owner: change status (ActionSheet). Renter: confirm the fix 👍 / 👎. */
@Component({
  selector: 'app-complaint-detail',
  imports: [
    DatePipe, StatusChipComponent,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent, IonCard, IonCardContent, IonList, IonItem, IonLabel,
    IonIcon, IonButton, IonImg, IonText,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button [defaultHref]="isOwner() ? '/owner/complaints' : '/renter/complaints'"></ion-back-button></ion-buttons>
        <ion-title>Complaint</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (complaint(); as c) {
        <ion-card>
          <ion-card-content>
            <app-status-chip [status]="c.status" />
            <h1>{{ c.title }}</h1>
            <p><ion-icon [name]="cat(c).icon" aria-hidden="true"></ion-icon> {{ cat(c).label }}</p>
            @if (c.description) { <p class="desc">{{ c.description }}</p> }
            @if (c.photo) { <ion-img [src]="c.photo" alt="Photo attached to complaint"></ion-img> }
          </ion-card-content>
        </ion-card>
        <ion-list inset>
          @if (isOwner()) {
            <ion-item><ion-label><p>Filed by</p><h3>{{ filer() }}</h3></ion-label></ion-item>
          }
          <ion-item><ion-label><p>Filed on</p><h3>{{ c.createdAt | date: 'd MMM y, h:mm a' }}</h3></ion-label></ion-item>
          @if (c.renterConfirmed !== null) {
            <ion-item><ion-label><p>Renter says</p><h3>{{ c.renterConfirmed ? '👍 Fixed' : '👎 Still a problem' }}</h3></ion-label></ion-item>
          }
        </ion-list>

        <div class="ion-padding">
          @if (isOwner()) {
            <ion-button expand="block" (click)="changeStatus(c)">Update status</ion-button>
          } @else {
            @switch (c.status) {
              @case ('resolved') {
                @if (c.renterConfirmed === null) {
                  <ion-text><h3>Is it fixed?</h3></ion-text>
                  <ion-button color="success" (click)="confirm(c, true)"><ion-icon slot="start" name="thumbs-up-outline" aria-hidden="true"></ion-icon> Yes, fixed</ion-button>
                  <ion-button color="danger" fill="outline" (click)="confirm(c, false)"><ion-icon slot="start" name="thumbs-down-outline" aria-hidden="true"></ion-icon> No, still broken</ion-button>
                }
              }
              @case ('in_progress') { <ion-text color="medium"><p>Your owner is working on this.</p></ion-text> }
              @default { <ion-text color="medium"><p>Your owner has been notified.</p></ion-text> }
            }
          }
        </div>
      }
    </ion-content>
  `,
  styles: `h1 { font-size:1.3em; font-weight:700; margin:8px 0; } .desc { white-space: pre-wrap; }`,
})
export class ComplaintDetailPage {
  readonly id = input.required<string>();
  private readonly auth = inject(AuthService);
  private readonly data = inject(PgDataService);
  private readonly repo = inject(RepoService);
  private readonly ui = inject(UiService);
  private readonly analytics = inject(AnalyticsService);
  private readonly sheetCtrl = inject(ActionSheetController);

  readonly complaint = toSignal(toObservable(this.id).pipe(switchMap((id) => this.data.complaint$(id))));
  private readonly renters = toSignal(this.data.renters$(), { initialValue: [] });
  private readonly rooms = toSignal(this.data.rooms$(), { initialValue: [] });
  readonly isOwner = computed(() => this.auth.role() === 'owner');
  readonly filer = computed(() => {
    const r = this.renters().find((x) => x.id === this.complaint()?.renterId);
    const room = this.rooms().find((x) => x.id === r?.roomId);
    return r ? `${r.name}, Room ${room?.number ?? '?'}` : 'Former renter';
  });

  cat(c: Complaint) {
    return COMPLAINT_CATEGORIES.find((x) => x.key === c.category) ?? COMPLAINT_CATEGORIES[COMPLAINT_CATEGORIES.length - 1];
  }

  async changeStatus(c: Complaint): Promise<void> {
    const set = (status: ComplaintStatus) => async () => {
      // Re-opening clears the renter's earlier confirmation.
      await this.repo.save<Complaint>('complaints', { id: c.id, status, ...(status !== 'resolved' ? { renterConfirmed: null } : {}) });
      this.analytics.track('complaint_status_changed', { status });
      await this.ui.toast(`Marked ${status.replace('_', ' ')}`);
    };
    const sheet = await this.sheetCtrl.create({
      header: 'Set status',
      buttons: [
        { text: 'Open', icon: 'alert-circle-outline', handler: set('open') },
        { text: 'In progress', icon: 'time-outline', handler: set('in_progress') },
        { text: 'Resolved', icon: 'checkmark-circle-outline', handler: set('resolved') },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  async confirm(c: Complaint, fixed: boolean): Promise<void> {
    await this.repo.save<Complaint>('complaints', {
      id: c.id,
      renterConfirmed: fixed,
      ...(fixed ? {} : { status: 'open' as const }),
    });
    this.analytics.track('complaint_confirmed', { fixed });
    await this.ui.toast(fixed ? 'Thanks for confirming!' : 'Re-opened. Owner notified.', fixed ? 'success' : 'medium');
  }
}
