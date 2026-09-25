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
  store.clearOfflineSnapshot('user-2');
  assert.equal(store.loadOfflineSnapshot(), null);
});

test('an expired session keeps unsynchronized sales for the next sign-in', () => {
  memory.clear();
  const user = { id:'user-3', name:'Test', role:'staff' };
  store.saveOfflineSnapshot({ user, state:{products:['Eau'],entries:[]}, audit:[], capabilities:{} });
  store.enqueuePendingSale('user-3', { date:'2026-09-01', units:[4], products:['Eau'] });
  store.clearOfflineSnapshot('user-3');
  assert.equal(store.loadOfflineSnapshot(), null);
  assert.equal(store.listPendingSales('user-3').length, 1);
});

test('synchronized sales leave the queue and rejected sales are flagged', () => {
  memory.clear();
  store.enqueuePendingSale('user-4', { id:'a', date:'2026-09-01', units:[1], products:['Eau'] });
  store.enqueuePendingSale('user-4', { id:'b', date:'2026-09-02', units:[2], products:['Eau'] });
  store.enqueuePendingSale('user-4', { id:'c', date:'2026-09-03', units:[3], products:['Eau'] });
  store.removePendingSales('user-4', ['a']);
  store.markPendingSalesRejected('user-4', [{ id:'b', error:'sale_owner_forbidden' }]);
  const queue = store.listPendingSales('user-4');
  assert.deepEqual(queue.map((item) => item.id), ['b', 'c']);
  assert.equal(queue[0].error, 'sale_owner_forbidden');
  assert.equal(queue[1].error, undefined);
});

test('production and expense queues are separate, deduplicated by their key and survive session expiry', () => {
  memory.clear();
  store.enqueuePendingRecord('production', 'user-6', { date:'2026-09-01', units:[1], products:['Eau'] }, 'date');
  store.enqueuePendingRecord('production', 'user-6', { date:'2026-09-01', units:[5], products:['Eau'] }, 'date');
  store.enqueuePendingRecord('expenses', 'user-6', { id:'e1', amount:100 }, 'id');
  store.enqueuePendingRecord('expenses', 'user-6', { id:'e2', amount:200 }, 'id');
  assert.deepEqual(store.listPendingRecords('production', 'user-6').map((item) => item.units[0]), [5]);
  assert.equal(store.listPendingRecords('expenses', 'user-6').length, 2);
  store.saveOperationsSnapshot('user-6', { production:[], expenses:[] });
  store.clearOfflineSnapshot('user-6');
  assert.equal(store.loadOperationsSnapshot('user-6'), null);
  assert.equal(store.listPendingRecords('expenses', 'user-6').length, 2);
  const [first] = store.listPendingRecords('expenses', 'user-6');
  store.markPendingRecordsRejected('expenses', 'user-6', [{ queueId:first.queueId, error:'invalid_expense_data' }]);
  store.removePendingRecords('expenses', 'user-6', [store.listPendingRecords('expenses', 'user-6')[1].queueId]);
  assert.deepEqual(store.listPendingRecords('expenses', 'user-6').map((item) => [item.id, item.error]), [['e1', 'invalid_expense_data']]);
});

test('re-entering a rejected sale clears its previous error', () => {
  memory.clear();
  store.enqueuePendingSale('user-5', { id:'a', date:'2026-09-01', units:[1], products:['Eau'] });
  store.markPendingSalesRejected('user-5', [{ id:'a', error:'product_conflict' }]);
  store.enqueuePendingSale('user-5', { date:'2026-09-01', units:[2], products:['Eau'] });
  assert.equal(store.listPendingSales('user-5')[0].error, undefined);
});
