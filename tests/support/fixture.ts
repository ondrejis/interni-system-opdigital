import { eq } from "drizzle-orm";
import { getPipeline } from "@rebar/core/config-data";
import type { Db } from "@rebar/core/db";
import { createRecord, resolveEntity, type ResolvedEntity } from "@rebar/core/entities";
import { taskType } from "@rebar/ukoly/schema";
import { canary, PRIVATE_AMOUNT_MINOR, SHARED_AMOUNT_MINOR } from "./canary";
import type { Fixture } from "./security-fixture";

/**
 * Sestava soukromých a sdílených záznamů pro testy viditelnosti (D §5.4): pro každou entitu se zámkem jeden sdílený
 * záznam a jeden soukromý s canary řetězcem v názvu (u plateb i v částce). Zakládá je vlastník přes engine, takže se
 * testuje i založení. Použije ji `private-matrix` (C1) a `private-paths` (QA-SEC): ručně čtené cesty modulů (widgety,
 * metriky, vrstvy, služby) se tu ověřují nad stejnými daty.
 */
export type PrivateFixture = {
  /** Klíče entit se zámkem, pro které sestava zakládá záznamy. */
  entities: string[];
  /** Id sdíleného záznamu podle klíče entity. */
  shared: Record<string, string>;
  /** Id soukromého záznamu podle klíče entity. */
  priv: Record<string, string>;
  /** Název (nebo jiný hledatelný text) soukromého záznamu s canary řetězcem. */
  privTitle: Record<string, string>;
  /** Název sdíleného záznamu. */
  sharedTitle: Record<string, string>;
  /** Id soukromé a sdílené zakázky a obchodu (rodiče, pod které patří děti). */
  parents: { privateJob: string; sharedJob: string; privateDeal: string; sharedDeal: string };
  /** Resolvovaná entita podle klíče (pro volání enginu). */
  resolve: (key: string) => Promise<ResolvedEntity>;
};

/** Hodnoty (pod klíči atributů) pro založení záznamu entity; `via` = zámek vzniká jen zděděním od rodiče. */
type Build = { values: Record<string, unknown>; via?: "parent" };

/** Entity se zámkem, pro které sestava umí založit záznamy. Nová entita se zámkem bez záznamu tu shodí matici. */
export const BUILDABLE = [
  "company",
  "person",
  "job",
  "deal",
  "task",
  "note",
  "time_entry",
  "payment",
  "email_template",
] as const;

/** Založí sestavu jako vlastník. Volat jednou na soubor testů (v izolované transakci). */
export async function buildPrivateFixture(f: Fixture, db: Db): Promise<PrivateFixture> {
  const owner = f.people.owner;
  const partner = f.people.partner;
  const resolve = (key: string) => {
    const def = f.registry.get(key);
    if (!def) throw new Error(`Entita „${key}“ není v registru.`);
    return resolveEntity(db, def);
  };
  const create = async (key: string, values: Record<string, unknown>) => {
    try {
      return (await createRecord(owner.ctx, f.registry, await resolve(key), values)).row;
    } catch (e) {
      throw new Error(`Fixture: entitu „${key}“ se nepodařilo založit: ${(e as Error).message}`, {
        cause: e,
      });
    }
  };

  // typ úkolu `task` a stav obchodu potřebují hooky modulů; zakládají se, kdyby je seed nedodal
  if (f.registry.get("task")) {
    const have = await db.select().from(taskType).where(eq(taskType.key, "task"));
    if (!have.length)
      await db.insert(taskType).values({ key: "task", name: "Úkol", isSystem: true } as never);
  }
  const stage = f.registry.get("deal")
    ? (await getPipeline(db, "deal", "default"))?.stages[0]?.id
    : undefined;

  const company = await create("company", { name: "Sdílená firma fixture" });
  const privCompany = await create("company", { name: canary("company"), isPrivate: true });
  const built: Record<string, { shared: Build; priv: Build }> = {};
  const names: Record<string, { shared: string; priv: string }> = {};
  const set = (key: string, shared: Build, priv: Build, sharedName: string, privName: string) => {
    built[key] = { shared, priv };
    names[key] = { shared: sharedName, priv: privName };
  };

  const sharedJobRow = f.registry.get("job")
    ? await create("job", { title: "Sdílená zakázka fixture", company: company.id, type: "web" })
    : undefined;
  const privJobRow = f.registry.get("job")
    ? await create("job", {
        title: canary("job"),
        company: company.id,
        type: "web",
        isPrivate: true,
      })
    : undefined;
  const sharedDealRow = stage
    ? await create("deal", { title: "Sdílený obchod fixture", company: company.id, status: stage })
    : undefined;
  const privDealRow = stage
    ? await create("deal", {
        title: canary("deal"),
        company: company.id,
        status: stage,
        isPrivate: true,
      })
    : undefined;

  set(
    "company",
    { values: { name: "Sdílená firma 2" } },
    { values: { name: canary("company-2"), isPrivate: true } },
    "Sdílená firma 2",
    canary("company-2"),
  );
  set(
    "person",
    { values: { lastName: "Sdílený", firstName: "Kontakt" } },
    { values: { lastName: canary("person"), firstName: "Soukromý", isPrivate: true } },
    "Kontakt Sdílený",
    `Soukromý ${canary("person")}`,
  );
  if (sharedJobRow && privJobRow) {
    set(
      "job",
      { values: { title: "Sdílená zakázka 2", company: company.id, type: "web" } },
      { values: { title: canary("job-2"), company: company.id, type: "web", isPrivate: true } },
      "Sdílená zakázka 2",
      canary("job-2"),
    );
    set(
      "time_entry",
      {
        values: { date: "2026-10-01", user: owner.id, job: sharedJobRow.id, minutes: 60 },
      },
      {
        via: "parent",
        values: { date: "2026-10-02", user: owner.id, job: privJobRow.id, minutes: 90 },
      },
      "Hodiny sdílené",
      "Hodiny soukromé",
    );
    set(
      "payment",
      {
        values: {
          description: "Sdílená platba fixture",
          amount: SHARED_AMOUNT_MINOR,
          job: sharedJobRow.id,
        },
      },
      {
        via: "parent",
        values: {
          description: canary("payment"),
          amount: PRIVATE_AMOUNT_MINOR,
          job: privJobRow.id,
        },
      },
      "Sdílená platba fixture",
      canary("payment"),
    );
  }
  if (stage)
    set(
      "deal",
      { values: { title: "Sdílený obchod 2", company: company.id, status: stage } },
      {
        values: {
          title: canary("deal-2"),
          company: company.id,
          status: stage,
          isPrivate: true,
        },
      },
      "Sdílený obchod 2",
      canary("deal-2"),
    );
  set(
    "task",
    { values: { title: "Sdílený úkol fixture" } },
    { values: { title: canary("task"), isPrivate: true } },
    "Sdílený úkol fixture",
    canary("task"),
  );
  set(
    "note",
    { values: { title: "Sdílená poznámka fixture" } },
    { values: { title: canary("note"), isPrivate: true } },
    "Sdílená poznámka fixture",
    canary("note"),
  );
  set(
    "email_template",
    { values: { name: "Sdílená šablona fixture" } },
    { values: { name: canary("email_template"), isPrivate: true } },
    "Sdílená šablona fixture",
    canary("email_template"),
  );

  const shared: Record<string, string> = {};
  const priv: Record<string, string> = {};
  const entities: string[] = [];
  for (const key of BUILDABLE) {
    const b = built[key];
    if (!b || !f.registry.get(key)) continue;
    entities.push(key);
    shared[key] = (await create(key, b.shared.values)).id;
    priv[key] = (await create(key, b.priv.values)).id;
  }
  void partner;
  void privCompany;
  return {
    entities,
    shared,
    priv,
    privTitle: Object.fromEntries(Object.entries(names).map(([k, v]) => [k, v.priv])),
    sharedTitle: Object.fromEntries(Object.entries(names).map(([k, v]) => [k, v.shared])),
    parents: {
      privateJob: privJobRow?.id ?? "",
      sharedJob: sharedJobRow?.id ?? "",
      privateDeal: privDealRow?.id ?? "",
      sharedDeal: sharedDealRow?.id ?? "",
    },
    resolve,
  };
}
