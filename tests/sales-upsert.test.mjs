import test from "node:test";
import assert from "node:assert/strict";
import { applySaleUpserts, remapUnits } from "../netlify/lib/sales-upsert.mjs";

const staffOne = { userId: "staff-1", name: "Staff One", email: "one@example.com", role: "staff" };
const admin = { userId: "admin-1", name: "Admin", email: "admin@example.com", role: "admin" };
const timestamp = "2026-09-25T10:00:00.000Z";
const previous = {
  products: ["Eau", "Glace"],
  entries: [
    { date: "2026-09-02", units: [3, 1], createdBy: { id: "staff-2" } },
    { date: "2026-09-01", units: [4, 2], createdBy: { id: staffOne.userId } }
  ]
};

test("a queued sale is added without removing sales the client never saw", () => {
  const result = applySaleUpserts({ session: admin, previous, timestamp, sales: [
    { id: "m1", date: "2026-09-03", units: [7, 0], products: ["Eau", "Glace"] }
  ] });
  assert.equal(result.entries.length, 3);
  assert.deepEqual(result.applied, [{ id: "m1", date: "2026-09-03" }]);
  assert.deepEqual(result.entries[0].createdBy, { id: admin.userId, name: admin.name, email: admin.email });
});

test("replaying the same queued sale is idempotent", () => {
  const sale = { id: "m1", date: "2026-09-01", units: [5, 2], products: ["Eau", "Glace"] };
  const first = applySaleUpserts({ session: staffOne, previous, timestamp, sales: [sale] });
  const second = applySaleUpserts({ session: staffOne, previous: { ...previous, entries: first.entries }, timestamp, sales: [sale] });
  assert.deepEqual(second.entries, first.entries);
});

test("a staff sale on another user's date is rejected while the rest of the batch is applied", () => {
  const result = applySaleUpserts({ session: staffOne, previous, timestamp, sales: [
    { id: "blocked", date: "2026-09-02", units: [9, 9], products: ["Eau", "Glace"] },
    { id: "ok", date: "2026-09-04", units: [1, 1], products: ["Eau", "Glace"] }
  ] });
  assert.deepEqual(result.rejected, [{ id: "blocked", date: "2026-09-02", error: "sale_owner_forbidden" }]);
  assert.deepEqual(result.applied, [{ id: "ok", date: "2026-09-04" }]);
  assert.deepEqual(result.entries.find((entry) => entry.date === "2026-09-02").units, [3, 1]);
});

test("units follow products by name when products were reordered or added", () => {
  assert.deepEqual(remapUnits(["Eau", "Glace"], ["Glace", "Eau", "Jus"], [5, 2]), [2, 5, 0]);
});

test("a sale on a removed product is rejected instead of being silently dropped", () => {
  assert.equal(remapUnits(["Eau", "Glace"], ["Eau"], [5, 2]), null);
  assert.deepEqual(remapUnits(["Eau", "Glace"], ["Eau"], [5, 0]), [5]);
  const result = applySaleUpserts({ session: admin, previous: { ...previous, products: ["Eau"] }, timestamp, sales: [
    { id: "m1", date: "2026-09-05", units: [5, 2], products: ["Eau", "Glace"] }
  ] });
  assert.equal(result.rejected[0].error, "product_conflict");
});

test("invalid queued sales are rejected", () => {
  const result = applySaleUpserts({ session: admin, previous, timestamp, sales: [
    { id: "bad-date", date: "2026-02-30", units: [1, 1] },
    { id: "bad-units", date: "2026-09-06", units: [-1, 1] }
  ] });
  assert.equal(result.applied.length, 0);
  assert.deepEqual(result.rejected.map((item) => item.error), ["invalid_sales_data", "invalid_sales_data"]);
});
