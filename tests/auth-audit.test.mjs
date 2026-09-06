import test from "node:test";
import assert from "node:assert/strict";
import { appendAuthenticationEvent, authenticationAuditKey, listAuthenticationEvents } from "../netlify/lib/auth-audit.mjs";

function memoryStore(initial = []) {
  let audit = initial;
  return {
    async get(key) { return key === authenticationAuditKey ? audit : null; },
    async setJSON(key, value) { if (key === authenticationAuditKey) audit = value; }
  };
}

test("login and logout events store only public actor fields", async () => {
  const store = memoryStore();
  const user = { id:"user-1", name:"Alice", email:"alice@example.com", passwordHash:"secret", token:"secret" };
  await appendAuthenticationEvent(store, user, "user_login");
  await appendAuthenticationEvent(store, user, "user_logout");
  const events = await listAuthenticationEvents(store);
  assert.deepEqual(events.map((event) => event.action), ["user_logout", "user_login"]);
  assert.deepEqual(events[0].actor, { id:"user-1", name:"Alice", email:"alice@example.com" });
  assert.equal("passwordHash" in events[0].actor, false);
  assert.equal("token" in events[0].actor, false);
});

test("authentication audit retains the latest 500 events", async () => {
  const previous = Array.from({ length:500 }, (_, index) => ({ id:`event-${index}`, timestamp:new Date().toISOString() }));
  const store = memoryStore(previous);
  await appendAuthenticationEvent(store, { id:"user-1", name:"Alice", email:"alice@example.com" }, "user_login");
  const events = await listAuthenticationEvents(store);
  assert.equal(events.length, 500);
  assert.equal(events[0].action, "user_login");
  assert.equal(events.some((event) => event.id === "event-499"), false);
});

test("authentication events identify the device without exposing its session token", async () => {
  const store = memoryStore();
  await appendAuthenticationEvent(store, { userId:"user-1", name:"Alice", email:"alice@example.com", deviceId:"device-phone-0001", deviceLabel:"Android · 0001", token:"secret" }, "user_login");
  const [event] = await listAuthenticationEvents(store);
  assert.deepEqual(event.device, { id:"device-phone-0001", label:"Android · 0001" });
  assert.equal("token" in event, false);
});
