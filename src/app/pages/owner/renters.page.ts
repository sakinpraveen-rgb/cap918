import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemDivider,
  IonItemGroup,
  IonLabel,
  IonList,
  IonSearchbar,
  IonTitle,
  IonToolbar,
  IonNote,
} from '@ionic/angular';
import { PgDataService } from '../../core/pg-data.service';
import { SyncBadgeComponent } from '../../components/sync-badge.component';

/** All renters grouped by room. */
@Component({
  selector: 'app-renters',
  imports: [
    FormsModule, RouterLink, SyncBadgeComponent,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonContent, IonList, IonItemGroup, IonItemDivider, IonItem, IonLabel,
    IonSearchbar, IonFab, IonFabButton, IonIcon, IonNote,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Renters</ion-title>
        <ion-buttons slot="end"><app-sync-badge /></ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-searchbar [(ngModel)]="query" placeholder="Search by name or phone" aria-label="Search renters"></ion-searchbar>
      <ion-list>
        @for (room of rooms(); track room.id) {
          <ion-item-group>
            <ion-item-divider sticky>
              <ion-label>Room {{ room.number }} · {{ room.sharing === 1 ? 'Single' : room.sharing + '-sharing' }}</ion-label>
              <ion-note slot="end">{{ inRoom(room.id).length }}/{{ room.sharing }} beds</ion-note>
            </ion-item-divider>
            @for (r of matching(room.id); track r.id) {
              <ion-item [routerLink]="['/owner/renter', r.id]" detail>
                <ion-icon slot="start" name="person-outline" aria-hidden="true"></ion-icon>
                <ion-label>
                  <h2>{{ r.name }}</h2>
                  <p>{{ phone(r.id) }}</p>
                </ion-label>
              </ion-item>
            } @empty {
              <ion-item lines="none"><ion-label><p>No one in this room.</p></ion-label></ion-item>
            }
          </ion-item-group>
        }
      </ion-list>
      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button routerLink="/owner/add-renter" aria-label="Add renter"><ion-icon name="person-add-outline"></ion-icon></ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
})
export class RentersPage {
  private readonly data = inject(PgDataService);
  readonly rooms = toSignal(this.data.rooms$(), { initialValue: [] });
  private readonly renters = toSignal(this.data.renters$(), { initialValue: [] });
  private readonly privates = toSignal(this.data.privates$(), { initialValue: [] });
  query = '';

  inRoom(roomId: string) {
    return this.renters().filter((r) => r.roomId === roomId);
  }

  matching(roomId: string) {
    const q = this.query.trim().toLowerCase();
    return this.inRoom(roomId).filter((r) => !q || r.name.toLowerCase().includes(q) || this.phone(r.id).includes(q));
  }

  phone(id: string): string {
    return this.privates().find((p) => p.id === id)?.phone ?? '';
  }
}
