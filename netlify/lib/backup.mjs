import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { isRestorableSnapshot, summarizeSnapshot } from "./recovery.mjs";

const store = getStore("daily-sales-backups");
const backupIndexKey = "backups:index";

export async function listRecoverySnapshots(limit = 20) {
  const index = (await store.get(backupIndexKey, { type: "json" })) ?? [];
  const indexed = Array.isArray(index)
    ? index.filter((entry) => entry?.entryCount > 0 && typeof entry?.key === "string").slice(0, limit)
    : [];
  const snapshots = await Promise.all(indexed.map(async (entry) => ({
    key: entry.key,
    snapshot: await store.get(entry.key, { type: "json" })
  })));
  return snapshots
    .filter(({ snapshot }) => isRestorableSnapshot(snapshot))
    .map(({ key, snapshot }) => summarizeSnapshot(snapshot, key));
}

export async function readRecoverySnapshot(key) {
  if (typeof key !== "string" || !key.startsWith("backup:")) return null;
  const snapshot = await store.get(key, { type: "json" });
  return isRestorableSnapshot(snapshot) ? snapshot : null;
}

export async function createBackup({ reason, data, audit, session }) {
  const createdAt = new Date().toISOString();
  const key = `backup:${createdAt}:${randomUUID()}`;
  const actor = { id: session.userId, name: session.name, email: session.email };
  const snapshot = {
    schemaVersion: 2,
    createdAt,
    reason,
    actor,
    data,
    audit
  };

  await store.setJSON(key, snapshot);
  const index = (await store.get(backupIndexKey, { type: "json" })) ?? [];
  await store.setJSON(backupIndexKey, [{
    key,
    createdAt,
    reason,
    actor,
    productCount: data.products.length,
    entryCount: data.entries.length
  }, ...index].slice(0, 200));

  return key;
}
