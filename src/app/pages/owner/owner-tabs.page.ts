import { Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs, IonBadge } from '@ionic/angular';
import { PgDataService } from '../../core/pg-data.service';
import { NotificationService } from '../../core/notification.service';
import { InboxService } from '../../core/inbox.service';

@Component({
  selector: 'app-owner-tabs',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonBadge],
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="dues"><ion-icon name="wallet-outline" aria-hidden="true"></ion-icon><ion-label>Dues</ion-label></ion-tab-button>
        <ion-tab-button tab="complaints">
          <ion-icon name="chatbubble-ellipses-outline" aria-hidden="true"></ion-icon><ion-label>Complaints</ion-label>
          @if (openComplaints() > 0) { <ion-badge color="danger" [attr.aria-label]="openComplaints() + ' open'">{{ openComplaints() }}</ion-badge> }
        </ion-tab-button>
        <ion-tab-button tab="notifications">
          <ion-icon name="notifications-outline" aria-hidden="true"></ion-icon><ion-label>Alerts</ion-label>
          @if (inbox.unreadCount() > 0) { <ion-badge color="danger" [attr.aria-label]="inbox.unreadCount() + ' unread notifications'">{{ inbox.unreadCount() }}</ion-badge> }
        </ion-tab-button>
        <ion-tab-button tab="renters"><ion-icon name="people-outline" aria-hidden="true"></ion-icon><ion-label>Renters</ion-label></ion-tab-button>
        <ion-tab-button tab="more"><ion-icon name="ellipsis-horizontal" aria-hidden="true"></ion-icon><ion-label>More</ion-label></ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class OwnerTabsPage {
  private readonly data = inject(PgDataService);
  private readonly notify = inject(NotificationService);
  readonly inbox = inject(InboxService);
  private readonly complaints = toSignal(this.data.complaints$(), { initialValue: [] });
  private readonly rows = toSignal(this.data.renterRows$(), { initialValue: [] });
  private readonly property = toSignal(this.data.property$());

  readonly openComplaints = () => this.complaints().filter((c) => c.status !== 'resolved').length;

  constructor() {
    // Keep the "5 days before due date" owner digest current as payments come in.
    effect(() => {
      const p = this.property();
      const rows = this.rows();
      if (!p || !rows.length) return;
      const pending = rows.filter((r) => r.dues && r.dues.balance > 0);
      void this.notify.scheduleOwnerDigest(
        p.rentDueDay,
        pending.length,
        rows.length,
        pending.reduce((a, r) => a + (r.dues?.balance ?? 0), 0),
      );
    });
  }
}
