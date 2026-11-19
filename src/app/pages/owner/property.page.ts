import { Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Geolocation } from '@capacitor/geolocation';
import {
  IonAccordion,
  IonAccordionGroup,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { PgDataService } from '../../core/pg-data.service';
import { RepoService } from '../../core/repo.service';
import { UiService } from '../../core/ui.service';
import type { Menu, MealSlot, Property, Weekday } from '../../core/models';

const DAYS: Array<[Weekday, string]> = [
  ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday'],
];

/** PG settings: UPI, due day, late fee, mess rates + weekly menu, and GPS location (Capacitor Geolocation). */
@Component({
  selector: 'app-property',
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonButton, IonContent, IonList, IonListHeader, IonItem,
    IonInput, IonLabel, IonNote, IonIcon, IonAccordionGroup, IonAccordion,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/owner/more"></ion-back-button></ion-buttons>
        <ion-title>PG and mess settings</ion-title>
        <ion-buttons slot="end"><ion-button (click)="save()" [strong]="true">Save</ion-button></ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (p(); as p) {
        <ion-list inset>
          <ion-list-header><ion-label>PG</ion-label></ion-list-header>
          <ion-item><ion-input label="Name" labelPlacement="stacked" [(ngModel)]="p.name"></ion-input></ion-item>
          <ion-item><ion-input label="Address" labelPlacement="stacked" [(ngModel)]="p.address"></ion-input></ion-item>
          <ion-item>
            <ion-label>
              <p>Location</p>
              <h3>{{ p.lat ? (p.lat.toFixed(5) + ', ' + p.lng!.toFixed(5)) : 'Not set' }}</h3>
            </ion-label>
            <ion-button slot="end" fill="outline" (click)="locate()" [disabled]="locating()">
              <ion-icon slot="start" name="locate-outline" aria-hidden="true"></ion-icon> Use GPS
            </ion-button>
          </ion-item>
        </ion-list>

        <ion-list inset>
          <ion-list-header><ion-label>Rent</ion-label></ion-list-header>
          <ion-item><ion-input label="UPI ID" labelPlacement="stacked" [(ngModel)]="p.upiId"></ion-input></ion-item>
          <ion-item><ion-input label="Rent due day (1–28)" labelPlacement="stacked" type="number" min="1" max="28" [(ngModel)]="p.rentDueDay"></ion-input></ion-item>
          <ion-item><ion-input label="Late fee (₹)" labelPlacement="stacked" type="number" min="0" [(ngModel)]="p.lateFee"></ion-input></ion-item>
        </ion-list>

        <ion-list inset>
          <ion-list-header><ion-label>Mess (monthly price per meal)</ion-label></ion-list-header>
          <ion-item><ion-input label="Breakfast (₹/month)" labelPlacement="stacked" type="number" [(ngModel)]="p.messRates.breakfast"></ion-input></ion-item>
          <ion-item><ion-input label="Lunch (₹/month)" labelPlacement="stacked" type="number" [(ngModel)]="p.messRates.lunch"></ion-input></ion-item>
          <ion-item><ion-input label="Dinner (₹/month)" labelPlacement="stacked" type="number" [(ngModel)]="p.messRates.dinner"></ion-input></ion-item>
          <ion-item><ion-input label="Rebate per skipped meal (₹)" labelPlacement="stacked" type="number" [(ngModel)]="p.skipRebate"></ion-input></ion-item>
          <ion-item><ion-input label="Skip cutoff time" labelPlacement="stacked" type="time" [(ngModel)]="p.messCutoff"></ion-input></ion-item>
          <ion-note class="ion-padding">Renters can skip today's meals until the cutoff time.</ion-note>
        </ion-list>

        @if (menu(); as menu) {
          <ion-list-header><ion-label>Weekly menu</ion-label></ion-list-header>
          <ion-accordion-group>
            @for (d of days; track d[0]) {
              <ion-accordion [value]="d[0]">
                <ion-item slot="header"><ion-label>{{ d[1] }}</ion-label></ion-item>
                <ion-list slot="content">
                  @for (slot of slots; track slot) {
                    <ion-item><ion-input [label]="slot" labelPlacement="stacked" [(ngModel)]="menu.days[d[0]][slot]"></ion-input></ion-item>
                  }
                </ion-list>
              </ion-accordion>
            }
          </ion-accordion-group>
        }
      }
    </ion-content>
  `,
})
export class PropertyPage {
  private readonly data = inject(PgDataService);
  private readonly repo = inject(RepoService);
  private readonly ui = inject(UiService);
  private readonly property = toSignal(this.data.property$());
  private readonly menuSrc = toSignal(this.data.menu$());
  readonly days = DAYS;
  readonly slots: MealSlot[] = ['breakfast', 'lunch', 'dinner'];
  readonly locating = signal(false);

  /** Editable copies, so typing doesn't write to the DB until Save. */
  readonly p = signal<Property | null>(null);
  readonly menu = signal<Menu | null>(null);

  constructor() {
    effect(() => {
      const src = this.property();
      if (src && !this.p()) this.p.set(structuredClone(src));
    });
    effect(() => {
      const src = this.menuSrc();
      const p = this.property();
      if (this.menu() || !p) return;
      const empty = () => ({ breakfast: '', lunch: '', dinner: '' });
      this.menu.set(src
        ? structuredClone(src)
        : ({
            id: `menu-${p.id}`,
            propertyId: p.id,
            audience: 'all',
            _hlc: {},
            days: Object.fromEntries(DAYS.map(([d]) => [d, empty()])) as Menu['days'],
          } as Menu));
    });
  }

  async locate(): Promise<void> {
    this.locating.set(true);
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
      this.p.update((p) => p && { ...p, lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      await this.ui.toast('Could not get location. Check permission.', 'danger');
    } finally {
      this.locating.set(false);
    }
  }

  async save(): Promise<void> {
    const edited = this.p();
    if (!edited) return;
    const day = Math.min(28, Math.max(1, Math.round(Number(edited.rentDueDay))));
    const original = this.property()!;
    // Only send fields that actually changed, so concurrent edits on other fields are preserved.
    const changed = diff(original as unknown as Record<string, unknown>, { ...edited, rentDueDay: day } as unknown as Record<string, unknown>);
    if (Object.keys(changed).length) await this.repo.save<Property>('properties', { id: original.id, ...changed });
    const menu = this.menu();
    if (menu && JSON.stringify(menu.days) !== JSON.stringify(this.menuSrc()?.days)) {
      await this.repo.save<Menu>('menus', { id: menu.id, propertyId: menu.propertyId, audience: 'all', days: menu.days });
    }
    await this.ui.toast('Saved');
  }
}

function diff(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(b)) {
    if (k === '_hlc' || k === 'id') continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out[k] = typeof a[k] === 'number' ? Number(b[k]) : b[k];
  }
  return out;
}
