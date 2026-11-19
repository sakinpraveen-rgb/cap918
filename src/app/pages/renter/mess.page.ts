import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  IonCheckbox,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
  IonToggle,
  IonText,
} from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { PgDataService } from '../../core/pg-data.service';
import { RepoService } from '../../core/repo.service';
import { UiService } from '../../core/ui.service';
import { AnalyticsService } from '../../core/analytics.service';
import { isoDate, messCharge } from '../../core/dues';
import type { MealPlan, MealSkip, MealSlot, RenterPrivate, Weekday } from '../../core/models';

const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const SLOTS: Array<{ key: MealSlot; label: string; time: string }> = [
  { key: 'breakfast', label: 'Breakfast', time: '7:30–9:30 am' },
  { key: 'lunch', label: 'Lunch', time: '12:30–2:30 pm' },
  { key: 'dinner', label: 'Dinner', time: '8–10 pm' },
];

/**
 * Mess: choose any combination of breakfast / lunch / dinner (3 checkboxes cover all 7 combos),
 * see the weekly menu, and skip today's meals before the cutoff.
 */
@Component({
  selector: 'app-mess',
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonListHeader, IonItem, IonLabel, IonCheckbox, IonNote, IonSegment,
    IonSegmentButton, IonToggle, IonText,
  ],
  template: `
    <ion-header><ion-toolbar color="primary"><ion-title>Mess</ion-title></ion-toolbar></ion-header>
    <ion-content>
      @if (me(); as m) {
        <ion-list inset>
          <ion-list-header>
            <ion-label>My meal plan</ion-label>
            <ion-note class="ion-padding-end">₹{{ monthly() }}/month</ion-note>
          </ion-list-header>
          @for (s of slots; track s.key) {
            <ion-item>
              <ion-checkbox [ngModel]="m.meals[s.key]" (ngModelChange)="setMeal(m, s.key, $event)" justify="space-between">
                {{ s.label }} <ion-note>· {{ s.time }} · ₹{{ rate(s.key) }}</ion-note>
              </ion-checkbox>
            </ion-item>
          }
          <ion-item lines="none"><ion-note>Plan: <strong>{{ planName(m.meals) }}</strong>. Changes apply to this month's bill.</ion-note></ion-item>
        </ion-list>

        <ion-list inset>
          <ion-list-header><ion-label>Today, {{ todayLabel }}</ion-label></ion-list-header>
          @if (!beforeCutoff()) {
            <ion-item lines="none"><ion-text color="medium"><p>Skipping closed at {{ property()?.messCutoff }}.</p></ion-text></ion-item>
          }
          @for (s of slots; track s.key) {
            @if (m.meals[s.key]) {
              <ion-item>
                <ion-toggle [checked]="!isSkipped(s.key)" [disabled]="!beforeCutoff()" (ionChange)="toggleSkip(s.key, !$event.detail.checked)">
                  {{ s.label }}: {{ menuFor(today, s.key) || '–' }}
                </ion-toggle>
              </ion-item>
            }
          }
          @if (property()?.skipRebate) {
            <ion-item lines="none"><ion-note>Each skipped meal saves ₹{{ property()!.skipRebate }} on your bill.</ion-note></ion-item>
          }
        </ion-list>
      }

      <ion-list-header><ion-label>Weekly menu</ion-label></ion-list-header>
      <ion-segment [(ngModel)]="day" scrollable aria-label="Day of week">
        @for (d of weekdays; track d) { <ion-segment-button [value]="d"><ion-label>{{ d.toUpperCase() }}</ion-label></ion-segment-button> }
      </ion-segment>
      <ion-list>
        @for (s of slots; track s.key) {
          <ion-item><ion-label class="ion-text-wrap"><p>{{ s.label }}</p><h3>{{ menuFor(day, s.key) || 'Not set' }}</h3></ion-label></ion-item>
        }
      </ion-list>
    </ion-content>
  `,
})
export class MessPage {
  private readonly auth = inject(AuthService);
  private readonly data = inject(PgDataService);
  private readonly repo = inject(RepoService);
  private readonly ui = inject(UiService);
  private readonly analytics = inject(AnalyticsService);
  readonly property = toSignal(this.data.property$());
  private readonly menu = toSignal(this.data.menu$());
  private readonly privates = toSignal(this.data.privates$(), { initialValue: [] });
  private readonly skips = toSignal(this.data.skips$(), { initialValue: [] });

  readonly slots = SLOTS;
  readonly weekdays: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  readonly today: Weekday = WEEKDAYS[new Date().getDay()];
  readonly todayKey = isoDate(new Date());
  readonly todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  day: Weekday = this.today;

  readonly me = computed(() => this.privates().find((p) => p.id === this.auth.session()?.renterId));
  readonly monthly = computed(() => {
    const p = this.property();
    const m = this.me();
    return p && m ? messCharge(m.meals, p) : 0;
  });
  private readonly mySkipsToday = computed(() =>
    this.skips().filter((s) => s.renterId === this.auth.session()?.renterId && s.date === this.todayKey),
  );

  rate(slot: MealSlot): number {
    return this.property()?.messRates[slot] ?? 0;
  }

  menuFor(day: Weekday, slot: MealSlot): string {
    return this.menu()?.days?.[day]?.[slot] ?? '';
  }

  planName(m: MealPlan): string {
    const on = SLOTS.filter((s) => m[s.key]).map((s) => s.label);
    if (on.length === 0) return 'No mess';
    if (on.length === 3) return 'All three meals';
    return on.join(' + ');
  }

  beforeCutoff(): boolean {
    const cutoff = this.property()?.messCutoff ?? '10:00';
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` < cutoff;
  }

  isSkipped(slot: MealSlot): boolean {
    return this.mySkipsToday().some((s) => s.meal === slot);
  }

  async setMeal(m: RenterPrivate, slot: MealSlot, on: boolean): Promise<void> {
    await this.repo.save<RenterPrivate>('renterPrivate', { id: m.id, meals: { ...m.meals, [slot]: on } });
    this.analytics.track('meal_plan_changed', { slot, on });
    await this.ui.toast(`${slot[0].toUpperCase() + slot.slice(1)} ${on ? 'added' : 'removed'}`, 'medium');
  }

  async toggleSkip(slot: MealSlot, skip: boolean): Promise<void> {
    const s = this.auth.session()!;
    const existing = this.mySkipsToday().find((x) => x.meal === slot);
    if (skip && !existing) {
      // Deterministic id: two devices skipping the same meal merge into one record.
      await this.repo.save<MealSkip>('mealSkips', {
        id: `${s.renterId}-${this.todayKey}-${slot}`,
        propertyId: s.propertyId,
        audience: 'subject',
        subjectUserId: s.userId,
        renterId: s.renterId!,
        date: this.todayKey,
        meal: slot,
        deleted: false,
      });
      this.analytics.track('meal_skipped', { slot });
    } else if (!skip && existing) {
      await this.repo.remove('mealSkips', existing.id);
    }
  }
}
