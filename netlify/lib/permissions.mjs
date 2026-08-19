export const roles = Object.freeze({
  superadmin: "superadmin",
  admin: "admin",
  staff: "staff"
});

export const applicationRoles = Object.freeze(Object.values(roles));
export const assignableRoles = Object.freeze([roles.admin, roles.staff]);

export function canViewUsers(session) {
  return Boolean(session && [roles.superadmin, roles.admin].includes(session.role));
}

export function canCreateUsers(session) {
  return session?.role === roles.superadmin;
}

export function canChangeAccess(session, targetRole) {
  if (session?.role === roles.superadmin) return assignableRoles.includes(targetRole);
  return session?.role === roles.admin && targetRole === roles.staff;
}

export function canChangeRole(session, targetRole, nextRole) {
  return session?.role === roles.superadmin
    && assignableRoles.includes(targetRole)
    && assignableRoles.includes(nextRole);
}

