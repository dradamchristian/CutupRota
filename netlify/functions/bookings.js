import { getAdminClient, json, parseBody } from './_supabaseAdmin.js';

const START_WRITE_KEYS = ['start_at', 'starts_at', 'start_time', 'start'];
const END_WRITE_KEYS = ['end_at', 'ends_at', 'end_time', 'end'];
const BOOKING_DATE_WRITE_KEYS = ['booking_date', 'date', 'booking_day'];

function toPostgresDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toPostgresTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(11, 19);
}

function formatCandidateTimes(candidate) {
  const next = { ...candidate };
  const timeKeys = [...new Set([...START_WRITE_KEYS, ...END_WRITE_KEYS])];

  timeKeys.forEach((key) => {
    if (next[key]) next[key] = toPostgresTime(next[key]);
  });

  return next;
}

function buildPayloadVariants(payload) {
  const timeVariants = [];

  for (const startKey of START_WRITE_KEYS) {
    for (const endKey of END_WRITE_KEYS) {
      const next = { ...payload };
      delete next.start_at;
      delete next.end_at;
      next[startKey] = payload.start_at;
      next[endKey] = payload.end_at;
      timeVariants.push(next);
    }
  }

  const bookingDate = toPostgresDate(payload.start_at);
  if (!bookingDate) return timeVariants;

  const withDateVariants = [];
  for (const candidate of timeVariants) {
    withDateVariants.push(candidate);
    for (const dateKey of BOOKING_DATE_WRITE_KEYS) {
      withDateVariants.push({
        ...candidate,
        [dateKey]: bookingDate
      });
    }
  }

  return withDateVariants;
}

async function insertBookingWithFallback(supabase, payload) {
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

    const { error } = await supabase.from('bookings').insert(candidateToInsert);
    if (!error) return;

    const message = String(error.message || '');
    const details = String(error.details || '');
    const combined = `${message} ${details}`.toLowerCase();
    const isColumnError = combined.includes('could not find') && combined.includes('column');
    const isTimeTypeError = combined.includes('invalid input syntax for type time');
    const isMissingBookingDateError = combined.includes('null value in column')
      && BOOKING_DATE_WRITE_KEYS.some((dateKey) => combined.includes(`"${dateKey}"`) || combined.includes(`'${dateKey}'`));

    if (isTimeTypeError && !useTimeFormat) {
      useTimeFormat = true;
      index = -1;
      continue;
    }

    if (!isColumnError && !isMissingBookingDateError) throw error;
  }

  throw new Error('Could not insert booking because no compatible start/end column names were found.');
}

export async function handler(event) {
  console.log('[bookings] invocation', {
    method: event.httpMethod,
    path: event.path,
    rawPath: event.rawUrl || event.rawPath || null,
    body: event.body || null
  });

  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const { action, booking, id } = parseBody(event);
    const supabase = getAdminClient();

    if (action === 'create') {
      if (!booking?.bench_id || !booking?.booked_by || !booking?.start_at || !booking?.end_at) {
        return json(400, { error: 'Missing required booking fields.' });
      }

      await insertBookingWithFallback(supabase, booking);
      return json(200, { ok: true });
    }

    if (action === 'delete') {
      if (!id) return json(400, { error: 'Booking id is required.' });

      const { error } = await supabase.from('bookings').delete().eq('id', id);
      if (error) throw error;
      return json(200, { ok: true });
    }

    return json(400, { error: 'Unknown action' });
  } catch (error) {
    console.error('[bookings] failure', {
      message: error?.message || null,
      details: error?.details || null,
      hint: error?.hint || null,
      code: error?.code || null
    });
    return json(500, { error: error.message || 'Bookings operation failed' });
  }
}
