import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonNote,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  IonAvatar,
  IonButtons,
} from '@ionic/angular';
import { AuthService, type DemoRenter } from '../../core/auth.service';
import { StatusChipComponent } from '../../components/status-chip.component';
import { UiService } from '../../core/ui.service';
import type { Role } from '../../core/models';

/**
 * Login + onboarding.
 *   Demo mode → choose Owner / Renter.
 *   Live mode → phone → OTP → (if new) owner creates PG, or renter enters invite code.
 */
@Component({
  selector: 'app-login',
  imports: [
    FormsModule, DatePipe, StatusChipComponent,
    IonHeader, IonToolbar, IonTitle, IonContent, IonCard, IonCardContent, IonList, IonItem, IonInput,
    IonButton, IonIcon, IonNote, IonText, IonSpinner, IonSegment, IonSegmentButton, IonLabel,
    IonAvatar, IonButtons,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        @if (renters()) {
          <ion-buttons slot="start">
            <ion-button (click)="renters.set(null)" aria-label="Back"><ion-icon slot="icon-only" name="arrow-back-outline"></ion-icon></ion-button>
          </ion-buttons>
          <ion-title>Choose a renter</ion-title>
        } @else {
          <ion-title>PG Manager</ion-title>
        }
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      @if (renters(); as list) {
        <ion-text color="medium"><p>Sunshine PG (Boys) · {{ list.length }} renters. Tap anyone to log in as them.</p></ion-text>
        <ion-list lines="full" class="renter-picker">
          @for (r of list; track r.id) {
            <ion-item button detail (click)="loginAsRenter(r)" [disabled]="busy()"
              [attr.aria-label]="'Log in as ' + r.name + ', room ' + r.roomNumber">
              <ion-avatar slot="start" aria-hidden="true"><div class="initials">{{ initials(r.name) }}</div></ion-avatar>
              <ion-label>
                <h2>{{ r.name }}</h2>
                <p>Room {{ r.roomNumber }} · {{ r.sharing === 1 ? 'Single' : r.sharing + '-sharing' }}</p>
                <p>Since {{ r.livingSince | date: 'MMM y' }} · {{ r.phone }}</p>
              </ion-label>
              <div slot="end" class="ion-text-end">
                <app-status-chip [status]="r.dues?.status ?? 'due'" />
                @if (r.dues && r.dues.balance > 0) { <p class="bal">₹{{ r.dues.balance.toLocaleString('en-IN') }}</p> }
              </div>
            </ion-item>
          }
        </ion-list>
      } @else {
      <div class="hero">
        <ion-icon name="business-outline" aria-hidden="true"></ion-icon>
        <h1>Rent, mess and complaints<br />for your PG, in one place</h1>
        <p>Works offline. Free for owners and renters.</p>
      </div>

      @if (auth.demoMode) {
        <ion-card>
          <ion-card-content>
            <ion-text><h2>Try the demo</h2></ion-text>
            <p>No backend is configured, so the app runs with sample data stored only on this device.</p>
            <ion-button expand="block" (click)="demo('owner')" class="ion-margin-top">
              <ion-icon slot="start" name="business-outline" aria-hidden="true"></ion-icon> I'm a PG owner
            </ion-button>
            <ion-button expand="block" fill="outline" (click)="demo('renter')">
              <ion-icon slot="start" name="person-outline" aria-hidden="true"></ion-icon> I'm a renter
            </ion-button>
          </ion-card-content>
        </ion-card>
      } @else if (auth.needsOnboarding()) {
        <ion-segment [(ngModel)]="onboardAs" aria-label="I am a">
          <ion-segment-button value="owner"><ion-label>PG owner</ion-label></ion-segment-button>
          <ion-segment-button value="renter"><ion-label>Renter</ion-label></ion-segment-button>
        </ion-segment>
        @if (onboardAs === 'owner') {
          <ion-list>
            <ion-item><ion-input label="PG name" labelPlacement="stacked" [(ngModel)]="pgName" required></ion-input></ion-item>
            <ion-item><ion-input label="Address" labelPlacement="stacked" [(ngModel)]="pgAddress"></ion-input></ion-item>
            <ion-item><ion-input label="UPI ID for rent" labelPlacement="stacked" placeholder="name@okaxis" [(ngModel)]="upiId"></ion-input></ion-item>
          </ion-list>
          <ion-button expand="block" [disabled]="!pgName || !upiId || busy()" (click)="createPg()">Create my PG</ion-button>
        } @else {
          <ion-list>
            <ion-item>
              <ion-input label="Invite code from your owner" labelPlacement="stacked" [(ngModel)]="inviteCode" maxlength="12" autocapitalize="characters"></ion-input>
            </ion-item>
          </ion-list>
          <ion-note class="ion-padding-start">Or simply tap the invite link your owner sent on WhatsApp.</ion-note>
          <ion-button expand="block" [disabled]="inviteCode.length < 4 || busy()" (click)="join()">Join PG</ion-button>
        }
      } @else {
        <ion-list>
          @if (!otpSent()) {
            <ion-item>
              <ion-input label="Mobile number" labelPlacement="stacked" type="tel" inputmode="numeric" maxlength="10"
                placeholder="98765 43210" [(ngModel)]="phone" helperText="We'll send a 6-digit OTP"></ion-input>
            </ion-item>
          } @else {
            <ion-item>
              <ion-input label="OTP" labelPlacement="stacked" type="text" inputmode="numeric" maxlength="6"
                autocomplete="one-time-code" [(ngModel)]="otp"></ion-input>
            </ion-item>
          }
        </ion-list>
        @if (!otpSent()) {
          <ion-button expand="block" [disabled]="phone.length !== 10 || busy()" (click)="sendOtp()">Send OTP</ion-button>
        } @else {
          <ion-button expand="block" [disabled]="otp.length !== 6 || busy()" (click)="verify()">Verify</ion-button>
          <ion-button expand="block" fill="clear" (click)="otpSent.set(false)">Change number</ion-button>
        }
      }
      }
      @if (busy()) { <div class="ion-text-center"><ion-spinner aria-label="Loading"></ion-spinner></div> }
    </ion-content>
  `,
  styles: `
    .hero { text-align:center; margin: 24px 0; }
    .hero ion-icon { font-size: 64px; color: var(--ion-color-primary); }
    .hero h1 { font-size: 1.4em; font-weight: 700; }
    .initials { width:100%; height:100%; border-radius:50%; display:flex; align-items:center; justify-content:center;
      background: var(--ion-color-primary); color:#fff; font-weight:700; }
    .bal { margin: 4px 0 0; font-weight: 600; font-size: .9em; }
  `,
})
export class LoginPage {
  readonly auth = inject(AuthService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);

  phone = '';
  otp = '';
  onboardAs: Role = 'owner';
  pgName = '';
  pgAddress = '';
  upiId = '';
  inviteCode = '';
  readonly otpSent = signal(false);
  readonly busy = signal(false);

  /** Sample renters for the "choose a renter" list (null = list not shown). */
  readonly renters = signal<DemoRenter[] | null>(null);

  async demo(role: Role): Promise<void> {
    if (role === 'renter') {
      await this.run(async () => this.renters.set(await this.auth.demoRenters()));
      return;
    }
    await this.auth.loginDemo(role);
    await this.goHome();
  }

  loginAsRenter = (r: DemoRenter) => this.run(async () => {
    await this.auth.loginDemo('renter', r.id);
    this.renters.set(null);
    await this.goHome();
  });

  initials(name: string): string {
    return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  }

  sendOtp = () => this.run(async () => {
    await this.auth.sendOtp(`+91${this.phone}`);
    this.otpSent.set(true);
  });

  verify = () => this.run(async () => {
    await this.auth.verifyOtp(`+91${this.phone}`, this.otp);
    if (!this.auth.needsOnboarding()) await this.goHome();
  });

  createPg = () => this.run(async () => {
    await this.auth.createProperty(this.pgName, this.pgAddress, this.upiId);
    await this.goHome();
  });

  join = () => this.run(async () => {
    await this.auth.joinWithInvite(this.inviteCode);
    await this.goHome();
  });

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await fn();
    } catch (e) {
      await this.ui.toast((e as Error).message || 'Something went wrong', 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  private goHome(): Promise<boolean> {
    return this.router.navigateByUrl(this.auth.role() === 'owner' ? '/owner/dues' : '/renter/home', { replaceUrl: true });
  }
}
