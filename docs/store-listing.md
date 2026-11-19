# Store listing and release checklist

## Listing copy (same for both stores)
**App name:** PG Manager: Rent & Mess (iOS max 30 chars; Play max 30)
**Subtitle (iOS, 30):** Rent, mess & complaints for PGs
**Short description (Play, 80):** Track PG rent, mess plans and complaints. Free for owners and renters.

**Full description:**
> PG Manager keeps rent, mess and complaints for your paying-guest accommodation in one free app. It works even without internet.
>
> **For PG owners**
> • See who has paid and who hasn't this month, with the pending total
> • A reminder 5 days before rent is due, with a summary of pending renters
> • Confirm UPI payments with one tap; rent receipts are created automatically
> • Record cash payments, even offline. The app warns you about possible double entries
> • Complaint box: see who raised each complaint, from which room, with photos
> • Renter ID cards: name, room, sharing, living since, phone, home address
> • Rooms and beds at a glance, a notice board, and a weekly mess menu
>
> **For renters**
> • See rent + mess due this month and pay with any UPI app
> • Download rent receipts (useful for HRA)
> • Pick any combination of breakfast, lunch and dinner, and skip today's meals before the cutoff
> • Raise complaints in 12 categories with a photo, and confirm when they're fixed
> • See your roommates. Your address and dues are never shown to them
>
> Free. No ads. No subscriptions.

**Keywords (iOS, 100 chars):** `pg,paying guest,rent,hostel,mess,tenant,landlord,rent receipt,complaint,room,roommate,upi`
**Category:** Productivity (primary), Lifestyle (secondary) · **Content rating:** Everyone / 4+
**Price:** Free, no in-app purchases.

## Screenshots (generated from the app, ready to upload)
| Store | Folder | Size |
|---|---|---|
| App Store, 6.7"/6.9" iPhone | `pg-manager/store/screenshots/ios-6.7/` | 1290 × 2796 |
| Google Play, phone | `pg-manager/store/screenshots/android-phone/` | 1080 × 2160 |

Order: 01 owner dues · 02 complaint box · 03 renter ID · 04 rooms · 05 renter dues · 06 mess · 07 new complaint · 08 roommates.
Optional: add caption frames on top (e.g. "Know who has paid, at a glance").
Still needed: a 1024×1024 app icon and a Play feature graphic (1024×500). Generate the icon set with `npx @capacitor/assets generate`.

## Privacy declarations
Both must match what the app actually collects:

| Data | Collected | Linked to user | Purpose | Shared |
|---|---|---|---|---|
| Name, phone number | Yes | Yes | App functionality | No (only the PG owner) |
| Address (home address) | Yes | Yes | App functionality | No |
| Photos (complaints, payment proof) | Yes, user-provided | Yes | App functionality | No |
| Precise location | Owner only, optional | Yes | App functionality (PG location) | No |
| Payment info (amount, UPI reference) | Yes | Yes | App functionality | No. No card or bank data |
| Product interaction | Only with opt-in | No (pseudonymous id) | Analytics | PostHog (processor) |
| Crash logs, diagnostics | Only with opt-in | No | App functionality | Sentry (processor) |

- Google Play **Data safety**: data is encrypted in transit, and users can request deletion (in-app: Settings → Delete my account).
- Apple **App Privacy**: the same table. The app does not track (no IDFA, no ATT prompt).
- **Privacy policy URL is required** by both stores. Host one at `https://<domain>/privacy` covering the table above, DPDP Act rights, and a grievance contact.

## Release checklist
**Accounts:** Google Play Console ($25 once) · Apple Developer Program ($99/yr) · Supabase · PostHog · Sentry · a domain for deep links.

**Configuration:**
- Set `supabaseUrl`, `supabaseAnonKey`, `posthogKey`, `sentryDsn` and `linkDomain` in `src/environments/environment.prod.ts`.
- Replace `pgmanager.example.com` with your domain in `AndroidManifest.xml` and `ios/App/App/App.entitlements`.
- Upload `well-known/assetlinks.json` (with the Play App Signing SHA-256) and `apple-app-site-association` (with your Team ID).
- Bump `versionCode`/`versionName` (`android/app/build.gradle`) and `CFBundleShortVersionString`/`CFBundleVersion`.

**Android build (on Windows):**
```
npm run build && npx cap sync android
cd android && gradlew bundleRelease     # signed with your upload keystore
```
Upload `app-release.aab` to **Internal testing**, then **Closed testing**. New personal accounts need **12+ testers opted in for 14 days** before production access.

**iOS build (needs macOS):** use a Mac, a cloud Mac (e.g. MacinCloud), or Ionic Appflow / Codemagic CI.
`npx cap sync ios` → open `ios/App/App.xcodeproj` → set Team + bundle id → Product › Archive → upload to TestFlight → submit.

**Accessibility pass before submitting:**
- TalkBack and VoiceOver: every button is announced with a meaningful name, the tab order is logical, and status chips are read out.
- System font at the largest size + in-app "Extra-large text": no clipped text.
- Colour contrast ≥ 4.5:1 for text (warning colour already darkened).
- The whole flow works by switch access or keyboard (category picker, toggles).

**Common rejection causes, already handled:**
- Account deletion is in-app.
- Permission strings explain their purpose.
- The app works without login in review? → Provide the reviewer a **demo account** (an owner phone + test OTP set in Supabase Auth → Phone → Test numbers).
- Rent is paid outside the app via UPI for a real-world service, which is allowed under App Store Guideline 3.1.3(e) and Play's physical-goods/services exemption.
