import test from "node:test";
import assert from "node:assert/strict";
import { authorizeSalesMutation, mergeStaffSales } from "../netlify/lib/sales-access.mjs";

const staffOne = { userId: "staff-1", name: "Staff One", email: "one@example.com", role: "staff" };
const staffTwo = { userId: "staff-2", name: "Staff Two", email: "two@example.com", role: "staff" };
const admin = { userId: "admin-1", name: "Admin", email: "admin@example.com", role: "admin" };
const superadmin = { userId: "root-1", name: "Root", email: "root@example.com", role: "superadmin" };
const products = ["Classic", "Plus"];
const previous = {
  products,
  entries: [
    { date: "2026-09-01", units: [4, 2], createdBy: { id: staffOne.userId } },
    { date: "2026-09-02", units: [3, 1], createdBy: { id: staffTwo.userId } }
  ]
};

test("a staff member can update their own sales without replacing other users' sales", () => {
  const entries = [{ date: "2026-09-01", units: [5, 2] }];
  assert.equal(authorizeSalesMutation({ session: staffOne, previous, products, entries }), null);
  const merged = mergeStaffSales({ session: staffOne, previous, entries, timestamp: "2026-09-03T10:00:00.000Z" });
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.find((entry) => entry.date === "2026-09-02").units, [3, 1]);
  assert.deepEqual(merged.find((entry) => entry.date === "2026-09-01").units, [5, 2]);
});

test("a staff member cannot modify another user's sale", () => {
  const entries = [{ date: "2026-09-02", units: [99, 99] }];
  assert.equal(authorizeSalesMutation({ session: staffOne, previous, products, entries }), "sale_owner_forbidden");
});

test("a staff member cannot delete their sale or manage products", () => {
  assert.equal(authorizeSalesMutation({ session: staffOne, previous, products, entries: [] }), "sale_delete_forbidden");
  assert.equal(authorizeSalesMutation({ session: staffOne, previous, products: [...products, "Mini"], entries: previous.entries }), "product_management_forbidden");
});

test("an Admin can correct sales but cannot change product structure", () => {
  assert.equal(authorizeSalesMutation({ session: admin, previous, products, entries: previous.entries.slice(0, 1) }), null);
  assert.equal(authorizeSalesMutation({ session: admin, previous, products: [...products, "Mini"], entries: previous.entries }), "product_management_forbidden");
});

test("the SuperAdmin can change products and sales", () => {
  assert.equal(authorizeSalesMutation({ session: superadmin, previous, products: [...products, "Mini"], entries: previous.entries }), null);
});
