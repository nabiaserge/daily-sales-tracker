export const roles = Object.freeze({
  superadmin: "superadmin",
  admin: "admin",
  staff: "staff"
});

export const applicationRoles = Object.freeze(Object.values(roles));
export const assignableRoles = Object.freeze([roles.admin, roles.staff]);

function hasRole(session, allowedRoles) {
  return Boolean(session && allowedRoles.includes(session.role));
}

export function canViewGlobalDashboard(session) {
  return hasRole(session, [roles.superadmin, roles.admin]);
}

export function canViewAudit(session) {
  return canViewGlobalDashboard(session);
}

export function canCreateSales(session) {
  return hasRole(session, applicationRoles);
}

export function canEditAllSales(session) {
  return canViewGlobalDashboard(session);
}

export function canDeleteSales(session) {
  return canViewGlobalDashboard(session);
}

export function canManageProducts(session) {
  return session?.role === roles.superadmin;
}

export function canViewUsers(session) {
  return canViewGlobalDashboard(session);
}

export function canCreateUsers(session) {
  return session?.role === roles.superadmin;
}

export function canChangeAccess(session, targetRole, options = {}) {
  if (session?.role === roles.superadmin) return assignableRoles.includes(targetRole);
  if (session?.role !== roles.admin || targetRole !== roles.staff) return false;
  return !(options.nextActive === true && options.accessUpdatedByRole === roles.superadmin);
}

export function canChangeRole(session, targetRole, nextRole) {
  return session?.role === roles.superadmin
    && assignableRoles.includes(targetRole)
    && assignableRoles.includes(nextRole);
}
