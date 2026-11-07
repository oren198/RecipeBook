import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { BookShell } from "@/components/book/shell";
import { getCurrentUser } from "@/server/auth/current";

export const dynamic = "force-dynamic";

export default async function BookLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <BookShell user={user}>{children}</BookShell>;
}
