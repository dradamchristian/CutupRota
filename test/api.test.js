import test from 'node:test';
import assert from 'node:assert/strict';

import { saveBooking } from '../src/lib/api.js';

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
