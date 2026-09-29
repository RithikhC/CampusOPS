"use client";

import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { AdminApp } from "@/app/admin/AdminApp";
import { GuardApp } from "@/app/guard/GuardApp";
import { StudentPass } from "@/app/student/StudentPass";
import type { Role } from "@/lib/session";
import { installFakeCamera } from "./camera";
import { demoUser, getBackend, installApiShim, isEmbedded } from "./client";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** One role's screen in the browser-only demo. Renders the same components as the real app. */
export default function DemoRole({ role }: { role: Role }) {
  const [setup] = useState(() => {
    const user = demoUser(role);
    const embedded = isEmbedded();
    installApiShim(user);
    if (role === "guard" && embedded) installFakeCamera();
    void getBackend();
    return { user, embedded };
  });

  const { user, embedded } = setup;
  const screen =
    role === "student" ? (
      <StudentPass studentId={user.id} />
    ) : role === "guard" ? (
      <GuardApp guardName={user.name} />
    ) : (
      <AdminApp adminName={user.name} demoMode />
    );

  if (embedded) return screen;

  return (
    <>
      <div className="flex items-center justify-between gap-3 bg-[#1d4ed8] px-4 py-2 text-sm text-white">
        <a href={`${BASE_PATH}/`} className="inline-flex items-center gap-1.5 font-medium">
          <ArrowLeft className="size-4" aria-hidden /> NightPass demo
        </a>
        <span className="truncate opacity-90">Sample data, runs in your browser</span>
      </div>
      {screen}
    </>
  );
}
