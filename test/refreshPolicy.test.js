import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldRefresh } from '../src/lib/refreshPolicy.js';

const base = {
  visibilityState: 'visible',
  isLoading: false,
  lastSuccessfulLoad: 1_000,
  refreshIntervalMs: 60_000,
  now: 61_000
};

test('refreshes visible data once the successful load is old enough', () => {
  assert.equal(shouldRefresh(base), true);
  assert.equal(shouldRefresh({ ...base, now: 60_999 }), false);
});

test('does not refresh while hidden or while another load is running', () => {
  assert.equal(shouldRefresh({ ...base, visibilityState: 'hidden' }), false);
  assert.equal(shouldRefresh({ ...base, isLoading: true }), false);
});

test('allows the first visible load when no load has succeeded', () => {
  assert.equal(shouldRefresh({ ...base, lastSuccessfulLoad: 0, now: 0 }), true);
});
