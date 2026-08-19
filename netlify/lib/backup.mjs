import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

const store = getStore("daily-sales-backups");
const backupIndexKey = "backups:index";

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

