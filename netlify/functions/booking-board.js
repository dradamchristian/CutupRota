import { getAdminClient } from './_supabaseAdmin.js';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const CACHE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=5, s-maxage=20, stale-while-revalidate=30',
  'Netlify-CDN-Cache-Control': 'public, s-maxage=20, stale-while-revalidate=30'
};

function isDateKey(value) {
  if (!DATE_KEY.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function response(statusCode, body, headers = CACHE_HEADERS) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

export async function listBookings(supabase, { from, to, benchId }) {
  const pageSize = 100;
  const bookings = [];

  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
      .from('bookings')
      .select('*')
      .gte('booking_date', from)
      .lte('booking_date', to);

    if (benchId) query = query.eq('bench_id', benchId);

    const { data, error } = await query
      .order('booking_date', { ascending: true })
      .order('start_time', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    const page = data || [];
    bookings.push(...page);
    if (page.length < pageSize) return bookings;
  }
}

export function createHandler(getClient = getAdminClient) {
  return async function bookingBoardHandler(event) {
    if (event.httpMethod !== 'GET') {
      return response(405, { error: 'Method not allowed' }, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0'
      });
    }

    const { from, to, bench, bench_id: benchId } = event.queryStringParameters || {};
    if (!isDateKey(from) || !isDateKey(to) || from > to) {
      return response(400, { error: 'A valid from/to date range is required.' }, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0'
      });
    }

    try {
      const bookings = await listBookings(getClient(), {
        from,
        to,
        benchId: bench || benchId || null
      });
      return response(200, { ok: true, bookings });
    } catch (error) {
      console.error('[booking-board] read failed', error);
      return response(500, { error: error.message || 'Could not load bookings.' }, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0'
      });
    }
  };
}

export const handler = createHandler();
