import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";

const authStore = getStore("daily-sales-auth");
const sessionCookie = "sales_session";

export function getCookie(request, name) {
  const header = request.headers.get("cookie") ?? "";
  const match = header.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export async function getSession(request) {
  const token = getCookie(request, sessionCookie);
  if (!token) return null;

  const session = await authStore.get(`session:${token}`, { type: "json" });
  if (!session || session.expiresAt < Date.now() || !["superadmin", "staff"].includes(session.role)) {
    if (session) await authStore.delete(`session:${token}`);
    return null;
  }

  const accountKey = `user:${createHash("sha256").update(session.email).digest("hex")}`;
  const account = await authStore.get(accountKey, { type: "json" });
  if (!account || account.active === false || account.role !== session.role) {
    await authStore.delete(`session:${token}`);
    return null;
  }

  return { ...session, token };
}

export function createSessionCookie(token) {
  return `${sessionCookie}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;
}

export function clearSessionCookie() {
  return `${sessionCookie}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export { authStore };

