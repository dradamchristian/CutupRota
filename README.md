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

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
