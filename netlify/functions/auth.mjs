import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { authStore, clearSessionCookie, createSessionCookie, getSession } from "../lib/session.mjs";

const jsonHeaders = { "Cache-Control": "no-store", "Content-Type": "application/json" };

function userKey(email) {
  return `user:${createHash("sha256").update(email).digest("hex")}`;
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name };
}

function createSession(user) {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    session: {
      userId: user.id,
      email: user.email,
      name: user.name,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
    }
  };
}

function validateCredentials(email, password) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && typeof password === "string" && password.length >= 8;
}

export default async (request) => {
  if (request.method === "GET") {
    const session = await getSession(request);
    if (!session) return Response.json({ error: "unauthorized" }, { status: 401, headers: jsonHeaders });
    return Response.json({ user: { id: session.userId, email: session.email, name: session.name } }, { headers: jsonHeaders });
  }

  if (request.method === "DELETE") {
    const session = await getSession(request);
    if (session) await authStore.delete(`session:${session.token}`);
    return new Response(null, { status: 204, headers: { "Set-Cookie": clearSessionCookie(), "Cache-Control": "no-store" } });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST, DELETE" } });
  }

  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!validateCredentials(email, password)) {
    return Response.json({ error: "invalid_credentials" }, { status: 400, headers: jsonHeaders });
  }

  let user;
  if (body.action === "register") {
    const name = String(body.name ?? "").trim();
    if (name.length < 2) return Response.json({ error: "invalid_name" }, { status: 400, headers: jsonHeaders });
    if (await authStore.get(userKey(email), { type: "json" })) {
      return Response.json({ error: "email_exists" }, { status: 409, headers: jsonHeaders });
    }

    const salt = randomBytes(16).toString("hex");
    user = {
      id: randomUUID(),
      email,
      name,
      salt,
      passwordHash: scryptSync(password, salt, 64).toString("hex"),
      createdAt: new Date().toISOString()
    };
    await authStore.setJSON(userKey(email), user);
  } else if (body.action === "login") {
    user = await authStore.get(userKey(email), { type: "json" });
    if (!user) return Response.json({ error: "login_failed" }, { status: 401, headers: jsonHeaders });
    const expected = Buffer.from(user.passwordHash, "hex");
    const supplied = scryptSync(password, user.salt, 64);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return Response.json({ error: "login_failed" }, { status: 401, headers: jsonHeaders });
    }
  } else {
    return Response.json({ error: "invalid_action" }, { status: 400, headers: jsonHeaders });
  }

  const { token, session } = createSession(user);
  await authStore.setJSON(`session:${token}`, session);
  return Response.json(
    { user: publicUser(user) },
    { headers: { ...jsonHeaders, "Set-Cookie": createSessionCookie(token) } }
  );
};

