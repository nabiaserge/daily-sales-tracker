import { getStore } from "@netlify/blobs";
import { createDatasetBackup } from "../lib/backup.mjs";
import {
  applyExpenseUpserts,
  applyProductionUpserts,
  expenseCategories,
  expensesKey,
  maxRecordsPerBatch,
  productionKey,
  removeExpense,
  removeProduction
} from "../lib/operations.mjs";
import { canManageOperations } from "../lib/permissions.mjs";
import { validSaleDate } from "../lib/sales-upsert.mjs";
import { getSession } from "../lib/session.mjs";

const store = getStore("daily-sales-tracker");
const auditKey = "audit:shared";
const noStore = { "Cache-Control": "no-store" };
const datasets = {
  production: { key: productionKey, bodyField: "entries" },
  expenses: { key: expensesKey, bodyField: "expenses" }
};

async function readDataset(key) {
  const value = await store.get(key, { type: "json" });
  return { entries: Array.isArray(value?.entries) ? value.entries : [] };
}

async function currentProducts() {
  const sales = await store.get("sales:shared", { type: "json" });
  return Array.isArray(sales?.products) ? sales.products : [];
}

async function payload() {
  const [products, production, expenses] = await Promise.all([currentProducts(), readDataset(productionKey), readDataset(expensesKey)]);
  return { products, production: production.entries, expenses: expenses.entries, categories: expenseCategories };
}

// Backs up the dataset and the audit trail before the first write; fails closed per BACKUP_POLICY.md.
async function commit({ kind, previous, entries, events, session, reason }) {
  const audit = (await store.get(auditKey, { type: "json" })) ?? [];
  try {
    await createDatasetBackup({ dataset: kind, reason, data: previous, audit, session });
  } catch {
    return false;
  }
  await store.setJSON(datasets[kind].key, { entries });
  if (events.length) await store.setJSON(auditKey, [...events, ...audit].slice(0, 500));
  return true;
}

export default async (request) => {
  const session = await getSession(request);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  if (!canManageOperations(session)) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });

  const url = new URL(request.url);
  if (request.method === "GET") return Response.json(await payload(), { headers: noStore });

  const kind = url.searchParams.get("kind");
  if (!datasets[kind]) return Response.json({ error: "invalid_kind" }, { status: 400, headers: noStore });
  const previous = await readDataset(datasets[kind].key);
  const timestamp = new Date().toISOString();

  if (request.method === "POST") {
    const body = await request.json().catch(() => null);
    const records = Array.isArray(body?.[datasets[kind].bodyField]) ? body[datasets[kind].bodyField] : null;
    if (!records || records.length < 1 || records.length > maxRecordsPerBatch) {
      return Response.json({ error: kind === "production" ? "invalid_production_data" : "invalid_expense_data" }, { status: 400, headers: noStore });
    }
    const result = kind === "production"
      ? applyProductionUpserts({ session, previous, products: await currentProducts(), records, timestamp })
      : applyExpenseUpserts({ session, previous, records, timestamp });
    if (result.applied.length && result.events.length) {
      const saved = await commit({ kind, previous, entries: result.entries, events: result.events, session, reason: `before_${kind}_update` });
      if (!saved) return Response.json({ error: "backup_failed" }, { status: 503, headers: noStore });
    }
    return Response.json({ ...(await payload()), applied: result.applied, rejected: result.rejected }, { headers: noStore });
  }

  if (request.method === "DELETE") {
    const date = url.searchParams.get("date");
    const id = url.searchParams.get("id");
    if (kind === "production" && !validSaleDate(date)) return Response.json({ error: "invalid_production_data" }, { status: 400, headers: noStore });
    if (kind === "expenses" && !id) return Response.json({ error: "invalid_expense_data" }, { status: 400, headers: noStore });
    const result = kind === "production"
      ? removeProduction({ session, previous, date, products: await currentProducts(), timestamp })
      : removeExpense({ session, previous, id, timestamp });
    if (result) {
      const saved = await commit({ kind, previous, entries: result.entries, events: result.events, session, reason: `before_${kind}_delete` });
      if (!saved) return Response.json({ error: "backup_failed" }, { status: 503, headers: noStore });
    }
    return Response.json(await payload(), { headers: noStore });
  }

  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST, DELETE" } });
};
