import test from "node:test";
import assert from "node:assert/strict";
import {
  applyExpenseUpserts,
  applyProductionUpserts,
  normalizeExpense,
  productionUnitsFor,
  realignProduction,
  removeExpense,
  removeProduction
} from "../netlify/lib/operations.mjs";
import { canManageOperations, canResetPassword } from "../netlify/lib/permissions.mjs";

test("the SuperAdmin resets Admin and Staff passwords, an Admin only Staff passwords", () => {
  assert.equal(canResetPassword({ role: "superadmin" }, "admin"), true);
  assert.equal(canResetPassword({ role: "superadmin" }, "staff"), true);
  assert.equal(canResetPassword({ role: "superadmin" }, "superadmin"), false);
  assert.equal(canResetPassword({ role: "admin" }, "staff"), true);
  assert.equal(canResetPassword({ role: "admin" }, "admin"), false);
  assert.equal(canResetPassword({ role: "staff" }, "staff"), false);
  assert.equal(canResetPassword(null, "staff"), false);
});

const admin = { userId: "admin-1", name: "Admin", email: "admin@example.com", role: "admin" };
const timestamp = "2026-09-25T10:00:00.000Z";
const products = ["Eau", "Glace"];

test("only Admin and SuperAdmin can manage production and expenses", () => {
  assert.equal(canManageOperations({ role: "superadmin" }), true);
  assert.equal(canManageOperations({ role: "admin" }), true);
  assert.equal(canManageOperations({ role: "staff" }), false);
  assert.equal(canManageOperations(null), false);
});

test("production is upserted per date and audited only when it changes", () => {
  const first = applyProductionUpserts({ session: admin, previous: { entries: [] }, products, timestamp, records: [
    { id: "p1", date: "2026-09-24", units: [120, 40], products }
  ] });
  assert.equal(first.entries.length, 1);
  assert.deepEqual(first.entries[0].products, products);
  assert.equal(first.events[0].action, "production_created");
  assert.equal(first.events[0].total, 160);

  const replay = applyProductionUpserts({ session: admin, previous: { entries: first.entries }, products, timestamp, records: [
    { id: "p1", date: "2026-09-24", units: [120, 40], products }
  ] });
  assert.equal(replay.events.length, 0);
  assert.deepEqual(replay.applied, [{ id: "p1", date: "2026-09-24" }]);

  const update = applyProductionUpserts({ session: admin, previous: { entries: first.entries }, products, timestamp, records: [
    { id: "p2", date: "2026-09-24", units: [130, 40], products }
  ] });
  assert.equal(update.events[0].action, "production_updated");
  assert.deepEqual(update.events[0].before, [120, 40]);
});

test("production on a removed product is rejected and invalid quantities are refused", () => {
  const result = applyProductionUpserts({ session: admin, previous: { entries: [] }, products: ["Eau"], timestamp, records: [
    { id: "a", date: "2026-09-24", units: [1, 5], products },
    { id: "b", date: "2026-09-24", units: [-1], products: ["Eau"] }
  ] });
  assert.deepEqual(result.rejected.map((item) => item.error), ["product_conflict", "invalid_production_data"]);
});

test("production follows product changes by name", () => {
  const entries = [{ date: "2026-09-24", products, units: [120, 40] }];
  assert.deepEqual(productionUnitsFor(entries[0], ["Glace", "Jus", "Eau"]), [40, 0, 120]);
  const renamed = realignProduction(entries, products, ["Eau potable", "Glace"]);
  assert.deepEqual(renamed[0].products, ["Eau potable", "Glace"]);
  assert.deepEqual(renamed[0].units, [120, 40]);
  const removed = realignProduction(entries, products, ["Glace"]);
  assert.deepEqual(removed[0].units, [40]);
  const added = realignProduction(entries, products, [...products, "Jus"]);
  assert.deepEqual(added[0].units, [120, 40, 0]);
});

test("production deletion targets one date", () => {
  const previous = { entries: [{ date: "2026-09-24", products, units: [1, 1] }, { date: "2026-09-23", products, units: [2, 2] }] };
  const result = removeProduction({ session: admin, previous, date: "2026-09-24", products, timestamp });
  assert.deepEqual(result.entries.map((entry) => entry.date), ["2026-09-23"]);
  assert.equal(result.events[0].action, "production_deleted");
  assert.equal(removeProduction({ session: admin, previous, date: "2026-01-01", products, timestamp }), null);
});

test("expenses are validated", () => {
  const valid = { id: "8f0c3f5e-0000-4000-8000-000000000001", date: "2026-09-24", category: "fuel", amount: 25000, note: "  Groupe électrogène " };
  assert.deepEqual(normalizeExpense(valid), { ...valid, note: "Groupe électrogène" });
  assert.equal(normalizeExpense({ ...valid, amount: 0 }), null);
  assert.equal(normalizeExpense({ ...valid, amount: 12.5 }), null);
  assert.equal(normalizeExpense({ ...valid, category: "vacances" }), null);
  assert.equal(normalizeExpense({ ...valid, note: "x".repeat(201) }), null);
  assert.equal(normalizeExpense({ ...valid, id: "short" }), null);
});

test("several expenses per day are kept and replaying one is idempotent", () => {
  const first = { id: "8f0c3f5e-0000-4000-8000-000000000001", date: "2026-09-24", category: "fuel", amount: 25000, note: "" };
  const second = { id: "8f0c3f5e-0000-4000-8000-000000000002", date: "2026-09-24", category: "electricity", amount: 18000, note: "" };
  const result = applyExpenseUpserts({ session: admin, previous: { entries: [] }, timestamp, records: [first, second] });
  assert.equal(result.entries.length, 2);
  assert.deepEqual(result.events.map((event) => event.action), ["expense_created", "expense_created"]);
  const replay = applyExpenseUpserts({ session: admin, previous: { entries: result.entries }, timestamp, records: [first] });
  assert.equal(replay.entries.length, 2);
  assert.equal(replay.events.length, 0);
  const updated = applyExpenseUpserts({ session: admin, previous: { entries: result.entries }, timestamp, records: [{ ...first, amount: 30000 }] });
  assert.equal(updated.events[0].action, "expense_updated");
  assert.equal(updated.events[0].beforeAmount, 25000);
  const removed = removeExpense({ session: admin, previous: { entries: result.entries }, id: second.id, timestamp });
  assert.equal(removed.entries.length, 1);
  assert.equal(removed.events[0].amount, 18000);
});
