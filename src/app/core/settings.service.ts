import { Injectable, signal } from '@angular/core';

export interface AppSettings {
  analytics: boolean; // product analytics consent (DPDP)
  crashReports: boolean; // crash report consent
  largeText: boolean; // extra-large text mode for accessibility
  consentAsked: boolean;
}

const KEY = 'pg.settings';
const DEFAULTS: AppSettings = { analytics: false, crashReports: false, largeText: false, consentAsked: false };

/** Per-device preferences (not synced). */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly value = signal<AppSettings>(this.read());

  update(patch: Partial<AppSettings>): void {
    const next = { ...this.value(), ...patch };
    this.value.set(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
    this.applyTextSize();
  }

  applyTextSize(): void {
    document.documentElement.classList.toggle('large-text', this.value().largeText);
  }

  private read(): AppSettings {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    } catch {
      return DEFAULTS;
    }
  }
}
