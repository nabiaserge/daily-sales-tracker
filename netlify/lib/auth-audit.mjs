import { randomUUID } from "node:crypto";

export const authenticationAuditKey = "audit:authentication";

export function createAuthenticationEvent(user, action, timestamp = new Date().toISOString()) {
  const event = {
    id: randomUUID(),
    timestamp,
    category: "authentication",
    action,
    actor: {
      id: user.id ?? user.userId,
      name: user.name,
      email: user.email
    }
  };
  if (user.deviceId) event.device = { id: user.deviceId, label: user.deviceLabel ?? "Appareil web" };
  return event;
}

export async function appendAuthenticationEvent(store, user, action) {
  const existing = await store.get(authenticationAuditKey, { type: "json" });
  const audit = [createAuthenticationEvent(user, action), ...(Array.isArray(existing) ? existing : [])].slice(0, 500);
  await store.setJSON(authenticationAuditKey, audit);
  return audit[0];
}

export async function listAuthenticationEvents(store) {
  const audit = await store.get(authenticationAuditKey, { type: "json" });
  return Array.isArray(audit) ? audit : [];
}
