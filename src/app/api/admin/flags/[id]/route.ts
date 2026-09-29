import { NextResponse, type NextRequest } from "next/server";
import { resolveFlag } from "@/lib/admin";
import { authorize } from "@/lib/auth";
import { getDb } from "@/lib/db";

/** Marks a flagged scan as followed up, with a note. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/admin/flags/[id]">) {
  const user = await authorize(["admin"]);
  if (user instanceof NextResponse) return user;

  const id = Number((await ctx.params).id);
  const { note } = (await request.json().catch(() => ({}))) as { note?: string };
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const ok = await resolveFlag(await getDb(), user, id, typeof note === "string" ? note.slice(0, 500) : "");
  if (!ok) return NextResponse.json({ error: "Already resolved or not a flag" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
