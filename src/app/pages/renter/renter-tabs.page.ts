import { Component, inject } from '@angular/core';
import { IonBadge, IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular';
import { InboxService } from '../../core/inbox.service';

@Component({
  selector: 'app-renter-tabs',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonBadge],
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="home"><ion-icon name="wallet-outline" aria-hidden="true"></ion-icon><ion-label>Dues</ion-label></ion-tab-button>
        <ion-tab-button tab="mess"><ion-icon name="restaurant-outline" aria-hidden="true"></ion-icon><ion-label>Mess</ion-label></ion-tab-button>
        <ion-tab-button tab="complaints"><ion-icon name="chatbubble-ellipses-outline" aria-hidden="true"></ion-icon><ion-label>Complaints</ion-label></ion-tab-button>
        <ion-tab-button tab="notifications">
          <ion-icon name="notifications-outline" aria-hidden="true"></ion-icon><ion-label>Alerts</ion-label>
          @if (inbox.unreadCount() > 0) { <ion-badge color="danger" [attr.aria-label]="inbox.unreadCount() + ' unread notifications'">{{ inbox.unreadCount() }}</ion-badge> }
        </ion-tab-button>
        <ion-tab-button tab="roommates"><ion-icon name="people-outline" aria-hidden="true"></ion-icon><ion-label>Roommates</ion-label></ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class RenterTabsPage {
  readonly inbox = inject(InboxService);
}
