import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule, type NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonList,
  IonListHeader,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
  IonNote,
} from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { PgDataService } from '../../core/pg-data.service';
import { RepoService, uuid } from '../../core/repo.service';
import { UiService } from '../../core/ui.service';
import { AnalyticsService } from '../../core/analytics.service';
import { DeepLinkService } from '../../core/deeplink.service';
import type { RenterPrivate, RenterPublic } from '../../core/models';

/** Template-driven form ([(ngModel)] + validation) to add a renter and share their invite link. */
@Component({
  selector: 'app-add-renter',
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent, IonList, IonListHeader, IonItem, IonInput,
    IonSelect, IonSelectOption, IonCheckbox, IonButton, IonLabel, IonNote,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/owner/renters"></ion-back-button></ion-buttons>
        <ion-title>Add renter</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <form #f="ngForm" (ngSubmit)="save(f)">
        <ion-list inset>
          <ion-list-header><ion-label>Renter ID</ion-label></ion-list-header>
          <ion-item><ion-input label="Full name" labelPlacement="stacked" name="name" [(ngModel)]="m.name" required minlength="2"></ion-input></ion-item>
          <ion-item>
            <ion-input label="Mobile number" labelPlacement="stacked" name="phone" type="tel" inputmode="numeric" [(ngModel)]="m.phone"
              required pattern="[6-9][0-9]{9}" maxlength="10" errorText="Enter a 10-digit Indian mobile number"></ion-input>
          </ion-item>
          <ion-item>
            <ion-select label="Room" labelPlacement="stacked" name="room" [(ngModel)]="m.roomId" required interface="action-sheet">
              @for (r of rooms(); track r.id) {
                <ion-select-option [value]="r.id">Room {{ r.number }} ({{ r.sharing }}-sharing)</ion-select-option>
              }
            </ion-select>
          </ion-item>
          <ion-item><ion-input label="Living since" labelPlacement="stacked" name="since" type="date" [(ngModel)]="m.livingSince" required></ion-input></ion-item>
          <ion-item><ion-input label="Original (home) address" labelPlacement="stacked" name="addr" [(ngModel)]="m.originalAddress" required></ion-input></ion-item>
          <ion-item>
            <ion-input label="ID proof, last 4 digits" labelPlacement="stacked" name="idp" inputmode="numeric" maxlength="4" pattern="[0-9]{4}"
              [(ngModel)]="m.idLast4" helperText="Only the last 4 digits are stored (masked)"></ion-input>
          </ion-item>
        </ion-list>

        <ion-list inset>
          <ion-list-header><ion-label>Rent and mess</ion-label></ion-list-header>
          <ion-item><ion-input label="Monthly rent (₹)" labelPlacement="stacked" name="rent" type="number" [(ngModel)]="m.rent" required min="0"></ion-input></ion-item>
          <ion-item><ion-input label="Security deposit (₹)" labelPlacement="stacked" name="dep" type="number" [(ngModel)]="m.deposit" min="0"></ion-input></ion-item>
          <ion-item><ion-checkbox name="b" [(ngModel)]="m.breakfast">Breakfast</ion-checkbox></ion-item>
          <ion-item><ion-checkbox name="l" [(ngModel)]="m.lunch">Lunch</ion-checkbox></ion-item>
          <ion-item><ion-checkbox name="d" [(ngModel)]="m.dinner">Dinner</ion-checkbox></ion-item>
        </ion-list>
        <ion-note class="ion-padding-horizontal">Phone number is hidden from roommates unless the renter chooses to share it.</ion-note>
        <div class="ion-padding">
          <ion-button type="submit" expand="block" [disabled]="f.invalid">Save and share invite</ion-button>
        </div>
      </form>
    </ion-content>
  `,
})
export class AddRenterPage {
  private readonly auth = inject(AuthService);
  private readonly data = inject(PgDataService);
  private readonly repo = inject(RepoService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);
  private readonly analytics = inject(AnalyticsService);
  readonly rooms = toSignal(this.data.rooms$(), { initialValue: [] });

  m = {
    name: '',
    phone: '',
    roomId: '',
    livingSince: new Date().toISOString().slice(0, 10),
    originalAddress: '',
    idLast4: '',
    rent: null as number | null,
    deposit: null as number | null,
    breakfast: true,
    lunch: false,
    dinner: true,
  };

  async save(f: NgForm): Promise<void> {
    if (f.invalid) return;
    const pid = this.auth.session()!.propertyId;
    const id = uuid();
    const inviteCode = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map((b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32])
      .join('');

    await this.repo.save<RenterPublic>('renters', {
      id,
      propertyId: pid,
      audience: 'all',
      name: this.m.name.trim(),
      roomId: this.m.roomId,
      livingSince: this.m.livingSince,
      publicPhone: null,
      active: true,
    });
    await this.repo.save<RenterPrivate>('renterPrivate', {
      id,
      propertyId: pid,
      audience: 'subject',
      subjectUserId: null, // set by the server when the renter joins with the invite code
      phone: `+91${this.m.phone}`,
      originalAddress: this.m.originalAddress.trim(),
      idProofMasked: this.m.idLast4 ? `XXXX-XXXX-${this.m.idLast4}` : '',
      rent: Number(this.m.rent ?? 0),
      deposit: Number(this.m.deposit ?? 0),
      sharePhone: false,
      meals: { breakfast: this.m.breakfast, lunch: this.m.lunch, dinner: this.m.dinner },
      inviteCode,
    });
    this.analytics.track('renter_added');
    await this.ui.share(
      'Join our PG on PG Manager',
      `Hi ${this.m.name.split(' ')[0]}, see your rent, mess and complaints here. Invite code: ${inviteCode}`,
      DeepLinkService.inviteUrl(inviteCode),
    );
    await this.router.navigate(['/owner/renter', id], { replaceUrl: true });
  }
}
