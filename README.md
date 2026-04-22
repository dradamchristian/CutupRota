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

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
