import { getAdminClient, json, parseBody } from './_supabaseAdmin.js';

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

async function insertBookingWithFallback(supabase, payload) {
  const transientCodes = new Set(['40001', '40P01', '53300', '57P03']);
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const rawInsertStart = Date.now();
    const { data, error } = await supabase.from('bookings').insert(payload).select('*');
    const rawInsertDurationMs = Date.now() - rawInsertStart;
    const rowCount = Array.isArray(data) ? data.length : 0;

    console.log('[bookings] raw insert call duration', {
      duration_ms: rawInsertDurationMs,
      attempt
    });
    console.log('[bookings] insert returning payload', {
      attempt,
      rowCount,
      rowsLength: rowCount,
      firstRow: rowCount > 0 ? data[0] : null
    });

    if (!error && rowCount > 0) {
      return data[0];
    }

    if (error) {
      console.error('[bookings] insert SQL error', {
        attempt,
        message: error?.message || null,
        details: error?.details || null,
        hint: error?.hint || null,
        code: error?.code || null
      });
      if (!transientCodes.has(error.code) || attempt === maxAttempts) throw error;
      continue;
    }

    throw new Error('Insert succeeded without returned rows.');
  }

  throw new Error('Booking insert failed after retrying transient database errors.');
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
        const insertedBooking = await insertBookingWithFallback(supabase, booking);
        console.log('[bookings] insert duration', {
          duration_ms: Date.now() - insertStart
        });
        console.log('[bookings] total request duration', {
          duration_ms: Date.now() - requestStart
        });
        return json(200, { ok: true, booking: insertedBooking });
      } catch (error) {
        console.log('[bookings] insert duration', {
          duration_ms: Date.now() - insertStart
        });
        console.error('[bookings] create insert catch', {
          message: error?.message || null,
          details: error?.details || null,
          hint: error?.hint || null,
          code: error?.code || null
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

        return json(500, {
          error: error?.message || 'Booking insert failed.',
          code: error?.code || null,
          details: error?.details || null
        });
      }
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
