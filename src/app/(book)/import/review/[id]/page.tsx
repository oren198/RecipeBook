import { notFound } from "next/navigation";

import { RecipeForm } from "@/components/book/recipe-form";
import { getCurrentUser } from "@/server/auth/current";
import { isUuid } from "@/server/http";
import { readDraft, type ImportDraftView } from "@/server/import/service";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  let draft: ImportDraftView | null = null;
  try {
    draft = await readDraft(user, id);
  } catch {
    draft = null;
  }
  if (!draft) notFound();
  return (
    <>
      {draft.photoId ? (
        <figure className="print">
          {/* Authenticated photo. next/image would cache it through the public optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/photos/${draft.photoId}`} alt="צילום המקור לטיוטה" />
        </figure>
      ) : null}
      <RecipeForm initial={draft.recipe} draftId={draft.id} warnings={draft.warnings} heading="בדיקה לפני שמירה" submitLabel="שמירה בספר" />
    </>
  );
}
