import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { paginate } from '../assets/pagination.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('pagination clamps pages and returns only the requested slice', () => {
  const result = paginate(Array.from({ length: 45 }, (_, index) => index + 1), 3, 20);
  assert.equal(result.currentPage, 3);
  assert.equal(result.totalPages, 3);
  assert.deepEqual(result.items, [41, 42, 43, 44, 45]);
});

test('the frontend registers an offline shell and synchronization queue', () => {
  assert.match(html, /serviceWorker\.register\('\/service-worker\.js'\)/);
  assert.match(html, /enqueuePendingSale/);
  assert.match(html, /async function synchronizePendingSales\(\)/);
  assert.match(html, /window\.addEventListener\('online',resumeOnline\)/);
});

test('history views use bounded pagination', () => {
  assert.match(html, /const salesPageSize = 20;/);
  assert.match(html, /const mySalesPageSize = 20;/);
  assert.match(html, /const auditPageSize = 25;/);
  assert.match(html, /const monthlyPageSize = 12;/);
  assert.match(html, /paginate\(filtered,salesPage,salesPageSize\)/);
  assert.match(html, /paginate\(audit,auditPage,auditPageSize\)/);
});

test('offline snapshots are cleared after an authoritative unauthorized response', () => {
  assert.match(html, /response\.status===401\)\{clearOfflineSession\(currentUser\?\.id\);return showAuth\(\);\}/);
});

test('authentication events are merged into the visible audit trail', () => {
  assert.match(html, /fetch\(`\$\{authEndpoint\}\?audit=1`/);
  assert.match(html, /function mergeAuditEvents\(salesEvents\)/);
  assert.match(html, /event\.action==='user_login'/);
  assert.match(html, /event\.action==='user_logout'/);
});
