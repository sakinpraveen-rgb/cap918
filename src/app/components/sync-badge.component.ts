import { Component, computed, inject } from '@angular/core';
import { IonIcon, IonButton } from '@ionic/angular';
import { SyncService } from '../core/sync.service';
import { AuthService } from '../core/auth.service';

/** Toolbar badge: Offline / Syncing / N changes waiting / Synced. */
@Component({
  selector: 'app-sync-badge',
  imports: [IonIcon, IonButton],
  template: `
    <ion-button fill="clear" size="small" (click)="sync.syncNow()" [attr.aria-label]="label()">
      @switch (state()) {
        @case ('demo') { <ion-icon slot="start" name="sparkles-outline" aria-hidden="true"></ion-icon> Demo }
        @case ('offline') { <ion-icon slot="start" name="cloud-offline-outline" color="warning" aria-hidden="true"></ion-icon> Offline }
        @case ('pending') { <ion-icon slot="start" name="cloud-upload-outline" aria-hidden="true"></ion-icon> {{ sync.pending() }} }
        @default { <ion-icon name="cloud-done-outline" color="success" aria-hidden="true"></ion-icon> }
      }
    </ion-button>
  `,
})
export class SyncBadgeComponent {
  readonly sync = inject(SyncService);
  private readonly auth = inject(AuthService);

  readonly state = computed(() => {
    if (this.auth.session()?.demo) return 'demo';
    if (!this.sync.online()) return 'offline';
    if (this.sync.pending() > 0 || this.sync.syncing()) return 'pending';
    return 'synced';
  });

  readonly label = computed(() => {
    switch (this.state()) {
      case 'demo':
        return 'Demo mode, data stays on this device';
      case 'offline':
        return `Offline. ${this.sync.pending()} changes will sync when you reconnect`;
      case 'pending':
        return `${this.sync.pending()} changes waiting to sync. Tap to sync now`;
      default:
        return 'All changes synced';
    }
  });
}
