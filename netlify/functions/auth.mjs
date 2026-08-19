import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { authStore, clearSessionCookie, createSessionCookie, getSession } from "../lib/session.mjs";

const jsonHeaders = { "Cache-Control": "no-store", "Content-Type": "application/json" };
const usersIndexKey = "users:index";
const superAdminKey = "super-admin-id";

function userKey(email) {
  return `user:${createHash("sha256").update(email).digest("hex")}`;
}

function publicUser(user) {
  return {
    id: user.id ?? user.userId,
    email: user.email,
    name: user.name,
    role: user.role ?? "staff",
    active: user.active !== false,
    createdAt: user.createdAt
  };
}

function createSession(user) {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    session: {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role ?? "staff",
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
    }
  };
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateCredentials(email, password) {
  return validEmail(email) && typeof password === "string" && password.length >= 8;
}

function validSetupKey(candidate) {
  const expected = process.env.SUPER_ADMIN_SETUP_KEY;
  if (!expected || !candidate) return false;
  const expectedHash = createHash("sha256").update(expected.trim()).digest();
  const candidateHash = createHash("sha256").update(candidate.trim()).digest();
  return timingSafeEqual(expectedHash, candidateHash);
}

function passwordFields(password) {
  const salt = randomBytes(16).toString("hex");
  return { salt, passwordHash: scryptSync(password, salt, 64).toString("hex") };
}

async function readUserIndex() {
  const index = await authStore.get(usersIndexKey, { type: "json" });
  return Array.isArray(index) ? index : [];
}

async function addToUserIndex(email) {
  const index = await readUserIndex();
  if (!index.includes(email)) await authStore.setJSON(usersIndexKey, [...index, email]);
}

async function createStaff(body, session) {
  if (!session || session.role !== "superadmin") {
    return Response.json({ error: "forbidden" }, { status: 403, headers: jsonHeaders });
  }

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (name.length < 2) return Response.json({ error: "invalid_name" }, { status: 400, headers: jsonHeaders });
  if (!validateCredentials(email, password)) {
    return Response.json({ error: "invalid_credentials" }, { status: 400, headers: jsonHeaders });
  }
  if (await authStore.get(userKey(email), { type: "json" })) {
    return Response.json({ error: "email_exists" }, { status: 409, headers: jsonHeaders });
  }

  const user = {
    id: randomUUID(),
    email,
    name,
    role: "staff",
    active: true,
    ...passwordFields(password),
    createdAt: new Date().toISOString(),
    createdBy: session.userId
  };
  await authStore.setJSON(userKey(email), user);
  await addToUserIndex(email);
  return Response.json({ user: publicUser(user) }, { status: 201, headers: jsonHeaders });
}

async function bootstrapSuperAdmin(body) {
  if (await authStore.get(superAdminKey, { type: "text" })) {
    return Response.json({ error: "setup_complete" }, { status: 409, headers: jsonHeaders });
  }

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!validSetupKey(String(body.setupKey ?? ""))) {
    return Response.json({ error: "setup_key_invalid" }, { status: 403, headers: jsonHeaders });
  }
  if (name.length < 2) return Response.json({ error: "invalid_name" }, { status: 400, headers: jsonHeaders });
  if (!validateCredentials(email, password)) {
    return Response.json({ error: "invalid_credentials" }, { status: 400, headers: jsonHeaders });
  }

  const existingUser = await authStore.get(userKey(email), { type: "json" });
  const user = {
    ...(existingUser ?? {}),
    id: existingUser?.id ?? randomUUID(),
    email,
    name,
    role: "superadmin",
    active: true,
    ...passwordFields(password),
    createdAt: existingUser?.createdAt ?? new Date().toISOString()
  };
  await authStore.setJSON(userKey(email), user);
  await addToUserIndex(email);
  await authStore.set(superAdminKey, user.id);

  const { token, session } = createSession(user);
  await authStore.setJSON(`session:${token}`, session);
  return Response.json(
    { user: publicUser(user) },
    { status: 201, headers: { ...jsonHeaders, "Set-Cookie": createSessionCookie(token) } }
  );
}

async function listUsers(session) {
  if (!session || session.role !== "superadmin") {
    return Response.json({ error: "forbidden" }, { status: 403, headers: jsonHeaders });
  }
  const users = (await Promise.all(
    (await readUserIndex()).map((email) => authStore.get(userKey(email), { type: "json" }))
  )).filter(Boolean).map(publicUser).sort((first, second) => first.name.localeCompare(second.name));
  return Response.json({ users }, { headers: jsonHeaders });
}

async function setUserAccess(body, session) {
  if (!session || session.role !== "superadmin") {
    return Response.json({ error: "forbidden" }, { status: 403, headers: jsonHeaders });
  }

  const userId = String(body.userId ?? "");
  const active = body.active === true;
  const indexedUsers = await Promise.all(
    (await readUserIndex()).map(async (email) => ({
      email,
      user: await authStore.get(userKey(email), { type: "json" })
    }))
  );
  const match = indexedUsers.find((entry) => entry.user?.id === userId);
  if (!match) return Response.json({ error: "user_not_found" }, { status: 404, headers: jsonHeaders });
  if (match.user.role === "superadmin") {
    return Response.json({ error: "superadmin_protected" }, { status: 400, headers: jsonHeaders });
  }

  const user = {
    ...match.user,
    active,
    accessUpdatedAt: new Date().toISOString(),
    accessUpdatedBy: session.userId
  };
  await authStore.setJSON(userKey(match.email), user);
  return Response.json({ user: publicUser(user) }, { headers: jsonHeaders });
}

export default async (request) => {
  const url = new URL(request.url);

  if (request.method === "GET" && url.searchParams.get("setup") === "1") {
    const superAdminId = await authStore.get(superAdminKey, { type: "text" });
    return Response.json({ setupRequired: !superAdminId }, { headers: jsonHeaders });
  }

  if (request.method === "GET") {
    const session = await getSession(request);
    if (url.searchParams.get("users") === "1") return listUsers(session);
    if (!session) return Response.json({ error: "unauthorized" }, { status: 401, headers: jsonHeaders });
    return Response.json({ user: publicUser(session) }, { headers: jsonHeaders });
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
  if (body.action === "bootstrap") return bootstrapSuperAdmin(body);
  if (body.action === "create_user") return createStaff(body, await getSession(request));
  if (body.action === "set_user_access") return setUserAccess(body, await getSession(request));
  if (body.action !== "login") {
    return Response.json({ error: "invalid_action" }, { status: 400, headers: jsonHeaders });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!validateCredentials(email, password)) {
    return Response.json({ error: "invalid_credentials" }, { status: 400, headers: jsonHeaders });
  }

  const user = await authStore.get(userKey(email), { type: "json" });
  if (!user || user.active === false || !["superadmin", "staff"].includes(user.role)) {
    return Response.json({ error: "login_failed" }, { status: 401, headers: jsonHeaders });
  }
  const expected = Buffer.from(user.passwordHash, "hex");
  const supplied = scryptSync(password, user.salt, 64);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return Response.json({ error: "login_failed" }, { status: 401, headers: jsonHeaders });
  }

  const { token, session } = createSession(user);
  await authStore.setJSON(`session:${token}`, session);
  return Response.json(
    { user: publicUser(user) },
    { headers: { ...jsonHeaders, "Set-Cookie": createSessionCookie(token) } }
  );
};

