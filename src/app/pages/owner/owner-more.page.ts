import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonTitle, IonToolbar, IonNote } from '@ionic/angular';
import { PgDataService } from '../../core/pg-data.service';

@Component({
  selector: 'app-owner-more',
  imports: [RouterLink, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonIcon, IonLabel, IonNote],
  template: `
    <ion-header><ion-toolbar color="primary"><ion-title>{{ property()?.name ?? 'More' }}</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <ion-list inset>
        <ion-item routerLink="/notices" detail>
          <ion-icon slot="start" name="megaphone-outline" aria-hidden="true"></ion-icon><ion-label>Notice board</ion-label>
          <ion-note slot="end">{{ noticeCount() }}</ion-note>
        </ion-item>
        <ion-item routerLink="/owner/rooms" detail><ion-icon slot="start" name="grid-outline" aria-hidden="true"></ion-icon><ion-label>Rooms and occupancy</ion-label></ion-item>
        <ion-item routerLink="/owner/property" detail><ion-icon slot="start" name="restaurant-outline" aria-hidden="true"></ion-icon><ion-label>PG, rent and mess settings</ion-label></ion-item>
      </ion-list>
      <ion-list inset>
        <ion-item routerLink="/settings" detail><ion-icon slot="start" name="settings-outline" aria-hidden="true"></ion-icon><ion-label>App settings and privacy</ion-label></ion-item>
      </ion-list>
    </ion-content>
  `,
})
export class OwnerMorePage {
  private readonly data = inject(PgDataService);
  readonly property = toSignal(this.data.property$());
  private readonly notices = toSignal(this.data.notices$(), { initialValue: [] });
  readonly noticeCount = () => this.notices().length;
}
