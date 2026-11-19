import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { PgDataService } from '../../core/pg-data.service';
import { COMPLAINT_CATEGORIES } from '../../core/models';
import { StatusChipComponent } from '../../components/status-chip.component';

/** The renter's own complaints. Others' complaints are never visible to them. */
@Component({
  selector: 'app-renter-complaints',
  imports: [
    DatePipe, RouterLink, StatusChipComponent,
    IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonIcon, IonNote, IonFab, IonFabButton,
  ],
  template: `
    <ion-header><ion-toolbar color="primary"><ion-title>My complaints</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <ion-list>
        @for (c of mine(); track c.id) {
          <ion-item [routerLink]="['/complaint', c.id]" detail>
            <ion-icon slot="start" [name]="icon(c.category)" aria-hidden="true"></ion-icon>
            <ion-label class="ion-text-wrap">
              <h2>{{ c.title }}</h2>
              <ion-note>{{ c.createdAt | date: 'd MMM, h:mm a' }}</ion-note>
              @if (c.status === 'resolved' && c.renterConfirmed === null) { <p><strong>Is it fixed? Tap to confirm.</strong></p> }
            </ion-label>
            <app-status-chip slot="end" [status]="c.status" />
          </ion-item>
        } @empty {
          <ion-item lines="none"><ion-label class="ion-text-center ion-text-wrap"><p>No complaints yet. Tap + to report a problem with your room, food, WiFi or anything else.</p></ion-label></ion-item>
        }
      </ion-list>
      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button routerLink="/renter/new-complaint" aria-label="New complaint"><ion-icon name="add-outline"></ion-icon></ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
})
export class RenterComplaintsPage {
  private readonly auth = inject(AuthService);
  private readonly data = inject(PgDataService);
  private readonly all = toSignal(this.data.complaints$(), { initialValue: [] });
  readonly mine = computed(() => this.all().filter((c) => c.renterId === this.auth.session()?.renterId));

  icon(key: string): string {
    return COMPLAINT_CATEGORIES.find((c) => c.key === key)?.icon ?? 'document-text-outline';
  }
}
