# Architecture: PG Manager v1

PG Manager is a free app for shared PGs (paying-guest accommodations). It has two roles: **Owner** and **Renter**.
It is built with **Ionic 9 + Angular 22 (standalone components) + Capacitor 8**, following course CAP918.
Code lives in [`pg-manager/`](../pg-manager).

## 1. Goals and constraints
- One codebase that ships to Android, iOS and the web (the web build is for development only).
- **Offline-first.** Every screen reads from the on-device database. Writes made offline sync later, and conflicts resolve automatically.
- **No monetisation.** There are no paid tiers and no store billing. Rent moves **outside** the app through UPI, which is allowed because it pays for a real-world service.
- **Privacy (India DPDP Act 2023).** Roommates never see each other's address, ID or dues. A phone number is shown to roommates only if its owner opts in. Analytics and crash reports are opt-in and carry no personal data.

## 2. Stack
| Concern | Choice |
|---|---|
| UI | Ionic components, Angular standalone components, signals, built-in control flow (`@if/@for/@switch`) |
| Navigation | Angular Router with lazy `loadComponent` per page; two `ion-tabs` shells (owner, renter); route guards by role |
| State | **Local DB is the source of truth.** Dexie `liveQuery` → RxJS → `toSignal`. Angular signals hold session and UI state only |
| Local DB | IndexedDB via **Dexie 4**. It works in the browser and in the Capacitor WebView |
| Backend | **Supabase**: Postgres, phone-OTP Auth, row-level security, RPC functions |
| Sync | Custom outbox + pull protocol with per-field HLC merge (§5) |
| Token storage | `@aparajita/capacitor-secure-storage`: **iOS Keychain / Android Keystore**, plugged into Supabase's `auth.storage` |
| Device features | Camera (complaint photos, payment screenshots), Geolocation (PG location), Filesystem + Share (receipts), Local Notifications (reminders), Network (online/offline), App (deep links) |
| Analytics | PostHog (`posthog-js`), opt-in, fixed event list |
| Crashes | Sentry (`@sentry/capacitor` + `@sentry/angular`). Covers native and JS crashes, plus release health (crash-free rate) |
| Tests | Vitest via `ng test` (sync logic, dues, deep links); Playwright is available for E2E |

## 3. Code layout
```
pg-manager/src/app/
  app.routes.ts              lazy routes + role guards
  icons.ts                   ionicons registration
  core/                      services (@Injectable) and pure logic
    models.ts                domain types + complaint categories
    db.service.ts            Dexie database (tables + outbox + meta)
    repo.service.ts          the ONLY write path: stamp HLC → merge → outbox
    hlc.ts, merge.ts         hybrid logical clock, field-level merge (pure, unit-tested)
    sync.service.ts          push outbox / pull by server_seq, network-aware
    auth.service.ts          demo mode, phone OTP, onboarding, invite join, account deletion
    secure-storage.ts        Keychain/Keystore adapter for Supabase tokens
    pg-data.service.ts       live read queries for the current PG
    dues.ts                  rent + mess + late fee + skip rebate; duplicate-payment detection; UPI link
    notification.service.ts  local reminders (owner digest, renter reminders)
    deeplink.service.ts      pgmanager:// and https App/Universal Links → routes
    analytics.service.ts     PostHog wrapper
    crash.service.ts         Sentry init + Angular ErrorHandler
    settings.service.ts      per-device prefs: consents, large text
    ui.service.ts            Toast/Alert controllers, Camera, Share helpers
    guards.ts                roleGuard / guestGuard
  components/                renter-card (content projection), status-chip (ngClass), sync-badge (@switch)
  pages/
    auth/      login (demo / OTP / onboarding), invite/:code
    owner/     tabs: dues · complaints · renters · more; renter/:id, add-renter, rooms, property
    renter/    tabs: home(dues) · mess · complaints · roommates; pay, new-complaint
    shared/    complaint/:id, receipt/:id, notices, settings
pg-manager/supabase/migrations/0001_init.sql   backend schema, RLS, sync RPCs
pg-manager/android, pg-manager/ios             native projects (Capacitor)
```

## 4. Data model
Every synced row has the envelope `{ id, propertyId, audience, subjectUserId, deleted, _hlc }`.

| Local table | Audience | Contents |
|---|---|---|
| `properties` | all | name, address, UPI ID, rent due day, late fee, mess rates (per meal per month), skip rebate, skip cutoff, lat/lng |
| `rooms` | all | number, sharing (beds) |
| `renters` | all | **public** ID: name, room, living since, `publicPhone` (only when opted in), active |
| `renterPrivate` | subject | phone, original address, masked ID proof, rent, deposit, `sharePhone`, meal plan `{breakfast,lunch,dinner}`, invite code |
| `payments` | subject | month, amount, UPI/cash, UTR, screenshot, pending/confirmed/rejected, receipt no. |
| `complaints` | subject | category (12), title, details, photo, open/in_progress/resolved, renter confirmation |
| `notices` | all | title, body, pinned |
| `menus` | all | weekly menu: day × breakfast/lunch/dinner |
| `mealSkips` | subject | renter, date, meal |

Splitting the renter record into **public** and **private** halves is what keeps roommate privacy safe. The server only ever sends a renter the public half of other renters' records (see RLS below). The UI also renders roommate cards from the public half only.

**Mess plans.** Three checkboxes cover all 7 meal combinations (B, L, D, B+L, B+D, L+D, B+L+D) plus "no mess". The monthly mess charge is the sum of the rates for the meals ticked, minus the per-skip rebate.

**Dues** are never stored. They are **computed** from the property, the renter's private record, payments and skips (`dues.ts`). Because of this, a dues total can never be in conflict between devices.

## 5. Offline-first sync and conflict resolution
**Reads:** pages subscribe to Dexie live queries, so the UI updates on every local write and every merged remote change. No screen waits on the network.

**Writes** (`RepoService.save`):
1. Stamp every changed field with a fresh **HLC** (`<ms>:<counter>:<deviceId>`, which sorts correctly as a string).
2. Merge into the local row with `mergeRecord`.
3. Add an `outbox` entry. Steps 2 and 3 run in one IndexedDB transaction.

**Sync** (`SyncService`) runs at start, on reconnect, 1.5 s after a write (debounced) and every 60 s:
- **Push:** collapse outbox entries per record, then send the merged row + field clocks to the `sync_push` RPC.
- **Pull:** `select … from records where server_seq > cursor` in pages of 500. RLS filters the rows. Each row is merged locally, then the cursor advances.

**Server** (`sync_push`, plpgsql, `SECURITY DEFINER`):
- The same per-field rule as the client: a field is taken only if its HLC is newer.
- **Permission rules:** owners may change anything in their own PG. Renters may change only:
  - their own `meals` and `sharePhone`
  - their own `publicPhone` (and only to their real phone number)
  - new pending UPI payments for themselves
  - their own complaints (create, edit text and photo, confirm a fix, re-open)
  - their own meal skips
- **Rejected edits are rolled back.** The server re-stamps its own value just above the client's clock, so the next pull overwrites the forbidden local change.
- A per-PG advisory lock makes `server_seq` order match commit order, so a pull never skips a row.

| Conflict scenario | Result |
|---|---|
| Owner sets complaint *Resolved* offline while the renter edits its description offline | Both changes kept (different fields) |
| Two caretakers set different statuses offline | The later edit (by HLC) wins on every device |
| Renter changes meal plan while owner edits mess rates | Different records, so both are kept. Dues recompute |
| **Owner records cash offline and the renter also submits UPI for the same month** | Both payments kept (separate rows). Dues show **"Possible duplicate payment"** and the owner rejects one |
| Delete vs edit | A soft-delete is a field (`deleted`), merged like any other |
| Device clock is wrong | The HLC advances past any timestamp it has seen (`receive`), so its order stays correct |

Tests: [`sync-logic.spec.ts`](../pg-manager/src/app/core/sync-logic.spec.ts) covers merge commutativity, field-level merge, delete merge, HLC ordering, dues, duplicate detection and deep links.

## 6. Auth and secure storage
- Phone OTP through Supabase. The session (access + refresh token) is persisted by the Supabase client through `secureTokenStorage`, which uses **Keychain** on iOS and **Keystore** on Android. In the browser it falls back to `localStorage`, for development only.
- Android `allowBackup=false` plus data-extraction rules keep tokens and the database out of cloud backups.
- Logout wipes the local database. **Delete account** (a store requirement) runs `delete_my_account`. That scrubs phone, address and ID, unlinks the login, and deletes the auth user. Anonymous payment amounts stay for the owner's accounts.
- **Demo mode:** if `environment.supabaseUrl` is empty, there is no login. You pick a role and sample data is seeded locally.

## 7. Payment notifications (in-app)
```
Renter: Pay → attach screenshot/UTR → payment {status: pending}
   ↓ sync (Realtime wakes the owner's app within ~1 s)
Owner: Alerts tab badge → "Rahul paid ₹10,600" → Payment screen (proof, UTR, dues) → Approve / Reject + reason
   ↓ writes {status, decidedAt, rejectReason, receiptNo} on the same payment → sync
Renter: Alerts tab badge → "Payment approved, receipt ready" / "Payment rejected: <reason>" → Pay again
```
- **Notifications are derived, not stored** (`core/inbox.ts`). They are computed from payment records, so they can never disagree with the payment, they work offline, and they need no extra sync or server rules. Only read state is stored, per user, on the device.
- Owner: a payment still pending = **needs action**, and is listed first. Once decided, it no longer counts as unread.
- Renter: a new decision gets a new id (`dec:<payment>:<status>`), so a changed decision shows as unread again.
- Approve/reject lives in one service (`PaymentDecisionService`), used by the Alerts flow and the renter page alike.
- **Speed:** Supabase Realtime on `records` (migration `0002_realtime.sql`) triggers a pull within ~300 ms of the other side's write. The app also syncs on resume, on reconnect, after local writes and every 60 s. New alerts arriving while the app is open also pop up as phone notifications.
- **Security** (tested in `supabase/tests/backend.test.mjs`): only the owner can set `status`, `decidedAt` and `rejectReason`. A renter can't approve their own payment, and a roommate can't see someone else's payment or its rejection.
- **Demo mode:** logging out keeps the data, so on one device you can pay as a renter, log in as the owner and approve, then log back in as the renter. Settings → *Reset demo data* starts fresh.
- **Limit:** with the app fully closed, alerts arrive the next time it opens. True background push needs FCM/APNs plus a server trigger (a v2 item).

## 8. Reminders
Reminders are **local notifications**, so they fire even with no internet:
- **Owner:** a digest 5 days before the due day, for example "3 of 7 renters pending · ₹38,500". It is rescheduled whenever dues change.
- **Renter:** a reminder 5 days before and on the due day, only if a balance remains.
- Tapping a notification opens the right screen (`extra.route`).

## 9. Deep links
| Link | Opens |
|---|---|
| `pgmanager://invite/CODE`, `https://<domain>/invite/CODE` | Invite → join PG |
| `https://<domain>/complaints/<id>` | Complaint detail |
| `https://<domain>/dues` | Renter dues |

- Android: intent filters, including an `autoVerify` App Link. iOS: a URL scheme plus Associated Domains (`App.entitlements`).
- Host `pg-manager/well-known/*` at `https://<domain>/.well-known/`.
- Parsing lives in `DeepLinkService.toAppPath` and is unit-tested.

## 10. Accessibility
- Ionic components give native roles and focus handling. Every icon-only button has an `aria-label`, and decorative icons are `aria-hidden`.
- Status is shown as text plus colour, never colour alone. The progress bar has `role=progressbar` and values. The category picker is a `radiogroup`.
- Settings has an extra-large text mode. The app respects "reduce motion", shows visible focus rings, and uses a darkened warning colour for AA contrast.
- Test with TalkBack and VoiceOver before release (checklist in [store-listing.md](store-listing.md)).

## 11. Known limits in v1
- Photos sync as compressed data URLs inside rows. Move them to Supabase Storage with signed URLs if rows get large.
- One PG per account in the UI. The schema already supports several (`memberships`).
- Server push notifications (FCM/APNs) aren't used. Local reminders cover v1.
- The migration and seed pass 21 backend checks in an in-memory Postgres (`npm run test:backend`), but have **not yet run on real Supabase** (Docker or cloud). Phone login against Supabase Auth is still untested.
