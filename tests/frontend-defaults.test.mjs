import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('the dashboard displays all historical sales by default', () => {
  assert.match(html, /let dashboardPeriod = 'all';/);
  assert.match(html, /<option value="all"[^>]*selected>/);
});

test('the complete sales list starts on the current month', () => {
  assert.match(html, /const initialSalesFilterDate = new Date\(\);/);
  assert.match(html, /year:String\(initialSalesFilterDate\.getFullYear\(\)\)/);
  assert.match(html, /month:String\(initialSalesFilterDate\.getMonth\(\)\+1\)\.padStart\(2,'0'\)/);
});
