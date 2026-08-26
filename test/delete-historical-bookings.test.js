import test from 'node:test';
import assert from 'node:assert/strict';

import {
  currentDateKey,
  deleteBookingsBefore,
  handler
} from '../netlify/functions/delete-historical-bookings.js';

test('uses an ISO date key for the historical booking cutoff', () => {
  assert.equal(currentDateKey(new Date('2026-08-26T23:59:59Z')), '2026-08-26');
});

test('deletes bookings strictly before the supplied date and returns the count', async () => {
  const calls = [];
  const supabase = {
    from(table) {
      calls.push(['from', table]);
      return {
        delete(options) {
          calls.push(['delete', options]);
          return {
            async lt(column, value) {
              calls.push(['lt', column, value]);
              return { error: null, count: 7 };
            }
          };
        }
      };
    }
  };

  assert.equal(await deleteBookingsBefore(supabase, '2026-08-26'), 7);
  assert.deepEqual(calls, [
    ['from', 'bookings'],
    ['delete', { count: 'exact' }],
    ['lt', 'booking_date', '2026-08-26']
  ]);
});

test('rejects cleanup requests with an invalid admin PIN', async (t) => {
  const originalPin = process.env.ADMIN_PIN;
  process.env.ADMIN_PIN = 'correct-pin';
  t.after(() => {
    if (originalPin === undefined) delete process.env.ADMIN_PIN;
    else process.env.ADMIN_PIN = originalPin;
  });

  const response = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({ pin: 'wrong-pin' })
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(JSON.parse(response.body), { error: 'Invalid PIN' });
});
