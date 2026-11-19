import type { DbService } from './db.service';
import { monthKey } from './dues';
import { sampleProofImage } from './sample-proof';
import type {
  Complaint,
  Menu,
  Notice,
  Payment,
  Property,
  RenterPrivate,
  RenterPublic,
  Room,
  Weekday,
} from './models';
import type { RepoService } from './repo.service';

export const DEMO_PROPERTY_ID = 'demo-property';
export const DEMO_OWNER_ID = 'demo-owner';
export const DEMO_RENTER_ID = 'r1';
export const DEMO_RENTER_USER_ID = 'demo-renter-user';

/** The fake login id each sample renter has in demo mode. */
export function demoUserIdFor(renterId: string): string {
  return renterId === DEMO_RENTER_ID ? DEMO_RENTER_USER_ID : `demo-user-${renterId}`;
}

/** Fills the local DB with a realistic PG so the app can be explored without a backend. */
export async function seedDemo(db: DbService, repo: RepoService): Promise<void> {
  if (await db.getMeta('seeded')) return;
  const P = DEMO_PROPERTY_ID;
  const h = () => ({ _hlc: { seed: repo.hlc.now() } });
  const now = new Date();
  const month = monthKey(now);
  const prev = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const property: Property = {
    id: P,
    propertyId: P,
    audience: 'all',
    name: 'Sunshine PG (Boys)',
    address: '14, 3rd Cross, Koramangala, Bengaluru',
    upiId: 'sunshinepg@okaxis',
    rentDueDay: 5,
    lateFee: 200,
    messRates: { breakfast: 900, lunch: 1500, dinner: 1500 },
    skipRebate: 40,
    messCutoff: '10:00',
    ...h(),
  };

  const rooms: Room[] = [
    { id: 'room-101', number: '101', sharing: 2 },
    { id: 'room-102', number: '102', sharing: 3 },
    { id: 'room-201', number: '201', sharing: 2 },
    { id: 'room-202', number: '202', sharing: 1 },
  ].map((r) => ({ ...r, propertyId: P, audience: 'all' as const, ...h() }));

  const people: Array<[string, string, string, string, string, string, number, boolean, boolean[]]> = [
    // id, name, room, phone, since, address, rent, sharePhone, meals [b,l,d]
    ['r1', 'Rahul Verma', 'room-101', '+919876500001', '2025-07-01', 'Gandhi Nagar, Bhopal, MP', 8000, true, [true, false, true]],
    ['r2', 'Aman Gupta', 'room-101', '+919876500002', '2026-01-15', 'Civil Lines, Kanpur, UP', 8000, false, [true, true, true]],
    ['r3', 'Karthik Rao', 'room-102', '+919876500003', '2024-11-01', 'Gandhinagar, Vijayawada, AP', 6500, true, [false, false, true]],
    ['r4', 'Imran Shaikh', 'room-102', '+919876500004', '2026-03-10', 'Camp, Pune, MH', 6500, false, [true, false, true]],
    ['r5', 'Deepak Nair', 'room-102', '+919876500005', '2026-06-01', 'Kakkanad, Kochi, KL', 6500, true, [false, false, false]],
    ['r6', 'Sourav Das', 'room-201', '+919876500006', '2025-09-20', 'Salt Lake, Kolkata, WB', 7500, false, [true, true, true]],
    ['r7', 'Harpreet Singh', 'room-202', '+919876500007', '2025-04-05', 'Model Town, Ludhiana, PB', 11000, true, [true, false, true]],
  ];

  const renters: RenterPublic[] = [];
  const privates: RenterPrivate[] = [];
  people.forEach(([id, name, roomId, phone, since, addr, rent, share, [b, l, d]], i) => {
    const subject = demoUserIdFor(id);
    renters.push({
      id,
      propertyId: P,
      audience: 'all',
      name,
      roomId,
      livingSince: since,
      publicPhone: share ? phone : null,
      active: true,
      ...h(),
    });
    privates.push({
      id,
      propertyId: P,
      audience: 'subject',
      subjectUserId: subject,
      phone,
      originalAddress: addr,
      idProofMasked: `XXXX-XXXX-${String(4821 + i * 137).slice(-4)}`,
      rent,
      deposit: rent * 2,
      sharePhone: share,
      meals: { breakfast: b, lunch: l, dinner: d },
      inviteCode: `PG${(1000 + i * 77).toString(36).toUpperCase()}`,
      ...h(),
    });
  });

  const pay = (renterId: string, m: string, amount: number, status: Payment['status'], method: Payment['method'], utr: string | null, decided = false, rejectReason: string | null = null): Payment => ({
    id: `pay-${renterId}-${m}-${method}`,
    propertyId: P,
    audience: 'subject',
    subjectUserId: privates.find((p) => p.id === renterId)!.subjectUserId,
    renterId,
    month: m,
    amount,
    method,
    utr,
    proofPhoto: method === 'upi' ? sampleProofImage(amount, property.upiId, utr ?? '', m === month ? new Date(Date.now() - 5 * 3_600_000) : new Date(`${m}-03T11:00:00`)) : null,
    status,
    createdBy: method === 'cash' ? 'owner' : 'renter',
    createdAt: m === month ? new Date(Date.now() - 5 * 3_600_000).toISOString() : `${m}-03T05:30:00.000Z`,
    receiptNo: status === 'confirmed' ? `RCPT-${m.replace('-', '')}-${renterId.toUpperCase()}` : null,
    decidedAt: decided ? new Date(Date.now() - 3 * 3_600_000).toISOString() : null,
    rejectReason,
    ...h(),
  });

  const payments: Payment[] = [
    ...privates.map((p) => pay(p.id, prev, p.rent + 2400, 'confirmed', 'upi', `41${p.id}829301`)),
    pay('r2', month, 12900, 'confirmed', 'upi', '412398712001', true),
    pay('r3', month, 8000, 'confirmed', 'cash', null, true),
    pay('r4', month, 9100, 'rejected', 'upi', '412398712055', true, 'Amount not received in my account'),
    pay('r6', month, 11400, 'pending', 'upi', '412398712044'),
    pay('r7', month, 13400, 'confirmed', 'upi', '412398712090', true),
  ];

  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const complaint = (id: string, renterId: string, category: Complaint['category'], title: string, description: string, status: Complaint['status'], created: string): Complaint => ({
    id,
    propertyId: P,
    audience: 'subject',
    subjectUserId: privates.find((p) => p.id === renterId)!.subjectUserId,
    renterId,
    category,
    title,
    description,
    photo: null,
    status,
    renterConfirmed: null,
    createdAt: created,
    ...h(),
  });
  const complaints: Complaint[] = [
    complaint('c1', 'r1', 'wifi', 'WiFi drops every evening', 'Internet disconnects between 8–11 pm on 1st floor.', 'in_progress', daysAgo(2)),
    complaint('c2', 'r4', 'plumbing', 'Bathroom tap leaking', 'Room 102 bathroom tap leaks all night.', 'open', daysAgo(1)),
    complaint('c3', 'r6', 'food', 'Dinner served cold', 'Dinner was cold on Monday and Tuesday.', 'resolved', daysAgo(6)),
    complaint('c4', 'r1', 'appliances', 'Geyser not heating', 'Geyser in 101 takes 40 min to heat.', 'open', daysAgo(0)),
  ];

  const notices: Notice[] = [
    { id: 'n1', title: 'Water supply off tomorrow 10 am – 2 pm', body: 'BWSSB maintenance. Please store water tonight.', pinned: true, createdAt: daysAgo(0) },
    { id: 'n2', title: 'Pest control on Sunday', body: 'Keep food items sealed. Rooms 101–202, 11 am.', pinned: false, createdAt: daysAgo(3) },
  ].map((n) => ({ ...n, propertyId: P, audience: 'all' as const, ...h() }));

  const day = (b: string, l: string, d: string) => ({ breakfast: b, lunch: l, dinner: d });
  const days: Record<Weekday, ReturnType<typeof day>> = {
    mon: day('Poha, tea', 'Rice, dal, aloo gobi', 'Chapati, paneer butter masala'),
    tue: day('Idli, sambar', 'Rice, rajma, salad', 'Chapati, mix veg, curd'),
    wed: day('Aloo paratha', 'Rice, sambar, beans poriyal', 'Egg curry / paneer, rice'),
    thu: day('Upma, coffee', 'Rice, chole, papad', 'Chapati, dal tadka'),
    fri: day('Dosa, chutney', 'Veg biryani, raita', 'Chapati, kadai veg'),
    sat: day('Bread omelette / bread jam', 'Rice, kadhi, pakoda', 'Fried rice, manchurian'),
    sun: day('Chole bhature', 'Chicken / paneer biryani', 'Khichdi, papad'),
  };
  const menu: Menu = { id: `menu-${P}`, propertyId: P, audience: 'all', days, ...h() };

  await db.transaction('rw', db.tables, async () => {
    await db.properties.put(property);
    await db.rooms.bulkPut(rooms);
    await db.renters.bulkPut(renters);
    await db.renterPrivate.bulkPut(privates);
    await db.payments.bulkPut(payments);
    await db.complaints.bulkPut(complaints);
    await db.notices.bulkPut(notices);
    await db.menus.put(menu);
    await db.setMeta('seeded', true);
  });
}
