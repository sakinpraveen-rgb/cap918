import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

/**
 * Key/value storage for auth tokens.
 *  - iOS: Keychain   - Android: Keystore-backed encrypted storage   (via @aparajita/capacitor-secure-storage)
 *  - Web (ionic serve only): localStorage, because browsers have no keychain. Never ship the web build.
 *
 * Shaped as Supabase's `SupportedStorage`, so it plugs straight into `createClient({ auth: { storage } })`.
 */
export const secureTokenStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!Capacitor.isNativePlatform()) return localStorage.getItem(key);
    const v = await SecureStorage.get(key);
    return typeof v === 'string' ? v : v == null ? null : JSON.stringify(v);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) return localStorage.setItem(key, value);
    await SecureStorage.set(key, value, false, false);
  },
  async removeItem(key: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) return localStorage.removeItem(key);
    await SecureStorage.remove(key);
  },
};
