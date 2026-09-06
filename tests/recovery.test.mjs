import test from "node:test";
import assert from "node:assert/strict";
import { isRestorableSnapshot, summarizeSnapshot } from "../netlify/lib/recovery.mjs";

const validSnapshot = {
  createdAt: "2026-08-19T20:48:29.497Z",
  reason: "before_sales_update",
  actor: { id: "root", name: "SuperAdmin", email: "root@example.com" },
  data: {
    products: ["Eaux&glaces"],
    entries: [
      { date: "2026-08-18", units: [12] },
      { date: "2026-08-19", units: [8] }
    ]
  }
};

test("only non-empty structurally valid snapshots can be restored", () => {
  assert.equal(isRestorableSnapshot(validSnapshot), true);
  assert.equal(isRestorableSnapshot({ data: { products: ["Eaux&glaces"], entries: [] } }), false);
  assert.equal(isRestorableSnapshot({ data: { products: ["Eaux&glaces"], entries: [{ date: "2026-08-19", units: [2, 3] }] } }), false);
});

test("snapshot summaries expose products, sales count and totals", () => {
  assert.deepEqual(summarizeSnapshot(validSnapshot, "backup:test"), {
    key: "backup:test",
    createdAt: validSnapshot.createdAt,
    reason: validSnapshot.reason,
    actor: validSnapshot.actor,
    products: ["Eaux&glaces"],
    entryCount: 2,
    totalUnits: 20
  });
});
