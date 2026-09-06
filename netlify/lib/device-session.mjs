import { createHash, randomBytes, randomUUID } from "node:crypto";

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
  return {
    token,
    session: {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role ?? "staff",
      deviceId,
      deviceLabel: normalizeDeviceLabel(device.label),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
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
