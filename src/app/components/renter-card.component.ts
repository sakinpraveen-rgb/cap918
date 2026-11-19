import { Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular';
import type { RenterPrivate, RenterPublic, Room } from '../core/models';

/**
 * Renter ID card. Shows only what the viewer may see:
 *  - `priv` is passed for the owner (and the renter themself): phone, original address, ID proof.
 *  - Roommates get only the public record: name, room, sharing, living since, phone if opted in.
 * Extra actions are projected into the card via <ng-content select="[actions]"> (content slot).
 */
@Component({
  selector: 'app-renter-card',
  imports: [IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent, IonList, IonItem, IonLabel, IonIcon, DatePipe],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ renter().name }}</ion-card-title>
        <ion-card-subtitle>Room {{ room()?.number ?? '–' }} · {{ sharingLabel() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ion-list lines="none">
          <ion-item>
            <ion-icon slot="start" name="calendar-outline" aria-hidden="true"></ion-icon>
            <ion-label>
              <p>Living since</p>
              <h3>{{ renter().livingSince | date: 'd MMM y' }} ({{ tenure() }})</h3>
            </ion-label>
          </ion-item>
          @if (phone(); as ph) {
            <ion-item [href]="'tel:' + ph" [attr.aria-label]="'Call ' + renter().name">
              <ion-icon slot="start" name="call-outline" aria-hidden="true"></ion-icon>
              <ion-label><p>Phone</p><h3>{{ ph }}</h3></ion-label>
            </ion-item>
          } @else {
            <ion-item>
              <ion-icon slot="start" name="lock-closed-outline" aria-hidden="true"></ion-icon>
              <ion-label><p>Phone</p><h3>Hidden by {{ renter().name.split(' ')[0] }}</h3></ion-label>
            </ion-item>
          }
          @if (priv(); as p) {
            <ion-item>
              <ion-icon slot="start" name="home-outline" aria-hidden="true"></ion-icon>
              <ion-label class="ion-text-wrap"><p>Original address</p><h3>{{ p.originalAddress }}</h3></ion-label>
            </ion-item>
            <ion-item>
              <ion-icon slot="start" name="id-card-outline" aria-hidden="true"></ion-icon>
              <ion-label><p>ID proof</p><h3>{{ p.idProofMasked }}</h3></ion-label>
            </ion-item>
          }
        </ion-list>
        <ng-content select="[actions]"></ng-content>
      </ion-card-content>
    </ion-card>
  `,
})
export class RenterCardComponent {
  readonly renter = input.required<RenterPublic>();
  readonly room = input<Room | undefined>();
  readonly priv = input<RenterPrivate | undefined>();

  readonly phone = computed(() => this.priv()?.phone ?? this.renter().publicPhone);
  readonly sharingLabel = computed(() => {
    const n = this.room()?.sharing ?? 0;
    return n === 1 ? 'Single room' : `${n}-sharing`;
  });
  readonly tenure = computed(() => {
    const months = Math.max(0, Math.floor((Date.now() - new Date(this.renter().livingSince).getTime()) / (30.44 * 86_400_000)));
    return months < 12 ? `${months} mo` : `${Math.floor(months / 12)} yr ${months % 12} mo`;
  });
}
