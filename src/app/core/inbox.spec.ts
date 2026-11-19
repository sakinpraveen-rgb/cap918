import { describe, expect, it } from 'vitest';
import { buildNotifications, timeAgo } from './inbox';
import type { Payment, RenterPublic, Room } from './models';

const renters = [
  { id: 'r1', name: 'Rahul Verma', roomId: 'room1' },
  { id: 'r2', name: 'Aman Gupta', roomId: 'room1' },
] as RenterPublic[];
const rooms = [{ id: 'room1', number: '101' }] as Room[];

const pay = (over: Partial<Payment>): Payment =>
  ({
    id: 'p1', propertyId: 'pg', audience: 'subject', _hlc: {}, renterId: 'r1', month: '2026-11', amount: 10600,
    method: 'upi', utr: '412398712001', proofPhoto: 'data:image/png;base64,xx', status: 'pending', createdBy: 'renter',
    createdAt: '2026-11-13T10:00:00Z', receiptNo: null, decidedAt: null, rejectReason: null, ...over,
  }) as Payment;

describe('buildNotifications: owner', () => {
  it('a renter payment appears as an action for the owner', () => {
    const [n] = buildNotifications('owner', null, [pay({})], renters, rooms, new Set());
    expect(n.kind).toBe('payment_submitted');
    expect(n.actionNeeded).toBe(true);
    expect(n.read).toBe(false);
    expect(n.title).toBe('Rahul Verma paid ₹10,600');
    expect(n.body).toContain('Room 101');
    expect(n.body).toContain('screenshot attached');
  });

  it('stops needing action once decided', () => {
    const [n] = buildNotifications('owner', null, [pay({ status: 'confirmed', decidedAt: '2026-11-13T11:00:00Z' })], renters, rooms, new Set());
    expect(n.actionNeeded).toBe(false);
    expect(n.read).toBe(true); // the owner decided it, so it is not "unread" for them
    expect(n.body).toContain('approved');
  });

  it('cash the owner recorded is not a notification for the owner', () => {
    expect(buildNotifications('owner', null, [pay({ method: 'cash', createdBy: 'owner', status: 'confirmed' })], renters, rooms, new Set())).toEqual([]);
  });

  it('pending items come first, then newest', () => {
    const list = buildNotifications('owner', null, [
      pay({ id: 'old', status: 'confirmed', createdAt: '2026-11-13T12:00:00Z' }),
      pay({ id: 'new', status: 'pending', createdAt: '2026-11-10T09:00:00Z' }),
    ], renters, rooms, new Set());
    expect(list.map((n) => n.paymentId)).toEqual(['new', 'old']);
  });

  it('respects read state', () => {
    const [n] = buildNotifications('owner', null, [pay({})], renters, rooms, new Set(['sub:p1']));
    expect(n.read).toBe(true);
  });
});

describe('buildNotifications: renter', () => {
  it('nothing until the owner decides', () => {
    expect(buildNotifications('renter', 'r1', [pay({})], renters, rooms, new Set())).toEqual([]);
  });

  it('approval tells the renter the receipt is ready', () => {
    const [n] = buildNotifications('renter', 'r1', [pay({ status: 'confirmed', decidedAt: '2026-11-13T11:00:00Z', receiptNo: 'RCPT-1' })], renters, rooms, new Set());
    expect(n.kind).toBe('payment_approved');
    expect(n.body).toContain('RCPT-1');
  });

  it('rejection carries the reason', () => {
    const [n] = buildNotifications('renter', 'r1', [pay({ status: 'rejected', decidedAt: '2026-11-13T11:00:00Z', rejectReason: 'Wrong amount paid' })], renters, rooms, new Set());
    expect(n.kind).toBe('payment_rejected');
    expect(n.body).toContain('Wrong amount paid');
  });

  it('a changed decision is a NEW notification, even if the old one was read', () => {
    const read = new Set(['dec:p1:rejected']);
    const [n] = buildNotifications('renter', 'r1', [pay({ status: 'confirmed', decidedAt: '2026-11-13T12:00:00Z' })], renters, rooms, read);
    expect(n.id).toBe('dec:p1:confirmed');
    expect(n.read).toBe(false);
  });

  it("never shows a roommate's payments", () => {
    const list = buildNotifications('renter', 'r1', [pay({ renterId: 'r2', status: 'rejected', decidedAt: '2026-11-13T11:00:00Z' })], renters, rooms, new Set());
    expect(list).toEqual([]);
  });

  it('cash recorded by the owner is shown to the renter', () => {
    const [n] = buildNotifications('renter', 'r1', [pay({ method: 'cash', createdBy: 'owner', status: 'confirmed', decidedAt: '2026-11-13T11:00:00Z', receiptNo: 'RCPT-9' })], renters, rooms, new Set());
    expect(n.kind).toBe('cash_recorded');
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-11-13T12:00:00Z');
  it.each([
    ['2026-11-13T11:59:30Z', 'Just now'],
    ['2026-11-13T11:45:00Z', '15 min ago'],
    ['2026-11-13T09:00:00Z', '3 h ago'],
    ['2026-11-12T10:00:00Z', 'Yesterday'],
  ])('%s → %s', (iso, text) => expect(timeAgo(iso, now)).toBe(text));
});
