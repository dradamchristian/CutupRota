import { getAdminClient, json, parseBody } from './_supabaseAdmin.js';

const START_WRITE_KEYS = ['start_at', 'starts_at', 'start_time', 'start'];
const END_WRITE_KEYS = ['end_at', 'ends_at', 'end_time', 'end'];
const BOOKING_DATE_WRITE_KEYS = ['booking_date', 'date', 'booking_day'];

let preferredBookingPayload = null;

function toPostgresDate(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toPostgresTime(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = trimmed.match(/(?:T|\s)(\d{2}:\d{2}(?::\d{2})?)/);
    if (match) {
      const parts = match[1].split(':');
      const hours = parts[0] || '00';
      const minutes = parts[1] || '00';
      const seconds = parts[2] || '00';
      return `${hours}:${minutes}:${seconds}`;
    }

    const hhmmss = trimmed.match(/^(\d{2}:\d{2}(?::\d{2})?)$/);
    if (hhmmss) {
      return hhmmss[1].length === 5 ? `${hhmmss[1]}:00` : hhmmss[1];
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(11, 19);
}

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

async function findExactBookingMatch(supabase, booking) {
  const bookingDate = toPostgresDate(booking?.start_at);
  const startTime = toPostgresTime(booking?.start_at);
  const endTime = toPostgresTime(booking?.end_at);
  if (!booking?.bench_id || !bookingDate || !startTime || !endTime) return null;

  const { data, error } = await supabase
    .from('bookings')
    .select('id, bench_id, booking_date, start_time, end_time, booked_by, specialties, notes')
    .eq('bench_id', booking.bench_id)
    .eq('booking_date', bookingDate)
    .eq('start_time', startTime)
    .eq('end_time', endTime)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const sameBooker = normalizeText(data.booked_by) === normalizeText(booking.booked_by);
  const sameSpecialties = normalizeText(data.specialties) === normalizeText(booking.specialties);
  const sameNotes = normalizeText(data.notes) === normalizeText(booking.notes);

  return sameBooker && sameSpecialties && sameNotes ? data : null;
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
  const baseCandidates = [payload, ...buildPayloadVariants(payload)];
  const candidates = preferredBookingPayload ? [preferredBookingPayload(payload), ...baseCandidates] : baseCandidates;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const candidateToInsert = useTimeFormat ? formatCandidateTimes(candidate) : candidate;

    const key = JSON.stringify({
      keys: Object.keys(candidateToInsert).sort(),
      values: Object.entries(candidateToInsert).sort(([a], [b]) => a.localeCompare(b))
    });

    if (tried.has(key)) continue;
    tried.add(key);

    const rawInsertStart = Date.now();
    const { error } = await supabase.from('bookings').insert(candidateToInsert);
    const rawInsertDurationMs = Date.now() - rawInsertStart;

    console.log('[bookings] raw insert call duration', {
      duration_ms: rawInsertDurationMs,
      attempt: index + 1
    });

    if (!error) {
      const keys = Object.keys(candidateToInsert);
      const shouldFormat = useTimeFormat;
      preferredBookingPayload = (input) => {
        let next = { ...input };
        if (shouldFormat) next = formatCandidateTimes(next);
        const preferred = {};
        keys.forEach((keyName) => {
          if (next[keyName] !== undefined) preferred[keyName] = next[keyName];
        });
        return preferred;
      };
      return;
    }

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
  const requestStart = Date.now();

  console.log('[bookings] invocation', {
    method: event.httpMethod,
    path: event.path,
    rawPath: event.rawUrl || event.rawPath || null,
    body: event.body || null
  });

  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const parseValidationStart = Date.now();
    const { action, booking, id } = parseBody(event);
    const supabase = getAdminClient();
    const parseValidationDurationMs = Date.now() - parseValidationStart;

    console.log('[bookings] parse/validation duration', {
      action: action || null,
      duration_ms: parseValidationDurationMs
    });

    if (action === 'create') {
      const createPathStart = Date.now();
      console.log('[bookings] create path entered', { entered: true });
      console.log('[bookings] create payload window', {
        bench_id: booking?.bench_id || null,
        start_at: booking?.start_at || null,
        end_at: booking?.end_at || null
      });

      if (!booking?.bench_id || !booking?.booked_by || !booking?.start_at || !booking?.end_at) {
        console.log('[bookings] create parse/validation duration', {
          duration_ms: Date.now() - createPathStart
        });
        console.log('[bookings] total request duration', {
          duration_ms: Date.now() - requestStart
        });
        return json(400, { error: 'Missing required booking fields.' });
      }

      const overlapCheckStart = Date.now();
      let overlapCount = null;
      try {
        const { data: overlappingRows, error: overlapError } = await supabase
          .from('bookings')
          .select('id')
          .eq('bench_id', booking.bench_id)
          .lt('start_time', toPostgresTime(booking.end_at))
          .gt('end_time', toPostgresTime(booking.start_at));

        if (overlapError) {
          console.warn('[bookings] overlap check warning', {
            message: overlapError?.message || null,
            details: overlapError?.details || null,
            hint: overlapError?.hint || null,
            code: overlapError?.code || null
          });
        } else {
          overlapCount = Array.isArray(overlappingRows) ? overlappingRows.length : 0;
        }
      } catch (overlapCheckError) {
        console.warn('[bookings] overlap check warning', {
          message: overlapCheckError?.message || null
        });
      }

      console.log('[bookings] overlap check duration', {
        duration_ms: Date.now() - overlapCheckStart,
        rows: overlapCount
      });

      const blockedCheckStart = Date.now();
      let blockedCount = null;
      try {
        const { data: blockedRows, error: blockedError } = await supabase
          .from('blocked_periods')
          .select('id')
          .or(`bench_id.is.null,bench_id.eq.${booking.bench_id}`)
          .lt('start_time', toPostgresTime(booking.end_at))
          .gt('end_time', toPostgresTime(booking.start_at));

        if (blockedError) {
          console.warn('[bookings] blocked period check warning', {
            message: blockedError?.message || null,
            details: blockedError?.details || null,
            hint: blockedError?.hint || null,
            code: blockedError?.code || null
          });
        } else {
          blockedCount = Array.isArray(blockedRows) ? blockedRows.length : 0;
        }
      } catch (blockedCheckError) {
        console.warn('[bookings] blocked period check warning', {
          message: blockedCheckError?.message || null
        });
      }

      console.log('[bookings] blocked period check duration', {
        duration_ms: Date.now() - blockedCheckStart,
        rows: blockedCount
      });

      const insertStart = Date.now();
      let postInsertDurationMs = 0;

      try {
        await insertBookingWithFallback(supabase, booking);
      } catch (error) {
        console.log('[bookings] insert duration', {
          duration_ms: Date.now() - insertStart
        });

        if (error?.code === '23P01') {
          const postInsertStart = Date.now();
          const existing = await findExactBookingMatch(supabase, booking);
          postInsertDurationMs = Date.now() - postInsertStart;
          console.log('[bookings] follow-up select/read duration', {
            duration_ms: postInsertDurationMs
          });

          if (existing) {
            console.log('[bookings] total request duration', {
              duration_ms: Date.now() - requestStart
            });
            return json(200, { ok: true, deduplicated: true, booking_id: existing.id });
          }

          console.log('[bookings] total request duration', {
            duration_ms: Date.now() - requestStart
          });
          return json(409, { error: 'That slot was just booked already. Please refresh and choose another time.' });
        }

        throw error;
      }

      console.log('[bookings] insert duration', {
        duration_ms: Date.now() - insertStart
      });

      console.log('[bookings] follow-up select/read duration', {
        duration_ms: postInsertDurationMs
      });

      console.log('[bookings] total request duration', {
        duration_ms: Date.now() - requestStart
      });

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
