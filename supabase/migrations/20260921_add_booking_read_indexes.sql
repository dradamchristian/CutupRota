-- Supports the bounded all-bench board read and the optional lab bench filter.
create index if not exists bookings_booking_date_start_time_idx
  on public.bookings (booking_date, start_time);

create index if not exists bookings_booking_date_bench_id_start_time_idx
  on public.bookings (booking_date, bench_id, start_time);
