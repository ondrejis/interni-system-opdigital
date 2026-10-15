import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@rebar/core/db";
import { setDomainEvents } from "@rebar/core/events";
import type { ModuleDeps } from "@rebar/core/module-server";
import { NotFoundError, PermissionError, UserError } from "@rebar/core/rbac";
import { connectAppDb } from "@rebar/core/testing";
import { MODULE_IDS } from "@rebar/core";
import { hasCanary, serialize } from "./support/canary";
import {
  buildPrivateFixture,
  buildRichData,
  fullDeps,
  type PrivateFixture,
  type RichData,
} from "./support/fixture";
import { buildProbes, stable, type Probe } from "./support/probes-private";
import { buildFixture, isolatedDb, type Fixture } from "./support/security-fixture";

/*
  Soukromé záznamy: ruční čtecí cesty modulů (D §5.4, NFR-08, VID-04, VID-08; QA-SEC).

  Sondy se berou přímo z registrů aplikace (widgety, pozornost, metriky, vrstvy kalendáře, odznaky, příspěvky karty
  klienta, e-mailové proměnné, služby) a z deklarovaných `privatePaths`. Každá se spustí jako Partner a jako vlastník:
    1. Partnerův výsledek nesmí obsahovat PRIVATE-CANARY (ani částku soukromé platby).
    2. Partnerův výsledek je stejný, jako kdyby soukromé záznamy neexistovaly (součty, počty, pořadí): po „smazání“
       soukromých záznamů se spustí znovu a výsledky se porovnají.
    3. Vlastník soukromá data vidí (canary, nebo se jeho výsledek liší od partnerova).
  Kontrola úplnosti: každá položka registru má záznam v `privatePaths` a každý soubor, který čte tabulky se zámkem,
  je ve snímku `READERS` (nový čtecí soubor test shodí, dokud se nezapíše, čím je pokrytý).
*/

const app = connectAppDb();
let f: Fixture;
let fx: PrivateFixture;
let rich: RichData;
let db: Db;
let deps: ModuleDeps;
let discard: () => Promise<void>;
let probes: Probe[];

class Rollback extends Error {}

/** Spustí `fn` v savepointu, který se vždy vrátí (sonda nesmí nic změnit ani shodit celou transakci souboru). */
async function savepoint<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  let out!: T;
  try {
    await db.transaction(async (tx) => {
      out = await fn(tx as unknown as Db);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return out;
}

type Outcome = { ok: true; value: unknown } | { ok: false; error: Error };
async function runProbe(p: Probe, who: "owner" | "partner"): Promise<Outcome> {
  const person = f.people[who];
  return savepoint(async (tx) => {
    try {
      return { ok: true as const, value: await p.run(f.ctxOf(person, tx)) };
    } catch (e) {
      return { ok: false as const, error: e as Error };
    }
  });
}
/** Odmítnutí (oprávnění, neexistující záznam, srozumitelná chyba) je správná odpověď na cizí soukromý záznam. */
const isRejection = (e: Error) =>
  e instanceof PermissionError || e instanceof NotFoundError || e instanceof UserError;

const partnerBefore = new Map<string, Outcome>();
const ownerRuns = new Map<string, Outcome>();
const partnerAfter = new Map<string, Outcome>();

beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  f = await buildFixture(db);
  deps = fullDeps(f);
  // obsluhy událostí jako v aplikaci (složky Disku, kalendář, úkoly…)
  setDomainEvents(f.collected.eventHandlers, () => deps);
  fx = await buildPrivateFixture(f, db);
  rich = await buildRichData(f, fx, db);
  probes = buildProbes(f, deps, fx, rich);
  for (const p of probes) partnerBefore.set(p.name, await runProbe(p, "partner"));
  for (const p of probes) ownerRuns.set(p.name, await runProbe(p, "owner"));
  // svět bez soukromých záznamů: všechny soukromé řádky zámkových tabulek se „smažou“
  for (const t of [
    "payment",
    "time_entry",
    "task",
    "note",
    "deal",
    "job",
    "person",
    "company",
    "email_template",
  ])
    await db.execute(
      sql`update ${sql.identifier(t)} set deleted_at = now() where is_private and deleted_at is null`,
    );
  for (const p of probes) partnerAfter.set(p.name, await runProbe(p, "partner"));
  if (process.env.QASEC_DUMP)
    fs.writeFileSync(
      process.env.QASEC_DUMP,
      JSON.stringify(
        Object.fromEntries(
          probes.map((p) => [
            p.name,
            Object.fromEntries(
              (
                [
                  ["partner", partnerBefore],
                  ["owner", ownerRuns],
                  ["after", partnerAfter],
                ] as const
              ).map(([k, m]) => {
                const o = m.get(p.name)!;
                return [
                  k,
                  o.ok
                    ? JSON.parse(serialize(o.value) || "null")
                    : `ERR ${o.error.name}: ${o.error.message.slice(0, 300)} | cause: ${String((o.error as { cause?: { message?: string } }).cause?.message ?? "")} | ${String(
                        o.error.stack ?? "",
                      )
                        .split("\n")
                        .slice(1, 4)
                        .join(" ; ")}`,
                ];
              }),
            ),
          ]),
        ),
        null,
        1,
      ),
    );
}, 240_000);

afterAll(async () => {
  setDomainEvents(undefined, undefined);
  await discard();
  await app.close();
});

describe("soukromé záznamy: úplnost registru `privatePaths`", () => {
  const pathNames = () => f.collected.privatePaths.map((p) => p.name);
  const modules = () => [...new Set(pathNames().map((n) => n.split(".")[0]!))];

  it("každý modul s ručně čtenými daty (metriky, vrstvy, odznaky, příspěvky, služby, widgety, pozornost) má `privatePaths`", () => {
    const c = f.collected;
    const moduleOf = (key: string) => key.split(".")[0]!;
    const needs = new Set<string>();
    for (const m of c.dashboardMetrics) needs.add(moduleOf(m.key));
    for (const [svc, owner] of Object.entries({
      clients: "klienti",
      disk: "disk",
      tasks: "ukoly",
      finance: "finance",
    }))
      if (svc in c.services) needs.add(owner);
    // moduly, které přispívají widgetem, pozorností nebo příspěvkem, jsou doplněny v test „sondy pokrývají …“ níže
    for (const m of needs)
      expect(
        modules(),
        `modul „${m}“ čte data ručně, ale nemá žádný záznam v privatePaths`,
      ).toContain(m);
  });

  it("každá metrika nástěnky má záznam v privatePaths (název = klíč metriky, `<modul>.metric.<x>`, nebo skupinový `<modul>.dashboardMetrics`)", () => {
    const names = new Set(pathNames());
    const missing = f.collected.dashboardMetrics
      .filter((m) => {
        const [mod, ...rest] = m.key.split(".");
        const short = rest.join(".");
        return !(
          names.has(m.key) ||
          names.has(`${mod}.metric.${short}`) ||
          names.has(`${mod}.${short}`) ||
          names.has(`${mod}.dashboardMetrics`) ||
          names.has(`${mod}.metrics`) ||
          [...names].some((n) => n.startsWith(`${m.key}.`) || n === `${mod}.${short}.metric`)
        );
      })
      .map((m) => m.key);
    expect(missing, "metriky bez záznamu v privatePaths").toEqual([]);
  });

  it("každá vrstva kalendáře, odznak navigace, příspěvek karty klienta a služba má záznam v privatePaths", () => {
    const names = pathNames();
    const has = (re: RegExp) => names.some((n) => re.test(n));
    const c = f.collected;
    const problems: string[] = [];
    for (const l of c.calendarLayers)
      if (!has(/calendar|layer|kalendar/i)) problems.push(`vrstva ${l.key}`);
    for (const l of c.calendarLayers) {
      const mod = l.key.split(".")[0]!;
      if (!names.some((n) => n.startsWith(`${mod}.`) && /calendar|layer|deadline/i.test(n)))
        problems.push(`vrstva ${l.key}: žádná cesta „${mod}.*calendar|layer“`);
    }
    for (const b of c.navBadges) {
      const seg = b.href.split("/").filter(Boolean).join(".");
      if (!names.some((n) => /badge/i.test(n) && seg.split(".").some((s) => n.includes(s))))
        problems.push(`odznak ${b.href}`);
    }
    for (const key of Object.keys(c.services))
      if (!has(new RegExp(`(^|\\.)(service|${key})(\\.|$)`))) problems.push(`služba ${key}`);
    expect([...new Set(problems)]).toEqual([]);
  });

  it("jména privatePaths jsou unikátní a začínají id modulu", () => {
    const names = pathNames();
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(MODULE_IDS as readonly string[]).toContain(n.split(".")[0]);
  });
});

/**
 * Snímek souborů, které čtou tabulky se zámkem (`from(job)`, `join company`, `from payment`…) mimo engine entit.
 * Každý má uvedeno, čím je pokrytý: `path:<předpona jména privatePaths>`, `engine` (čte přes engine / pomocné funkce
 * z jádra, které soukromí vynucují) nebo `write` (zápis a ověření existence záznamu, který aktér už smí vidět).
 * Nový soubor, který čte takové tabulky a ve snímku není, test shodí: přidejte `privatePaths` a řádek sem.
 */
const READERS: Record<string, string> = {
  "disk/src/contributions.ts": "path:disk.clientCard",
  "finance/src/data/client-card.ts": "path:finance.clientCard",
  "finance/src/data/finance-service.ts": "path:finance.balance",
  "finance/src/data/jobs.ts": "path:finance.balance",
  "finance/src/data/metrics.ts": "path:finance.",
  "finance/src/data/model.ts": "path:finance.",
  "finance/src/data/payments.ts": "path:finance.",
  "finance/src/data/plan.ts": "write",
  "finance/src/data/reports.ts": "path:finance.reports",
  "finance/src/data/retainer.ts": "path:finance.retainers",
  "finance/src/data/settlements.ts": "path:finance.balance",
  "hodiny/src/data/read.ts": "path:hodiny.",
  "hodiny/src/data/write.ts": "write",
  "hodiny/src/metrics.ts": "path:hodiny.",
  "kalendar/src/google/foreign.ts": "path:kalendar.",
  "klienti/src/data.ts": "path:klienti.",
  "klienti/src/private-paths.ts": "path:klienti.",
  "kontakty/src/ares-service.ts": "write",
  "kontakty/src/companies.ts": "path:kontakty.",
  "kontakty/src/contributions.ts": "path:kontakty.",
  "kontakty/src/duplicates.ts": "engine",
  "kontakty/src/leads.ts": "write",
  "kontakty/src/persons.ts": "path:kontakty.",
  "kontakty/src/points.ts": "write",
  "kontakty/src/search.ts": "engine",
  "muj-prostor/src/invoices/data.ts": "path:muj-prostor.invoices",
  "muj-prostor/src/library/preview.ts": "path:muj-prostor.",
  "obchody/src/deals/common.ts": "write",
  "obchody/src/deals/lead.ts": "write",
  "obchody/src/deals/metrics.ts": "path:obchody.",
  "obchody/src/deals/queries.ts": "path:obchody.",
  "obchody/src/deals/transitions.ts": "write",
  "reklama/src/meta/admin.ts": "write",
  "reklama/src/meta/queries.ts": "path:reklama.",
  "sablony-emailu/src/private.ts": "path:sablony-emailu.",
  "sablony-emailu/src/service.ts": "path:sablony-emailu.",
  "ukoly/src/notes/providers.ts": "path:ukoly.notes",
  "ukoly/src/notes/queries.ts": "path:ukoly.notes",
  "ukoly/src/notes/write.ts": "write",
  "ukoly/src/service.ts": "path:ukoly.service",
  "ukoly/src/tasks/events.ts": "write",
  "ukoly/src/tasks/hooks.ts": "write",
  "ukoly/src/tasks/providers.ts": "path:ukoly.",
  "ukoly/src/tasks/queries.ts": "path:ukoly.",
  "ukoly/src/tasks/write.ts": "write",
  "zakazky/src/core/briefs.ts": "path:zakazky.api.briefs",
  "zakazky/src/core/create.ts": "write",
  "zakazky/src/core/detail.ts": "path:zakazky.",
  "zakazky/src/core/insights.ts": "path:zakazky.",
  "zakazky/src/core/lookups.ts": "write",
  "zakazky/src/core/team.ts": "write",
  "zakazky/src/entities.ts": "write",
};

describe("soukromé záznamy: soubory, které čtou tabulky se zámkem (statický snímek)", () => {
  const root = path.resolve(import.meta.dirname, "../packages");
  const TABLE_READ =
    /(\.from|Join)\((company|person|job|deal|task|note|timeEntry|payment|emailTemplate|jobPhase|paymentAllocation)\b|\b(from|join)\s+(company|person|job|deal|task|note|time_entry|payment|email_template|job_phase)\b/;

  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!["node_modules", "ui", "drizzle", "_donor", "e2e"].includes(e.name))
          out.push(...sources(p));
      } else if (
        /\.ts$/.test(e.name) &&
        !/\.(test|int\.test)\.ts$/.test(e.name) &&
        e.name !== "schema.ts" &&
        !p.includes(`${path.sep}schema${path.sep}`)
      )
        out.push(p);
    }
    return out;
  }
  const found = () => {
    const modules = path.join(root, "modules");
    return sources(modules)
      .filter((p) => TABLE_READ.test(fs.readFileSync(p, "utf8")))
      .map((p) => path.relative(modules, p).replaceAll(path.sep, "/").replace("/src/", "/src/"));
  };

  it("každý čtecí soubor je ve snímku READERS (nový čtecí soubor test shodí)", () => {
    const unknown = found().filter((p) => !(p in READERS));
    expect(
      unknown,
      "tyto soubory čtou tabulky se zámkem a nejsou ve snímku: přidejte privatePaths a řádek do READERS",
    ).toEqual([]);
  });

  it("snímek neobsahuje zaniklé soubory a odkazuje jen na existující privatePaths", () => {
    const present = new Set(found());
    expect(Object.keys(READERS).filter((p) => !present.has(p))).toEqual([]);
    const names = f.collected.privatePaths.map((p) => p.name);
    for (const [file, how] of Object.entries(READERS)) {
      if (!how.startsWith("path:")) continue;
      const prefix = how.slice(5);
      expect(
        names.some((n) => n.startsWith(prefix)),
        `${file}: žádná privatePath s předponou „${prefix}“`,
      ).toBe(true);
    }
  });
});

describe("soukromé záznamy: sondy jako Partner", () => {
  it("sestava obsahuje sondy všech druhů", () => {
    const kinds = new Set(probes.map((p) => p.kind));
    for (const k of ["path", "widget", "metric", "layer", "badge", "clientCard", "service", "core"])
      expect(kinds.has(k), `žádná sonda druhu ${k}`).toBe(true);
    expect(probes.length).toBeGreaterThan(100);
  });

  it("žádná sonda partnerovi neprozradí PRIVATE-CANARY ani částku soukromé platby", () => {
    const leaks: string[] = [];
    for (const [name, o] of partnerBefore) {
      const text = o.ok ? serialize(o.value) : "";
      if (
        hasCanary(o.ok ? o.value : null) ||
        text.includes("987654321") ||
        text.includes("9876543.21")
      )
        leaks.push(name);
      if (o.ok && /CANARY-FOLDER/.test(text)) leaks.push(`${name} (složka Disku)`);
    }
    expect(leaks, "sondy, které partnerovi prozradily soukromá data").toEqual([]);
  });

  it("žádná sonda partnerovi nespadla jinak než srozumitelným odmítnutím", () => {
    const crashes = [...partnerBefore]
      .filter(([, o]) => !o.ok && !isRejection(o.error))
      .map(([n, o]) => `${n}: ${(o as { error: Error }).error.message.slice(0, 120)}`);
    expect(crashes).toEqual([]);
  });

  it("výsledek partnera je stejný, jako kdyby soukromé záznamy neexistovaly (součty, počty, pořadí)", () => {
    const different: string[] = [];
    for (const [name, before] of partnerBefore) {
      const after = partnerAfter.get(name)!;
      const a = before.ok ? stable(before.value) : `chyba:${before.error.name}`;
      const b = after.ok ? stable(after.value) : `chyba:${after.error.name}`;
      if (a !== b) different.push(name);
    }
    expect(different, "sondy, jejichž výsledek partnera ovlivnila soukromá data").toEqual([]);
  });

  it("sondy mají nad sestavou co ukázat: aspoň polovina vrátí neprázdný výsledek", () => {
    const nonEmpty = [...partnerBefore.values()].filter(
      (o) => o.ok && o.value != null && !/^(\[\]|\{\}|0|null)$/.test(serialize(o.value)),
    ).length;
    expect(nonEmpty).toBeGreaterThan(partnerBefore.size / 3);
  });
});

describe("soukromé záznamy: sondy jako vlastník", () => {
  it("vlastník soukromá data vidí: canary ve výsledku, nebo se výsledek liší od partnerova", () => {
    const neutral: string[] = [];
    for (const p of probes) {
      const o = ownerRuns.get(p.name)!;
      const part = partnerBefore.get(p.name)!;
      if (!o.ok) continue; // oprávnění vlastníka řeší testy příkazů; sonda nad modulem, který vlastník nemá
      const same = part.ok && stable(part.value) === stable(o.value);
      if (!hasCanary(o.value) && same) neutral.push(p.name);
    }
    // sondy, které se soukromými daty sestavy ze své podstaty nesouvisí (nastavení, číselníky, cizí kalendáře apod.)
    const unexpected = neutral.filter((n) => !NEUTRAL_FOR_OWNER.some(([re]) => re.test(n)));
    expect(unexpected, "sondy, které vlastníkovi soukromá data neukázaly").toEqual([]);
  });

  it("žádná sonda nespadla vlastníkovi (chyba v cestě, ne oprávnění)", () => {
    const crashes = [...ownerRuns]
      .filter(([, o]) => !o.ok && !isRejection(o.error))
      .map(([n, o]) => `${n}: ${(o as { error: Error }).error.message.slice(0, 120)}`);
    expect(crashes).toEqual([]);
  });
});

describe("soukromé záznamy: citlivost testu (negativní kontrola)", () => {
  it("když se soukromé záznamy „zveřejní“ přímo v databázi, partner v týchž sondách canary uvidí (sondy by únik odhalily)", async () => {
    const withCanary = probes.filter((p) => {
      const o = ownerRuns.get(p.name)!;
      return o.ok && hasCanary(o.value);
    });
    expect(withCanary.length).toBeGreaterThan(20);
    const seen = await savepoint(async (tx) => {
      for (const t of [
        "payment",
        "time_entry",
        "task",
        "note",
        "deal",
        "job",
        "person",
        "company",
        "email_template",
      ])
        await tx.execute(
          sql`update ${sql.identifier(t)} set is_private = false, deleted_at = null where is_private`,
        );
      await tx.execute(sql`update search_document set is_private = false where is_private`);
      await tx.execute(sql`delete from private_record`);
      const out: string[] = [];
      for (const p of withCanary) {
        try {
          if (hasCanary(await p.run(f.ctxOf(f.people.partner, tx)))) out.push(p.name);
        } catch {
          /* sonda spadla: nepočítá se */
        }
      }
      return out;
    });
    // osobní sondy („moje“ úkoly a události jiného uživatele) partner nevidí ani zveřejněné; ostatní musí canary ukázat
    expect(
      seen.length / withCanary.length,
      `viděly canary: ${seen.length}/${withCanary.length}`,
    ).toBeGreaterThan(0.5);
  });
});

/**
 * Sondy, které vlastníkovi ukazují totéž co partnerovi, protože se soukromá data sestavy jich ze své podstaty netýkají
 * (vzor → zdůvodnění). Cokoli jiného, co vlastníkovi soukromá data neukáže, test shodí: sonda by nic netestovala.
 */
const NEUTRAL_FOR_OWNER: [RegExp, string][] = [
  [
    /^(path:|metric:)reklama\./,
    "data reklamy (účty, kampaně) nejsou vázaná na soukromé záznamy; kryje reklama.int.test",
  ],
  [
    /^clientCard:7\.tabCounts$/,
    "záložka Reklama (indexy příspěvků = pořadí modulů): reklama bez dat v sestavě",
  ],
  [
    /^clientCard:4\.listMetrics$/,
    "úkoly: sloupec poslední aktivity klienta plní hook až při změně úkolu, v sestavě je prázdný",
  ],
  [
    /^(path|badge|metric):(\/)?muj-prostor/,
    "Můj prostor je jen pro vlastníka (oprávnění), jeho tabulky nemají sloupec soukromí",
  ],
  [
    /^path:finance\.(balance|balance\.view|retainers|retainers_count|income_by_person|income_by_type|top_clients)$|^metric:finance\.(balance|retainers|retainers_count|income_by_person|income_by_type|top_clients)/,
    "saldo a přehledy výchozně soukromé zakázky nezahrnují ani vlastníkovi (spec: „do vyrovnání se nepočítají“); vlastník je zapíná parametrem",
  ],
  [/^core:recent$/, "naposledy otevřené se plní až otevřením záznamu; kryje scénář AS-15 níže"],
  [
    /^widget:\d+$|^path:finance\.income_month_planned$|^metric:finance\.income_month_planned/,
    "bez dat sestavy (plánované platby, widget Pozornost); součet ověřuje scénář AS-05",
  ],
];
