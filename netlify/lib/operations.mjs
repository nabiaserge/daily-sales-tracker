import { randomUUID } from "node:crypto";
import { alignUnits } from "./products.mjs";
import { remapUnits, validSaleDate } from "./sales-upsert.mjs";

export const productionKey = "production:shared";
export const expensesKey = "expenses:shared";
export const maxRecordsPerBatch = 200;
export const expenseCategories = Object.freeze([
  "raw_materials", "electricity", "water", "fuel", "salaries", "transport", "maintenance", "other"
]);

function actor(session) {
  return { id: session.userId, name: session.name, email: session.email };
}

function auditEvent(session, action, details, timestamp) {
  return { id: randomUUID(), timestamp, action, actor: actor(session), ...details };
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function validQuantity(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 1000000000;
}

// Production entries keep the product names they were recorded with, so they stay readable
// after products are added, removed or restored from a backup.
export function productionUnitsFor(entry, products) {
  const recorded = Array.isArray(entry?.products) ? entry.products : products;
  const byName = new Map(recorded.map((name, index) => [name, Number(entry?.units?.[index]) || 0]));
  return products.map((name) => byName.get(name) ?? 0);
}

export function realignProduction(entries, previousProducts, nextProducts) {
  return entries.map((entry) => ({
    ...entry,
    products: nextProducts,
    units: alignUnits(previousProducts, nextProducts, productionUnitsFor(entry, previousProducts))
  }));
}

export function applyProductionUpserts({ session, previous, products, records, timestamp }) {
  const entries = new Map(previous.entries.map((entry) => [entry.date, entry]));
  const applied = [];
  const rejected = [];
  const events = [];

  for (const record of records) {
    const id = typeof record?.id === "string" ? record.id.slice(0, 100) : null;
    if (!validSaleDate(record?.date) || !Array.isArray(record?.units) || !record.units.every(validQuantity)) {
      rejected.push({ id, date: record?.date ?? null, error: "invalid_production_data" });
      continue;
    }
    const units = remapUnits(Array.isArray(record.products) ? record.products : products, products, record.units);
    if (!units) {
      rejected.push({ id, date: record.date, error: "product_conflict" });
      continue;
    }
    const existing = entries.get(record.date);
    const before = existing ? productionUnitsFor(existing, products) : null;
    const changed = !existing || JSON.stringify(before) !== JSON.stringify(units);
    entries.set(record.date, {
      date: record.date,
      products,
      units,
      createdBy: existing?.createdBy ?? actor(session),
      createdAt: existing?.createdAt ?? timestamp,
      ...(existing?.updatedBy ? { updatedBy: existing.updatedBy, updatedAt: existing.updatedAt } : {}),
      ...(existing && changed ? { updatedBy: actor(session), updatedAt: timestamp } : {})
    });
    applied.push({ id, date: record.date });
    if (changed) {
      events.push(auditEvent(session, existing ? "production_updated" : "production_created", {
        date: record.date,
        total: sum(units),
        ...(before ? { before } : {}),
        after: units
      }, timestamp));
    }
  }

  return {
    entries: [...entries.values()].sort((first, second) => second.date.localeCompare(first.date)),
    applied,
    rejected,
    events
  };
}

export function removeProduction({ session, previous, date, products, timestamp }) {
  const existing = previous.entries.find((entry) => entry.date === date);
  if (!existing) return null;
  return {
    entries: previous.entries.filter((entry) => entry.date !== date),
    events: [auditEvent(session, "production_deleted", { date, total: sum(productionUnitsFor(existing, products)), before: existing.units }, timestamp)]
  };
}

export function normalizeExpense(record) {
  const id = typeof record?.id === "string" ? record.id.trim().slice(0, 100) : "";
  const note = typeof record?.note === "string" ? record.note.trim() : "";
  const amount = Number(record?.amount);
  if (!/^[A-Za-z0-9-]{8,100}$/.test(id)
    || !validSaleDate(record?.date)
    || !expenseCategories.includes(record?.category)
    || !Number.isInteger(amount) || amount <= 0 || amount > 1000000000000
    || note.length > 200) return null;
  return { id, date: record.date, category: record.category, amount, note };
}

export function applyExpenseUpserts({ session, previous, records, timestamp }) {
  const entries = new Map(previous.entries.map((entry) => [entry.id, entry]));
  const applied = [];
  const rejected = [];
  const events = [];

  for (const record of records) {
    const expense = normalizeExpense(record);
    if (!expense) {
      rejected.push({ id: typeof record?.id === "string" ? record.id.slice(0, 100) : null, error: "invalid_expense_data" });
      continue;
    }
    const existing = entries.get(expense.id);
    const changed = !existing || ["date", "category", "amount", "note"].some((field) => existing[field] !== expense[field]);
    entries.set(expense.id, {
      ...expense,
      createdBy: existing?.createdBy ?? actor(session),
      createdAt: existing?.createdAt ?? timestamp,
      ...(existing?.updatedBy ? { updatedBy: existing.updatedBy, updatedAt: existing.updatedAt } : {}),
      ...(existing && changed ? { updatedBy: actor(session), updatedAt: timestamp } : {})
    });
    applied.push({ id: expense.id });
    if (changed) {
      events.push(auditEvent(session, existing ? "expense_updated" : "expense_created", {
        date: expense.date,
        category: expense.category,
        amount: expense.amount,
        ...(existing ? { beforeAmount: existing.amount } : {})
      }, timestamp));
    }
  }

  return {
    entries: [...entries.values()].sort((first, second) => second.date.localeCompare(first.date) || String(second.createdAt).localeCompare(String(first.createdAt))),
    applied,
    rejected,
    events
  };
}

export function removeExpense({ session, previous, id, timestamp }) {
  const existing = previous.entries.find((entry) => entry.id === id);
  if (!existing) return null;
  return {
    entries: previous.entries.filter((entry) => entry.id !== id),
    events: [auditEvent(session, "expense_deleted", { date: existing.date, category: existing.category, amount: existing.amount }, timestamp)]
  };
}
