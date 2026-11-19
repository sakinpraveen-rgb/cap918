/**
 * Domain model. Every synced record shares the `SyncedRecord` envelope:
 *  - `_hlc` holds one hybrid-logical-clock timestamp per field, used for field-level merge.
 *  - `audience` + `subjectUserId` drive server row-level security (who may read the row).
 */

export type Role = 'owner' | 'renter';

/** 'all' = every member of the property, 'owner' = owner only, 'subject' = owner + subjectUserId. */
export type Audience = 'all' | 'owner' | 'subject';

export interface SyncedRecord {
  id: string;
  propertyId: string;
  audience: Audience;
  subjectUserId?: string | null;
  deleted?: boolean;
  _hlc: Record<string, string>;
}

export interface MessRates {
  breakfast: number;
  lunch: number;
  dinner: number;
}

export interface Property extends SyncedRecord {
  name: string;
  address: string;
  upiId: string;
  rentDueDay: number; // 1–28
  lateFee: number;
  messRates: MessRates; // monthly price per meal slot
  skipRebate: number; // ₹ credited per skipped meal (0 = none)
  messCutoff: string; // 'HH:mm', last time to skip today's meals
  lat?: number | null;
  lng?: number | null;
}

export interface Room extends SyncedRecord {
  number: string;
  sharing: number; // beds in the room
}

/** Fields roommates are allowed to see. */
export interface RenterPublic extends SyncedRecord {
  name: string;
  roomId: string;
  livingSince: string; // ISO date
  publicPhone: string | null; // only set when the renter opts in
  active: boolean;
}

export interface MealPlan {
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
}

/** Owner + the renter themself only. Same id as the RenterPublic record. */
export interface RenterPrivate extends SyncedRecord {
  phone: string;
  originalAddress: string;
  idProofMasked: string; // e.g. XXXX-XXXX-1234
  rent: number;
  deposit: number;
  sharePhone: boolean;
  meals: MealPlan;
  inviteCode: string;
}

export type PaymentMethod = 'upi' | 'cash';
export type PaymentStatus = 'pending' | 'confirmed' | 'rejected';

export interface Payment extends SyncedRecord {
  renterId: string;
  month: string; // 'YYYY-MM'
  amount: number;
  method: PaymentMethod;
  utr: string | null;
  proofPhoto: string | null; // data URL (v1); Supabase Storage path later
  status: PaymentStatus;
  createdBy: Role;
  createdAt: string;
  receiptNo: string | null;
  /** When the owner approved/rejected it (drives the renter's notification). */
  decidedAt?: string | null;
  /** Shown to the renter when a payment is rejected. */
  rejectReason?: string | null;
}

export const COMPLAINT_CATEGORIES = [
  { key: 'electricity', label: 'Electricity', icon: 'flash-outline' },
  { key: 'plumbing', label: 'Plumbing / Water', icon: 'water-outline' },
  { key: 'wifi', label: 'WiFi', icon: 'wifi-outline' },
  { key: 'cleaning', label: 'Cleaning', icon: 'sparkles-outline' },
  { key: 'food', label: 'Food / Mess', icon: 'restaurant-outline' },
  { key: 'furniture', label: 'Furniture', icon: 'bed-outline' },
  { key: 'appliances', label: 'Appliances (AC, geyser, washing machine)', icon: 'snow-outline' },
  { key: 'pest', label: 'Pest control', icon: 'bug-outline' },
  { key: 'laundry', label: 'Laundry', icon: 'shirt-outline' },
  { key: 'security', label: 'Security', icon: 'lock-closed-outline' },
  { key: 'roommate', label: 'Roommate issue', icon: 'people-outline' },
  { key: 'other', label: 'Other', icon: 'document-text-outline' },
] as const;

export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number]['key'];
export type ComplaintStatus = 'open' | 'in_progress' | 'resolved';

export interface Complaint extends SyncedRecord {
  renterId: string;
  category: ComplaintCategory;
  title: string;
  description: string;
  photo: string | null;
  status: ComplaintStatus;
  renterConfirmed: boolean | null; // after "resolved": 👍 true / 👎 false
  createdAt: string;
}

export interface Notice extends SyncedRecord {
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
}

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type MealSlot = keyof MealPlan;

export interface Menu extends SyncedRecord {
  days: Record<Weekday, Record<MealSlot, string>>;
}

export interface MealSkip extends SyncedRecord {
  renterId: string;
  date: string; // 'YYYY-MM-DD'
  meal: MealSlot;
}

/** In-app notification. Derived from payment records, never stored separately (see core/inbox.ts). */
export type NotificationKind = 'payment_submitted' | 'payment_approved' | 'payment_rejected' | 'cash_recorded';

export interface AppNotification {
  id: string; // stable per event, e.g. "sub:<paymentId>" or "dec:<paymentId>:confirmed"
  kind: NotificationKind;
  at: string; // ISO time of the event
  title: string;
  body: string;
  paymentId: string;
  amount: number;
  actionNeeded: boolean; // owner: payment still waiting for a decision
  photo: string | null; // the screenshot the renter attached, if any
  read: boolean;
}

export interface Session {
  userId: string;
  role: Role;
  propertyId: string;
  renterId: string | null;
  name: string;
  demo: boolean;
}

export type TableName =
  | 'properties'
  | 'rooms'
  | 'renters'
  | 'renterPrivate'
  | 'payments'
  | 'complaints'
  | 'notices'
  | 'menus'
  | 'mealSkips';

export const SYNCED_TABLES: TableName[] = [
  'properties',
  'rooms',
  'renters',
  'renterPrivate',
  'payments',
  'complaints',
  'notices',
  'menus',
  'mealSkips',
];
