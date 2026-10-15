/*
  Sestavení „sond“ pro test soukromí (D §5.4, QA-SEC): všechny ruční čtecí cesty modulů, jak je zná aplikace (widgety,
  pozornost, metriky, vrstvy kalendáře, odznaky navigace, příspěvky karty klienta a proměnné e-mailů, služby) +
  deklarované `privatePaths` + čtení jádra mimo entity (hledání, historie, naposledy otevřené, export historie).
  Sondy se skládají přímo z registrů (`collectServers`), ne z `privatePaths`: nová položka registru je tedy
  testovaná, i když ji autor do `privatePaths` nezapsal; chybějící záznam v `privatePaths` hlásí zvláštní test.
*/
import { exportHistoryCsv, listRecent, queryHistory } from "@rebar/core/history";
import { searchAll } from "@rebar/core/entities";
import type { DashboardMetricInput, ModuleDeps } from "@rebar/core/module-server";
import { can, type Ctx } from "@rebar/core/rbac";
import { addDaysIso } from "@rebar/core/time";
import type { Fixture } from "./security-fixture";
import type { PrivateFixture, RichData } from "./fixture";

export type Probe = {
  /** Jednoznačný název sondy (`widget:3`, `metric:finance.balance`, `path:klienti.list`…). */
  name: string;
  /** Druh (pro hlášení a pro kontrolu úplnosti). */
  kind: string;
  /** Sonda, kterou aktér vůbec nemůže spustit (chybí oprávnění metriky…), vrátí `undefined` hned. */
  run: (ctx: Ctx) => Promise<unknown>;
};

/** Všechna ID soukromých záznamů ze sestav (pro sondy, které berou ID). */
export function privateIds(fx: PrivateFixture, rich: RichData) {
  return {
    companies: [fx.priv.company!, rich.privCompany],
    persons: [fx.priv.person!],
    jobs: [fx.priv.job!, fx.parents.privateJob],
    deals: [fx.priv.deal!, fx.parents.privateDeal],
    tasks: [fx.priv.task!, rich.tasks.privOverdue, rich.tasks.underPrivJob],
    notes: [fx.priv.note!, rich.noteUnderPrivJob],
    payments: [fx.priv.payment!, rich.privOverduePayment],
  };
}

export function buildProbes(
  f: Fixture,
  deps: ModuleDeps,
  fx: PrivateFixture,
  rich: RichData,
): Probe[] {
  const c = f.collected;
  const probes: Probe[] = [];
  const add = (kind: string, name: string, run: Probe["run"]) =>
    probes.push({ kind, name: `${kind}:${name}`, run });
  const today = rich.today;
  const window = { from: addDaysIso(today, -45), to: addDaysIso(today, 45) };
  const allCompanies = [fx.priv.company!, fx.shared.company!, rich.privCompany, rich.sharedCompany];

  // declared privatePaths (what the modules themselves promise)
  for (const p of c.privatePaths) add("path", p.name, (ctx) => p.run(ctx, deps));

  c.widgets.forEach((w, i) => add("widget", String(i), (ctx) => w(ctx, deps)));
  c.attention.forEach((a, i) => add("attention", String(i), (ctx) => a(ctx, deps)));
  for (const layer of c.calendarLayers)
    add("layer", layer.key, (ctx) => layer.items(ctx, window, deps));
  for (const b of c.navBadges) add("badge", b.href, (ctx) => b.count(ctx, deps));

  for (const m of c.dashboardMetrics) {
    const run = (input: Partial<DashboardMetricInput>) => async (ctx: Ctx) => {
      // metrika, na kterou aktér nemá oprávnění, pro něj neexistuje (jádro ji nevyhodnotí)
      if (!m.permissions.every((p) => can(ctx, p))) return undefined;
      return m.compute(
        ctx,
        {
          from: null,
          to: null,
          jobId: null,
          userId: null,
          bucket: null,
          limit: 50,
          params: {},
          today,
          ...input,
        },
        deps,
      );
    };
    add("metric", m.key, run({}));
    add("metric", `${m.key}@period`, run({ ...window, bucket: "month" as never }));
    for (const param of m.params ?? []) {
      // přepínače typu „zahrnout soukromé“ (vlastník si je smí zapnout): partner je zapnout nesmí a nic neuvidí
      if (param.type === "boolean")
        add("metric", `${m.key}@${param.key}=true`, run({ params: { [param.key]: true } }));
      for (const ch of param.choices ?? [])
        add(
          "metric",
          `${m.key}@${param.key}=${ch.value}`,
          run({ params: { [param.key]: ch.value } }),
        );
    }
  }

  // příspěvky karty klienta: nejen to, co si modul vybere sám, ale i výslovně soukromé firmy (hádání ID)
  (c.contributions.clientCard ?? []).forEach((p, i) => {
    if (p.tabCounts)
      add("clientCard", `${i}.tabCounts`, async (ctx) =>
        Promise.all(allCompanies.map((id) => p.tabCounts!(ctx, id))),
      );
    if (p.summary)
      add("clientCard", `${i}.summary`, async (ctx) =>
        Promise.all(allCompanies.map((id) => p.summary!(ctx, id))),
      );
    if (p.listMetrics)
      add("clientCard", `${i}.listMetrics`, (ctx) => p.listMetrics!(ctx, allCompanies));
  });
  // proměnné e-mailů (šablony: `{{klient.nazev}}`…) pro soukromé záznamy
  for (const [i, p] of (c.contributions.emailVars ?? []).entries()) {
    const resolver = p as unknown as { resolve?: (ctx: Ctx, id: string) => Promise<unknown> };
    if (resolver.resolve)
      add("emailVars", String(i), (ctx) =>
        Promise.all(
          [...allCompanies, fx.priv.person!, fx.parents.privateJob, fx.parents.privateDeal].map(
            (id) => resolver.resolve!(ctx, id).catch((e: unknown) => `chyba: ${(e as Error).name}`),
          ),
        ),
      );
  }

  // služby ostatních modulů, které čtou (volají je moduly za partnera)
  const settle = async <T>(fn: () => Promise<T>): Promise<unknown> =>
    fn().catch((e: unknown) => `chyba: ${(e as Error).name}`);
  add("service", "tasks", async (ctx) => {
    const t = deps.services.optional("tasks");
    if (!t) return null;
    const jobs = [fx.parents.privateJob, fx.parents.sharedJob];
    return {
      overdue: await settle(() => t.overdueJobIds(ctx)),
      counts: await Promise.all(
        [...jobs.map((jobId) => ({ jobId })), { dealId: fx.parents.privateDeal }].map((s) =>
          settle(() => t.openCounts(ctx, s)),
        ),
      ),
      estimate: await Promise.all(jobs.map((j) => settle(() => t.estimateByJob(ctx, j)))),
      byPhase: await Promise.all(
        jobs.map((jobId) => settle(() => t.openCountsByPhase(ctx, { jobId, phaseIds: [] }))),
      ),
      forTemplate: await Promise.all(
        jobs.map((jobId) => settle(() => t.listForTemplate(ctx, { jobId }))),
      ),
    };
  });
  add("service", "finance", async (ctx) => {
    const s = deps.services.optional("finance");
    if (!s) return null;
    const jobs = [fx.parents.privateJob, fx.parents.sharedJob, rich.jobOnPrivCompany];
    return {
      defaultSplit: await settle(() => s.defaultSplit(ctx)),
      income: await settle(() =>
        s.incomeSince(ctx, { companyIds: allCompanies, from: "2000-01-01" }),
      ),
      unpaid: await Promise.all(jobs.map((jobId) => settle(() => s.unpaidCount(ctx, { jobId })))),
      allocated: await Promise.all(jobs.map((j) => settle(() => s.allocatedByUser(ctx, j)))),
    };
  });
  add("service", "disk", async (ctx) => {
    const s = deps.services.optional("disk");
    if (!s) return null;
    return {
      company: await settle(() => s.folderState(ctx, "company", allCompanies)),
      job: await settle(() =>
        s.folderState(ctx, "job", [fx.parents.privateJob, fx.parents.sharedJob]),
      ),
    };
  });

  // jádro mimo entity: hledání, historie, naposledy otevřené, export historie
  for (const q of ["PRIVATE-CANARY", "CANARY", "canary-task", "Soukromý", "27082440"])
    add("core", `search:${q}`, (ctx) => searchAll(ctx, f.registry.all(), q, 50, { perType: 50 }));
  add("core", "history", (ctx) => queryHistory(ctx, f.registry, { limit: 200 } as never));
  add("core", "history:q", (ctx) => queryHistory(ctx, f.registry, { q: "CANARY" } as never));
  add("core", "history:csv", (ctx) =>
    exportHistoryCsv(ctx, f.registry, {}).catch((e: unknown) => `chyba: ${(e as Error).name}`),
  );
  add("core", "recent", (ctx) => listRecent(ctx, f.registry));

  return probes;
}

/**
 * Kanonický tvar výsledku pro porovnání „s a bez soukromých záznamů“: cesty, které si samy vybírají záznamy
 * (`someIds`), po odstranění soukromých řádků vrací kratší seznam; prázdné prvky a pořadí proto nehrají roli.
 * Časové značky vygenerované při čtení se zahodí.
 */
export function stable(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (typeof v === "bigint") return v.toString();
    if (v instanceof Date) return "<date>";
    if (Array.isArray(v))
      return v
        .map(norm)
        .filter(
          (x) => !(x == null || (typeof x === "object" && Object.keys(x as object).length === 0)),
        )
        .map((x) => JSON.stringify(x))
        .sort();
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([k]) => k !== "generatedAt" && k !== "now")
          .map(([k, x]) => [k, norm(x)]),
      );
    return v;
  };
  return JSON.stringify(norm(value)) ?? "";
}
