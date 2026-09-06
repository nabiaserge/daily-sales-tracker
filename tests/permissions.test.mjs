import test from "node:test";
import assert from "node:assert/strict";
import {
  canChangeAccess,
  canCreateUsers,
  canManageProducts,
  canViewAudit,
  canViewGlobalDashboard,
  roles
} from "../netlify/lib/permissions.mjs";

const session = (role) => ({ userId: `${role}-id`, role });

test("only administrators can view the global dashboard and audit", () => {
  assert.equal(canViewGlobalDashboard(session(roles.staff)), false);
  assert.equal(canViewAudit(session(roles.staff)), false);
  assert.equal(canViewGlobalDashboard(session(roles.admin)), true);
  assert.equal(canViewAudit(session(roles.superadmin)), true);
});

test("only the SuperAdmin can manage products and create users", () => {
  assert.equal(canManageProducts(session(roles.staff)), false);
  assert.equal(canManageProducts(session(roles.admin)), false);
  assert.equal(canManageProducts(session(roles.superadmin)), true);
  assert.equal(canCreateUsers(session(roles.admin)), false);
  assert.equal(canCreateUsers(session(roles.superadmin)), true);
});

test("an Admin cannot manage an Admin or undo a SuperAdmin revocation", () => {
  assert.equal(canChangeAccess(session(roles.admin), roles.admin, { nextActive: false }), false);
  assert.equal(canChangeAccess(session(roles.admin), roles.staff, { nextActive: false }), true);
  assert.equal(canChangeAccess(session(roles.admin), roles.staff, {
    nextActive: true,
    accessUpdatedByRole: roles.superadmin
  }), false);
  assert.equal(canChangeAccess(session(roles.superadmin), roles.staff, {
    nextActive: true,
    accessUpdatedByRole: roles.superadmin
  }), true);
});
