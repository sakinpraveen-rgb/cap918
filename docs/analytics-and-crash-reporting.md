# Analytics dashboard and crash-free rate report

Both tools are **opt-in** (Settings → "Help improve the app") and receive no names, phone numbers, addresses or amounts.

## 1. PostHog analytics dashboard
Events are fixed in `src/app/core/analytics.service.ts`:

| Event | Fired when | Props |
|---|---|---|
| `app_opened` | App start | |
| `login_completed` | Session created | role, demo |
| `invite_opened` / `invite_accepted` | Invite deep link opened / renter joined | |
| `renter_added` | Owner adds renter | |
| `payment_submitted` | Renter reports a UPI payment | has_utr, has_photo |
| `payment_confirmed` / `payment_rejected` | Owner acts on a payment | |
| `cash_recorded` | Owner records cash | |
| `receipt_shared` | Receipt saved or shared | role |
| `complaint_filed` | Renter files complaint | category, has_photo |
| `complaint_status_changed` / `complaint_confirmed` | Status change / renter 👍👎 | status / fixed |
| `meal_plan_changed` / `meal_skipped` | Mess actions | slot |
| `notice_posted`, `reminder_scheduled` | | kind |

Users are grouped by **property** (`posthog.group('property', id)`), so you can count *PGs*, not just people.

**Build this dashboard** (PostHog → Dashboards → New) with these insights:

| # | Insight | Type | Definition | Target |
|---|---|---|---|---|
| 1 | Active PGs | Trends, weekly, unique *groups: property* | `app_opened` | grows week on week |
| 2 | Owner activation funnel | Funnel, 14-day window | `login_completed (role=owner)` → `renter_added` → `invite_accepted` → `payment_confirmed` | ≥ 40% reach the last step |
| 3 | Renter activation | Funnel | `invite_opened` → `invite_accepted` → `payment_submitted` | ≥ 50% |
| 4 | Payment confirmations | Trends, monthly | `payment_confirmed`, broken down by month | |
| 5 | Late-payment proxy | Trends | `payment_submitted` by day of month | shifts earlier after reminders |
| 6 | Complaint categories | Trends, bar | `complaint_filed` breakdown by `category` | |
| 7 | Complaint fix rate | Formula | `complaint_confirmed(fixed=true)` / `complaint_confirmed` | ≥ 80% |
| 8 | Retention | Retention, weekly | start `login_completed`, return `app_opened` | W4 ≥ 30% |

To share the result as a deliverable: Dashboard → **Share** → public link, or export each insight as PNG/CSV.

## 2. Crash-free rate (Sentry)
`@sentry/capacitor` captures native crashes (Java/Kotlin, Swift/ObjC) and JS errors (Angular `ErrorHandler`). Each event is tagged `release = pg-manager@<version>`, and Sentry **Release Health** computes:
- **Crash-free sessions** = 1 − (crashed sessions ÷ total sessions)
- **Crash-free users** = 1 − (users with ≥1 crash ÷ total users)

To enable it, set `sentryDsn` in `environment.prod.ts`. To get readable stack traces, upload source maps for each release:
```
npm run build -- --source-map
npx @sentry/cli sourcemaps inject www && npx @sentry/cli sourcemaps upload --release pg-manager@1.0.0 www
```
Also enable "Release Health" and alerting: **Alert if crash-free sessions < 99.5% in 1 h**.

## 3. Crash-free rate report: template
Fill this in from Sentry → Releases → `pg-manager@1.0.0` at the end of the closed-testing period (≥ 14 days, ≥ 12 testers).

| Field | Value |
|---|---|
| Release | pg-manager@1.0.0 (Android versionCode __, iOS build __) |
| Period | ____ to ____ |
| Testers / active users | __ |
| Sessions | __ |
| **Crash-free sessions** | __ % (target ≥ 99.5%) |
| **Crash-free users** | __ % (target ≥ 99%) |
| Play Console: user-perceived crash rate | __ % (bad-behaviour threshold: 1.09%) |
| Play Console: ANR rate | __ % (threshold: 0.47%) |
| Top 3 issues | 1. __ (events, users, fixed in __) |
| Verdict | ☐ Ship to production ☐ Fix and re-test |

Attach screenshots of the Sentry release page and Play Console → Android vitals.
