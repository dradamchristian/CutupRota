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

function toPostgresTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toISOString().slice(11, 19);
}

function formatCandidateTimes(candidate) {
  const next = { ...candidate };
  const timeKeys = [...new Set([...START_KEYS, ...END_KEYS, ...START_WRITE_KEYS, ...END_WRITE_KEYS])];

  timeKeys.forEach((key) => {
    if (next[key]) {
      next[key] = toPostgresTime(next[key]);
    }
  });

  return next;
}

export async function insertBookingWithFallback(supabaseClient, payload) {
  const tried = new Set();
  let useTimeFormat = false;
  const candidates = [payload, ...buildPayloadVariants(payload)];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const candidateToInsert = useTimeFormat ? formatCandidateTimes(candidate) : candidate;

    const key = JSON.stringify({
      keys: Object.keys(candidateToInsert).sort(),
      values: Object.entries(candidateToInsert).sort(([a], [b]) => a.localeCompare(b))
    });
    if (tried.has(key)) continue;
    tried.add(key);

    const { error } = await supabaseClient.from('bookings').insert(candidateToInsert);
    if (!error) return;

    const message = String(error.message || '');
    const details = String(error.details || '');
    const combined = `${message} ${details}`.toLowerCase();
    const isColumnError = combined.includes('could not find') && combined.includes('column');
    const isTimeTypeError = combined.includes('invalid input syntax for type time');

    if (isTimeTypeError && !useTimeFormat) {
      useTimeFormat = true;
      index = -1;
      continue;
    }

    if (!isColumnError) throw error;
  }

  throw new Error('Could not insert booking because no compatible start/end column names were found.');
}
