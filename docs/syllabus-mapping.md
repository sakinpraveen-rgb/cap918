# CAP918 syllabus → where it is in PG Manager

Paths are relative to `pg-manager/src/app/`.

## Course outcomes
| Outcome | Where |
|---|---|
| CO1: multiple mobile development environments | Web (`ionic serve`), Android Studio (`android/`), Xcode (`ios/`) from one codebase |
| CO2: Angular integrated with Ionic in app design | Every page is an Angular standalone component built from Ionic components |
| CO3: cross-platform apps for phones and tablets | Responsive `ion-grid` (`size="6" size-md="4"`), tabs, platform plugins |
| CO4: develop and integrate Ionic with Angular | Whole app; lazy routes in `app.routes.ts` |

## Units
| Unit | Topic | Where to show it |
|---|---|---|
| I | Ionic platform, project structure, dev server | Created with `ionic start --type=angular-standalone`; `ionic serve` |
| II | Components, data binding, event handling, TypeScript | `pages/**` (interpolation, `[prop]`, `(event)`), `core/models.ts` (interfaces, union types) |
| III | Ionic components, categories, **grid**, icons, **slots**, CSS utilities, JS components | `ion-grid` in `owner/dues.page.ts`, `owner/rooms.page.ts`, `renter/new-complaint.page.ts`; `slot="start/end/icon-only"` everywhere; **content projection slot** `<ng-content select="[actions]">` in `components/renter-card.component.ts`; `icons.ts`; `ion-padding`/`ion-text-center` utilities |
| IV | Creating pages, navigation, lazy loading | `app.routes.ts` (`loadComponent`), `ion-tabs` shells, `routerLink`, `ion-back-button`, route params via `input()` |
| V | **@if / @for / @switch / @case / @default** | `@if` and `@for` with `@empty` in nearly every page; `@switch` in `components/sync-badge.component.ts` and `shared/complaint-detail.page.ts` |
| V | **ngClass / ngStyle** | `ngClass`: `components/status-chip.component.ts`, `owner/rooms.page.ts`, `renter/new-complaint.page.ts`. `ngStyle`: progress bar in `owner/dues.page.ts` |
| V | **[(ngModel)]** two-way binding | `owner/add-renter.page.ts` (template-driven form with validation), `auth/login.page.ts`, `owner/property.page.ts`, `renter/pay.page.ts`, search bars |
| V | **Services, @Injectable(), DI** | `core/*.service.ts`, using `inject()` |
| V | **AlertController** | `owner/renter-detail.page.ts` (record cash, change room), `owner/rooms.page.ts` (add room), `shared/notices.page.ts` (post notice), `core/ui.service.ts` (confirm) |
| V | **ToastController** | `core/ui.service.ts` → used after every save |
| V | **ActionSheetController** | `owner/renter-detail.page.ts` (more actions), `shared/complaint-detail.page.ts` (set status) |
| VI | **Capacitor** native features | **Camera**: `core/ui.service.ts` → complaint photos and payment screenshots. **Geolocation**: `owner/property.page.ts` ("Use GPS"). **Filesystem**: `shared/receipt.page.ts` (save receipt). Also Local Notifications, Network, App (deep links), Share |
| VI | Debugging | Sentry error handler (`core/crash.service.ts`); `console.error` in `CrashService.capture`; Chrome DevTools `chrome://inspect` for Android, Safari Web Inspector for iOS |

## Payment notifications feature, unit by unit
| Syllabus item | Where it is used |
|---|---|
| Ionic components (Unit III) | `ion-tabs` with an **Alerts** tab and `ion-badge` unread count (`owner/owner-tabs.page.ts`, `renter/renter-tabs.page.ts`); `ion-item-group` + `ion-item-divider` sections ("Needs your approval" / "Earlier"); `ion-refresher` pull-to-refresh; `ion-modal` full-screen proof viewer (`shared/payment.page.ts`) |
| Routing (Unit IV) | Lazy routes `owner/notifications`, `renter/notifications`, `payment/:id`; route param bound with `input()` |
| `@if / @for / @switch` (Unit V) | `@for` over notifications with `@empty` "all caught up"; `@if` for owner-only Approve/Reject vs renter-only "Pay again"; `@switch` on payment status in the progress steps |
| `ngClass` (Unit V) | Unread rows (`[ngClass]="{ unread: !n.read }"`) and progress steps (`done / bad / waiting`) |
| `[(ngModel)]` (Unit V) | All / Unread filter segment |
| Services, `@Injectable` (Unit V) | `core/inbox.service.ts` (live list, unread count, read state), `core/payment-decision.service.ts` (approve/reject used everywhere); pure logic in `core/inbox.ts` |
| **AlertController** (Unit V) | Confirm "Approve payment?"; type an "Other" rejection reason |
| **ActionSheetController** (Unit V) | Pick a rejection reason; choose Camera or Gallery for the proof |
| **ToastController** (Unit V) | "Approved. Renter notified and receipt created." / "Rejected. Renter notified with your reason." |
| Capacitor (Unit VI) | **Camera** for the payment screenshot; **Local Notifications** to pop up new alerts on the phone; **App** `resume` event to refresh on return |

## List of practicals
| Practical | Where |
|---|---|
| First application using Angular | The app itself |
| List with checkboxes and ion-icons | Mess plan checkboxes in `renter/mess.page.ts`; meal checkboxes in `owner/add-renter.page.ts` |
| Basic Ionic standalone app with `ionic serve` | `npm start` / `ionic serve` |
| Page with ion-header, ion-toolbar, ion-content | Every page |
| Student-registration-style form with Ionic inputs | `owner/add-renter.page.ts` (renter registration: name, phone pattern, room select, date, address) |
| `[(ngModel)]` to display entered text on the same page | `renter/new-complaint.page.ts` (title counter); `login.page.ts` |
| List of products with `@for` | Dues list, renters list, complaints list |
| "No products available" with `@if` / `@empty` | `@empty` blocks: "No complaints here 🎉", "No renters match." |
| Dynamic CSS classes with ngClass (active/inactive buttons) | Category buttons (`selected`) in `renter/new-complaint.page.ts`; bed icons (`taken`) in `owner/rooms.page.ts` |
| Navigation Home / About / Contact with Ionic routing | Owner and renter tab navigation + detail pages |
| Service to add / view / delete items | `RepoService` + `PgDataService`: notices add, view, pin and delete in `shared/notices.page.ts` |
