-- PG Manager: backend schema for offline-first sync.
-- Design: one generic `records` table holds every synced row as JSON + per-field HLC clocks.
-- Clients never write to it directly; all writes go through sync_push(), which
--   1) checks the caller may change each field (role-based rules below),
--   2) merges field-by-field (newest HLC wins), the same rule as src/app/core/merge.ts,
--   3) assigns a server_seq so other devices can pull "everything after N".
-- Reads are protected by row-level security (RLS).


-- ---------------------------------------------------------------- tables
create table public.memberships (
  property_id uuid not null,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('owner', 'renter')),
  renter_id   text,
  created_at  timestamptz not null default now(),
  primary key (property_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create sequence public.records_seq;

create table public.records (
  table_name      text   not null check (table_name in
                    ('properties','rooms','renters','renterPrivate','payments','complaints','notices','menus','mealSkips')),
  id              text   not null,
  property_id     uuid   not null,
  audience        text   not null check (audience in ('all', 'owner', 'subject')),
  subject_user_id uuid,
  data            jsonb  not null,
  field_hlc       jsonb  not null default '{}'::jsonb,
  server_seq      bigint not null default nextval('public.records_seq'),
  updated_at      timestamptz not null default now(),
  primary key (table_name, id)
);
create index records_pull_idx on public.records (property_id, server_seq);
create index records_invite_idx on public.records ((data ->> 'inviteCode')) where table_name = 'renterPrivate';

-- ---------------------------------------------------------------- helpers
create or replace function public.is_owner(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where property_id = p and user_id = auth.uid() and role = 'owner');
$$;

create or replace function public.is_member(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where property_id = p and user_id = auth.uid());
$$;

-- ---------------------------------------------------------------- RLS (reads)
alter table public.memberships enable row level security;
alter table public.records enable row level security;

create policy "own memberships" on public.memberships
  for select using (user_id = auth.uid());

-- Owner sees everything in their PG. Renters see shared rows ('all') and rows about themselves ('subject').
-- Roommates therefore never receive each other's renterPrivate (phone/address/ID), payments or complaints.
create policy "read records" on public.records
  for select using (
    public.is_owner(property_id)
    or (public.is_member(property_id)
        and (audience = 'all' or (audience = 'subject' and subject_user_id = auth.uid())))
  );
-- No insert/update/delete policies: all writes go through the SECURITY DEFINER functions below.

-- ---------------------------------------------------------------- write rules for renters
-- Which fields a renter may change, per table. Owners may change anything in their own PG.
create or replace function public.renter_may_write(
  p_table text, p_field text, p_is_new boolean, p_data jsonb, p_renter_id text
) returns boolean language plpgsql immutable as $$
begin
  -- envelope fields are fixed by the server
  if p_field in ('propertyId', 'audience', 'subjectUserId') then return p_is_new; end if;

  case p_table
    when 'renterPrivate' then
      return p_data ->> 'id' = p_renter_id and p_field in ('sharePhone', 'meals');
    when 'renters' then
      return p_data ->> 'id' = p_renter_id and p_field = 'publicPhone';
    when 'payments' then
      -- renters can only create a new pending UPI payment for themselves
      return p_is_new and p_data ->> 'renterId' = p_renter_id and p_data ->> 'status' = 'pending'
             and p_data ->> 'method' = 'upi' and p_data ->> 'createdBy' = 'renter';
    when 'complaints' then
      if p_data ->> 'renterId' <> p_renter_id then return false; end if;
      if p_is_new then return p_data ->> 'status' = 'open'; end if;
      return p_field in ('title', 'description', 'photo', 'renterConfirmed')
             or (p_field = 'status' and p_data ->> 'status' = 'open'); -- re-open only
    when 'mealSkips' then
      return p_data ->> 'renterId' = p_renter_id;
    else
      return false; -- properties, rooms, notices, menus: owner only
  end case;
end $$;

-- ---------------------------------------------------------------- sync_push
-- changes: [{ table_name, id, data, field_hlc }, ...]
create or replace function public.sync_push(changes jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  c          jsonb;
  t          text;
  rid        text;
  incoming   jsonb;
  in_hlc     jsonb;
  pid        uuid;
  m          memberships%rowtype;
  cur        records%rowtype;
  is_new     boolean;
  out_data   jsonb;
  out_hlc    jsonb;
  k          text;
  v          text;
  allowed    boolean;
  own_phone  text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  for c in select * from jsonb_array_elements(changes) loop
    t        := c ->> 'table_name';
    rid      := c ->> 'id';
    incoming := c -> 'data';
    in_hlc   := coalesce(c -> 'field_hlc', '{}'::jsonb);

    select * into cur from records where table_name = t and id = rid for update;
    is_new := not found;
    pid := coalesce(cur.property_id, (incoming ->> 'propertyId')::uuid);

    select * into m from memberships where property_id = pid and user_id = auth.uid();
    if not found then raise exception 'not a member of property %', pid; end if;

    -- serialise writers per PG so server_seq order == commit order (pullers never skip a row)
    perform pg_advisory_xact_lock(hashtext(pid::text));

    -- A renter's NEW record is all-or-nothing: if any field breaks the rules
    -- (e.g. a payment created as 'confirmed'), the whole record is dropped.
    if is_new and m.role = 'renter' and exists (
      select 1 from jsonb_object_keys(in_hlc) as f
       where not public.renter_may_write(t, f, true, incoming || jsonb_build_object('id', rid), m.renter_id)
    ) then
      continue;
    end if;

    out_data := coalesce(cur.data, '{}'::jsonb);
    out_hlc  := coalesce(cur.field_hlc, '{}'::jsonb);

    for k, v in select key, value from jsonb_each_text(in_hlc) loop
      if out_hlc ->> k is not null and not (v collate "C" > (out_hlc ->> k) collate "C") then
        continue; -- server already has a newer value for this field
      end if;

      allowed := m.role = 'owner'
        or public.renter_may_write(t, k, is_new, incoming || jsonb_build_object('id', rid), m.renter_id);

      -- a renter may only publish their *own* phone number to roommates
      if allowed and m.role = 'renter' and t = 'renters' and k = 'publicPhone'
         and incoming ->> 'publicPhone' is not null then
        select data ->> 'phone' into own_phone from records where table_name = 'renterPrivate' and id = m.renter_id;
        allowed := own_phone = incoming ->> 'publicPhone';
      end if;

      if allowed then
        out_data := jsonb_set(out_data, array[k], coalesce(incoming -> k, 'null'::jsonb), true);
        out_hlc  := jsonb_set(out_hlc, array[k], to_jsonb(v), true);
      elsif not is_new then
        -- Rejected edit: re-stamp the server's value just above the client's clock,
        -- so the client's next pull overwrites its local change (server is authoritative).
        out_hlc := jsonb_set(out_hlc, array[k], to_jsonb(v || '~srv'), true);
      end if;
    end loop;

    if is_new and out_data = '{}'::jsonb then
      continue; -- nothing allowed: don't create the row
    end if;

    out_data := out_data || jsonb_build_object('id', rid);

    insert into records (table_name, id, property_id, audience, subject_user_id, data, field_hlc)
    values (
      t, rid, pid,
      coalesce(cur.audience, incoming ->> 'audience', 'owner'),
      case when m.role = 'renter' and is_new then auth.uid()
           else coalesce(cur.subject_user_id, nullif(incoming ->> 'subjectUserId', '')::uuid) end,
      out_data, out_hlc)
    on conflict (table_name, id) do update
      set data = excluded.data,
          field_hlc = excluded.field_hlc,
          server_seq = nextval('public.records_seq'),
          updated_at = now();
  end loop;
end $$;

-- ---------------------------------------------------------------- onboarding RPCs
create or replace function public.create_property(p_property_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into memberships (property_id, user_id, role) values (p_property_id, auth.uid(), 'owner');
end $$;

-- Renter claims the record the owner created, using the invite code.
create or replace function public.join_property(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare
  r   records%rowtype;
  srv text := lpad((extract(epoch from clock_timestamp()) * 1000)::bigint::text, 15, '0') || ':00000:server';
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into r from records
   where table_name = 'renterPrivate' and data ->> 'inviteCode' = upper(p_code) limit 1;
  if not found then raise exception 'Invalid invite code'; end if;
  if r.subject_user_id is not null and r.subject_user_id <> auth.uid() then
    raise exception 'This invite has already been used';
  end if;

  insert into memberships (property_id, user_id, role, renter_id)
  values (r.property_id, auth.uid(), 'renter', r.id)
  on conflict (property_id, user_id) do update set role = 'renter', renter_id = excluded.renter_id;

  -- Attach the renter's private record and everything about them (payments, complaints, skips).
  perform pg_advisory_xact_lock(hashtext(r.property_id::text));
  update records
     set subject_user_id = auth.uid(),
         data = jsonb_set(data, '{subjectUserId}', to_jsonb(auth.uid()::text)),
         field_hlc = jsonb_set(field_hlc, '{subjectUserId}', to_jsonb(srv)),
         server_seq = nextval('public.records_seq'),
         updated_at = now()
   where property_id = r.property_id
     and ((table_name = 'renterPrivate' and id = r.id)
          or (table_name in ('payments', 'complaints', 'mealSkips') and data ->> 'renterId' = r.id));
end $$;

create or replace function public.my_membership()
returns table (property_id uuid, role text, renter_id text, name text)
language sql stable security definer set search_path = public as $$
  select m.property_id, m.role, m.renter_id,
         (select data ->> 'name' from records where table_name = 'renters' and id = m.renter_id)
    from memberships m
   where m.user_id = auth.uid()
   order by m.created_at
   limit 1;
$$;

-- Store requirement: users can delete their account in-app.
-- Personal fields are scrubbed; payment amounts stay (owner's accounting) but are no longer linked to a login.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  m   memberships%rowtype;
  srv jsonb := to_jsonb(lpad((extract(epoch from clock_timestamp()) * 1000)::bigint::text, 15, '0') || ':zzzzz:server');
begin
  -- New clocks on scrubbed fields, so every device's next pull overwrites its copy.
  for m in select * from memberships where user_id = auth.uid() and role = 'renter' loop
    update records
       set data = data || jsonb_build_object('phone', '', 'originalAddress', '', 'idProofMasked', '', 'sharePhone', false),
           field_hlc = field_hlc || jsonb_build_object('phone', srv, 'originalAddress', srv, 'idProofMasked', srv, 'sharePhone', srv),
           server_seq = nextval('public.records_seq'), updated_at = now()
     where table_name = 'renterPrivate' and id = m.renter_id;
    update records
       set data = data || jsonb_build_object('publicPhone', null, 'active', false),
           field_hlc = field_hlc || jsonb_build_object('publicPhone', srv, 'active', srv),
           server_seq = nextval('public.records_seq'), updated_at = now()
     where table_name = 'renters' and id = m.renter_id;
  end loop;
  update records set subject_user_id = null where subject_user_id = auth.uid();
  delete from memberships where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.renter_may_write(text, text, boolean, jsonb, text) from public, anon;
grant execute on function public.sync_push(jsonb), public.create_property(uuid), public.join_property(text),
  public.my_membership(), public.delete_my_account() to authenticated;
grant select on public.records, public.memberships to authenticated;
