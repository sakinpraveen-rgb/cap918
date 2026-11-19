-- Let the app hear about changes instantly (Supabase Realtime), so an owner's approval reaches the
-- renter's phone within a second instead of at the next 60-second sync. Realtime respects RLS.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.records;
  end if;
end $$;
