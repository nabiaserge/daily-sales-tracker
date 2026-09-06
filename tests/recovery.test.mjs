import test from "node:test";
import assert from "node:assert/strict";
import { isRestorableSnapshot, listAuditRecoveryCandidates, recoverAuditEntries, summarizeSnapshot } from "../netlify/lib/recovery.mjs";

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

test("grouped deletions can be reconstructed from the audit trail", () => {
  const audit = [
    { timestamp: "2026-09-06T00:44:03.000Z", action: "sale_deleted", date: "2026-09-03", total: 2150, before: [0, 2150], actor: { id: "root", name: "Admin" } },
    { timestamp: "2026-09-06T00:44:02.000Z", action: "sale_deleted", date: "2026-09-02", total: 1550, before: [0, 1550], actor: { id: "root", name: "Admin" } },
    { timestamp: "2026-08-19T14:18:00.000Z", action: "sale_deleted", date: "2026-08-19", total: 1000, before: [1000], actor: { id: "root", name: "Admin" } }
  ];
  const candidates = listAuditRecoveryCandidates({ audit, products: ["Eaux&glaces"] });
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].entryCount, 2);
  assert.equal(candidates[0].totalUnits, 3700);
  assert.deepEqual(candidates[0].entries.map((entry) => entry.units), [[2150], [1550]]);
  assert.equal(recoverAuditEntries({ audit, products: ["Eaux&glaces"], key: candidates[0].key }).length, 2);
});

test("existing sales are excluded from audit recovery", () => {
  const audit = [{ timestamp: "2026-09-06T00:44:00.000Z", action: "sale_deleted", date: "2026-09-03", total: 2150, actor: { id: "root" } }];
  const candidates = listAuditRecoveryCandidates({ audit, products: ["Eaux&glaces"], currentEntries: [{ date: "2026-09-03", units: [2150] }] });
  assert.deepEqual(candidates, []);
});
