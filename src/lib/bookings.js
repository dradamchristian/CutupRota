const START_KEYS = ['start_at', 'starts_at', 'start_time', 'start', 'start_datetime'];
const END_KEYS = ['end_at', 'ends_at', 'end_time', 'end', 'end_datetime'];
const START_WRITE_KEYS = ['start_at', 'starts_at', 'start_time', 'start'];
const END_WRITE_KEYS = ['end_at', 'ends_at', 'end_time', 'end'];

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

function replaceDateField(payload, keys, value) {
  const next = { ...payload };
  keys.forEach((key) => delete next[key]);
  next[keys[0]] = value;
  return next;
}

function buildPayloadVariants(payload) {
  const variants = [];
  for (const startKey of START_WRITE_KEYS) {
    for (const endKey of END_WRITE_KEYS) {
      const next = { ...payload };
      delete next.start_at;
      delete next.end_at;
      next[startKey] = payload.start_at;
      next[endKey] = payload.end_at;
      variants.push(next);
    }
  }
  return variants;
}

export async function insertBookingWithFallback(supabaseClient, payload) {
  const tried = new Set();
  let current = payload;

  for (const candidate of [current, ...buildPayloadVariants(payload)]) {
    const key = JSON.stringify(Object.keys(candidate).sort());
    if (tried.has(key)) continue;
    tried.add(key);

    const { error } = await supabaseClient.from('bookings').insert(candidate);
    if (!error) return;

    const message = String(error.message || '');
    const details = String(error.details || '');
    const combined = `${message} ${details}`.toLowerCase();
    const isColumnError = combined.includes('could not find') && combined.includes('column');

    if (!isColumnError) throw error;

    if (combined.includes('start')) {
      current = replaceDateField(current, START_WRITE_KEYS, payload.start_at);
    }

    if (combined.includes('end')) {
      current = replaceDateField(current, END_WRITE_KEYS, payload.end_at);
    }
  }

  throw new Error('Could not insert booking because no compatible start/end column names were found.');
}
