import { Injectable } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { secureTokenStorage } from './secure-storage';

/** Thin wrapper so the rest of the app can ask "is the backend configured?" */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly enabled = !!environment.supabaseUrl;
  readonly client: SupabaseClient | null = this.enabled
    ? createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
        auth: {
          storage: secureTokenStorage, // tokens live in Keychain / Keystore
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;
}
