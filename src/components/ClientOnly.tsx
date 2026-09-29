"use client";

import dynamic from "next/dynamic";

/**
 * The scanner and pass screens read device state (camera, offline queue in localStorage, network
 * status) from the first render, so they render only in the browser.
 */
export const GuardApp = dynamic(() => import("@/app/guard/GuardApp").then((m) => m.GuardApp), {
  ssr: false,
  loading: Loading,
});

export const StudentPass = dynamic(() => import("@/app/student/StudentPass").then((m) => m.StudentPass), {
  ssr: false,
  loading: Loading,
});

function Loading() {
  return <main className="grid min-h-dvh place-items-center text-muted">Loading…</main>;
}
