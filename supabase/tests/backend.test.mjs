import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
// Runs the real migration + seed in PGlite (Postgres compiled to WebAssembly), so no Docker is needed.
// Usage: npm run test:backend
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('../', import.meta.url));
const db = new PGlite();
const q = async (sql, p) => (await db.query(sql, p)).rows;
const results = [];
const check = (name, cond, extra = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);

// --- minimal stand-in for Supabase's auth schema
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (instance_id uuid, id uuid primary key, aud text, role text, phone text unique, phone_confirmed_at timestamptz,
    raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz,
    confirmation_token text, recovery_token text, email_change_token_new text, email_change text);
  create table auth.identities (id uuid primary key, user_id uuid references auth.users on delete cascade, provider_id text, provider text,
    identity_data jsonb, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz, unique (provider_id, provider));
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to authenticated; grant execute on function auth.uid() to authenticated;
`);
await db.exec(readFileSync(dir + 'migrations/0001_init.sql', 'utf8'));
await db.exec(readFileSync(dir + 'migrations/0002_realtime.sql', 'utf8'));
results.push('PASS  migrations run');
await db.exec(readFileSync(dir + 'seed.sql', 'utf8'));
results.push('PASS  seed runs');

const counts = Object.fromEntries((await q(`select table_name, count(*)::int n from records group by 1`)).map((r) => [r.table_name, r.n]));
check('seed row counts', counts.renters === 7 && counts.renterPrivate === 7 && counts.payments === 12 && counts.complaints === 4 && counts.rooms === 4, JSON.stringify(counts));

const OWNER = '00000000-0000-4000-8000-000000000001';
const R1 = '00000000-0000-4000-8000-000000000002';
const R2 = '00000000-0000-4000-8000-000000000003';
const NEW = '00000000-0000-4000-8000-000000000004';
const as = async (uid, fn) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role;`);
  }
};

// --- RLS: what does each user see?
const total = Object.values(counts).reduce((a, b) => a + b, 0);
const ownerSees = await as(OWNER, () => q(`select count(*)::int n from records`));
check('owner sees every row', ownerSees[0].n === total, `${ownerSees[0].n}/${total} rows`);
const r1Rows = await as(R1, () => q(`select table_name, id, subject_user_id from records`));
const r1Private = r1Rows.filter((r) => r.table_name === 'renterPrivate').map((r) => r.id);
check('renter sees only own private record', r1Private.length === 1 && r1Private[0] === 'seed-r1', JSON.stringify(r1Private));
check("renter sees no one else's payments/complaints", r1Rows.filter((r) => ['payments', 'complaints'].includes(r.table_name)).every((r) => r.subject_user_id === R1));
check('renter sees all public renter cards', r1Rows.filter((r) => r.table_name === 'renters').length === 7);
const mem = await as(R1, () => q(`select * from my_membership()`));
check('my_membership for renter 1', mem[0]?.renter_id === 'seed-r1' && mem[0]?.name === 'Rahul Verma', JSON.stringify(mem[0]));
const memO = await as(OWNER, () => q(`select * from my_membership()`));
check('my_membership for owner', memO[0]?.role === 'owner');

// --- sync_push permission rules
const T = '999999999999999:00000:dev1';
const push = (uid, changes) => as(uid, () => q(`select sync_push($1::jsonb)`, [JSON.stringify(changes)]));
const get = async (t, id) => (await q(`select data, field_hlc from records where table_name=$1 and id=$2`, [t, id]))[0];

await push(R1, [{ table_name: 'renterPrivate', id: 'seed-r1', data: { rent: 1, meals: { breakfast: false, lunch: true, dinner: true } }, field_hlc: { rent: T, meals: T } }]);
const rp = await get('renterPrivate', 'seed-r1');
check('renter CAN change own meal plan', rp.data.meals.lunch === true);
check('renter CANNOT change own rent', rp.data.rent === 8000 && rp.field_hlc.rent > T, `rent=${rp.data.rent} hlc=${rp.field_hlc.rent}`);

await push(R1, [{ table_name: 'renterPrivate', id: 'seed-r2', data: { meals: { breakfast: false, lunch: false, dinner: false } }, field_hlc: { meals: T } }]);
check("renter CANNOT edit a roommate's record", (await get('renterPrivate', 'seed-r2')).data.meals.breakfast === true);

await push(R1, [{ table_name: 'renters', id: 'seed-r1', data: { publicPhone: '+911111111111' }, field_hlc: { publicPhone: T } }]);
check('renter CANNOT publish a fake phone', (await get('renters', 'seed-r1')).data.publicPhone === '+919000000002');

const pay = { id: 'p-new', propertyId: 'a0000000-0000-4000-8000-000000000001', audience: 'subject', subjectUserId: R1, renterId: 'seed-r1', month: '2026-11', amount: 10600, method: 'upi', utr: '123456789012', proofPhoto: null, status: 'pending', createdBy: 'renter', createdAt: 'x', receiptNo: null };
const stampAll = (d) => Object.fromEntries(Object.keys(d).filter((k) => k !== 'id').map((k) => [k, T]));
await push(R1, [{ table_name: 'payments', id: 'p-new', data: pay, field_hlc: stampAll(pay) }]);
const np = await q(`select subject_user_id, data from records where id='p-new'`);
check('renter CAN submit a pending UPI payment', np[0]?.data.status === 'pending' && np[0]?.subject_user_id === R1);
const fake = { ...pay, id: 'p-fake', status: 'confirmed' };
await push(R1, [{ table_name: 'payments', id: 'p-fake', data: fake, field_hlc: stampAll(fake) }]);
check('renter CANNOT create a confirmed payment', (await q(`select 1 from records where id='p-fake'`)).length === 0);

// a renter must not be able to approve their own payment or fake a decision
await push(R1, [{ table_name: 'payments', id: 'p-new', data: { status: 'confirmed', decidedAt: 'x', receiptNo: 'R' }, field_hlc: { status: T + 'z', decidedAt: T, receiptNo: T } }]);
const selfApprove = (await get('payments', 'p-new')).data;
check('renter CANNOT approve own payment', selfApprove.status === 'pending' && !selfApprove.decidedAt, JSON.stringify({ s: selfApprove.status, d: selfApprove.decidedAt }));

const OWN = '999999999999999:00009:own';
await push(OWNER, [{ table_name: 'payments', id: 'p-new', data: { status: 'rejected', decidedAt: '2026-11-13T10:00:00Z', rejectReason: 'Wrong amount paid' }, field_hlc: { status: OWN, decidedAt: OWN, rejectReason: OWN } }]);
const rej = await as(R1, () => q(`select data from records where id='p-new'`));
check('owner CAN reject with a reason, and the renter can read it', rej[0]?.data.status === 'rejected' && rej[0]?.data.rejectReason === 'Wrong amount paid');
const roommateSees = await as(R2, () => q(`select 1 from records where id='p-new'`));
check('roommate CANNOT see the payment or its rejection', roommateSees.length === 0);

const OWN2 = '999999999999999:00010:own';
await push(OWNER, [{ table_name: 'payments', id: 'p-new', data: { status: 'confirmed', rejectReason: null }, field_hlc: { status: OWN2, rejectReason: OWN2 } }]);
check('owner CAN change a rejection to approved', (await get('payments', 'p-new')).data.status === 'confirmed');

// field-level merge on the server: owner resolves; renter's offline edit with an OLDER clock arrives later
await push(OWNER, [{ table_name: 'complaints', id: 'seed-c1', data: { status: 'resolved' }, field_hlc: { status: '500000000000000:00000:own' } }]);
await push(R1, [{ table_name: 'complaints', id: 'seed-c1', data: { description: 'edited offline', status: 'open' }, field_hlc: { description: '400000000000000:00000:dev1', status: '400000000000000:00000:dev1' } }]);
const c1 = (await get('complaints', 'seed-c1')).data;
check('server merge: newer status kept, renter text applied', c1.status === 'resolved' && c1.description === 'edited offline', `${c1.status} / ${c1.description}`);

// --- invite flow for a brand-new user
await db.exec(`insert into auth.users (id, phone) values ('${NEW}', '919000000004')`);
await as(NEW, () => q(`select join_property('kartik')`));
const memN = await as(NEW, () => q(`select * from my_membership()`));
check('new user joins with invite code KARTIK', memN[0]?.renter_id === 'seed-r3' && memN[0]?.name === 'Karthik Rao', JSON.stringify(memN[0]));
const newRows = await as(NEW, () => q(`select table_name, id from records where table_name in ('payments','renterPrivate')`));
check('joined renter now sees own history', newRows.some((r) => r.id === 'seed-pay-seed-r3-now') && newRows.some((r) => r.id === 'seed-r3'), `${newRows.length} rows`);
let reuse = 'no error';
try {
  await db.exec(`insert into auth.users (id, phone) values ('00000000-0000-4000-8000-000000000005', '919000000005')`);
  await as('00000000-0000-4000-8000-000000000005', () => q(`select join_property('KARTIK')`));
} catch (e) {
  reuse = e.message;
}
check('invite code cannot be reused', /already been used/.test(reuse), reuse);

// --- account deletion
await as(R2, () => q(`select delete_my_account()`));
const r2p = (await get('renterPrivate', 'seed-r2')).data;
check('delete account scrubs personal data', r2p.phone === '' && r2p.originalAddress === '' && (await q(`select 1 from auth.users where id='${R2}'`)).length === 0);

console.log(results.join('\n'));
const passed = results.filter((r) => r.startsWith('PASS')).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
