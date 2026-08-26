-- The booking board is intentionally readable without signing in. If this
-- policy is missing, PostgREST returns HTTP 200 with an empty array, while the
-- exclusion constraint can still see the hidden rows and reject overlaps.
alter table public.bookings enable row level security;

drop policy if exists "bookings_read_board" on public.bookings;
create policy "bookings_read_board"
  on public.bookings
  for select
  to anon, authenticated
  using (true);

