import { formatDate } from "@rebar/core/shared";
import { Chip, cn } from "@rebar/ui";
import { FileText, ImageIcon } from "lucide-react";
import type { InvestorData } from "@/server/investor";

const PHASE_COLOR: Record<string, string> = {
  inquiry: "gray",
  offer: "purple",
  preparation: "blue",
  execution: "orange",
  handover: "teal",
  warranty: "indigo",
  closed: "green",
  lost: "red",
  paused: "yellow",
};

const bytes = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1_048_576
      ? `${Math.round(n / 1024)} kB`
      : `${(n / 1_048_576).toFixed(1).replace(".", ",")} MB`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-faint">{title}</h2>
      {children}
    </section>
  );
}

function Bar({ value, done }: { value: number; done?: boolean }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-hover" aria-hidden>
      <div
        className={cn("h-full rounded-full", done ? "bg-success" : "bg-accent")}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/**
 * Stránka investora: fáze a postup, vybrané zápisy stavebního deníku, fotky a dokumenty. Žádné ceny ani náklady,
 * žádná navigace aplikace. Soubory jdou přes `fileBase` (veřejná adresa s tokenem, nebo adresa náhledu).
 */
export function InvestorView({
  data,
  systemName,
  fileBase,
  preview,
}: {
  data: InvestorData;
  systemName: string;
  fileBase: string;
  preview?: boolean;
}) {
  const { base, ext, share } = data;
  const color = (base.job.phase && PHASE_COLOR[base.job.phase]) || "gray";
  const photoUrl = (id: string, thumb = false) => `${fileBase}/${id}${thumb ? "?thumb=1" : ""}`;

  return (
    <div className="min-h-dvh bg-bg" data-testid="investor-page">
      {preview && (
        <div className="border-b border-line bg-accent-soft px-4 py-2 text-center text-sm text-accent">
          Náhled: takto odkaz „{share.label ?? "bez popisku"}“ uvidí investor.
        </div>
      )}
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <span className="font-semibold">{systemName}</span>
          <span className="text-sm text-muted">Informace o zakázce</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:py-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold" data-testid="investor-title">
            {base.job.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
            {base.job.phaseLabel && (
              <Chip color={color} dot>
                {base.job.phaseLabel}
              </Chip>
            )}
            {base.job.address && <span>{base.job.address}</span>}
            {base.job.startDate && base.job.endDate && (
              <span className="tabular">
                {formatDate(base.job.startDate)} – {formatDate(base.job.endDate)}
              </span>
            )}
          </div>
        </div>

        {share.scope.schedule && ext && (
          <Section title="Postup prací">
            {ext.phases.length === 0 ? (
              <p className="text-muted">Harmonogram zatím není zadaný.</p>
            ) : (
              <>
                {ext.progress !== null && (
                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-muted">Celkový průběh</span>
                      <span className="tabular text-lg font-semibold">{ext.progress} %</span>
                    </div>
                    <Bar value={ext.progress} done={ext.progress >= 100} />
                  </div>
                )}
                <ul
                  className="divide-y divide-line rounded-lg border border-line"
                  data-testid="investor-phases"
                >
                  {ext.phases.map((p, n) => (
                    <li key={n} className="space-y-1.5 px-4 py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-medium">{p.name}</span>
                        <span className="tabular text-sm text-muted">
                          {formatDate(p.startDate)}
                          {p.endDate !== p.startDate && ` – ${formatDate(p.endDate)}`}
                        </span>
                      </div>
                      {!p.milestone && (
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <Bar value={p.progress} done={p.status === "done"} />
                          </div>
                          <span className="tabular w-10 text-right text-sm">
                            {p.status === "done" ? "hotovo" : `${p.progress} %`}
                          </span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>
        )}

        {share.scope.diary !== "none" && ext && (
          <Section title="Stavební deník">
            {ext.diary.length === 0 ? (
              <p className="text-muted">Zatím tu nejsou žádné zápisy.</p>
            ) : (
              <ol className="space-y-3" data-testid="investor-diary">
                {ext.diary.map((d) => (
                  <li key={d.date} className="space-y-2 rounded-lg border border-line p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="font-semibold">{formatDate(d.date)}</b>
                      {d.weather && <Chip>{d.weather}</Chip>}
                      {d.signed && (
                        <Chip color="green" dot>
                          Podepsáno
                        </Chip>
                      )}
                    </div>
                    {d.work && <p className="whitespace-pre-wrap">{d.work}</p>}
                    <dl className="grid gap-x-4 gap-y-1 text-sm text-muted sm:grid-cols-[auto_1fr]">
                      {d.workers.length > 0 && (
                        <>
                          <dt className="font-medium">Na stavbě</dt>
                          <dd>{d.workers.join(", ")}</dd>
                        </>
                      )}
                      {d.machines.length > 0 && (
                        <>
                          <dt className="font-medium">Stroje</dt>
                          <dd>{d.machines.join(", ")}</dd>
                        </>
                      )}
                      {d.materials.length > 0 && (
                        <>
                          <dt className="font-medium">Materiál</dt>
                          <dd>
                            {d.materials
                              .map((m) => `${m.name} (${m.qty.replace(".", ",")} ${m.unit})`)
                              .join(", ")}
                          </dd>
                        </>
                      )}
                      {d.events && (
                        <>
                          <dt className="font-medium">Události</dt>
                          <dd className="whitespace-pre-wrap">{d.events}</dd>
                        </>
                      )}
                      {d.incidents.length > 0 && (
                        <>
                          <dt className="font-medium">Nehody a vady</dt>
                          <dd>{d.incidents.join("; ")}</dd>
                        </>
                      )}
                    </dl>
                    {d.photoIds.length > 0 && (
                      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {d.photoIds.map((id) => (
                          <li key={id}>
                            <a href={photoUrl(id)} target="_blank" rel="noreferrer">
                              <img
                                src={photoUrl(id, true)}
                                alt="Fotka ze stavby"
                                loading="lazy"
                                className="aspect-square w-full rounded-md border border-line object-cover"
                              />
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Section>
        )}

        {base.photos.length > 0 && (
          <Section title="Fotky">
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="investor-photos">
              {base.photos.map((f) => (
                <li key={f.id}>
                  <a href={photoUrl(f.id)} target="_blank" rel="noreferrer" className="block">
                    <img
                      src={photoUrl(f.id, true)}
                      alt={f.name}
                      loading="lazy"
                      className="aspect-[4/3] w-full rounded-md border border-line object-cover"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {base.documents.length > 0 && (
          <Section title="Dokumenty">
            <ul
              className="divide-y divide-line rounded-lg border border-line"
              data-testid="investor-documents"
            >
              {base.documents.map((f) => (
                <li key={f.id}>
                  <a
                    href={`${photoUrl(f.id)}${photoUrl(f.id).includes("?") ? "&" : "?"}download=1`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-subtle"
                  >
                    {f.mime.startsWith("image/") ? (
                      <ImageIcon className="size-4 shrink-0 text-faint" />
                    ) : (
                      <FileText className="size-4 shrink-0 text-faint" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="shrink-0 text-sm text-muted">{bytes(f.size)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {!share.scope.schedule &&
          share.scope.diary === "none" &&
          base.photos.length === 0 &&
          base.documents.length === 0 && (
            <p className="text-muted">K této zakázce zatím nejsou sdílené žádné podrobnosti.</p>
          )}
      </main>
      <footer className="border-t border-line px-4 py-4 text-center text-sm text-faint">
        Stránka je jen ke čtení a není veřejně dohledatelná.
      </footer>
    </div>
  );
}
