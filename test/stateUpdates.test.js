import test from 'node:test';
import assert from 'node:assert/strict';

import { removeById, removeByIds, upsertById } from '../src/lib/stateUpdates.js';

test('create appends an authoritative returned row', () => {
  const created = { id: 2, name: 'new' };
  assert.deepEqual(upsertById([{ id: 1, name: 'old' }], created), [
    { id: 1, name: 'old' }, created
  ]);
});

test('edit replaces the matching row, including string-equivalent IDs', () => {
  const edited = { id: 1, name: 'authoritative' };
  assert.deepEqual(upsertById([{ id: '1', name: 'stale' }, { id: 2 }], edited), [edited, { id: 2 }]);
});

test('delete removes the known ID without disturbing other rows', () => {
  assert.deepEqual(removeById([{ id: 1 }, { id: 2 }], '1'), [{ id: 2 }]);
});

test('waitlist completion removes every confirmed affected ID', () => {
  assert.deepEqual(removeByIds([{ id: 'a' }, { id: 'b' }, { id: 'c' }], ['a', 'c']), [{ id: 'b' }]);
});
