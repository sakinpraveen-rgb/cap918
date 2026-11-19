import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  IonContent,
  IonHeader,
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
import { RenterCardComponent } from '../../components/renter-card.component';

/**
 * Roommates' ID cards. Built only from the public renter record: name, room, sharing, living since,
 * and phone if they opted in. Address, ID proof and dues are never available on this screen.
 */
@Component({
  selector: 'app-roommates',
  imports: [RenterCardComponent, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonListHeader, IonItem, IonLabel, IonNote],
  template: `
    <ion-header><ion-toolbar color="primary"><ion-title>Roommates</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <ion-list-header><ion-label>Room {{ myRoom()?.number }}</ion-label></ion-list-header>
      @for (r of roommates(); track r.id) {
        <app-renter-card [renter]="r" [room]="myRoom()" />
      } @empty {
        <ion-list><ion-item lines="none"><ion-label><p>You have the room to yourself.</p></ion-label></ion-item></ion-list>
      }
      <ion-note class="ion-padding" style="display:block">
        Only name, room and move-in date are shared. Phone numbers appear only if a roommate turns on sharing in Settings.
      </ion-note>
    </ion-content>
  `,
})
export class RoommatesPage {
  private readonly auth = inject(AuthService);
  private readonly data = inject(PgDataService);
  private readonly renters = toSignal(this.data.renters$(), { initialValue: [] });
  private readonly rooms = toSignal(this.data.rooms$(), { initialValue: [] });

  private readonly me = computed(() => this.renters().find((r) => r.id === this.auth.session()?.renterId));
  readonly myRoom = computed(() => this.rooms().find((r) => r.id === this.me()?.roomId));
  readonly roommates = computed(() => this.renters().filter((r) => r.roomId === this.me()?.roomId && r.id !== this.me()?.id));
}
