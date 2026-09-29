/**
 * Signed session cookie. Kept free of Node-only imports so the proxy can use it too.
 *
 * Prototype: users pick a demo account. Production: swap the login route for the university's
 * Google Workspace SSO (OIDC, restricted to the university domain); everything downstream of
 * `SessionUser` stays the same.
 */
import { SignJWT, jwtVerify } from "jose";

export type Role = "student" | "guard" | "admin";

export interface SessionUser {
  id: string;
  role: Role;
  name: string;
}

export const SESSION_COOKIE = "np_session";
export const SESSION_HOURS = 12;

export const HOME_FOR_ROLE: Record<Role, string> = {
  student: "/student",
  guard: "/guard",
  admin: "/admin",
};

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET ?? "nightpass-development-auth-secret-change-me";
  return new TextEncoder().encode(value);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ role: user.role, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());
}

export async function readSessionToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    const role = payload.role;
    if (!payload.sub || (role !== "student" && role !== "guard" && role !== "admin")) return null;
    return { id: payload.sub, role, name: String(payload.name ?? "") };
  } catch {
    return null;
  }
}
