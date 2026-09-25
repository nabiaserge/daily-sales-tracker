import test from "node:test";
import assert from "node:assert/strict";
import { activateDeviceSession, closeDeviceSession, createDeviceSession, deviceSessionKey, sessionChangedResponse, sessionDurationMs, sessionUserMismatch } from "../netlify/lib/device-session.mjs";

test("a tab acting for another account than the cookie's is refused", async () => {
  const session = { userId: "serge" };
  const request = (user) => new Request("https://example.com/", { headers: user ? { "X-Session-User": user } : {} });
  assert.equal(sessionUserMismatch(request("awa"), session), true);
  assert.equal(sessionUserMismatch(request("serge"), session), false);
  assert.equal(sessionUserMismatch(request(null), session), false);
  assert.equal(sessionUserMismatch(request("awa"), null), false);
  const response = sessionChangedResponse();
  assert.equal(response.status, 409);
  assert.equal(response.headers.get("X-Session-Changed"), "1");
  assert.deepEqual(await response.json(), { error: "session_changed" });
});

function memoryStore() {
  const values = new Map();
  return {
    values,
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, value); },
    async setJSON(key, value) { values.set(key, value); },
    async delete(key) { values.delete(key); }
  };
}

const user = { id:"user-1", name:"Alice", email:"alice@example.com", role:"staff" };

test("different devices keep independent sessions", async () => {
  const store = memoryStore();
  const phone = createDeviceSession(user, { id:"device-phone-0001", label:"Android · 0001" });
  const computer = createDeviceSession(user, { id:"device-computer-02", label:"Windows · 0002" });
  await activateDeviceSession(store, phone.token, phone.session);
  await activateDeviceSession(store, computer.token, computer.session);
  assert.ok(store.values.has(`session:${phone.token}`));
  assert.ok(store.values.has(`session:${computer.token}`));
});

test("new sessions expire after 24 hours", () => {
  const { session } = createDeviceSession(user, { id:"device-phone-0001", label:"Android · 0001" });
  assert.equal(sessionDurationMs, 24 * 60 * 60 * 1000);
  assert.equal(session.expiresAt - session.issuedAt, sessionDurationMs);
});

test("a new login replaces only the previous session on the same device", async () => {
  const store = memoryStore();
  const first = createDeviceSession(user, { id:"device-phone-0001", label:"Android · 0001" });
  const second = createDeviceSession(user, { id:"device-phone-0001", label:"Android · 0001" });
  await activateDeviceSession(store, first.token, first.session);
  await activateDeviceSession(store, second.token, second.session);
  assert.equal(store.values.has(`session:${first.token}`), false);
  assert.ok(store.values.has(`session:${second.token}`));
  assert.equal(store.values.get(deviceSessionKey(user.id, second.session.deviceId)), second.token);
});

test("logout closes only the current device session", async () => {
  const store = memoryStore();
  const phone = createDeviceSession(user, { id:"device-phone-0001", label:"Android · 0001" });
  const computer = createDeviceSession(user, { id:"device-computer-02", label:"Windows · 0002" });
  await activateDeviceSession(store, phone.token, phone.session);
  await activateDeviceSession(store, computer.token, computer.session);
  await closeDeviceSession(store, { ...phone.session, token:phone.token });
  assert.equal(store.values.has(`session:${phone.token}`), false);
  assert.ok(store.values.has(`session:${computer.token}`));
});
