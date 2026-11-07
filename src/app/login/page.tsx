import { redirect } from "next/navigation";

import { LoginForm } from "@/components/book/auth-forms";
import { getCurrentUser, } from "@/server/auth/current";
import { isSetupOpen } from "@/server/auth/service";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const setupOpen = await isSetupOpen();
  if (setupOpen) redirect("/setup");
  const params = await searchParams;
  return (
    <main>
      <LoginForm next={params.next ?? "/"} setupOpen={false} />
    </main>
  );
}
