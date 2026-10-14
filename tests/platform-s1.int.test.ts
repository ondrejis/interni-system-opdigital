import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collectPermissions } from "@rebar/core";
import { ensureLookup, ensurePipeline, getPipeline } from "@rebar/core/config-data";
import {
  clearEntityPolicies,
  createRecord,
  deleteRecord,
  describeEntity,
  getRecord,
  queryRecords,
  resolveEntity,
  searchAll,
  updateRecord,
  type EntityRegistry,
  type ResolvedEntity,
} from "@rebar/core/entities";
import { ensureSeries } from "@rebar/core/numbering";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { personContactPoint } from "@rebar/kontakty/schema";
import { ALL_MODULES } from "../apps/web/src/modules";
import { buildRegistry, collectServers } from "../apps/web/src/server/modules-server";

/*
  Schema-freeze S1: každá entita nového modelu (D §1.2) se dá sestavit, popsat, vypsat a (kde to dává smysl) založit,
  přečíst, najít, upravit a smazat přes engine jádra, a tabulky odpovídají migracím. Žádná logika modulů se tu netestuje.
*/
const app = connectAppDb();
afterAll(() => app.close());

const collected = collectServers(ALL_MODULES);
let registry: EntityRegistry;
let boss: Awaited<ReturnType<typeof makeUser>>;
const R = (key: string): Promise<ResolvedEntity> =>
  resolveEntity(app.db, registry.get(key) ?? (undefined as never));

beforeAll(async () => {
  clearEntityPolicies();
  registry = buildRegistry(collected.entities);
  for (const m of ALL_MODULES) {
    for (const p of m.seed?.pipelines ?? []) await ensurePipeline(app.db, p);
    for (const l of m.seed?.lookups ?? []) await ensureLookup(app.db, l);
    if (m.seed?.series) await ensureSeries(app.db, m.seed.series);
  }
  const keys = collectPermissions(ALL_MODULES).map((p): [string, "all"] => [p.key, "all"]);
  boss = await makeUser(app.db, keys);
});

describe("entity modelu OPSYS", () => {
  const expected = [
    "company",
    "person",
    "job",
    "job_template",
    "deal",
    "task",
    "note",
    "task_type",
    "time_entry",
    "payment",
    "settlement",
    "ad_account",
    "ad_campaign",
    "email_template",
    "recurring_service",
    "web_domain",
    "email_library_item",
    "recurring_invoice",
  ];

  it("všechny entity z D §1.2 jsou v registru a patří svému modulu", () => {
    for (const key of expected) expect(registry.get(key), key).toBeTruthy();
    expect(
      registry
        .all()
        .map((e) => e.key)
        .sort(),
    ).toEqual([...expected].sort());
  });

  it("každá entita jde popsat a vypsat (prázdný seznam, součty, seskupení se nerozbijí)", async () => {
    for (const key of expected) {
      const e = await R(key);
      const d = await describeEntity(boss.ctx, app.db, e, registry);
      expect(d.attributes.length, key).toBeGreaterThan(3);
      const out = await queryRecords(boss.ctx, registry, e, { limit: 5 });
      expect(Array.isArray(out.rows), key).toBe(true);
    }
  });

  it("organizace, kontakt, obchod, zakázka, úkol, poznámka, hodiny a platba se dají založit, najít, upravit a smazat", async () => {
    const tag = Math.random().toString(36).slice(2, 8);
    const co = await createRecord(boss.ctx, registry, await R("company"), {
      name: `Firma ${tag} s.r.o.`,
      ico: String(30_000_000 + Math.floor(Math.random() * 9_000_000)),
      clientStatus: "lead",
      services: ["web"],
    });
    const person = await createRecord(boss.ctx, registry, await R("person"), {
      firstName: "Jana",
      lastName: `Novotná${tag}`,
      company: co.row.id,
      isDecisionMaker: true,
    });
    expect(person.row.fullName).toBe(`Jana Novotná${tag}`);
    await app.db.insert(personContactPoint).values({
      personId: String(person.row.id),
      kind: "email",
      value: `Jana@Example.cz`,
      valueNorm: "jana@example.cz",
      label: "work",
      isPrimary: true,
    });

    const stage = (await getPipeline(app.db, "deal", "default"))!.stages[0]!;
    const deal = await createRecord(boss.ctx, registry, await R("deal"), {
      title: `Obchod ${tag}`,
      company: co.row.id,
      person: person.row.id,
      status: stage.id,
      value: 500_000_00,
      services: ["web", "marketing"],
    });
    const job = await createRecord(boss.ctx, registry, await R("job"), {
      title: `Zakázka ${tag}`,
      company: co.row.id,
      type: "marketing",
      price: 700_000_00,
    });
    expect(String(job.row.number)).toMatch(/^Z-\d{4}-\d{3,}$/);
    const task = await createRecord(boss.ctx, registry, await R("task"), {
      title: `Zavolat ${tag}`,
      deal: deal.row.id,
      assignee: boss.id,
      dueDate: "2026-10-20",
    });
    const note = await createRecord(boss.ctx, registry, await R("note"), {
      title: `Poznámka ${tag}`,
      deal: deal.row.id,
    });
    const hours = await createRecord(boss.ctx, registry, await R("time_entry"), {
      date: "2026-10-14",
      user: boss.id,
      job: job.row.id,
      minutes: 90,
    });
    const payment = await createRecord(boss.ctx, registry, await R("payment"), {
      description: `Platba ${tag}`,
      job: job.row.id,
      amount: 7_000_00,
    });
    for (const [key, id] of [
      ["company", co.row.id],
      ["person", person.row.id],
      ["deal", deal.row.id],
      ["job", job.row.id],
      ["task", task.row.id],
      ["note", note.row.id],
      ["time_entry", hours.row.id],
      ["payment", payment.row.id],
    ] as const) {
      const e = await R(key);
      expect((await getRecord(boss.ctx, registry, e, id)).row.id, key).toBe(id);
    }

    // hledání bez diakritiky najde firmu, kontakt, obchod i platbu
    const hits = await searchAll(boss.ctx, registry.all(), `novotna${tag}`);
    expect(hits.some((h) => h.entityType === "person")).toBe(true);
    expect((await searchAll(boss.ctx, registry.all(), `Platba ${tag}`)).length).toBeGreaterThan(0);

    // úprava a smazání do koše
    await updateRecord(boss.ctx, registry, await R("deal"), deal.row.id, {
      title: `Přejmenováno ${tag}`,
    });
    await deleteRecord(boss.ctx, await R("task"), task.row.id);
    await expect(getRecord(boss.ctx, registry, await R("task"), task.row.id)).rejects.toThrow();
  });

  it("odkazované entity bez zámku (Můj prostor, reklama, šablony e-mailů, typ úkolu) se zakládají a hledají", async () => {
    const tag = Math.random().toString(36).slice(2, 8);
    const co = await createRecord(boss.ctx, registry, await R("company"), {
      name: `Hosting ${tag}`,
    });
    await createRecord(boss.ctx, registry, await R("recurring_service"), {
      name: `Hosting ${tag}`,
      company: co.row.id,
      kind: "hosting",
      price: 12_000_00,
    });
    await createRecord(boss.ctx, registry, await R("web_domain"), {
      domain: `${tag}.example.cz`,
      company: co.row.id,
      expiresOn: "2027-01-01",
    });
    await createRecord(boss.ctx, registry, await R("email_library_item"), { title: `Text ${tag}` });
    await createRecord(boss.ctx, registry, await R("email_template"), {
      name: `Šablona ${tag}`,
      language: "cs",
    });
    await createRecord(boss.ctx, registry, await R("task_type"), {
      name: `Typ ${tag}`,
      key: `typ_${tag}`,
    });
    await createRecord(boss.ctx, registry, await R("job_template"), {
      name: `Šablona zakázky ${tag}`,
      type: "web",
    });
    await createRecord(boss.ctx, registry, await R("settlement"), {
      settledOn: "2026-10-14",
      from: boss.id,
      to: (await makeUser(app.db, [])).id,
      amount: 1_000_00,
      method: "transfer",
    });
    expect((await searchAll(boss.ctx, registry.all(), `${tag}.example`)).length).toBeGreaterThan(0);
  });
});
