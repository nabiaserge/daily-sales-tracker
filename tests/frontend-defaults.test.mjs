import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('the dashboard displays all historical sales by default', () => {
  assert.match(html, /let dashboardPeriod = 'all';/);
  assert.match(html, /<option value="all"[^>]*selected>/);
});
