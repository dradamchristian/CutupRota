import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBookings, saveBooking } from '../src/lib/api.js';

test('passes booking date boundaries and bench filter to the read API', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let payload;
  globalThis.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return new Response(JSON.stringify({ ok: true, bookings: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  await loadBookings({ from: '2026-09-01', to: '2026-09-03', bench_id: 'bench-1' });
  assert.deepEqual(payload, {
    action: 'list', from: '2026-09-01', to: '2026-09-03', bench_id: 'bench-1'
  });
});

test('does not retry a booking after an ambiguous transport failure', async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, options) => {
    calls.push(url);
    assert.equal(options.cache, 'no-store');
    throw new TypeError('response connection closed');
  };

  await assert.rejects(
    saveBooking({ action: 'create', booking: { bench_id: 'bench-1' } }),
    /response connection closed/
  );
  assert.deepEqual(calls, ['/api/bookings']);
});

test('still tries the alternate endpoint after an explicit 404', async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, options) => {
    calls.push(url);
    assert.equal(options.cache, 'no-store');
    if (calls.length === 1) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  await assert.doesNotReject(saveBooking({ action: 'create', booking: { bench_id: 'bench-1' } }));
  assert.deepEqual(calls, ['/api/bookings', '/.netlify/functions/bookings']);
});

test('preserves conflict booking data on API errors', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const conflictingBooking = { id: 'booking-1', booking_date: '2026-08-26' };
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: 'That slot was just booked already.',
    conflicting_booking: conflictingBooking
  }), {
    status: 409,
    headers: { 'Content-Type': 'application/json' }
  });

  await assert.rejects(
    saveBooking({ action: 'create', booking: { bench_id: 'bench-1' } }),
    (error) => {
      assert.deepEqual(error.responseData?.conflicting_booking, conflictingBooking);
      return true;
    }
  );
});
