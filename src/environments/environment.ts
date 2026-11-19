/**
 * Leave supabaseUrl empty to run in DEMO mode (local data only, no login, no sync).
 * Fill these in (see ../../supabase/README.md) to enable phone login and cloud sync.
 */
export const environment = {
  production: false,
  supabaseUrl: '',
  supabaseAnonKey: '',
  posthogKey: '',
  posthogHost: 'https://eu.i.posthog.com',
  sentryDsn: '',
  /** Domain that serves /.well-known/assetlinks.json and apple-app-site-association */
  linkDomain: 'pgmanager.example.com',
  appVersion: '1.0.0',
};
