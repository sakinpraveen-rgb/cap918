import type { MealPlan, MealSkip, Payment, Property, RenterPrivate } from './models';

export interface Dues {
  month: string;
  rent: number;
  mess: number;
  skipRebate: number;
  lateFee: number;
  total: number;
  paid: number; // confirmed payments
  awaiting: number; // UPI payments waiting for owner confirmation
  balance: number; // total - paid (never negative)
  status: 'paid' | 'awaiting' | 'due' | 'overdue';
  dueDate: string; // YYYY-MM-DD
  /** True when confirmed payments exceed the total, e.g. cash recorded offline AND UPI confirmed. */
  possibleDuplicate: boolean;
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function messCharge(meals: MealPlan, property: Pick<Property, 'messRates'>): number {
  const r = property.messRates;
  return (meals.breakfast ? r.breakfast : 0) + (meals.lunch ? r.lunch : 0) + (meals.dinner ? r.dinner : 0);
}

export function dueDateFor(month: string, dueDay: number): string {
  return `${month}-${String(dueDay).padStart(2, '0')}`;
}

/** Compute rent + mess dues for one renter and one month. `today` is injectable for tests. */
export function computeDues(
  property: Property,
  renter: RenterPrivate,
  payments: Payment[],
  skips: MealSkip[],
  month: string,
  today: Date = new Date(),
): Dues {
  const mine = payments.filter((p) => !p.deleted && p.renterId === renter.id && p.month === month);
  const paid = sum(mine.filter((p) => p.status === 'confirmed').map((p) => p.amount));
  const awaiting = sum(mine.filter((p) => p.status === 'pending').map((p) => p.amount));

  const rent = renter.rent;
  const mess = messCharge(renter.meals, property);
  const skipCount = skips.filter((s) => !s.deleted && s.renterId === renter.id && s.date.startsWith(month)).length;
  const skipRebate = Math.min(mess, skipCount * (property.skipRebate || 0));

  const dueDate = dueDateFor(month, property.rentDueDay);
  const todayKey = isoDate(today);
  const baseTotal = rent + mess - skipRebate;
  const overdue = todayKey > dueDate && paid < baseTotal;
  const lateFee = overdue ? property.lateFee : 0;
  const total = baseTotal + lateFee;
  const balance = Math.max(0, total - paid);

  let status: Dues['status'];
  if (balance === 0) status = 'paid';
  else if (awaiting >= balance) status = 'awaiting';
  else status = overdue ? 'overdue' : 'due';

  return {
    month,
    rent,
    mess,
    skipRebate,
    lateFee,
    total,
    paid,
    awaiting,
    balance,
    status,
    dueDate,
    possibleDuplicate: paid > total && mine.filter((p) => p.status === 'confirmed').length > 1,
  };
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/** Build a UPI deep link (opens GPay / PhonePe / Paytm etc.). */
export function upiLink(upiId: string, payeeName: string, amount: number, note: string): string {
  const q = new URLSearchParams({ pa: upiId, pn: payeeName, am: amount.toFixed(2), cu: 'INR', tn: note });
  return `upi://pay?${q.toString()}`;
}
