export function isRestorableSnapshot(snapshot) {
  const data = snapshot?.data;
  return Array.isArray(data?.products)
    && data.products.length > 0
    && data.products.every((product) => typeof product === "string" && product.trim())
    && Array.isArray(data.entries)
    && data.entries.length > 0
    && data.entries.every((entry) => typeof entry?.date === "string"
      && Array.isArray(entry.units)
      && entry.units.length === data.products.length
      && entry.units.every((value) => Number.isFinite(Number(value)) && Number(value) >= 0));
}

export function summarizeSnapshot(snapshot, key) {
  return {
    key,
    createdAt: snapshot.createdAt,
    reason: snapshot.reason,
    actor: snapshot.actor,
    products: snapshot.data.products,
    entryCount: snapshot.data.entries.length,
    totalUnits: snapshot.data.entries.reduce(
      (sum, entry) => sum + entry.units.reduce((entrySum, value) => entrySum + Number(value), 0),
      0
    )
  };
}

function auditGroupKey(event) {
  const minute = String(event.timestamp ?? "").slice(0, 16);
  const actor = event.actor?.id ?? event.actor?.email ?? "unknown";
  return `audit:${minute}:${actor}`;
}

function auditUnits(event, productCount) {
  if (Array.isArray(event.before) && event.before.length === productCount) {
    const units = event.before.map(Number);
    return units.every((value) => Number.isFinite(value) && value >= 0) ? units : null;
  }
  const total = Number(event.total);
  return productCount === 1 && Number.isFinite(total) && total >= 0 ? [total] : null;
}

export function listAuditRecoveryCandidates({ audit, products, currentEntries = [] }) {
  if (!Array.isArray(audit) || !Array.isArray(products) || products.length === 0) return [];
  const currentDates = new Set(currentEntries.map((entry) => entry.date));
  const groups = new Map();
  for (const event of audit) {
    const units = auditUnits(event, products.length);
    if (event?.action !== "sale_deleted" || !/^\d{4}-\d{2}-\d{2}$/.test(event.date) || !units || currentDates.has(event.date)) continue;
    const key = auditGroupKey(event);
    if (!groups.has(key)) groups.set(key, { key, source: "audit", createdAt: event.timestamp, reason: "audit_deleted_batch", products, entries: [] });
    groups.get(key).entries.push({
      date: event.date,
      units,
      createdBy: event.actor ?? { id: "audit-recovery", name: "Historical recovery", email: "" },
      createdAt: `${event.date}T00:00:00.000Z`
    });
  }
  return [...groups.values()].map((group) => ({
    ...group,
    entryCount: group.entries.length,
    totalUnits: group.entries.reduce((sum, entry) => sum + entry.units.reduce((entrySum, value) => entrySum + value, 0), 0)
  })).sort((first, second) => second.createdAt.localeCompare(first.createdAt));
}

export function recoverAuditEntries({ audit, products, currentEntries = [], key }) {
  return listAuditRecoveryCandidates({ audit, products, currentEntries }).find((candidate) => candidate.key === key)?.entries ?? null;
}
