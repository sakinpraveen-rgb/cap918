import { Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, IonSpinner } from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { AnalyticsService } from '../../core/analytics.service';
import { UiService } from '../../core/ui.service';

/** Landing page for invite deep links: pgmanager://invite/CODE or https://<domain>/invite/CODE */
@Component({
  selector: 'app-invite',
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonIcon, IonSpinner],
  template: `
    <ion-header><ion-toolbar color="primary"><ion-title>Join your PG</ion-title></ion-toolbar></ion-header>
    <ion-content class="ion-padding ion-text-center">
      <ion-icon name="qr-code-outline" style="font-size:72px" aria-hidden="true"></ion-icon>
      <h2>You've been invited</h2>
      <p>Invite code <strong>{{ code() }}</strong></p>
      @if (auth.role()) {
        <p>You're already logged in. Log out first to join a different PG.</p>
        <ion-button (click)="router.navigateByUrl('/')">Go to my PG</ion-button>
      } @else if (auth.demoMode) {
        <ion-button expand="block" (click)="accept()" [disabled]="busy()">Join (demo)</ion-button>
      } @else {
        <p>Log in with your mobile number, then enter this code.</p>
        <ion-button expand="block" (click)="router.navigateByUrl('/login')">Continue</ion-button>
      }
      @if (busy()) { <ion-spinner aria-label="Joining"></ion-spinner> }
    </ion-content>
  `,
})
export class InvitePage {
  readonly code = input.required<string>();
  readonly auth = inject(AuthService);
  readonly router = inject(Router);
  private readonly ui = inject(UiService);
  readonly busy = signal(false);

  constructor() {
    inject(AnalyticsService).track('invite_opened');
  }

  async accept(): Promise<void> {
    this.busy.set(true);
    try {
      await this.auth.joinWithInvite(this.code());
      await this.router.navigateByUrl('/renter/home', { replaceUrl: true });
    } catch (e) {
      await this.ui.toast((e as Error).message, 'danger');
    } finally {
      this.busy.set(false);
    }
  }
}
