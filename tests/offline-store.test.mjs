import test from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key)
};

const store = await import('../assets/offline-store.js');

test('offline queue keeps only the latest sale for a date', () => {
  memory.clear();
  assert.equal(store.enqueuePendingSale('user-1', { date:'2026-09-01', units:[1], products:['Eau'] }), true);
  assert.equal(store.enqueuePendingSale('user-1', { date:'2026-09-01', units:[9], products:['Eau'] }), true);
  const queue = store.listPendingSales('user-1');
  assert.equal(queue.length, 1);
  assert.deepEqual(queue[0].units, [9]);
});

test('offline snapshots remain isolated by active user', () => {
  memory.clear();
  const user = { id:'user-2', name:'Test', role:'staff' };
  assert.equal(store.saveOfflineSnapshot({ user, state:{products:['Eau'],entries:[]}, audit:[], capabilities:{} }), true);
  assert.equal(store.loadOfflineSnapshot().user.id, 'user-2');
  store.clearOfflineSession('user-2');
  assert.equal(store.loadOfflineSnapshot(), null);
});
