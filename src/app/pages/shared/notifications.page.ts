import { Component, computed, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemDivider,
  IonItemGroup,
  IonLabel,
  IonList,
  IonNote,
  IonRefresher,
  IonRefresherContent,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { InboxService } from '../../core/inbox.service';
import { SyncService } from '../../core/sync.service';
import { timeAgo } from '../../core/inbox';
import type { AppNotification } from '../../core/models';
import { SyncBadgeComponent } from '../../components/sync-badge.component';

type Filter = 'all' | 'unread';

/**
 * Notification centre, shared by both roles (it is a tab in both tab bars).
 * Owner: "Rahul paid ₹10,600" → tap → review proof → approve / reject.
 * Renter: "Payment approved / rejected" → tap → see decision, receipt or reason.
 */
@Component({
  selector: 'app-notifications',
  imports: [
    NgClass, FormsModule, SyncBadgeComponent,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonSegment, IonSegmentButton, IonLabel, IonList,
    IonItemGroup, IonItemDivider, IonItem, IonIcon, IonNote, IonRefresher, IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Notifications</ion-title>
        <ion-buttons slot="end">
          <app-sync-badge />
          @if (inbox.unreadCount() > 0) {
            <ion-button (click)="inbox.markAllRead()" aria-label="Mark all as read">
              <ion-icon slot="icon-only" name="checkmark-done-outline"></ion-icon>
            </ion-button>
          }
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [(ngModel)]="filter" aria-label="Show">
          <ion-segment-button value="all"><ion-label>All</ion-label></ion-segment-button>
          <ion-segment-button value="unread"><ion-label>Unread ({{ inbox.unreadCount() }})</ion-label></ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content /></ion-refresher>

      <ion-list>
        @if (isOwner() && needsAction().length) {
          <ion-item-group>
            <ion-item-divider color="light" sticky>
              <ion-label>Needs your approval ({{ needsAction().length }})</ion-label>
            </ion-item-divider>
            @for (n of needsAction(); track n.id) {
              <ion-item button detail (click)="open(n)" [ngClass]="{ unread: !n.read }" [attr.aria-label]="label(n)">
                <ion-icon slot="start" [name]="icon(n)" [color]="color(n)" aria-hidden="true"></ion-icon>
                <ion-label class="ion-text-wrap">
                  <h2>{{ n.title }}</h2>
                  <p>{{ n.body }}</p>
                  @if (n.photo) { <img class="thumb" [src]="n.photo" alt="Screenshot attached by the renter" /> }
                </ion-label>
                <ion-note slot="end">{{ ago(n.at) }}</ion-note>
              </ion-item>
            }
          </ion-item-group>
        }

        <ion-item-group>
          @if (isOwner() && needsAction().length) {
            <ion-item-divider color="light" sticky><ion-label>Earlier</ion-label></ion-item-divider>
          }
          @for (n of rest(); track n.id) {
            <ion-item button detail (click)="open(n)" [ngClass]="{ unread: !n.read }" [attr.aria-label]="label(n)">
              <ion-icon slot="start" [name]="icon(n)" [color]="color(n)" aria-hidden="true"></ion-icon>
              <ion-label class="ion-text-wrap">
                <h2>{{ n.title }}</h2>
                <p>{{ n.body }}</p>
                @if (n.photo) { <img class="thumb" [src]="n.photo" alt="Screenshot attached by the renter" /> }
              </ion-label>
              <ion-note slot="end">{{ ago(n.at) }}</ion-note>
            </ion-item>
          } @empty {
            @if (!needsAction().length || !isOwner()) {
              <div class="empty">
                <ion-icon name="notifications-outline" aria-hidden="true"></ion-icon>
                <p>{{ filter === 'unread' ? "You're all caught up." : emptyText() }}</p>
              </div>
            }
          }
        </ion-item-group>
      </ion-list>
    </ion-content>
  `,
  styles: `
    ion-item.unread { --background: rgba(var(--ion-color-primary-rgb, 0, 84, 233), 0.08); }
    ion-item.unread h2 { font-weight: 700; }
    ion-item.unread ion-note::after { content: ' ●'; color: var(--ion-color-primary); }
    ion-item ion-icon[slot='start'] { font-size: 28px; }
    .thumb { display:block; margin-top:6px; height:96px; max-width:60%; object-fit:cover; object-position:top; border-radius:8px; border:1px solid var(--ion-color-light-shade); }
    .empty { text-align: center; padding: 48px 24px; color: var(--ion-color-medium-shade); }
    .empty ion-icon { font-size: 56px; }
  `,
})
export class NotificationsPage {
  readonly inbox = inject(InboxService);
  private readonly auth = inject(AuthService);
  private readonly sync = inject(SyncService);
  private readonly router = inject(Router);
  filter: Filter = 'all';

  readonly isOwner = computed(() => this.auth.role() === 'owner');
  readonly emptyText = computed(() =>
    this.isOwner()
      ? 'When a renter pays rent, it shows up here for you to approve.'
      : 'When your owner approves or rejects a payment, you will see it here.',
  );

  // Plain methods (not computed) so they also react to the ngModel-bound filter.
  needsAction(): AppNotification[] {
    return this.inbox.items().filter((n) => n.actionNeeded && (this.filter === 'all' || !n.read));
  }
  rest(): AppNotification[] {
    return this.inbox.items().filter((n) => !n.actionNeeded && (this.filter === 'all' || !n.read));
  }

  icon(n: AppNotification): string {
    switch (n.kind) {
      case 'payment_submitted':
        return n.actionNeeded ? 'wallet-outline' : 'receipt-outline';
      case 'payment_approved':
      case 'cash_recorded':
        return 'checkmark-circle';
      default:
        return 'close-circle-outline';
    }
  }

  color(n: AppNotification): string {
    if (n.kind === 'payment_rejected') return 'danger';
    if (n.kind === 'payment_submitted' && n.actionNeeded) return 'warning';
    return n.kind === 'payment_submitted' ? 'medium' : 'success';
  }

  ago(iso: string): string {
    return timeAgo(iso);
  }

  label(n: AppNotification): string {
    return `${n.read ? '' : 'Unread. '}${n.title}. ${n.body}. ${timeAgo(n.at)}`;
  }

  async open(n: AppNotification): Promise<void> {
    await this.inbox.markRead([n.id]);
    await this.router.navigate(['/payment', n.paymentId]);
  }

  async refresh(ev: CustomEvent): Promise<void> {
    await this.sync.syncNow();
    (ev.target as HTMLIonRefresherElement).complete();
  }
}
