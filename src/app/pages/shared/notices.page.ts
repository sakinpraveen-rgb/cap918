import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { PgDataService } from '../../core/pg-data.service';
import { RepoService } from '../../core/repo.service';
import { UiService } from '../../core/ui.service';
import { AnalyticsService } from '../../core/analytics.service';
import type { Notice } from '../../core/models';

/** Notice board. Everyone reads; only the owner posts, pins and deletes. */
@Component({
  selector: 'app-notices',
  imports: [
    DatePipe,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonButton, IonIcon, IonContent, IonCard, IonCardHeader,
    IonCardTitle, IonCardSubtitle, IonCardContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button [defaultHref]="isOwner() ? '/owner/more' : '/renter/home'"></ion-back-button></ion-buttons>
        <ion-title>Notice board</ion-title>
        @if (isOwner()) {
          <ion-buttons slot="end"><ion-button (click)="post()" aria-label="Post notice"><ion-icon slot="icon-only" name="add-outline"></ion-icon></ion-button></ion-buttons>
        }
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @for (n of notices(); track n.id) {
        <ion-card>
          <ion-card-header>
            <ion-card-subtitle>@if (n.pinned) { 📌 Pinned · } {{ n.createdAt | date: 'd MMM, h:mm a' }}</ion-card-subtitle>
            <ion-card-title>{{ n.title }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <p>{{ n.body }}</p>
            @if (isOwner()) {
              <ion-button size="small" fill="clear" (click)="togglePin(n)">{{ n.pinned ? 'Unpin' : 'Pin' }}</ion-button>
              <ion-button size="small" fill="clear" color="danger" (click)="remove(n)">Delete</ion-button>
            }
          </ion-card-content>
        </ion-card>
      } @empty {
        <p class="ion-padding ion-text-center">No notices yet.</p>
      }
    </ion-content>
  `,
})
export class NoticesPage {
  private readonly auth = inject(AuthService);
  private readonly data = inject(PgDataService);
  private readonly repo = inject(RepoService);
  private readonly ui = inject(UiService);
  private readonly analytics = inject(AnalyticsService);
  private readonly alertCtrl = inject(AlertController);
  readonly notices = toSignal(this.data.notices$(), { initialValue: [] });
  readonly isOwner = computed(() => this.auth.role() === 'owner');

  async post(): Promise<void> {
    const a = await this.alertCtrl.create({
      header: 'New notice',
      inputs: [
        { name: 'title', placeholder: 'Title, e.g. Water off tomorrow' },
        { name: 'body', type: 'textarea', placeholder: 'Details' },
      ],
      buttons: [{ text: 'Cancel', role: 'cancel' }, { text: 'Post', role: 'confirm' }],
    });
    await a.present();
    const { role, data } = await a.onDidDismiss();
    if (role !== 'confirm' || !data?.values?.title?.trim()) return;
    await this.repo.save<Notice>('notices', {
      propertyId: this.auth.session()!.propertyId,
      audience: 'all',
      title: data.values.title.trim(),
      body: (data.values.body ?? '').trim(),
      pinned: false,
      createdAt: new Date().toISOString(),
    });
    this.analytics.track('notice_posted');
    await this.ui.toast('Notice posted');
  }

  togglePin(n: Notice): Promise<Notice> {
    return this.repo.save<Notice>('notices', { id: n.id, pinned: !n.pinned });
  }

  async remove(n: Notice): Promise<void> {
    if (await this.ui.confirm('Delete notice?', n.title, 'Delete')) await this.repo.remove('notices', n.id);
  }
}
