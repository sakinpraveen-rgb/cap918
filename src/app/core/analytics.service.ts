import { Injectable } from '@angular/core';
import posthog from 'posthog-js';
import { environment } from '../../environments/environment';
import type { Role } from './models';

/**
 * Product analytics (PostHog). Event names are fixed here so the dashboard stays consistent.
 * Only ids and roles are sent: no names, phones, addresses or amounts.
 */
export type AnalyticsEvent =
  | 'app_opened'
  | 'login_completed'
  | 'invite_opened'
  | 'invite_accepted'
  | 'renter_added'
  | 'payment_submitted'
  | 'payment_confirmed'
  | 'payment_rejected'
  | 'cash_recorded'
  | 'receipt_shared'
  | 'complaint_filed'
  | 'complaint_status_changed'
  | 'complaint_confirmed'
  | 'meal_plan_changed'
  | 'meal_skipped'
  | 'notice_posted'
  | 'reminder_scheduled'
  | 'sync_conflict_merged';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private on = false;

  init(enabled: boolean): void {
    if (!environment.posthogKey || !enabled || this.on) return;
    posthog.init(environment.posthogKey, {
      api_host: environment.posthogHost,
      person_profiles: 'identified_only',
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      persistence: 'localStorage',
    });
    this.on = true;
  }

  identify(userId: string, role: Role, propertyId: string): void {
    if (!this.on) return;
    posthog.identify(userId, { role });
    posthog.group('property', propertyId);
  }

  track(event: AnalyticsEvent, props: Record<string, string | number | boolean> = {}): void {
    if (this.on) posthog.capture(event, props);
  }

  screen(name: string): void {
    if (this.on) posthog.capture('$screen', { $screen_name: name });
  }

  optOut(): void {
    if (this.on) posthog.opt_out_capturing();
  }

  reset(): void {
    if (this.on) posthog.reset();
  }
}
