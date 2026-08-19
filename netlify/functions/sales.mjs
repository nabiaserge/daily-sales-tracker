import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { getSession } from "../lib/session.mjs";

const store = getStore("daily-sales-tracker");
const defaultData = {
  products: ["Product One", "Product Two", "Product Three", "Product Four"],
  entries: []
};

function dataKey(userId) {
  return `sales:${userId}`;
}

function auditKey(userId) {
  return `audit:${userId}`;
}

function total(units = []) {
  return units.reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function auditEvent(session, action, details) {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    action,
    actor: { id: session.userId, name: session.name, email: session.email },
    ...details
  };
}

async function loadData(session) {
  const existing = await store.get(dataKey(session.userId), { type: "json" });
  if (existing) return existing;

  const migrationOwner = await store.get("legacy-migration-owner", { type: "text" });
  const legacy = !migrationOwner ? await store.get("sales-data", { type: "json" }) : null;
  const initial = legacy ?? defaultData;
  await store.setJSON(dataKey(session.userId), initial);
  if (legacy) await store.set("legacy-migration-owner", session.userId);
  return initial;
}

function buildAudit(previous, next, session) {
  const events = [];
  const previousEntries = new Map(previous.entries.map((entry) => [entry.date, entry]));
  const nextEntries = new Map(next.entries.map((entry) => [entry.date, entry]));

  for (const [date, entry] of nextEntries) {
    const oldEntry = previousEntries.get(date);
    if (!oldEntry) {
      events.push(auditEvent(session, "sale_created", { date, total: total(entry.units), after: entry.units }));
    } else if (JSON.stringify(oldEntry.units) !== JSON.stringify(entry.units)) {
      events.push(auditEvent(session, "sale_updated", {
        date,
        total: total(entry.units),
        before: oldEntry.units,
        after: entry.units
      }));
    }
  }

  for (const [date, entry] of previousEntries) {
    if (!nextEntries.has(date)) {
      events.push(auditEvent(session, "sale_deleted", { date, total: total(entry.units), before: entry.units }));
    }
  }

  if (JSON.stringify(previous.products) !== JSON.stringify(next.products)) {
    events.push(auditEvent(session, "products_updated", { before: previous.products, after: next.products }));
  }
  return events;
}

export default async (request) => {
  const session = await getSession(request);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });

  if (request.method === "GET") {
    const data = await loadData(session);
    const audit = (await store.get(auditKey(session.userId), { type: "json" })) ?? [];
    return Response.json({ ...data, audit }, { headers: { "Cache-Control": "no-store" } });
  }

  if (request.method !== "PUT") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, PUT" } });
  }

  const next = await request.json().catch(() => null);
  const valid = Array.isArray(next?.products)
    && next.products.length === 4
    && next.products.every((name) => typeof name === "string" && name.trim().length > 0)
    && Array.isArray(next?.entries)
    && next.entries.every((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry?.date)
      && Array.isArray(entry.units)
      && entry.units.length === 4
      && entry.units.every((value) => Number.isFinite(Number(value)) && Number(value) >= 0));
  if (!valid) return Response.json({ error: "invalid_sales_data" }, { status: 400 });

  const normalized = {
    products: next.products.map((name) => name.trim()),
    entries: next.entries.map((entry) => ({ date: entry.date, units: entry.units.map(Number) }))
  };
  const previous = await loadData(session);
  const newEvents = buildAudit(previous, normalized, session);
  const existingAudit = (await store.get(auditKey(session.userId), { type: "json" })) ?? [];
  const audit = [...newEvents, ...existingAudit].slice(0, 500);

  await store.setJSON(dataKey(session.userId), normalized);
  await store.setJSON(auditKey(session.userId), audit);
  return Response.json({ ...normalized, audit });
};

