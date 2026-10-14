import { definitions, summary } from "../lib/corpus";
import { discoverCatalogs } from "../lib/discover";
import { extensionEvents, notificationKinds } from "../lib/events";
import { genericTable } from "../lib/generic";
import { code, doc, generatedHeader, table, text } from "../lib/md";
import type { Runtime } from "../lib/runtime";
import { schemaFields } from "../lib/zod-fields";

type JobLike = {
  name: string;
  cron?: string;
  retryLimit?: number;
  keepCompletedSeconds?: number;
  schema: unknown;
};

/** Plánované úlohy, upozornění a události pro rozšíření klienta. */
export async function eventDocs(rt: Runtime): Promise<Record<string, string>> {
  const defs = definitions();
  const jobs: { owner: string; job: JobLike }[] = [
    ...rt.coreJobs.map((job) => ({ owner: "jádro", job: job as JobLike })),
    ...rt.manifests.flatMap((m) =>
      (rt.servers.get(m.id)?.jobs ?? []).map((job) => ({ owner: m.id, job: job as JobLike })),
    ),
  ];
  const jobRow = ({ owner, job }: { owner: string; job: JobLike }) => {
    const d = defs.find((x) => x.key === job.name && x.callee.endsWith("Job"));
    const fields = schemaFields(job.schema)
      .fields.map((f) => f.path)
      .filter((p) => p !== "(vstup)");
    return [
      code(job.name),
      owner,
      job.cron ? code(job.cron) : "",
      job.retryLimit ?? "výchozí",
      job.keepCompletedSeconds ?? "výchozí",
      fields.map((f) => code(f)).join(", "),
      text(summary(d?.doc)),
    ];
  };
  const head = [
    "Úloha",
    "Vlastník",
    "Plán (cron)",
    "Opakování po chybě",
    "Uchování dokončených (s)",
    "Data úlohy",
    "Popis",
  ];
  const scheduled = jobs
    .filter((j) => j.job.cron)
    .sort((a, b) => (a.job.name < b.job.name ? -1 : 1));
  const queued = jobs.filter((j) => !j.job.cron).sort((a, b) => (a.job.name < b.job.name ? -1 : 1));

  const notif = notificationKinds();
  const events = extensionEvents();
  const catalogs = await discoverCatalogs();

  return {
    "docs/reference/udalosti-a-ulohy.md": doc(
      "# Události, upozornění a plánované úlohy",
      generatedHeader(
        "úlohy jádra (`coreJobs`) a modulů (`ModuleServer.jobs`), volání `createNotifications` a rozhraní `EventMap` ve zdrojích",
      ),
      "Úlohy běží ve workeru (samostatný proces téže image, fronta pg-boss v PostgreSQL, [ADR 009](../adr/009-fronta-uloh-a-migrace.md)). Plán je cron v časové zóně Europe/Prague; úloha bez plánu se jen posílá do fronty z aplikace.",
      "## Plánované úlohy (cron)",
      table(head, scheduled.map(jobRow)),
      "## Úlohy ve frontě bez plánu",
      queued.length
        ? table(
            head.filter((h) => h !== "Plán (cron)"),
            queued.map((j) => {
              const r = jobRow(j);
              r.splice(2, 1);
              return r;
            }),
          )
        : "_Žádné._",
      "## Druhy upozornění",
      "Upozornění (zvonek v aplikaci, případně push) vytváří `createNotifications`. Druh (`kind`) je text, podle kterého se upozornění seskupuje a ikonuje. Seznam vychází z míst ve zdrojích, kde se upozornění sestavuje; příjemce, text a odkaz určuje vždy kód v uvedeném souboru. Částky se z textu upozornění vynechají lidem bez oprávnění k penězům (viz [oprávnění](opravneni.md)).",
      notif.length
        ? table(
            ["Druh", "Vzniká v"],
            notif.map((n) => [code(n.kind), n.files.map((f) => code(f)).join(", ")]),
          )
        : "_Žádné._",
      "## Události pro rozšíření klienta",
      "Rozšíření v `clients/<slug>/extensions/` reagují jen na tyto události ([CUSTOMIZATION](../CUSTOMIZATION.md)). Událost se oznamuje uvnitř transakce akce, která ji vyvolala.",
      events.length
        ? table(
            ["Událost", "Data", "Popis", "Oznamuje se v"],
            events.map((e) => [
              code(e.name),
              code(e.type),
              text(e.doc),
              e.emittedIn.map((f) => code(f)).join(", ") || "zatím nikde",
            ]),
          )
        : "_Žádné._",
      catalogs.length
        ? doc(
            "## Další katalogy nalezené v kódu",
            "Exportované konstanty, jejichž název odpovídá katalogu událostí, upozornění nebo metrik. Objevují se tu automaticky; vlastní podrobnější sekci lze přidat do generátoru (viz [DOCS-PROCES](../DOCS-PROCES.md)).",
            ...catalogs.map((c) =>
              doc(`### ${c.name}`, `Export ${code(c.entry)}.`, genericTable(c.value)),
            ),
          )
        : "",
    ),
  };
}
