import { assertEntityAccess } from "@rebar/core/entities";
import { shareApi } from "@rebar/zakazky/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadInvestorData, sharingEnabled } from "@/server/investor";
import { requireCan } from "@/server/request";
import { getServices } from "@/server/services";
import { InvestorView } from "../../investor-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Náhled: pohled investora",
  robots: { index: false, follow: false },
};

/** Náhled „pohled investora“ pro toho, kdo odkazy zakázky spravuje: stejná stránka, jen přes přihlášení. */
export default async function InvestorPreviewPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  if (!sharingEnabled()) notFound();
  const ctx = await requireCan("zakazky.share");
  const { shareId } = await params;
  const s = getServices();
  if (!/^[0-9a-f-]{36}$/i.test(shareId)) notFound();
  const share = await shareApi.loadShareById(s.db, shareId);
  if (!share) notFound();
  try {
    await assertEntityAccess(ctx, "job", share.jobId, "read");
  } catch {
    notFound();
  }
  const data = await loadInvestorData(share);
  if (!data) notFound();
  const { name } = await s.getBranding();
  return (
    <InvestorView
      data={data}
      systemName={name}
      fileBase={`/api/investor/nahled/${shareId}/files`}
      preview
    />
  );
}
