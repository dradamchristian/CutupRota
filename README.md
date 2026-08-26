# Cut-Up Rota Booking (V1)

Vite + Vanilla JS + Supabase + Netlify Functions implementation for pathology bench booking.

## Environment variables

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PIN`

## Data model note

The app expects a `bench_waitlist` table for adhoc “call when bench is free” requests.
Suggested columns:

- `id` (uuid/int primary key)
- `requested_by` (text, required)
- `specialties` (text, nullable)
- `duration_minutes` (integer, required)
- `notes` (text, nullable)
- `bench_id` (nullable FK to benches)
- `requested_at` (timestamp with time zone, default now())
- `completed_at` (timestamp with time zone, nullable)

### Supabase SQL to create `bench_waitlist`

Run this once in the Supabase SQL editor:

```sql
create table if not exists public.bench_waitlist (
  id bigint generated always as identity primary key,
  requested_by text not null,
  specialties text,
  duration_minutes integer not null check (duration_minutes > 0),
  notes text,
  bench_id uuid references public.benches (id) on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists bench_waitlist_active_idx
  on public.bench_waitlist (completed_at, requested_at);

alter table public.bench_waitlist enable row level security;

drop policy if exists "bench_waitlist_read_active" on public.bench_waitlist;
create policy "bench_waitlist_read_active"
  on public.bench_waitlist
  for select
  to anon, authenticated
  using (true);
```

Notes:
- create/complete/delete are performed via Netlify function `waitlist` using service role key.
- select access is done directly in the browser app, so the read policy above is required when RLS is enabled.
- if your `benches.id` is not `uuid`, set `bench_id` to exactly match your existing `benches.id` type.

## Booking board shows occupied slots as free

The booking board must be able to read `public.bookings`. With Row Level Security
enabled, a missing `SELECT` policy does **not** necessarily produce an HTTP error:
Supabase can return `200` with an empty array. Inserts into those apparently free
slots are then correctly rejected by the `bookings_no_overlap` database constraint.

Apply `supabase/migrations/20260826_restore_booking_read_policy.sql` in the Supabase
SQL editor if bookings exist in Table Editor but do not appear on the board. The
policy makes bookings readable by the same anonymous users who can already view
the booking board; booking creation and deletion remain handled by Netlify
Functions using `SUPABASE_SERVICE_ROLE_KEY`.

Also verify that the Netlify `SUPABASE_SERVICE_ROLE_KEY` value is the Supabase
`service_role` key, not the browser-safe `anon` key. After changing the policy or
environment variable, trigger a new Netlify deploy and reload the page.

The server booking list intentionally requests only today and future dates and
paginates the result. Supabase/PostgREST normally limits a response to 1,000 rows;
without the date filter, a sufficiently large booking history can fill the response
with old rows and make newly-created bookings disappear on the next refresh.

Historical bookings can be removed from the Admin Console with **Delete past
bookings**. The operation requires the verified admin PIN, asks for confirmation,
and deletes only rows whose `booking_date` is before today. Current and future
bookings are not affected.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
