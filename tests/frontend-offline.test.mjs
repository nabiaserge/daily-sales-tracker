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
  assert.match(html, /async function synchronizePendingSales\(/);
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

test('an unauthorized response clears the cached snapshot but never the pending sales queue', () => {
  assert.match(html, /function handleUnauthorized\(reason='expired'\)\{\s*if\(!currentUser\)return;\s*clearOfflineSnapshot\(currentUser\.id\);/);
  assert.doesNotMatch(html, /clearOfflineSession/);
});

test('sales are queued first and synchronized in one idempotent batch', () => {
  assert.match(html, /function queueSale\(mutation\)\{\s*if\(!enqueuePendingSale/);
  assert.match(html, /request\(salesEndpoint,\{method:'POST',headers:\{'Content-Type':'application\/json'\},body:JSON\.stringify\(\{sales\}\)\}\)/);
  assert.doesNotMatch(html, /function saveEntry\(\)[^\n]*saveState\(/);
});

test('network requests time out so weak connections fall back to local data quickly', () => {
  assert.match(html, /const requestTimeoutMs = 12000;/);
  assert.match(html, /setTimeout\(\(\)=>controller\.abort\(\),requestTimeoutMs\)/);
});

test('pending sales are retried without waiting for an online event', () => {
  assert.match(html, /setInterval\(\(\)=>\{ if\(currentUser&&navigator\.onLine&&!isSynchronizing&&syncablePendingSales\(\)\.length\)synchronizePendingSales\(\); if\(currentUser&&navigator\.onLine&&operations\.counts\(\)\.syncable\)operations\.sync\(\); \},syncRetryMs\);/);
  assert.match(html, /document\.addEventListener\('visibilitychange'/);
});

test('production and expense tabs are shown only to administrators', () => {
  assert.match(html, /<button id="productionTab" class="tab hidden" data-view="production"/);
  assert.match(html, /<button id="expensesTab" class="tab hidden" data-view="expenses"/);
  assert.match(html, /manageOperations:global\}/);
  assert.match(html, /\$\('#productionTab'\)\.classList\.toggle\('hidden',!capabilities\.manageOperations\)/);
  assert.match(html, /if\(\['production','expenses'\]\.includes\(view\)&&!capabilities\.manageOperations\)return false;/);
});

test('the operations module is part of the offline app shell', async () => {
  const worker = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
  assert.match(worker, /'\/assets\/operations\.js'/);
  assert.match(html, /import \{ createOperations \} from '\/assets\/operations\.js';/);
});

test('every API request names the displayed account and reacts to a changed session', () => {
  assert.match(html, /if\(currentUser\?\.id\)headers\['X-Session-User'\]=currentUser\.id;/);
  assert.match(html, /if\(response\.headers\.get\('X-Session-Changed'\)\)handleUnauthorized\('changed'\);/);
  assert.doesNotMatch(html, /await fetch\(`\$\{salesEndpoint\}/);
  assert.doesNotMatch(html, /await fetch\(`\$\{authEndpoint\}\?(users|audit)=1`/);
  assert.doesNotMatch(html, /body:JSON\.stringify\(\{action:'(create_user|set_user_access|set_user_role)'[^\n]*credentials/);
});

test('the sign-in form leaves SuperAdmin setup mode after the first account is created', () => {
  assert.match(html, /setupRequired=false; updateAuthScreen\(\);/);
});

test('deletions target a single date instead of rewriting all sales', () => {
  assert.match(html, /request\(`\$\{salesEndpoint\}\?date=\$\{encodeURIComponent\(date\)\}`,\{method:'DELETE'\}\)/);
});

test('authentication events are merged into the visible audit trail', () => {
  assert.match(html, /request\(`\$\{authEndpoint\}\?audit=1`\)/);
  assert.match(html, /function mergeAuditEvents\(salesEvents\)/);
  assert.match(html, /event\.action==='user_login'/);
  assert.match(html, /event\.action==='user_logout'/);
});

test('authentication sends a stable local device identity', () => {
  assert.match(html, /const deviceStorageKey = 'sales-device-id';/);
  assert.match(html, /deviceId,deviceLabel/);
  assert.match(html, /Session ouverte sur \{device\}/);
});
