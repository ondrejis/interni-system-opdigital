import { formatDate } from "@rebar/core/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/request";
import { getServices } from "@/server/services";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Stavební deník",
  robots: { index: false, follow: false },
};

type Entry = {
  date: string;
  weather: string | null;
  temperature: number | null;
  weatherData: {
    label: string;
    tempMin: number | null;
    tempMax: number | null;
    precipMm: number | null;
  } | null;
  work: string | null;
  events: string | null;
  people: string | null;
  machines: string | null;
  materials: string | null;
  workers: { name: string; hours: number | null }[];
  materialRows: { name: string; qty: string; unit: string; supplier: string | null }[];
  machineRows: { name: string; hours: number | null; note: string | null }[];
  incidents: { kind: string; text: string }[];
  photoIds: string[];
  signed: { at: string; name: string | null } | null;
  author: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hrs = (h: number | null) => (h === null ? "" : ` (${String(h).replace(".", ",")} h)`);

/**
 * Tisk stavebního deníku zakázky (`?od=` a `?do=` zužují období). Stránka je bílá a černá bez navigace aplikace,
 * tisk se spouští tlačítkem (z tisku prohlížeče jde uložit PDF). Ceny v tisku nejsou.
 */
export default async function PrintDiaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { jobId } = await params;
  const sp = await searchParams;
  if (!UUID.test(jobId)) notFound();
  const ctx = await requireCtx();
  const s = getServices();
  const cmd = s.collected.commands.get("realizace.diary.print");
  if (!cmd) notFound();
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  let data: { job: { number: string; title: string; address: string | null }; entries: Entry[] };
  try {
    data = (await cmd.handler(
      ctx,
      cmd.input.parse({
        jobId,
        from: sp.od && iso.test(sp.od) ? sp.od : null,
        to: sp.do && iso.test(sp.do) ? sp.do : null,
      }),
      s.moduleDeps,
    )) as typeof data;
  } catch {
    notFound();
  }
  const { name } = await s.getBranding();

  return (
    <div
      className="min-h-dvh bg-white p-6 text-[13px] leading-relaxed text-black print:p-0"
      data-testid="print-diary"
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-start justify-between gap-4 print:hidden">
          <p className="text-neutral-600">
            Náhled tisku. Z tlačítka vpravo jde deník vytisknout nebo uložit jako PDF.
          </p>
          <PrintButton />
        </div>
        <header className="border-b-2 border-black pb-2">
          <p className="text-xs uppercase tracking-wide">{name} · Stavební deník</p>
          <h1 className="text-xl font-bold">
            {data.job.number} {data.job.title}
          </h1>
          {data.job.address && <p>{data.job.address}</p>}
        </header>
        {data.entries.length === 0 && <p>V tomto období nejsou žádné zápisy.</p>}
        {data.entries.map((e) => (
          <section key={e.date} className="break-inside-avoid border-b border-neutral-400 pb-3">
            <h2 className="text-base font-bold">
              {formatDate(e.date)}
              {e.signed && (
                <span className="ml-2 text-xs font-normal">podepsáno {e.signed.name ?? ""}</span>
              )}
            </h2>
            <p className="text-neutral-700">
              Počasí:{" "}
              {e.weatherData
                ? [
                    e.weatherData.label,
                    e.weatherData.tempMin !== null && e.weatherData.tempMax !== null
                      ? `${e.weatherData.tempMin} až ${e.weatherData.tempMax} °C`
                      : null,
                    e.weatherData.precipMm ? `srážky ${e.weatherData.precipMm} mm` : null,
                  ]
                    .filter(Boolean)
                    .join(", ")
                : [e.weather, e.temperature !== null ? `${e.temperature} °C` : null]
                    .filter(Boolean)
                    .join(", ") || "neuvedeno"}
            </p>
            {e.work && <p className="mt-1 whitespace-pre-wrap">{e.work}</p>}
            <dl className="mt-1 grid grid-cols-[6.5rem_1fr] gap-x-3">
              {(e.workers.length > 0 || e.people) && (
                <>
                  <dt className="font-semibold">Pracovníci</dt>
                  <dd>
                    {e.workers.length
                      ? e.workers.map((w) => `${w.name}${hrs(w.hours)}`).join(", ")
                      : e.people}
                  </dd>
                </>
              )}
              {(e.machineRows.length > 0 || e.machines) && (
                <>
                  <dt className="font-semibold">Stroje</dt>
                  <dd>
                    {e.machineRows.length
                      ? e.machineRows
                          .map((m) => `${m.name}${hrs(m.hours)}${m.note ? ` — ${m.note}` : ""}`)
                          .join("; ")
                      : e.machines}
                  </dd>
                </>
              )}
              {(e.materialRows.length > 0 || e.materials) && (
                <>
                  <dt className="font-semibold">Materiál</dt>
                  <dd>
                    {e.materialRows.length
                      ? e.materialRows
                          .map(
                            (m) =>
                              `${m.name} (${m.qty.replace(".", ",")} ${m.unit})${m.supplier ? `, ${m.supplier}` : ""}`,
                          )
                          .join("; ")
                      : e.materials}
                  </dd>
                </>
              )}
              {e.incidents.length > 0 && (
                <>
                  <dt className="font-semibold">Nehody a vady</dt>
                  <dd>
                    {e.incidents
                      .map((x) => `${x.kind === "defect" ? "Vada" : "Nehoda"}: ${x.text}`)
                      .join("; ")}
                  </dd>
                </>
              )}
              {e.events && (
                <>
                  <dt className="font-semibold">Události</dt>
                  <dd className="whitespace-pre-wrap">{e.events}</dd>
                </>
              )}
            </dl>
            {e.photoIds.length > 0 && (
              <p className="mt-1 text-xs text-neutral-600">
                Fotografie: {e.photoIds.length} (v systému)
              </p>
            )}
            {e.author && <p className="mt-1 text-xs text-neutral-600">Zapsal(a): {e.author}</p>}
          </section>
        ))}
      </div>
    </div>
  );
}
