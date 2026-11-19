import { Injectable, computed, inject, signal } from '@angular/core';
import { DbService } from './db.service';
import type { Property, Role, Session } from './models';
import { RepoService, uuid } from './repo.service';
import { SupabaseService } from './supabase.service';
import { SyncService } from './sync.service';
import { AnalyticsService } from './analytics.service';
import { seedDemo, demoUserIdFor, DEMO_OWNER_ID, DEMO_PROPERTY_ID, DEMO_RENTER_ID } from './seed';
import { computeDues, monthKey, type Dues } from './dues';

export interface DemoRenter {
  id: string;
  name: string;
  roomNumber: string;
  sharing: number;
  livingSince: string;
  phone: string;
  dues: Dues | null;
}

interface Membership {
  property_id: string;
  role: Role;
  renter_id: string | null;
  name: string | null;
}

/**
 * Who is logged in, as which role, for which PG.
 * Two modes:
 *  - Demo (no Supabase configured): pick Owner or Renter, data is seeded locally.
 *  - Live: phone OTP via Supabase Auth; tokens stored in Keychain/Keystore (see secure-storage.ts).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly db = inject(DbService);
  private readonly repo = inject(RepoService);
  private readonly sb = inject(SupabaseService);
  private readonly sync = inject(SyncService);
  private readonly analytics = inject(AnalyticsService);

  readonly session = signal<Session | null>(null);
  readonly role = computed(() => this.session()?.role ?? null);
  readonly demoMode = !this.sb.enabled;
  /** Set when logged in but not yet attached to a PG (needs onboarding). */
  readonly needsOnboarding = signal(false);
  private loaded: Promise<void> | null = null;

  /** Restore the saved session on app start. */
  load(): Promise<void> {
    this.loaded ??= (async () => {
      const s = await this.db.getMeta<Session>('session');
      if (s) {
        this.session.set(s);
        this.analytics.identify(s.userId, s.role, s.propertyId);
        if (!s.demo) await this.sync.start(s.propertyId);
      } else if (this.sb.client) {
        const { data } = await this.sb.client.auth.getSession();
        if (data.session) await this.resolveMembership();
      }
    })();
    return this.loaded;
  }

  // ---------- demo mode ----------
  /** Seeds the sample PG (once) and returns every renter's ID card, for the "choose a renter" list. */
  async demoRenters(): Promise<DemoRenter[]> {
    await seedDemo(this.db, this.repo);
    const [property, renters, privates, rooms, payments, skips] = await Promise.all([
      this.db.properties.get(DEMO_PROPERTY_ID),
      this.db.renters.where({ propertyId: DEMO_PROPERTY_ID }).toArray(),
      this.db.renterPrivate.where({ propertyId: DEMO_PROPERTY_ID }).toArray(),
      this.db.rooms.where({ propertyId: DEMO_PROPERTY_ID }).toArray(),
      this.db.payments.where({ propertyId: DEMO_PROPERTY_ID }).toArray(),
      this.db.mealSkips.where({ propertyId: DEMO_PROPERTY_ID }).toArray(),
    ]);
    const month = monthKey(new Date());
    return renters
      .filter((r) => r.active && !r.deleted)
      .map((r) => {
        const room = rooms.find((x) => x.id === r.roomId);
        const priv = privates.find((p) => p.id === r.id);
        return {
          id: r.id,
          name: r.name,
          roomNumber: room?.number ?? '?',
          sharing: room?.sharing ?? 0,
          livingSince: r.livingSince,
          phone: priv?.phone ?? '',
          dues: property && priv ? computeDues(property, priv, payments, skips, month) : null,
        };
      })
      .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }) || a.name.localeCompare(b.name));
  }

  /** Demo login. For a renter, `renterId` picks which sample renter to become. */
  async loginDemo(role: Role, renterId: string = DEMO_RENTER_ID): Promise<void> {
    await seedDemo(this.db, this.repo);
    if (role === 'owner') {
      await this.setSession({ userId: DEMO_OWNER_ID, role, propertyId: DEMO_PROPERTY_ID, renterId: null, name: 'Mr. Sharma', demo: true });
      return;
    }
    const renter = await this.db.renters.get(renterId);
    if (!renter) throw new Error('Renter not found');
    await this.setSession({
      userId: demoUserIdFor(renterId),
      role,
      propertyId: DEMO_PROPERTY_ID,
      renterId,
      name: renter.name,
      demo: true,
    });
  }

  // ---------- live mode ----------
  async sendOtp(phoneE164: string): Promise<void> {
    const { error } = await this.sb.client!.auth.signInWithOtp({ phone: phoneE164 });
    if (error) throw error;
  }

  async verifyOtp(phoneE164: string, token: string): Promise<void> {
    const { error } = await this.sb.client!.auth.verifyOtp({ phone: phoneE164, token, type: 'sms' });
    if (error) throw error;
    await this.resolveMembership();
  }

  /** Owner onboarding: create a PG locally, register it on the server, then sync. */
  async createProperty(name: string, address: string, upiId: string): Promise<void> {
    const user = await this.currentUserId();
    const id = uuid();
    const { error } = await this.sb.client!.rpc('create_property', { p_property_id: id });
    if (error) throw error;
    await this.repo.save<Property>('properties', {
      id,
      propertyId: id,
      audience: 'all',
      name,
      address,
      upiId,
      rentDueDay: 5,
      lateFee: 200,
      messRates: { breakfast: 900, lunch: 1500, dinner: 1500 },
      skipRebate: 0,
      messCutoff: '10:00',
    });
    await this.setSession({ userId: user, role: 'owner', propertyId: id, renterId: null, name: 'Owner', demo: false });
  }

  /** Renter onboarding: claim the renter record the owner created, via the invite code. */
  async joinWithInvite(code: string): Promise<void> {
    if (this.demoMode) {
      await this.loginDemo('renter');
      return;
    }
    const { error } = await this.sb.client!.rpc('join_property', { p_code: code.trim().toUpperCase() });
    if (error) throw error;
    this.analytics.track('invite_accepted');
    await this.resolveMembership();
  }

  /** Demo only: throw away all changes and start again from the original sample data. */
  async resetDemo(): Promise<void> {
    await this.db.wipe();
    this.session.set(null);
    this.loaded = null;
  }

  /** Erases the user's login + personal data on the server (store requirement), then logs out. */
  async deleteAccount(): Promise<void> {
    if (this.sb.client && !this.session()?.demo) {
      const { error } = await this.sb.client.rpc('delete_my_account');
      if (error) throw error;
    }
    await this.logout();
  }

  async logout(): Promise<void> {
    this.sync.stop();
    if (this.session()?.demo) {
      // Demo: keep the sample PG so a payment made as a renter is waiting when you log in as the owner.
      await this.db.meta.delete('session');
      this.analytics.reset();
      this.session.set(null);
      this.loaded = null;
      return;
    }
    await this.sb.client?.auth.signOut();
    await this.db.wipe();
    this.analytics.reset();
    this.session.set(null);
    this.needsOnboarding.set(false);
    this.loaded = null;
  }

  private async resolveMembership(): Promise<void> {
    const user = await this.currentUserId();
    const { data, error } = await this.sb.client!.rpc('my_membership');
    if (error) throw error;
    const m = (data as Membership[] | null)?.[0];
    if (!m) {
      this.needsOnboarding.set(true);
      return;
    }
    this.needsOnboarding.set(false);
    await this.setSession({
      userId: user,
      role: m.role,
      propertyId: m.property_id,
      renterId: m.renter_id,
      name: m.name ?? '',
      demo: false,
    });
  }

  private async currentUserId(): Promise<string> {
    const { data } = await this.sb.client!.auth.getUser();
    if (!data.user) throw new Error('Not logged in');
    return data.user.id;
  }

  private async setSession(s: Session): Promise<void> {
    await this.db.setMeta('session', s);
    this.session.set(s);
    this.analytics.identify(s.userId, s.role, s.propertyId);
    this.analytics.track('login_completed', { role: s.role, demo: s.demo });
    if (!s.demo) await this.sync.start(s.propertyId);
  }
}
