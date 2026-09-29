import type { Metadata } from "next";
import { GuardApp } from "@/components/ClientOnly";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Gate scanner · NightPass" };

export default async function GuardPage() {
  const user = await getSessionUser();
  return <GuardApp guardName={user?.name ?? "Guard"} />;
}
