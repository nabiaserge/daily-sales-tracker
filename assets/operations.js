// Production and expense tabs (Admin and SuperAdmin only).
// Records are queued locally first, shown immediately and synchronized in the background,
// exactly like sales, so they survive network loss and session expiry.
import {
  enqueuePendingRecord,
  listPendingRecords,
  loadOperationsSnapshot,
  markPendingRecordsRejected,
  removePendingRecords,
  saveOperationsSnapshot
} from '/assets/offline-store.js';
import { paginate } from '/assets/pagination.js';

export const expenseCategories = ['raw_materials', 'electricity', 'water', 'fuel', 'salaries', 'transport', 'maintenance', 'other'];
const endpoint = '/.netlify/functions/operations';
const pageSize = 20;

export function createOperations(ctx) {
  const { $, t, escapeHTML, formatDate, locale, request, showToast, paginationHTML } = ctx;
  let server = { production: [], expenses: [] };
  let loaded = false;
  let syncing = false;
  let productionPage = 1;
  let expensesPage = 1;
  let productionMonth = currentMonth();
  let expenseMonth = currentMonth();
  let expenseCategory = '';

  function currentMonth() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; }
  function userId() { return ctx.getUser()?.id; }
  function enabled() { return Boolean(ctx.getCapabilities().manageOperations); }
  function products() { return ctx.getProducts(); }
  function sum(values) { return values.reduce((total, value) => total + (Number(value) || 0), 0); }
  function formatUnits(value) { return Number(value || 0).toLocaleString(locale()); }
  function formatMoney(value) { return `${Number(value || 0).toLocaleString(locale())} FCFA`; }
  function inMonth(date, month) { return !month || date.startsWith(month); }
  function author(entry) { return entry.createdBy?.name || t('unknownUser'); }
  function pendingLabel(entry) { return entry.pendingSync ? `<div class="pending-label">${t(entry.syncError ? 'syncRejectedLabel' : 'pendingSync')}</div>` : ''; }

  // Maps quantities recorded against one product list onto the current products by name.
  function unitsFor(entry) {
    const recorded = Array.isArray(entry.products) ? entry.products : products();
    const byName = new Map(recorded.map((name, index) => [name, Number(entry.units?.[index]) || 0]));
    return products().map((name) => byName.get(name) ?? 0);
  }

  function pending(kind) { return listPendingRecords(kind, userId()); }
  function productionEntries() {
    const entries = new Map(server.production.map((entry) => [entry.date, entry]));
    pending('production').forEach((record) => entries.set(record.date, { ...entries.get(record.date), ...record, createdBy: entries.get(record.date)?.createdBy ?? ctx.getUser(), pendingSync: true, syncError: record.error }));
    return [...entries.values()].sort((a, b) => b.date.localeCompare(a.date));
  }
  function expenseEntries() {
    const entries = new Map(server.expenses.map((entry) => [entry.id, entry]));
    pending('expenses').forEach((record) => entries.set(record.id, { ...entries.get(record.id), ...record, createdBy: entries.get(record.id)?.createdBy ?? ctx.getUser(), pendingSync: true, syncError: record.error }));
    return [...entries.values()].sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt ?? b.queuedAt).localeCompare(String(a.createdAt ?? a.queuedAt)));
  }

  function applyPayload(payload) {
    server = { production: payload.production ?? [], expenses: payload.expenses ?? [] };
    loaded = true;
    saveOperationsSnapshot(userId(), server);
  }

  async function load() {
    if (!enabled()) return;
    try {
      const response = await request(endpoint);
      if (response.status === 401) return ctx.onUnauthorized();
      if (!response.ok) throw new Error('network');
      applyPayload(await response.json());
      render();
      await sync();
    } catch { restoreCached(); }
  }

  function restoreCached() {
    const cached = loadOperationsSnapshot(userId());
    if (cached) { server = { production: cached.production ?? [], expenses: cached.expenses ?? [] }; loaded = true; }
    render();
  }

  function reset() { server = { production: [], expenses: [] }; loaded = false; }

  async function syncKind(kind) {
    const queue = pending(kind).filter((record) => !record.error);
    if (!queue.length) return;
    const body = kind === 'production'
      ? { entries: queue.map(({ queueId, date, units, products: names }) => ({ id: queueId, date, units, products: names })) }
      : { expenses: queue.map(({ id, date, category, amount, note }) => ({ id, date, category, amount, note })) };
    const response = await request(`${endpoint}?kind=${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (response.status === 401) { ctx.onUnauthorized(); throw new Error('unauthorized'); }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'network');
    const queueIdFor = (id) => kind === 'production' ? id : queue.find((record) => record.id === id)?.queueId;
    removePendingRecords(kind, userId(), (payload.applied ?? []).map((item) => queueIdFor(item.id)));
    const rejected = (payload.rejected ?? []).map((item) => ({ queueId: queueIdFor(item.id), error: item.error }));
    markPendingRecordsRejected(kind, userId(), rejected);
    if (rejected.length) showToast(t(rejected[0].error));
    applyPayload(payload);
  }

  async function sync({ includeRejected = false } = {}) {
    if (!enabled() || syncing || !navigator.onLine || !userId()) return;
    if (includeRejected) ['production', 'expenses'].forEach((kind) => markPendingRecordsRejected(kind, userId(), pending(kind).map((record) => ({ queueId: record.queueId, error: undefined }))));
    syncing = true;
    try {
      await syncKind('production');
      await syncKind('expenses');
    } catch {} finally {
      syncing = false;
      render();
      ctx.onQueueChange();
    }
  }

  function counts() {
    const all = [...pending('production'), ...pending('expenses')];
    return { syncable: all.filter((record) => !record.error).length, rejected: all.filter((record) => record.error).length };
  }

  function queueRecord(kind, record, keyField) {
    if (!enqueuePendingRecord(kind, userId(), record, keyField)) { showToast(t('saveError')); return false; }
    render();
    ctx.onQueueChange();
    if (navigator.onLine) sync();
    return true;
  }

  // ----- Production -----
  function renderProductionForm() {
    const date = $('#productionDate').value;
    const existing = productionEntries().find((entry) => entry.date === date);
    const units = existing ? unitsFor(existing) : products().map(() => 0);
    $('#productionGrid').innerHTML = products().map((name, index) => `<div class="product-row readonly"><span class="product-name product-label">${escapeHTML(name)}</span><input class="production-units" aria-label="${escapeHTML(name)}" type="number" min="0" step="1" inputmode="numeric" value="${units[index]}" data-production-index="${index}"></div>`).join('');
    updateProductionTotal();
  }
  function productionFormUnits() { return [...document.querySelectorAll('.production-units')].map((input) => Math.max(0, Math.floor(Number(input.value) || 0))); }
  function updateProductionTotal() { $('#productionLiveTotal').textContent = formatUnits(sum(productionFormUnits())); }

  function saveProduction() {
    const date = $('#productionDate').value;
    if (!date) { showToast(t('chooseDate')); return; }
    if (queueRecord('production', { date, units: productionFormUnits(), products: [...products()] }, 'date')) showToast(t(navigator.onLine ? 'productionSaved' : 'savedLocally'));
  }

  function renderProductionBalance() {
    const produced = products().map(() => 0);
    const sold = products().map(() => 0);
    productionEntries().filter((entry) => inMonth(entry.date, productionMonth)).forEach((entry) => unitsFor(entry).forEach((value, index) => { produced[index] += value; }));
    ctx.getSalesEntries().filter((entry) => inMonth(entry.date, productionMonth)).forEach((entry) => entry.units.forEach((value, index) => { if (index < sold.length) sold[index] += Number(value) || 0; }));
    const row = (name, made, out) => { const gap = made - out; return `<tr><td>${escapeHTML(name)}</td><td>${formatUnits(made)}</td><td>${formatUnits(out)}</td><td class="${gap < 0 ? 'gap-negative' : gap > 0 ? 'gap-positive' : ''}"><strong>${gap > 0 ? '+' : ''}${formatUnits(gap)}</strong></td></tr>`; };
    $('#productionBalanceBody').innerHTML = products().map((name, index) => row(name, produced[index], sold[index])).join('') + row(t('totalUnitsShort'), sum(produced), sum(sold)).replace('<tr>', '<tr class="total-row">');
  }

  function renderProductionHistory() {
    const filtered = productionEntries().filter((entry) => inMonth(entry.date, productionMonth));
    const page = paginate(filtered, productionPage, pageSize); productionPage = page.currentPage;
    $('#productionHistoryBody').innerHTML = page.items.length ? page.items.map((entry) => {
      const units = unitsFor(entry);
      return `<tr class="${entry.pendingSync ? 'pending-row' : ''}"><td>${formatDate(entry.date)}${pendingLabel(entry)}</td><td><span class="sale-author">${escapeHTML(author(entry))}</span></td><td class="sale-products">${products().map((name, index) => `${escapeHTML(name)}: <strong>${formatUnits(units[index])}</strong>`).join(' · ')}</td><td><strong>${formatUnits(sum(units))}</strong></td><td><button class="ghost" data-edit-production="${entry.date}">${t('edit')}</button><button class="delete" data-delete-production="${entry.date}">${t('delete')}</button></td></tr>`;
    }).join('') : `<tr><td colspan="5" class="empty">${t('emptyProduction')}</td></tr>`;
    $('#productionPagination').innerHTML = paginationHTML(page, 'production');
  }

  async function deleteProduction(date) {
    if (!confirm(t('confirmDelete'))) return;
    const local = pending('production').filter((record) => record.date === date);
    if (local.length) removePendingRecords('production', userId(), local.map((record) => record.queueId));
    if (!server.production.some((entry) => entry.date === date)) { render(); ctx.onQueueChange(); showToast(t('productionDeleted')); return; }
    await remove(`kind=production&date=${encodeURIComponent(date)}`, 'productionDeleted');
  }

  // ----- Expenses -----
  function categoryOptions(selected, withAll) {
    return `${withAll ? `<option value="">${t('allCategories')}</option>` : ''}${expenseCategories.map((category) => `<option value="${category}" ${category === selected ? 'selected' : ''}>${t(`expense_${category}`)}</option>`).join('')}`;
  }

  function saveExpense(event) {
    event.preventDefault();
    const amount = Math.floor(Number($('#expenseAmount').value) || 0);
    const date = $('#expenseDate').value;
    if (!date) { showToast(t('chooseDate')); return; }
    if (amount <= 0) { showToast(t('invalid_expense_data')); return; }
    const id = $('#expenseForm').dataset.editId || crypto.randomUUID();
    const record = { id, date, category: $('#expenseCategory').value, amount, note: $('#expenseNote').value.trim().slice(0, 200) };
    if (queueRecord('expenses', record, 'id')) {
      showToast(t(navigator.onLine ? 'expenseSaved' : 'savedLocally'));
      resetExpenseForm();
    }
  }

  function resetExpenseForm() {
    const form = $('#expenseForm');
    delete form.dataset.editId;
    $('#expenseAmount').value = ''; $('#expenseNote').value = '';
    $('#expenseSubmit').textContent = t('saveExpense'); $('#cancelExpenseEdit').classList.add('hidden');
  }

  function editExpense(id) {
    const expense = expenseEntries().find((entry) => entry.id === id);
    if (!expense) return;
    const form = $('#expenseForm');
    form.dataset.editId = id;
    $('#expenseDate').value = expense.date; $('#expenseCategory').value = expense.category; $('#expenseAmount').value = expense.amount; $('#expenseNote').value = expense.note ?? '';
    $('#expenseSubmit').textContent = t('updateExpense'); $('#cancelExpenseEdit').classList.remove('hidden');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function deleteExpense(id) {
    if (!confirm(t('confirmDelete'))) return;
    const local = pending('expenses').filter((record) => record.id === id);
    if (local.length) removePendingRecords('expenses', userId(), local.map((record) => record.queueId));
    if ($('#expenseForm').dataset.editId === id) resetExpenseForm();
    if (!server.expenses.some((entry) => entry.id === id)) { render(); ctx.onQueueChange(); showToast(t('expenseDeleted')); return; }
    await remove(`kind=expenses&id=${encodeURIComponent(id)}`, 'expenseDeleted');
  }

  function renderExpenseSummary() {
    const monthly = expenseEntries().filter((entry) => inMonth(entry.date, expenseMonth));
    const totals = new Map(expenseCategories.map((category) => [category, 0]));
    monthly.forEach((entry) => totals.set(entry.category, (totals.get(entry.category) ?? 0) + Number(entry.amount)));
    const total = sum([...totals.values()]);
    const max = Math.max(...totals.values(), 1);
    $('#expenseMonthTotal').textContent = formatMoney(total);
    $('#expenseMonthLabel').textContent = expenseMonth ? new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(new Date(`${expenseMonth}-01T00:00:00`)) : t('allTime');
    const used = [...totals].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
    $('#expenseByCategory').innerHTML = used.length ? used.map(([category, value], index) => `<div><div class="bar-head"><span>${t(`expense_${category}`)}</span><strong>${formatMoney(value)}</strong></div><div class="track"><div class="fill ${['', 'b', 'c', 'd'][index % 4]}" style="width:${value / max * 100}%"></div></div></div>`).join('') : `<p class="hint">${t('emptyExpenses')}</p>`;
  }

  function renderExpenseHistory() {
    const filtered = expenseEntries().filter((entry) => inMonth(entry.date, expenseMonth) && (!expenseCategory || entry.category === expenseCategory));
    const page = paginate(filtered, expensesPage, pageSize); expensesPage = page.currentPage;
    $('#expenseFilterSummary').textContent = t('expensesFound', { count: formatUnits(filtered.length), total: formatMoney(sum(filtered.map((entry) => entry.amount))) });
    $('#expenseHistoryBody').innerHTML = page.items.length ? page.items.map((entry) => `<tr class="${entry.pendingSync ? 'pending-row' : ''}"><td>${formatDate(entry.date)}${pendingLabel(entry)}</td><td><span class="category-badge">${t(`expense_${entry.category}`)}</span></td><td class="sale-products">${escapeHTML(entry.note || '—')}</td><td><span class="sale-author">${escapeHTML(author(entry))}</span></td><td><strong>${formatMoney(entry.amount)}</strong></td><td><button class="ghost" data-edit-expense="${escapeHTML(entry.id)}">${t('edit')}</button><button class="delete" data-delete-expense="${escapeHTML(entry.id)}">${t('delete')}</button></td></tr>`).join('') : `<tr><td colspan="6" class="empty">${t('emptyExpenses')}</td></tr>`;
    $('#expensePagination').innerHTML = paginationHTML(page, 'expenses');
  }

  async function remove(query, successKey) {
    if (!navigator.onLine) { showToast(t('offlineRestricted')); render(); return; }
    try {
      const response = await request(`${endpoint}?${query}`, { method: 'DELETE' });
      if (response.status === 401) return ctx.onUnauthorized();
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { showToast(t(payload.error || 'saveError')); return; }
      applyPayload(payload); showToast(t(successKey));
    } catch { showToast(t('network_error')); }
    finally { render(); ctx.onQueueChange(); }
  }

  function render() {
    if (!enabled() || !ctx.getUser()) return;
    const focused = document.activeElement;
    const editingProduction = focused?.classList?.contains('production-units');
    if (!editingProduction) renderProductionForm();
    renderProductionBalance();
    renderProductionHistory();
    $('#expenseCategory').innerHTML = categoryOptions($('#expenseCategory').value || expenseCategories[0], false);
    $('#expenseCategoryFilter').innerHTML = categoryOptions(expenseCategory, true);
    renderExpenseSummary();
    renderExpenseHistory();
  }

  function bind() {
    $('#productionDate').valueAsDate = new Date();
    $('#expenseDate').valueAsDate = new Date();
    $('#productionMonth').value = productionMonth;
    $('#expenseMonth').value = expenseMonth;
    $('#productionDate').addEventListener('change', renderProductionForm);
    $('#productionGrid').addEventListener('input', updateProductionTotal);
    $('#saveProductionBtn').addEventListener('click', saveProduction);
    $('#productionMonth').addEventListener('change', (event) => { productionMonth = event.target.value; productionPage = 1; renderProductionBalance(); renderProductionHistory(); });
    $('#productionHistoryBody').addEventListener('click', (event) => {
      const edit = event.target.closest('[data-edit-production]');
      if (edit) { $('#productionDate').value = edit.dataset.editProduction; renderProductionForm(); $('#productionDate').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      const del = event.target.closest('[data-delete-production]');
      if (del) deleteProduction(del.dataset.deleteProduction);
    });
    $('#expenseForm').addEventListener('submit', saveExpense);
    $('#cancelExpenseEdit').addEventListener('click', resetExpenseForm);
    $('#expenseMonth').addEventListener('change', (event) => { expenseMonth = event.target.value; expensesPage = 1; renderExpenseSummary(); renderExpenseHistory(); });
    $('#expenseCategoryFilter').addEventListener('change', (event) => { expenseCategory = event.target.value; expensesPage = 1; renderExpenseHistory(); });
    $('#expenseHistoryBody').addEventListener('click', (event) => {
      const edit = event.target.closest('[data-edit-expense]');
      if (edit) editExpense(edit.dataset.editExpense);
      const del = event.target.closest('[data-delete-expense]');
      if (del) deleteExpense(del.dataset.deleteExpense);
    });
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-page-scope="production"],[data-page-scope="expenses"]');
      if (!button) return;
      const page = Math.max(1, Number(button.dataset.page) || 1);
      if (button.dataset.pageScope === 'production') { productionPage = page; renderProductionHistory(); } else { expensesPage = page; renderExpenseHistory(); }
    });
  }

  bind();
  return { load, restoreCached, reset, render, sync, counts, isLoaded: () => loaded };
}
