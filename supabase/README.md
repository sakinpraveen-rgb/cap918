# Backend setup (Supabase)

The app runs in **demo mode** until you do this. Demo mode has no login, sample data, and no sync.

1. Create a free project at supabase.com. Region: Mumbai (ap-south-1).
2. **SQL editor** → paste and run [`migrations/0001_init.sql`](migrations/0001_init.sql).
3. **Authentication → Providers → Phone**: enable it and connect an SMS provider (Twilio, MessageBird or Vonage). For testing, add **test phone numbers with fixed OTPs**. Use the same numbers for the App Store / Play reviewers.
4. **Project settings → API**: copy the Project URL and the `anon` key into `src/environments/environment.prod.ts` (and `environment.ts` for local testing):
   ```ts
   supabaseUrl: 'https://xxxx.supabase.co',
   supabaseAnonKey: 'eyJ...',
   ```
   The anon key is safe in the app: all data access is controlled by row-level security and the `SECURITY DEFINER` RPCs.
5. Run the app. Log in with a phone number → **Create my PG** (owner). Add a renter and share the invite. On a second device or browser profile, log in as the renter → **Join PG** with the code.

## What the migration creates
- `memberships`: who belongs to which PG, as owner or renter.
- `records`: every synced row (JSON + per-field clocks + `server_seq`). Clients can only `select` it, and RLS filters what they see.
- `sync_push(changes)`: permission-checked, field-level merge of client changes.
- `create_property`, `join_property(code)`, `my_membership()`, `delete_my_account()`.

## Test the privacy rules
Run in the SQL editor while impersonating a renter (Supabase → SQL editor → "Run as" user):
```sql
select table_name, count(*) from records group by 1;
-- A renter must NOT see other renters' renterPrivate / payments / complaints rows.
```
