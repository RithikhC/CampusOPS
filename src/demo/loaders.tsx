"use client";

import dynamic from "next/dynamic";

function Loading() {
  return <main className="grid min-h-dvh place-items-center bg-[#0b1120] text-[#9aa3b5]">Loading…</main>;
}

// The demo screens read browser state (URL, storage, camera) on their first render.
export const DemoConsole = dynamic(() => import("./DemoConsole"), { ssr: false, loading: Loading });
export const DemoRole = dynamic(() => import("./DemoRole"), { ssr: false, loading: Loading });
