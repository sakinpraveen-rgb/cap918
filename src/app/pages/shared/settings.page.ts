import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { PgDataService } from '../../core/pg-data.service';
import { RepoService } from '../../core/repo.service';
import { SettingsService } from '../../core/settings.service';
import { SyncService } from '../../core/sync.service';
import { AnalyticsService } from '../../core/analytics.service';
import { initCrashReporting } from '../../core/crash.service';
import { UiService } from '../../core/ui.service';
import type { RenterPrivate, RenterPublic } from '../../core/models';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-settings',
  imports: [
    DatePipe,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent, IonList, IonListHeader, IonItem, IonLabel,
    IonToggle, IonNote, IonButton, IonIcon,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button [defaultHref]="auth.role() === 'owner' ? '/owner/more' : '/renter/home'"></ion-back-button></ion-buttons>
        <ion-title>Settings</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (me(); as m) {
        <ion-list inset>
          <ion-list-header><ion-label>Privacy with roommates</ion-label></ion-list-header>
          <ion-item>
            <ion-toggle [checked]="m.sharePhone" (ionChange)="setSharePhone(m, $event.detail.checked)">Show my phone number to roommates</ion-toggle>
          </ion-item>
          <ion-note class="ion-padding-start">Your address, ID and dues are never shown to roommates.</ion-note>
        </ion-list>
      }

      <ion-list inset>
        <ion-list-header><ion-label>Accessibility</ion-label></ion-list-header>
        <ion-item>
          <ion-icon slot="start" name="text-outline" aria-hidden="true"></ion-icon>
          <ion-toggle [checked]="settings.value().largeText" (ionChange)="settings.update({ largeText: $event.detail.checked })">Extra-large text</ion-toggle>
        </ion-item>
      </ion-list>

      <ion-list inset>
        <ion-list-header><ion-label>Help improve the app</ion-label></ion-list-header>
        <ion-item><ion-toggle [checked]="settings.value().analytics" (ionChange)="setAnalytics($event.detail.checked)">Share anonymous usage stats</ion-toggle></ion-item>
        <ion-item><ion-toggle [checked]="settings.value().crashReports" (ionChange)="setCrash($event.detail.checked)">Send crash reports</ion-toggle></ion-item>
        <ion-note class="ion-padding-start">No names, phone numbers, addresses or amounts are ever sent.</ion-note>
      </ion-list>

      <ion-list inset>
        <ion-list-header><ion-label>Sync</ion-label></ion-list-header>
        <ion-item>
          <ion-label>
            @if (auth.session()?.demo) { <h3>Demo mode: data stays on this device</h3> }
            @else {
              <h3>{{ sync.online() ? 'Online' : 'Offline' }} · {{ sync.pending() }} change(s) waiting</h3>
              <p>Last synced {{ sync.lastSyncedAt() ? (sync.lastSyncedAt() | date: 'h:mm:ss a') : 'never' }}</p>
            }
          </ion-label>
          @if (!auth.session()?.demo) { <ion-button slot="end" fill="outline" (click)="sync.syncNow()">Sync now</ion-button> }
        </ion-item>
      </ion-list>

      <ion-list inset>
        <ion-item button (click)="logout()"><ion-icon slot="start" name="log-out-outline" aria-hidden="true"></ion-icon><ion-label>Log out</ion-label></ion-item>
        @if (auth.session()?.demo) {
          <ion-item button (click)="resetDemo()"><ion-icon slot="start" name="refresh-outline" aria-hidden="true"></ion-icon><ion-label>Reset demo data</ion-label></ion-item>
        }
        <ion-item button (click)="deleteAccount()"><ion-icon slot="start" name="trash-outline" color="danger" aria-hidden="true"></ion-icon><ion-label color="danger">Delete my account</ion-label></ion-item>
      </ion-list>
      <p class="ion-text-center"><ion-note>PG Manager v{{ version }}</ion-note></p>
    </ion-content>
  `,
})
export class SettingsPage {
  readonly auth = inject(AuthService);
  readonly settings = inject(SettingsService);
  readonly sync = inject(SyncService);
  private readonly data = inject(PgDataService);
  private readonly repo = inject(RepoService);
  private readonly analytics = inject(AnalyticsService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);
  readonly version = environment.appVersion;

  private readonly privates = toSignal(this.data.privates$(), { initialValue: [] });
  readonly me = computed(() => {
    const id = this.auth.session()?.renterId;
    return id ? this.privates().find((p) => p.id === id) : undefined;
  });

  async setSharePhone(m: RenterPrivate, share: boolean): Promise<void> {
    await this.repo.save<RenterPrivate>('renterPrivate', { id: m.id, sharePhone: share });
    await this.repo.save<RenterPublic>('renters', { id: m.id, publicPhone: share ? m.phone : null });
  }

  setAnalytics(on: boolean): void {
    this.settings.update({ analytics: on, consentAsked: true });
    if (on) this.analytics.init(true);
    else this.analytics.optOut();
  }

  setCrash(on: boolean): void {
    this.settings.update({ crashReports: on, consentAsked: true });
    initCrashReporting(on); // takes full effect on next launch when turning off
  }

  async logout(): Promise<void> {
    const msg = this.auth.session()?.demo
      ? 'Demo data stays on this device, so you can log in as someone else and see your changes.'
      : 'Unsynced changes on this device will be lost.';
    if (!(await this.ui.confirm('Log out?', msg, 'Log out'))) return;
    await this.auth.logout();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  async resetDemo(): Promise<void> {
    if (!(await this.ui.confirm('Reset demo data?', 'All changes are erased and the sample PG starts fresh.', 'Reset'))) return;
    await this.auth.resetDemo();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  async deleteAccount(): Promise<void> {
    const ok = await this.ui.confirm(
      'Delete account?',
      'Your login and personal details will be erased. Payment records your owner needs for accounting are kept in anonymised form.',
      'Delete',
    );
    if (!ok) return;
    try {
      await this.auth.deleteAccount();
    } catch (e) {
      await this.ui.toast((e as Error).message, 'danger');
      return;
    }
    await this.ui.toast('Account deleted', 'medium');
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
