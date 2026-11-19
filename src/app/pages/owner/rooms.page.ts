import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgClass } from '@angular/common';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonIcon,
  IonRow,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { PgDataService } from '../../core/pg-data.service';
import { RepoService } from '../../core/repo.service';
import type { Room } from '../../core/models';

/** Occupancy grid: filled vs vacant beds per room (ion-grid + ngClass). */
@Component({
  selector: 'app-rooms',
  imports: [
    NgClass, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonButton, IonIcon, IonContent, IonGrid, IonRow, IonCol, IonCard, IonCardContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/owner/more"></ion-back-button></ion-buttons>
        <ion-title>Rooms and beds</ion-title>
        <ion-buttons slot="end"><ion-button (click)="addRoom()" aria-label="Add room"><ion-icon slot="icon-only" name="add-outline"></ion-icon></ion-button></ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <p><strong>{{ filled() }}</strong> of <strong>{{ totalBeds() }}</strong> beds filled · {{ totalBeds() - filled() }} vacant</p>
      <ion-grid>
        <ion-row>
          @for (room of rooms(); track room.id) {
            <ion-col size="6" size-md="4">
              <ion-card [ngClass]="{ full: occupants(room).length >= room.sharing, vacant: occupants(room).length === 0 }">
                <ion-card-content>
                  <h2>Room {{ room.number }}</h2>
                  <div class="beds" [attr.aria-label]="occupants(room).length + ' of ' + room.sharing + ' beds filled'">
                    @for (b of beds(room); track $index) {
                      <ion-icon name="bed-outline" [ngClass]="{ taken: b }" aria-hidden="true"></ion-icon>
                    }
                  </div>
                  @for (o of occupants(room); track o.id) { <p class="name">{{ o.name }}</p> }
                </ion-card-content>
              </ion-card>
            </ion-col>
          }
        </ion-row>
      </ion-grid>
    </ion-content>
  `,
  styles: `
    .beds ion-icon { font-size: 24px; margin-right: 4px; color: var(--ion-color-medium); }
    .beds ion-icon.taken { color: var(--ion-color-primary); }
    ion-card.full { border-left: 4px solid var(--ion-color-success); }
    ion-card.vacant { border-left: 4px solid var(--ion-color-warning); }
    .name { font-size: .85em; margin: 0; }
  `,
})
export class RoomsPage {
  private readonly data = inject(PgDataService);
  private readonly repo = inject(RepoService);
  private readonly auth = inject(AuthService);
  private readonly alertCtrl = inject(AlertController);
  readonly rooms = toSignal(this.data.rooms$(), { initialValue: [] });
  private readonly renters = toSignal(this.data.renters$(), { initialValue: [] });

  occupants(room: Room) {
    return this.renters().filter((r) => r.roomId === room.id);
  }
  beds(room: Room): boolean[] {
    const n = this.occupants(room).length;
    return Array.from({ length: Math.max(room.sharing, n) }, (_, i) => i < n);
  }
  totalBeds = () => this.rooms().reduce((a, r) => a + r.sharing, 0);
  filled = () => this.renters().length;

  async addRoom(): Promise<void> {
    const a = await this.alertCtrl.create({
      header: 'Add room',
      inputs: [
        { name: 'number', placeholder: 'Room number, e.g. 203' },
        { name: 'sharing', type: 'number', placeholder: 'Beds (1–6)', min: 1, max: 6 },
      ],
      buttons: [{ text: 'Cancel', role: 'cancel' }, { text: 'Add', role: 'confirm' }],
    });
    await a.present();
    const { role, data } = await a.onDidDismiss();
    const v = data?.values;
    if (role !== 'confirm' || !v?.number || !(Number(v.sharing) > 0)) return;
    await this.repo.save<Room>('rooms', {
      propertyId: this.auth.session()!.propertyId,
      audience: 'all',
      number: String(v.number).trim(),
      sharing: Number(v.sharing),
    });
  }
}
