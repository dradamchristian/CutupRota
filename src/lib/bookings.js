const START_KEYS = ['start_at', 'starts_at', 'start_time', 'start', 'start_datetime'];
const END_KEYS = ['end_at', 'ends_at', 'end_time', 'end', 'end_datetime'];

function pickValue(record, keys) {
  for (const key of keys) {
    if (record?.[key]) return record[key];
  }
  return null;
}

export function normalizeBooking(booking) {
  const startAt = pickValue(booking, START_KEYS);
  const endAt = pickValue(booking, END_KEYS);

  return {
    ...booking,
    start_at: startAt,
    end_at: endAt
  };
}

export function normalizeBookings(bookings = []) {
  return bookings
    .map(normalizeBooking)
    .filter((booking) => booking.start_at && booking.end_at)
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
}
