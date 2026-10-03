/**
 * Browser-side glue for the GitHub Pages demo. The app screens call fetch("/api/...") exactly as
 * they do against the real server; here those calls are answered by the in-browser backend.
 * When the phones and dashboard are shown inside the demo page (iframes), they all share the
 * demo page's backend, so a scan on the guard phone shows up on the dashboard.
 */
import type { DemoBackend } from "./backend";
import { DEMO_STAFF, DEMO_STUDENT_IDS } from "@/lib/seed";
import type { Role, SessionUser } from "@/lib/session";

declare global {
  interface Window {
    __nightpassBackend?: Promise<DemoBackend>;
    __nightpassOffline?: boolean;
    __nightpassCamera?: { show(code: string, holdMs?: number, style?: "pass" | "tag"): void };
    /** Demo only: pretend the student's phone is away from the hostel network. */
    __nightpassOffCampus?: boolean;
    /** Demo only: pretend the check-in comes from someone else's phone. */
    __nightpassDeviceOverride?: string;
  }
}

export const DEMO_STUDENTS = [
  { id: DEMO_STUDENT_IDS[0], name: "Aarav Mehta", hostel: "A-Block", room: "A-214", nextDoor: "A-215" },
  { id: DEMO_STUDENT_IDS[1], name: "Fatima Al Mansoori", hostel: "B-Block", room: "B-108", nextDoor: "B-109" },
  { id: DEMO_STUDENT_IDS[2], name: "Rohan Pillai", hostel: "C-Block", room: "C-305", nextDoor: "C-306" },
];

export function isEmbedded(): boolean {
  return window.self !== window.top;
}

export function getBackend(): Promise<DemoBackend> {
  try {
    const parentBackend = isEmbedded() ? window.parent.__nightpassBackend : undefined;
    if (parentBackend) return parentBackend;
  } catch {
    // Not same-origin: fall back to a backend in this page.
  }
  window.__nightpassBackend ??= import("./backend").then((m) => m.createBackend());
  return window.__nightpassBackend;
}

export function demoUser(role: Role): SessionUser {
  if (role === "student") {
    const requested = new URLSearchParams(window.location.search).get("id");
    const student = DEMO_STUDENTS.find((s) => s.id === requested) ?? DEMO_STUDENTS[0];
    return { id: student.id, name: student.name, role };
  }
  const staff = DEMO_STAFF.find((s) => s.id === (role === "admin" ? "admin-1" : "guard-1"))!;
  return { id: staff.id, name: staff.name, role };
}

let shimInstalled = false;

export function installApiShim(user: SessionUser): void {
  if (shimInstalled) return;
  shimInstalled = true;
  const networkFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("/api/")) return networkFetch(input, init);
    // The demo page can switch the guard phone "offline" to show the offline queue.
    if (window.__nightpassOffline) throw new TypeError("Failed to fetch");
    const backend = await getBackend();
    const body = typeof init?.body === "string" ? init.body : null;
    const result = await backend.handle(user, (init?.method ?? "GET").toUpperCase(), url, body);
    return new Response(result.body, { status: result.status, headers: { "Content-Type": result.contentType } });
  };
}
