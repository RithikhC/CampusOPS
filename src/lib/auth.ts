import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, readSessionToken, type Role, type SessionUser } from "./session";

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value);
}

/** For route handlers: returns the user, or a 401/403 response to send back as-is. */
export async function authorize(roles: Role[]): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  if (!roles.includes(user.role)) return NextResponse.json({ error: "Not allowed for your role" }, { status: 403 });
  return user;
}
