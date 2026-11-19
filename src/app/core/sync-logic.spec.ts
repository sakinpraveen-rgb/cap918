import { describe, expect, it } from 'vitest';
import { Hlc } from './hlc';
import { mergeRecord } from './merge';
import { computeDues, upiLink } from './dues';
import { nextOccurrence } from './notification.service';
import { DeepLinkService } from './deeplink.service';
import type { Complaint, Payment, Property, RenterPrivate } from './models';

describe('Hlc', () => {
  it('is monotonic even when the wall clock stands still', () => {
    const h = new Hlc('a', () => 1000);
    const x = h.now();
    const y = h.now();
    expect(y > x).toBe(true);
  });

  it('orders after a remote timestamp from a device whose clock is ahead', () => {
    const h = new Hlc('a', () => 1000);
    h.receive(Hlc.encode(5000, 3, 'b'));
    expect(h.now() > Hlc.encode(5000, 3, 'b')).toBe(true);
  });

  it('round-trips encode/decode', () => {
    expect(Hlc.decode(Hlc.encode(1234, 40, 'dev:1'))).toEqual({ ms: 1234, counter: 40, node: 'dev:1' });
  });
});

describe('mergeRecord (offline conflict resolution)', () => {
  const base = (over: Partial<Complaint>, hlc: Record<string, string>): Complaint =>
    ({ id: 'c1', propertyId: 'p', audience: 'subject', renterId: 'r1', category: 'wifi', title: 'WiFi', description: '',
      photo: null, status: 'open', renterConfirmed: null, createdAt: '', ...over, _hlc: hlc }) as Complaint;

  it('keeps both edits when two devices change different fields offline', () => {
    const owner = base({ status: 'resolved' }, { status: '002' });
    const renter = base({ description: 'still slow' }, { description: '003' });
    const merged = mergeRecord(owner, renter);
    expect(merged.status).toBe('resolved');
    expect(merged.description).toBe('still slow');
  });

  it('later write wins when both change the same field', () => {
    const a = base({ status: 'in_progress' }, { status: '005' });
    const b = base({ status: 'resolved' }, { status: '009' });
    expect(mergeRecord(a, b).status).toBe('resolved');
    expect(mergeRecord(b, a).status).toBe('resolved');
  });

  it('is commutative', () => {
    const a = base({ status: 'in_progress', title: 'A' }, { status: '005', title: '010' });
    const b = base({ status: 'resolved', title: 'B' }, { status: '009', title: '001' });
    const ab = mergeRecord(a, b);
    const ba = mergeRecord(b, a);
    expect({ s: ab.status, t: ab.title }).toEqual({ s: ba.status, t: ba.title });
  });

  it('a soft delete merges like any other field', () => {
    const live = base({ title: 'edited' }, { title: '004' });
    const deleted = { ...base({}, { deleted: '006' }), deleted: true };
    const m = mergeRecord(live, deleted);
    expect(m.deleted).toBe(true);
    expect(m.title).toBe('edited');
  });
});

describe('computeDues', () => {
  const property = {
    id: 'p', propertyId: 'p', audience: 'all', _hlc: {}, name: 'PG', address: '', upiId: 'x@upi',
    rentDueDay: 5, lateFee: 200, messRates: { breakfast: 900, lunch: 1500, dinner: 1500 }, skipRebate: 40, messCutoff: '10:00',
  } as Property;
  const renter = {
    id: 'r1', propertyId: 'p', audience: 'subject', _hlc: {}, phone: '', originalAddress: '', idProofMasked: '',
    rent: 8000, deposit: 0, sharePhone: false, meals: { breakfast: true, lunch: false, dinner: true }, inviteCode: 'X',
  } as RenterPrivate;
  const pay = (amount: number, status: Payment['status'], method: Payment['method'] = 'upi'): Payment =>
    ({ id: crypto.randomUUID(), propertyId: 'p', audience: 'subject', _hlc: {}, renterId: 'r1', month: '2026-11', amount, method,
      utr: null, proofPhoto: null, status, createdBy: 'renter', createdAt: '', receiptNo: null }) as Payment;

  it('adds rent and the chosen meals', () => {
    const d = computeDues(property, renter, [], [], '2026-11', new Date(2026, 10, 1));
    expect(d.mess).toBe(2400);
    expect(d.total).toBe(10400);
    expect(d.status).toBe('due');
  });

  it('adds the late fee after the due day', () => {
    const d = computeDues(property, renter, [], [], '2026-11', new Date(2026, 10, 6));
    expect(d.lateFee).toBe(200);
    expect(d.status).toBe('overdue');
  });

  it('shows "awaiting" when a UPI payment is pending confirmation', () => {
    const d = computeDues(property, renter, [pay(10400, 'pending')], [], '2026-11', new Date(2026, 10, 2));
    expect(d.status).toBe('awaiting');
    expect(d.balance).toBe(10400);
  });

  it('flags a duplicate when cash (offline) and UPI are both confirmed', () => {
    const d = computeDues(property, renter, [pay(10400, 'confirmed', 'cash'), pay(10400, 'confirmed')], [], '2026-11', new Date(2026, 10, 2));
    expect(d.status).toBe('paid');
    expect(d.possibleDuplicate).toBe(true);
  });

  it('ignores rejected payments and credits skipped meals', () => {
    const skips = [1, 2, 3].map((n) => ({ id: `s${n}`, propertyId: 'p', audience: 'subject' as const, _hlc: {}, renterId: 'r1', date: `2026-11-0${n}`, meal: 'dinner' as const }));
    const d = computeDues(property, renter, [pay(10400, 'rejected')], skips, '2026-11', new Date(2026, 10, 2));
    expect(d.skipRebate).toBe(120);
    expect(d.balance).toBe(10280);
  });

  it('builds a UPI link', () => {
    expect(upiLink('x@upi', 'Sunshine PG', 100, 'Rent')).toBe('upi://pay?pa=x%40upi&pn=Sunshine+PG&am=100.00&cu=INR&tn=Rent');
  });
});

describe('reminder dates', () => {
  it('schedules 5 days before the due day, next month if already past', () => {
    expect(nextOccurrence(0, new Date(2026, 10, 13))).toEqual(new Date(2026, 10, 30, 9)); // day 0 of Dec = 30 Nov
    expect(nextOccurrence(5, new Date(2026, 10, 1))).toEqual(new Date(2026, 10, 5, 9));
    expect(nextOccurrence(5, new Date(2026, 10, 13))).toEqual(new Date(2026, 11, 5, 9));
  });
});

describe('deep links', () => {
  it.each([
    ['pgmanager://invite/ab12cd', '/invite/AB12CD'],
    ['https://pgmanager.example.com/invite/AB12CD', '/invite/AB12CD'],
    ['https://pgmanager.example.com/complaints/c-123', '/complaint/c-123'],
    ['https://pgmanager.example.com/dues', '/renter/home'],
    ['https://pgmanager.example.com/admin', null],
    ['not a url', null],
  ])('%s → %s', (url, path) => {
    expect(DeepLinkService.toAppPath(url)).toBe(path);
  });
});
