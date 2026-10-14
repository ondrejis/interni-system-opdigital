import "server-only";
import { consumeRateLimit } from "@rebar/core/http";
import { contentDisposition } from "@rebar/core/files";
import { systemCtx } from "@rebar/core/rbac";
import { shareApi } from "@rebar/zakazky/server";
import { Readable } from "node:stream";
import { getServices } from "./services";

/*
  Odkaz pro investora (jen ke čtení). Data skládá aplikace: základ zakázky a soubory z modulu Zakázky (`shareApi`),
  harmonogram a deník z příkazu `realizace.investor.view`, který smí běžet jen pod systémovým kontextem po ověření
  tokenu. Ceny, náklady a marže sem nikdy neproudí: každá vrstva vybírá sloupce explicitně.
*/

export type InvestorExt = {
  phases: {
    name: string;
    startDate: string;
    endDate: string;
    progress: number;
    status: string;
    milestone: boolean;
  }[];
  progress: number | null;
  diary: {
    date: string;
    weather: string;
    work: string | null;
    workers: string[];
    machines: string[];
    materials: { name: string; qty: string; unit: string }[];
    photoIds: string[];
    events: string | null;
    incidents: string[];
    signed: boolean;
  }[];
  diaryPhotoIds: string[];
};

export type InvestorData = {
  share: shareApi.ResolvedShare;
  base: shareApi.InvestorBase;
  ext: InvestorExt | null;
};

/** Zakázky jsou zapnuté? Bez nich odkaz nic neukazuje. */
export const sharingEnabled = () => getServices().runtime.modules.some((m) => m.id === "zakazky");

export async function loadInvestorData(
  share: shareApi.ResolvedShare,
): Promise<InvestorData | null> {
  const s = getServices();
  const base = await shareApi.investorBase(s.db, share);
  if (!base) return null;
  const cmd = s.collected.commands.get("realizace.investor.view");
  let ext: InvestorExt | null = null;
  if (cmd && (share.scope.schedule || share.scope.diary !== "none")) {
    ext = (await cmd.handler(
      systemCtx(s.db),
      cmd.input.parse({
        jobId: share.jobId,
        scope: { schedule: share.scope.schedule, diary: share.scope.diary },
      }),
      s.moduleDeps,
    )) as InvestorExt;
  }
  return { share, base, ext };
}

export function clientKeyFromHeaders(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Omezení počtu zobrazení veřejné stránky z jedné adresy. */
export const investorRateOk = (key: string) =>
  consumeRateLimit(getServices().db, `investor:${key}`, 120, 60);

const INLINE = /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/;

/** Odpověď se souborem pro investora, pokud ho rozsah odkazu dovoluje; jinak 404. */
export async function serveInvestorFile(
  share: shareApi.ResolvedShare,
  fileId: string,
  url: URL,
): Promise<Response> {
  const s = getServices();
  const notFound = () => new Response("Nenalezeno.", { status: 404 });
  const data = await loadInvestorData(share);
  const f = await shareApi.canServeFile(s.db, share, fileId, data?.ext?.diaryPhotoIds ?? []);
  if (!f) return notFound();
  const thumb = url.searchParams.has("thumb") && f.thumbKey;
  const inline = INLINE.test(f.mime) && !url.searchParams.has("download");
  const stream = await s.storage.get(thumb ? f.thumbKey! : f.storageKey);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "content-type": thumb ? "image/webp" : f.mime,
      "content-disposition": contentDisposition(f.name, inline),
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, max-age=600",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
