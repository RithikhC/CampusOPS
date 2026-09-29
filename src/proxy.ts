import { NextResponse, type NextRequest } from "next/server";
import { HOME_FOR_ROLE, SESSION_COOKIE, readSessionToken, type Role } from "@/lib/session";

/** Which roles may open each app. API routes check roles themselves as well. */
const ACCESS: Record<string, Role[]> = {
  "/student": ["student"],
  "/guard": ["guard", "admin"],
  "/admin": ["admin"],
};

export async function proxy(request: NextRequest) {
  const area = Object.keys(ACCESS).find((prefix) => request.nextUrl.pathname.startsWith(prefix));
  if (!area) return NextResponse.next();

  const user = await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.redirect(new URL("/", request.url));
  if (!ACCESS[area].includes(user.role)) return NextResponse.redirect(new URL(HOME_FOR_ROLE[user.role], request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/student/:path*", "/guard/:path*", "/admin/:path*"],
};
