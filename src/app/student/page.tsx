import type { Metadata } from "next";
import { StudentPass } from "@/components/ClientOnly";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = { title: "My pass · NightPass" };

export default async function StudentPage() {
  const user = await getSessionUser();
  return <StudentPass studentId={user?.id ?? ""} />;
}
