import { redirect } from "next/navigation";

import { SetupForm } from "@/components/book/auth-forms";
import { getCurrentUser } from "@/server/auth/current";
import { setupStatus } from "@/server/auth/service";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await getCurrentUser()) redirect("/");
  const status = await setupStatus();
  if (!status.needsSetup) redirect("/login");
  return (
    <main>
      <SetupForm productionSecretRequired={status.productionSecretRequired} />
    </main>
  );
}
