import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../netlify/lib/session.mjs", import.meta.url), "utf8");

test("the authentication cookie expires after 24 hours", () => {
  assert.match(source, /Max-Age=86400/);
});

test("legacy seven-day sessions are capped to the new 24-hour duration", () => {
  assert.match(source, /issuedAt \+ sessionDurationMs/);
  assert.match(source, /Math\.min\(Number\(session\?\.expiresAt\) \|\| 0, issuedAt \+ sessionDurationMs\)/);
});
