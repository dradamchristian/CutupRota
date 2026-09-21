import test from 'node:test';
import assert from 'node:assert/strict';

import {
  handler,
  listBookings,
  MAX_BOOKING_RANGE_DAYS,
  validateBookingListFilters
} from '../netlify/functions/bookings.js';

test('booking read API rejects invalid ranges before querying Supabase', async () => {
  const response = await handler({
    httpMethod: 'POST',
    path: '/bookings',
    body: JSON.stringify({ action: 'list', from: 'not-a-date', to: '2026-09-03' })
  });
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /required dates/);
});

test('booking list filters require real, ordered dates within the maximum range', () => {
  assert.match(validateBookingListFilters({}).error, /required dates/);
  assert.match(validateBookingListFilters({ from: '2026-02-30', to: '2026-03-01' }).error, /required dates/);
  assert.match(validateBookingListFilters({ from: '2026-09-02', to: '2026-09-01' }).error, /on or after/);
  assert.match(validateBookingListFilters({ from: '2026-01-01', to: '2026-02-01' }).error, /cannot exceed/);

  const lastAllowed = new Date(Date.UTC(2026, 0, MAX_BOOKING_RANGE_DAYS));
  lastAllowed.setUTCDate(lastAllowed.getUTCDate() - 1);
  const to = lastAllowed.toISOString().slice(0, 10);
  assert.deepEqual(
    validateBookingListFilters({ from: '2026-01-01', to }).filters,
    { from: '2026-01-01', to, benchId: undefined }
  );
});

function recordingClient(rows = []) {
  const calls = [];
  const query = new Proxy({}, {
    get(_target, method) {
      if (method === 'then') return (resolve) => resolve({ data: rows, error: null });
      return (...args) => {
        calls.push([method, ...args]);
        return query;
      };
    }
  });
  return {
    calls,
    client: { from: (...args) => { calls.push(['from', ...args]); return query; } }
  };
}

test('booking reads use inclusive date boundaries and only required columns', async () => {
  const { client, calls } = recordingClient([]);
  await listBookings(client, { from: '2026-09-01', to: '2026-09-03' });

  assert.deepEqual(calls.find((call) => call[0] === 'gte'), ['gte', 'booking_date', '2026-09-01']);
  assert.deepEqual(calls.find((call) => call[0] === 'lte'), ['lte', 'booking_date', '2026-09-03']);
  assert.equal(calls.find((call) => call[0] === 'select')[1].includes('*'), false);
});

test('booking reads apply a validated bench filter', async () => {
  assert.match(validateBookingListFilters({
    from: '2026-09-01', to: '2026-09-03', bench_id: 'bench.1'
  }).error, /valid bench/);

  const validation = validateBookingListFilters({
    from: '2026-09-01', to: '2026-09-03', bench_id: 'bench-1'
  });
  const { client, calls } = recordingClient([]);
  await listBookings(client, validation.filters);
  assert.deepEqual(calls.find((call) => call[0] === 'eq'), ['eq', 'bench_id', 'bench-1']);
});
