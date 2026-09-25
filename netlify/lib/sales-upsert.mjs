import { canEditAllSales } from "./permissions.mjs";
import { ownsSale } from "./sales-access.mjs";

export const maxSalesPerBatch = 200;

function actor(session) {
  return { id: session.userId, name: session.name, email: session.email };
}

export function validSaleDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validUnit(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 1000000000;
}

// Maps units recorded against one product list onto another by product name.
// Returns null when a product with sold units no longer exists, so no sale is silently dropped.
export function remapUnits(fromProducts, toProducts, units) {
  if (!Array.isArray(fromProducts) || fromProducts.length !== units.length) return null;
  const byName = new Map(fromProducts.map((name, index) => [String(name).trim(), Number(units[index]) || 0]));
  for (const [name, value] of byName) {
    if (value > 0 && !toProducts.includes(name)) return null;
  }
  return toProducts.map((name) => byName.get(name) ?? 0);
}

// Applies queued or live sale mutations onto the latest stored entries, one date at a time.
// Other entries are never touched, so a stale client can no longer overwrite sales it has not seen.
export function applySaleUpserts({ session, previous, sales, timestamp }) {
  const entries = new Map(previous.entries.map((entry) => [entry.date, entry]));
  const applied = [];
  const rejected = [];

  for (const sale of sales) {
    const id = typeof sale?.id === "string" ? sale.id.slice(0, 100) : null;
    if (!validSaleDate(sale?.date) || !Array.isArray(sale?.units) || !sale.units.every(validUnit)) {
      rejected.push({ id, date: sale?.date ?? null, error: "invalid_sales_data" });
      continue;
    }
    const units = remapUnits(Array.isArray(sale.products) ? sale.products : previous.products, previous.products, sale.units);
    if (!units) {
      rejected.push({ id, date: sale.date, error: "product_conflict" });
      continue;
    }
    const existing = entries.get(sale.date);
    if (existing && !canEditAllSales(session) && !ownsSale(session, existing)) {
      rejected.push({ id, date: sale.date, error: "sale_owner_forbidden" });
      continue;
    }
    const changed = existing && JSON.stringify(existing.units) !== JSON.stringify(units);
    entries.set(sale.date, {
      date: sale.date,
      units,
      createdBy: existing?.createdBy ?? actor(session),
      createdAt: existing?.createdAt ?? timestamp,
      ...(existing?.updatedBy ? { updatedBy: existing.updatedBy } : {}),
      ...(existing?.updatedAt ? { updatedAt: existing.updatedAt } : {}),
      ...(changed ? { updatedBy: actor(session), updatedAt: timestamp } : {})
    });
    applied.push({ id, date: sale.date });
  }

  return {
    entries: [...entries.values()].sort((first, second) => second.date.localeCompare(first.date)),
    applied,
    rejected
  };
}
