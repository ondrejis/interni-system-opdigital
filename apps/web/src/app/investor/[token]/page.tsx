import { shareApi } from "@rebar/zakazky/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import {
  clientKeyFromHeaders,
  investorRateOk,
  loadInvestorData,
  sharingEnabled,
} from "@/server/investor";
import { getServices } from "@/server/services";
import { InvestorView } from "../investor-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Informace o zakázce",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

/**
 * Veřejná stránka pro investora podle tajného tokenu v adrese: bez přihlášení, bez navigace aplikace, jen ke čtení.
 * Neplatný, zrušený i prošlý odkaz je stejně „nenalezeno“.
 */
export default async function InvestorPage({ params }: { params: Promise<{ token: string }> }) {
  if (!sharingEnabled()) notFound();
  if (!(await investorRateOk(clientKeyFromHeaders(await headers())))) notFound();
  const { token } = await params;
  const s = getServices();
  const share = await shareApi.resolveShare(s.db, token);
  if (!share) notFound();
  const data = await loadInvestorData(share);
  if (!data) notFound();
  const { name } = await s.getBranding();
  return <InvestorView data={data} systemName={name} fileBase={`/api/investor/${token}/files`} />;
}
