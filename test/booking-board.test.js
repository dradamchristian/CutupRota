import test from 'node:test';
import assert from 'node:assert/strict';

import { createHandler } from '../netlify/functions/booking-board.js';
import { handler as mutationHandler } from '../netlify/functions/bookings.js';

function fakeClient(rows = []) {
  const filters = [];
  const query = {
    select() { return this; },
    gte(column, value) { filters.push(['gte', column, value]); return this; },
    lte(column, value) { filters.push(['lte', column, value]); return this; },
    eq(column, value) { filters.push(['eq', column, value]); return this; },
    order() { return this; },
    async range() { return { data: rows, error: null }; }
  };
  return {
    filters,
    from(table) {
      assert.equal(table, 'bookings');
      return query;
    }
  };
}

test('booking board accepts GET, applies its URL filters, and emits CDN cache headers', async () => {
  const client = fakeClient([{ id: 'booking-1' }]);
  const response = await createHandler(() => client)({
    httpMethod: 'GET',
    queryStringParameters: {
      from: '2026-09-21',
      to: '2026-09-28',
      bench: 'bench-1'
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body).bookings, [{ id: 'booking-1' }]);
  assert.equal(response.headers['Cache-Control'],
    'public, max-age=5, s-maxage=20, stale-while-revalidate=30');
  assert.equal(response.headers['Netlify-CDN-Cache-Control'],
    'public, s-maxage=20, stale-while-revalidate=30');
  assert.deepEqual(client.filters, [
    ['gte', 'booking_date', '2026-09-21'],
    ['lte', 'booking_date', '2026-09-28'],
    ['eq', 'bench_id', 'bench-1']
  ]);
});

test('booking board rejects POST without cacheable headers', async () => {
  const response = await createHandler(() => {
    throw new Error('client should not be created');
  })({ httpMethod: 'POST' });

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers['Cache-Control'], 'no-store, max-age=0');
});

test('booking mutations reject GET and remain non-cacheable', async () => {
  const response = await mutationHandler({ httpMethod: 'GET' });

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers['Cache-Control'], 'no-store, max-age=0');
});
