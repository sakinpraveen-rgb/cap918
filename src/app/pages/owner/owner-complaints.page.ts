import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
  IonNote,
} from '@ionic/angular';
import { PgDataService } from '../../core/pg-data.service';
import { COMPLAINT_CATEGORIES, type Complaint } from '../../core/models';
import { StatusChipComponent } from '../../components/status-chip.component';
import { SyncBadgeComponent } from '../../components/sync-badge.component';

/** Owner complaint box: every complaint with who filed it and from which room. */
@Component({
  selector: 'app-owner-complaints',
  imports: [
    FormsModule, RouterLink, DatePipe, StatusChipComponent, SyncBadgeComponent,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonContent, IonSegment, IonSegmentButton, IonLabel, IonList, IonItem, IonIcon, IonNote,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Complaint box</ion-title>
        <ion-buttons slot="end"><app-sync-badge /></ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [(ngModel)]="tab" aria-label="Complaint status">
          <ion-segment-button value="active"><ion-label>Active ({{ count('active') }})</ion-label></ion-segment-button>
          <ion-segment-button value="resolved"><ion-label>Resolved ({{ count('resolved') }})</ion-label></ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list>
        @for (c of list(); track c.id) {
          <ion-item [routerLink]="['/complaint', c.id]" detail>
            <ion-icon slot="start" [name]="icon(c.category)" aria-hidden="true"></ion-icon>
            <ion-label class="ion-text-wrap">
              <h2>{{ c.title }}</h2>
              <p><strong>{{ who(c) }}</strong> · {{ category(c.category) }}</p>
              <ion-note>{{ c.createdAt | date: 'd MMM, h:mm a' }}</ion-note>
            </ion-label>
            <app-status-chip slot="end" [status]="c.status" />
          </ion-item>
        } @empty {
          <ion-item><ion-label class="ion-text-center"><p>No complaints here 🎉</p></ion-label></ion-item>
        }
      </ion-list>
    </ion-content>
  `,
})
export class OwnerComplaintsPage {
  private readonly data = inject(PgDataService);
  private readonly complaints = toSignal(this.data.complaints$(), { initialValue: [] });
  private readonly renters = toSignal(this.data.renters$(), { initialValue: [] });
  private readonly rooms = toSignal(this.data.rooms$(), { initialValue: [] });
  tab: 'active' | 'resolved' = 'active';

  list(): Complaint[] {
    return this.complaints().filter((c) => (this.tab === 'resolved') === (c.status === 'resolved'));
  }

  count(tab: 'active' | 'resolved'): number {
    return this.complaints().filter((c) => (tab === 'resolved') === (c.status === 'resolved')).length;
  }

  who(c: Complaint): string {
    const r = this.renters().find((x) => x.id === c.renterId);
    const room = this.rooms().find((x) => x.id === r?.roomId);
    return r ? `${r.name}, Room ${room?.number ?? '?'}` : 'Former renter';
  }

  icon(key: string): string {
    return COMPLAINT_CATEGORIES.find((c) => c.key === key)?.icon ?? 'document-text-outline';
  }

  category(key: string): string {
    return COMPLAINT_CATEGORIES.find((c) => c.key === key)?.label ?? key;
  }
}
