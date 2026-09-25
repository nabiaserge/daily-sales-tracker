import { createHash, randomBytes, randomUUID } from "node:crypto";

export const sessionDurationMs = 24 * 60 * 60 * 1000;

// The session cookie is shared by every tab of a browser. When another account signs in
// from a second tab, an older tab would otherwise keep acting under the new account.
// Clients send the user they display in this header; a mismatch is refused.
export const expectedUserHeader = "x-session-user";

export function sessionUserMismatch(request, session) {
  const expected = request.headers.get(expectedUserHeader);
  return Boolean(expected && session && expected !== session.userId);
}

export function sessionChangedResponse() {
  return Response.json({ error: "session_changed" }, {
    status: 409,
    headers: { "Cache-Control": "no-store", "X-Session-Changed": "1" }
  });
}

export function normalizeDeviceId(value) {
  const deviceId = String(value ?? "").trim();
  return /^[a-zA-Z0-9_-]{16,128}$/.test(deviceId) ? deviceId : randomUUID();
}

export function normalizeDeviceLabel(value) {
  const label = String(value ?? "").trim().replace(/\s+/g, " ");
  return label.slice(0, 80) || "Appareil web";
}

export function deviceSessionKey(userId, deviceId) {
  const fingerprint = createHash("sha256").update(deviceId).digest("hex");
  return `device-session:${userId}:${fingerprint}`;
}

export function createDeviceSession(user, device = {}) {
  const token = randomBytes(32).toString("hex");
  const deviceId = normalizeDeviceId(device.id);
  const issuedAt = Date.now();
  return {
    token,
    session: {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role ?? "staff",
      deviceId,
      deviceLabel: normalizeDeviceLabel(device.label),
      issuedAt,
      expiresAt: issuedAt + sessionDurationMs
    }
  };
}

export async function activateDeviceSession(store, token, session) {
  const key = deviceSessionKey(session.userId, session.deviceId);
  const previousToken = await store.get(key, { type: "text" });
  await store.setJSON(`session:${token}`, session);
  await store.set(key, token);
  if (previousToken && previousToken !== token) await store.delete(`session:${previousToken}`);
}

export async function closeDeviceSession(store, session) {
  const key = session.deviceId ? deviceSessionKey(session.userId, session.deviceId) : null;
  if (key) {
    const activeToken = await store.get(key, { type: "text" });
    if (activeToken === session.token) await store.delete(key);
  }
  await store.delete(`session:${session.token}`);
}
