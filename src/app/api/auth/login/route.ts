import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { HOME_FOR_ROLE, SESSION_COOKIE, SESSION_HOURS, createSessionToken, type SessionUser } from "@/lib/session";

/**
 * Prototype login: pick a demo account. In production this route is replaced by the university's
 * Google Workspace SSO callback, which maps the verified email to a student or staff record.
 */
export async function POST(request: Request) {
  if (!config.demoMode) {
    return NextResponse.json({ error: "Demo login is disabled; use university sign-in" }, { status: 403 });
  }
  const { id } = (await request.json().catch(() => ({}))) as { id?: string };
  if (typeof id !== "string") return NextResponse.json({ error: "Choose an account" }, { status: 400 });

  const db = await getDb();
  const [staff] = await db.query<{ id: string; name: string; role: "guard" | "admin" }>(
    `select id, name, role from staff where id = $1`,
    [id],
  );
  const [student] = staff
    ? []
    : await db.query<{ id: string; name: string }>(`select id, name from students where id = $1 and active`, [id]);

  const user: SessionUser | null = staff
    ? { id: staff.id, name: staff.name, role: staff.role }
    : student
      ? { id: student.id, name: student.name, role: "student" }
      : null;
  if (!user) return NextResponse.json({ error: "Unknown account" }, { status: 404 });

  const response = NextResponse.json({ redirect: HOME_FOR_ROLE[user.role] });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  });
  return response;
}
