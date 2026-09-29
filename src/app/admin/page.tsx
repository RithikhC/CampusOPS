import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { AdminApp } from "./AdminApp";

export const metadata: Metadata = { title: "Warden dashboard · NightPass" };

export default async function AdminPage() {
  const user = await getSessionUser();
  return <AdminApp adminName={user?.name ?? "Admin"} demoMode={config.demoMode} />;
}
