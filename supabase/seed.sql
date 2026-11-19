-- Demo data for the LOCAL backend. Loaded automatically on the first `supabase start` and on every `db reset`.
-- Never run this against a production project.
--
-- Ready-made logins (OTP 123456; the numbers are in config.toml → [auth.sms.test_otp]):
--   9000000001  Owner of "Sunshine PG (Boys)"
--   9000000002  Renter: Rahul Verma, Room 101 (overdue this month)
--   9000000003  Renter: Aman Gupta,  Room 101 (paid; Rahul's roommate)
--   9000000004  New user, not in any PG: log in, then join with invite code KARTIK (claims Karthik Rao, Room 102)

-- ---------------------------------------------------------------- auth users
insert into auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.phone, now(),
       '{"provider":"phone","providers":["phone"]}', '{}', now(), now(), '', '', '', ''
from (values
  ('00000000-0000-4000-8000-000000000001'::uuid, '919000000001'),
  ('00000000-0000-4000-8000-000000000002'::uuid, '919000000002'),
  ('00000000-0000-4000-8000-000000000003'::uuid, '919000000003')
) as u(id, phone);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'phone',
       jsonb_build_object('sub', u.id::text, 'phone', u.phone, 'phone_verified', true), now(), now(), now()
from auth.users u
where u.id in ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003');

-- ---------------------------------------------------------------- helper
-- Inserts a synced record with the envelope fields filled in and an old "seed" clock on every field,
-- so any real edit made in the app wins over seed values.
create or replace function public._seed_put(t text, rid text, aud text, subj uuid, d jsonb) returns void
language plpgsql as $$
declare
  pid  uuid := 'a0000000-0000-4000-8000-000000000001';
  rec  jsonb := d || jsonb_build_object('id', rid, 'propertyId', pid, 'audience', aud, 'subjectUserId', subj);
begin
  insert into public.records (table_name, id, property_id, audience, subject_user_id, data, field_hlc)
  values (t, rid, pid, aud, subj, rec,
          (select jsonb_object_agg(k, '000000000000001:00000:seed') from jsonb_object_keys(rec) as k where k <> 'id'));
end $$;

-- ---------------------------------------------------------------- memberships
insert into public.memberships (property_id, user_id, role, renter_id) values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'owner',  null),
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'renter', 'seed-r1'),
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'renter', 'seed-r2');

-- ---------------------------------------------------------------- PG, rooms, menu, notices
select public._seed_put('properties', 'a0000000-0000-4000-8000-000000000001', 'all', null, jsonb_build_object(
  'name', 'Sunshine PG (Boys)', 'address', '14, 3rd Cross, Koramangala, Bengaluru', 'upiId', 'sunshinepg@okaxis',
  'rentDueDay', 5, 'lateFee', 200, 'messRates', jsonb_build_object('breakfast', 900, 'lunch', 1500, 'dinner', 1500),
  'skipRebate', 40, 'messCutoff', '10:00', 'lat', null, 'lng', null));

select public._seed_put('rooms', r.id, 'all', null, jsonb_build_object('number', r.num, 'sharing', r.sharing))
from (values ('seed-room-101', '101', 2), ('seed-room-102', '102', 3), ('seed-room-201', '201', 2), ('seed-room-202', '202', 1))
  as r(id, num, sharing);

select public._seed_put('menus', 'menu-a0000000-0000-4000-8000-000000000001', 'all', null, jsonb_build_object('days', jsonb_build_object(
  'mon', jsonb_build_object('breakfast', 'Poha, tea', 'lunch', 'Rice, dal, aloo gobi', 'dinner', 'Chapati, paneer butter masala'),
  'tue', jsonb_build_object('breakfast', 'Idli, sambar', 'lunch', 'Rice, rajma, salad', 'dinner', 'Chapati, mix veg, curd'),
  'wed', jsonb_build_object('breakfast', 'Aloo paratha', 'lunch', 'Rice, sambar, beans poriyal', 'dinner', 'Egg curry / paneer, rice'),
  'thu', jsonb_build_object('breakfast', 'Upma, coffee', 'lunch', 'Rice, chole, papad', 'dinner', 'Chapati, dal tadka'),
  'fri', jsonb_build_object('breakfast', 'Dosa, chutney', 'lunch', 'Veg biryani, raita', 'dinner', 'Chapati, kadai veg'),
  'sat', jsonb_build_object('breakfast', 'Bread omelette / bread jam', 'lunch', 'Rice, kadhi, pakoda', 'dinner', 'Fried rice, manchurian'),
  'sun', jsonb_build_object('breakfast', 'Chole bhature', 'lunch', 'Chicken / paneer biryani', 'dinner', 'Khichdi, papad'))));

select public._seed_put('notices', n.id, 'all', null, jsonb_build_object(
  'title', n.title, 'body', n.body, 'pinned', n.pinned,
  'createdAt', to_char((now() - n.ago) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
from (values
  ('seed-n1', 'Water supply off tomorrow 10 am – 2 pm', 'BWSSB maintenance. Please store water tonight.', true, interval '0 day'),
  ('seed-n2', 'Pest control on Sunday', 'Keep food items sealed. Rooms 101–202, 11 am.', false, interval '3 day')
) as n(id, title, body, pinned, ago);

-- ---------------------------------------------------------------- renters (public + private halves)
-- Only seed-r1 and seed-r2 have logins; the rest are attached later via invite codes.
create temporary table _seed_renters (
  id text, name text, room text, phone text, since text, addr text, rent int, share boolean,
  b boolean, l boolean, d boolean, code text, uid uuid
);
insert into _seed_renters values
  ('seed-r1', 'Rahul Verma',    'seed-room-101', '+919000000002', '2025-07-01', 'Gandhi Nagar, Bhopal, MP',    8000,  true,  true,  false, true,  'RAHUL1', '00000000-0000-4000-8000-000000000002'),
  ('seed-r2', 'Aman Gupta',     'seed-room-101', '+919000000003', '2026-01-15', 'Civil Lines, Kanpur, UP',     8000,  false, true,  true,  true,  'AMAN02', '00000000-0000-4000-8000-000000000003'),
  ('seed-r3', 'Karthik Rao',    'seed-room-102', '+919000000004', '2024-11-01', 'Gandhinagar, Vijayawada, AP', 6500,  true,  false, false, true,  'KARTIK', null),
  ('seed-r4', 'Imran Shaikh',   'seed-room-102', '+919876500004', '2026-03-10', 'Camp, Pune, MH',              6500,  false, true,  false, true,  'IMRAN4', null),
  ('seed-r5', 'Deepak Nair',    'seed-room-102', '+919876500005', '2026-06-01', 'Kakkanad, Kochi, KL',         6500,  true,  false, false, false, 'DEEPK5', null),
  ('seed-r6', 'Sourav Das',     'seed-room-201', '+919876500006', '2025-09-20', 'Salt Lake, Kolkata, WB',      7500,  false, true,  true,  true,  'SOURV6', null),
  ('seed-r7', 'Harpreet Singh', 'seed-room-202', '+919876500007', '2025-04-05', 'Model Town, Ludhiana, PB',    11000, true,  true,  false, true,  'HARPR7', null);

select public._seed_put('renters', r.id, 'all', null, jsonb_build_object(
  'name', r.name, 'roomId', r.room, 'livingSince', r.since,
  'publicPhone', case when r.share then r.phone end, 'active', true))
from _seed_renters r;

select public._seed_put('renterPrivate', r.id, 'subject', r.uid, jsonb_build_object(
  'phone', r.phone, 'originalAddress', r.addr, 'idProofMasked', 'XXXX-XXXX-' || lpad((4821 + row_number() over () * 137)::text, 4, '0'),
  'rent', r.rent, 'deposit', r.rent * 2, 'sharePhone', r.share,
  'meals', jsonb_build_object('breakfast', r.b, 'lunch', r.l, 'dinner', r.d), 'inviteCode', r.code))
from _seed_renters r;

-- ---------------------------------------------------------------- payments
-- Last month: everyone paid by UPI. This month: a mix (paid, cash, awaiting confirmation, unpaid).
select public._seed_put('payments', 'seed-pay-' || r.id || '-prev', 'subject', r.uid, jsonb_build_object(
  'renterId', r.id, 'month', to_char(now() - interval '1 month', 'YYYY-MM'), 'amount', r.rent + 2400,
  'method', 'upi', 'utr', '41' || right(r.id, 1) || '829301000', 'proofPhoto', null, 'status', 'confirmed', 'createdBy', 'renter',
  'createdAt', to_char((now() - interval '1 month') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'receiptNo', 'RCPT-' || to_char(now() - interval '1 month', 'YYYYMM') || '-' || upper(r.id)))
from _seed_renters r;

select public._seed_put('payments', 'seed-pay-' || p.rid || '-now', 'subject', r.uid, jsonb_build_object(
  'renterId', p.rid, 'month', to_char(now(), 'YYYY-MM'), 'amount', p.amount, 'method', p.method, 'utr', p.utr,
  'proofPhoto', null, 'status', p.status, 'createdBy', case p.method when 'cash' then 'owner' else 'renter' end,
  'createdAt', to_char((now() - interval '5 hour') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'receiptNo', case p.status when 'confirmed' then 'RCPT-' || to_char(now(), 'YYYYMM') || '-' || upper(p.rid) end,
  'decidedAt', case when p.status <> 'pending' then to_char((now() - interval '3 hour') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
  'rejectReason', p.reason))
from (values
  ('seed-r2', 12900, 'upi',  '412398712001', 'confirmed', null),
  ('seed-r3', 8000,  'cash', null,           'confirmed', null),
  ('seed-r4', 9100,  'upi',  '412398712055', 'rejected',  'Amount not received in my account'),
  ('seed-r6', 11400, 'upi',  '412398712044', 'pending',   null),
  ('seed-r7', 13400, 'upi',  '412398712090', 'confirmed', null)
) as p(rid, amount, method, utr, status, reason)
join _seed_renters r on r.id = p.rid;

-- ---------------------------------------------------------------- complaints
select public._seed_put('complaints', c.id, 'subject', r.uid, jsonb_build_object(
  'renterId', c.rid, 'category', c.cat, 'title', c.title, 'description', c.descr, 'photo', null,
  'status', c.status, 'renterConfirmed', null,
  'createdAt', to_char((now() - c.ago) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
from (values
  ('seed-c1', 'seed-r1', 'wifi',       'WiFi drops every evening', 'Internet disconnects between 8–11 pm on 1st floor.', 'in_progress', interval '2 day'),
  ('seed-c2', 'seed-r4', 'plumbing',   'Bathroom tap leaking',     'Room 102 bathroom tap leaks all night.',             'open',        interval '1 day'),
  ('seed-c3', 'seed-r6', 'food',       'Dinner served cold',       'Dinner was cold on Monday and Tuesday.',             'resolved',    interval '6 day'),
  ('seed-c4', 'seed-r1', 'appliances', 'Geyser not heating',       'Geyser in 101 takes 40 min to heat.',                'open',        interval '0 day')
) as c(id, rid, cat, title, descr, status, ago)
join _seed_renters r on r.id = c.rid;

drop function public._seed_put(text, text, text, uuid, jsonb);
drop table _seed_renters;
