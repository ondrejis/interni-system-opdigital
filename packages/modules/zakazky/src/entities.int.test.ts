import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPipeline } from "@rebar/core/config-data";
import { createFieldDef, deleteFieldDef } from "@rebar/core/custom-fields";
import { schema } from "@rebar/core/db";
import { newId } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  createRecord,
  deleteRecord,
  getRecord,
  queryGroups,
  queryRecords,
  registerEntityPolicies,
  resolveEntity,
  restoreRecord,
  searchAll,
  updateRecord,
  type EntityRegistry,
  type RecordRow,
  type ResolvedEntity,
} from "@rebar/core/entities";
import { ensureSeries } from "@rebar/core/numbering";
import { createCtx } from "@rebar/core/rbac";
import { loadActor } from "@rebar/core/rbac";
import { NotFoundError, PermissionError } from "@rebar/core/rbac";
import { connectAppDb, uniqueEmail } from "@rebar/core/testing";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { company } from "@rebar/kontakty/schema";
import { manifest } from "./index";
import { jobEntity } from "./server";
import { job, jobMember } from "./schema";
import { ensurePipeline } from "@rebar/core/config-data";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
let jobE: ResolvedEntity;
let stages: { id: string; name: string; kind: string }[];

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, jobEntity]);
  registerEntityPolicies(registry);
  const seed = manifest.seed!;
  for (const p of seed.pipelines!) await ensurePipeline(app.db, p);
  await ensureSeries(app.db, seed.series!);
  jobE = await resolveEntity(app.db, jobEntity);
  stages = (await getPipeline(app.db, "job", "default"))!.stages;
});

async function person(perms: [string, "all" | "own"][] = []) {
  const [role] = await app.db
    .insert(schema.role)
    .values({ key: `r-${newId().slice(-8)}`, name: "R" })
    .returning();
  if (perms.length)
    await app.db
      .insert(schema.rolePermission)
      .values(perms.map(([permission, scope]) => ({ roleId: role!.id, permission, scope })));
  const [user] = await app.db
    .insert(schema.user)
    .values({ name: `Test ${newId().slice(-4)}`, email: uniqueEmail(), roleId: role!.id })
    .returning();
  return {
    id: user!.id,
    name: user!.name,
    ctx: createCtx(app.db, (await loadActor(app.db, user!.id))!),
  };
}
const boss = () =>
  person([
    ["zakazky.read", "all"],
    ["zakazky.write", "all"],
    ["zakazky.finance", "all"],
    ["kontakty.read", "all"],
    ["kontakty.write", "all"],
    ["settings.manage", "all"],
  ]);

async function mkCompany(name = `Firma ${randomBytes(3).toString("hex")}`) {
  const [c] = await app.db.insert(company).values({ name }).returning();
  return c!;
}
const stage = (name: string) => stages.find((s) => s.name === name)!;

/** Čerstvá sada zakázek s unikátním předponou, aby testy neměnily výsledky jeden druhému. */
async function seedJobs(owner: { id: string }) {
  const tag = randomBytes(4).toString("hex");
  const c1 = await mkCompany(`Novák ${tag}`);
  const c2 = await mkCompany(`Černý ${tag}`);
  const mk = (title: string, o: Partial<typeof job.$inferInsert>) =>
    app.db
      .insert(job)
      .values({
        number: `T-${tag}-${title}`,
        title: `${title} ${tag}`,
        companyId: c1.id,
        stageId: stage("Příprava").id,
        managerId: owner.id,
        ...o,
      })
      .returning()
      .then((r) => r[0]!);
  const a = await mk("Koupelna", {
    valueMinor: 100_000_00,
    startDate: "2026-11-01",
    endDate: "2026-11-20",
    address: "Plzeň, Nádražní 1",
  });
  const b = await mk("Střecha", {
    companyId: c2.id,
    stageId: stage("Realizace").id,
    valueMinor: 250_000_00,
    startDate: "2026-12-01",
    address: "Rokycany",
  });
  const c = await mk("Fasáda", {
    companyId: c2.id,
    stageId: stage("Realizace").id,
    valueMinor: 50_000_00,
    startDate: "2027-01-10",
  });
  const d = await mk("Zateplení", { stageId: stage("Uzavřeno").id, valueMinor: 0 });
  return { tag, c1, c2, a, b, c, d };
}
const titles = (rows: RecordRow[]) => rows.map((r) => String(r.title));

describe("dotazy: filtry, řazení, hledání", () => {
  it("textové filtry ignorují diakritiku a velikost písmen; q hledá napříč textovými atributy", async () => {
    const u = await boss();
    const s = await seedJobs(u);
    const run = (filters: unknown) =>
      queryRecords(u.ctx, registry, jobE, {
        filters: {
          op: "and",
          conditions: [{ attr: "title", op: "contains", value: s.tag }, ...(filters as never[])],
        } as never,
      });
    expect((await run([{ attr: "address", op: "contains", value: "plzen" }])).rows).toHaveLength(1);
    expect((await run([{ attr: "address", op: "contains", value: "ROKYCANY" }])).rows).toHaveLength(
      1,
    );
    expect(
      (await run([{ attr: "title", op: "starts_with", value: "stre" }])).rows.map((r) => r.title),
    ).toEqual([`Střecha ${s.tag}`]);
    expect(
      (await run([{ attr: "title", op: "not_contains", value: "koupelna" }])).rows,
    ).toHaveLength(3);
    expect((await run([{ attr: "address", op: "empty" }])).rows).toHaveLength(2);
    expect((await run([{ attr: "address", op: "not_empty" }])).rows).toHaveLength(2);
    const q = await queryRecords(u.ctx, registry, jobE, {
      q: `fasada ${s.tag}`.split(" ")[0] + " " + s.tag,
    });
    void q;
    expect((await queryRecords(u.ctx, registry, jobE, { q: s.tag })).total).toBe(4);
    expect(
      (await queryRecords(u.ctx, registry, jobE, { q: `strecha ${s.tag}` })).rows,
    ).toHaveLength(1);
  });

  it("filtry podle čísla, měny, data, stavu, uživatele, odkazu; skládání and/or", async () => {
    const u = await boss();
    const other = await person();
    const s = await seedJobs(u);
    await app.db.update(job).set({ managerId: other.id }).where(eq(job.id, s.c.id));
    const tagged = { attr: "title", op: "contains", value: s.tag } as const;
    const q = async (...conds: unknown[]) =>
      titles(
        (
          await queryRecords(u.ctx, registry, jobE, {
            filters: { op: "and", conditions: [tagged, ...conds] } as never,
          })
        ).rows,
      ).map((t) => t.split(" ")[0]);

    expect(await q({ attr: "value", op: "gt", value: 100_000_00 })).toEqual(["Střecha"]);
    expect((await q({ attr: "value", op: "gte", value: 100_000_00 })).sort()).toEqual([
      "Koupelna",
      "Střecha",
    ]);
    expect(await q({ attr: "value", op: "between", value: [40_000_00, 60_000_00] })).toEqual([
      "Fasáda",
    ]);
    expect(await q({ attr: "startDate", op: "before", value: "2026-12-01" })).toEqual(["Koupelna"]);
    expect(
      (await q({ attr: "startDate", op: "between", value: ["2026-12-01", "2027-01-31"] })).sort(),
    ).toEqual(["Fasáda", "Střecha"]);
    expect(await q({ attr: "endDate", op: "empty" })).toHaveLength(3);
    expect(await q({ attr: "stage", op: "is", value: stage("Realizace").id })).toHaveLength(2);
    expect(
      await q({
        attr: "stage",
        op: "is_any_of",
        value: [stage("Příprava").id, stage("Uzavřeno").id],
      }),
    ).toHaveLength(2);
    expect(
      await q({ attr: "stage", op: "is_none_of", value: [stage("Realizace").id] }),
    ).toHaveLength(2);
    expect(await q({ attr: "company", op: "is", value: s.c2.id })).toHaveLength(2);
    expect(await q({ attr: "manager", op: "is_me" })).toHaveLength(3);
    expect(await q({ attr: "manager", op: "is_not_me" })).toEqual(["Fasáda"]);
    expect(await q({ attr: "manager", op: "is", value: other.id })).toEqual(["Fasáda"]);
    expect(
      (
        await queryRecords(u.ctx, registry, jobE, {
          filters: {
            op: "and",
            conditions: [
              tagged,
              {
                op: "or",
                conditions: [
                  { attr: "title", op: "contains", value: "koupelna" },
                  { attr: "value", op: "eq", value: 0 },
                ],
              },
            ],
          } as never,
        })
      ).rows,
    ).toHaveLength(2);
  });

  it("neplatný filtr dá srozumitelnou chybu: neznámý atribut, nepovolený operátor, špatná hodnota", async () => {
    const u = await boss();
    const run = (c: unknown) =>
      queryRecords(u.ctx, registry, jobE, { filters: { op: "and", conditions: [c] } as never });
    await expect(run({ attr: "neexistuje", op: "eq", value: 1 })).rejects.toThrow(
      /nejde filtrovat/,
    );
    await expect(run({ attr: "title", op: "gt", value: 1 })).rejects.toThrow(/operátor „gt“/);
    await expect(run({ attr: "value", op: "eq", value: "abc" })).rejects.toThrow(/musí být číslo/);
    await expect(run({ attr: "startDate", op: "before", value: "včera" })).rejects.toThrow(
      /RRRR-MM-DD/,
    );
    await expect(run({ attr: "stage", op: "is_any_of", value: [] })).rejects.toThrow(
      /neprázdný seznam/,
    );
    await expect(run({ attr: "stage", op: "is", value: "x'; drop table job; --" })).rejects.toThrow(
      /neplatná hodnota/,
    );
  });

  it("injekce přes hodnoty textového filtru a řazení není možná", async () => {
    const u = await boss();
    const res = await queryRecords(u.ctx, registry, jobE, {
      filters: {
        op: "and",
        conditions: [{ attr: "title", op: "contains", value: "%'; delete from job; --" }],
      } as never,
    });
    expect(res.rows).toHaveLength(0);
    await expect(
      queryRecords(u.ctx, registry, jobE, {
        sort: [{ attr: "title; drop table job", dir: "asc" }],
      }),
    ).rejects.toThrow(/nejde řadit/);
    expect((await queryRecords(u.ctx, registry, jobE, {})).total).toBeGreaterThan(0);
  });

  it("řazení podle textu (česky bez diakritiky), čísla a data; stránkování je stabilní", async () => {
    const u = await boss();
    const s = await seedJobs(u);
    const only = {
      op: "and",
      conditions: [{ attr: "title", op: "contains", value: s.tag }],
    } as never;
    const t = async (sort: { attr: string; dir: "asc" | "desc" }[]) =>
      titles((await queryRecords(u.ctx, registry, jobE, { filters: only, sort })).rows).map(
        (x) => x.split(" ")[0],
      );
    expect(await t([{ attr: "title", dir: "asc" }])).toEqual([
      "Fasáda",
      "Koupelna",
      "Střecha",
      "Zateplení",
    ]);
    expect(await t([{ attr: "value", dir: "desc" }])).toEqual([
      "Střecha",
      "Koupelna",
      "Fasáda",
      "Zateplení",
    ]);
    expect(await t([{ attr: "startDate", dir: "asc" }])).toEqual([
      "Koupelna",
      "Střecha",
      "Fasáda",
      "Zateplení",
    ]); // bez data nakonec
    const p1 = await queryRecords(u.ctx, registry, jobE, {
      filters: only,
      sort: [{ attr: "title", dir: "asc" }],
      limit: 2,
      offset: 0,
    });
    const p2 = await queryRecords(u.ctx, registry, jobE, {
      filters: only,
      sort: [{ attr: "title", dir: "asc" }],
      limit: 2,
      offset: 2,
    });
    expect([...p1.rows, ...p2.rows].map((r) => r.id)).toHaveLength(4);
    expect(new Set([...p1.rows, ...p2.rows].map((r) => r.id)).size).toBe(4);
    expect(p1.total).toBe(4);
  });

  it("součty a skupiny: součet hodnot za filtr a po stavech; popisky firem a uživatelů", async () => {
    const u = await boss();
    const s = await seedJobs(u);
    const only = {
      op: "and",
      conditions: [{ attr: "title", op: "contains", value: s.tag }],
    } as never;
    const res = await queryRecords(u.ctx, registry, jobE, { filters: only });
    expect(res.totals.value).toBe(400_000_00);
    expect(res.labels.company?.[s.c1.id]?.label).toBe(s.c1.name);
    expect(res.labels.manager?.[u.id]?.label).toBe(u.name);

    const groups = await queryGroups(u.ctx, jobE, "stage", { filters: only });
    const by = Object.fromEntries(groups.map((g) => [g.value, g]));
    expect(by[stage("Realizace").id]).toMatchObject({ count: 2, sums: { value: 300_000_00 } });
    expect(by[stage("Příprava").id]).toMatchObject({ count: 1 });
    await expect(queryGroups(u.ctx, jobE, "title")).rejects.toThrow(/nejde seskupovat/);
  });
});

describe("oprávnění a rozsah", () => {
  it("rozsah own: montér vidí jen zakázky, kde je vedoucí nebo člen týmu; v seznamu, detailu i hledání", async () => {
    const u = await boss();
    const worker = await person([
      ["zakazky.read", "own"],
      ["zakazky.write", "own"],
      ["zakazky.finance", "all"],
    ]);
    const s = await seedJobs(u);
    await app.db.update(job).set({ managerId: worker.id }).where(eq(job.id, s.a.id));
    await app.db.insert(jobMember).values({ jobId: s.b.id, userId: worker.id });
    const only = {
      op: "and",
      conditions: [{ attr: "title", op: "contains", value: s.tag }],
    } as never;

    const mine = await queryRecords(worker.ctx, registry, jobE, { filters: only });
    expect(
      titles(mine.rows)
        .map((t) => t.split(" ")[0])
        .sort(),
    ).toEqual(["Koupelna", "Střecha"]);
    expect(mine.total).toBe(2);
    expect(mine.totals.value).toBe(350_000_00); // součty jen z viditelných záznamů

    await expect(getRecord(worker.ctx, registry, jobE, s.a.id)).resolves.toBeDefined();
    await expect(getRecord(worker.ctx, registry, jobE, s.b.id)).resolves.toBeDefined();
    await expect(getRecord(worker.ctx, registry, jobE, s.c.id)).rejects.toThrow(NotFoundError);
    await expect(
      updateRecord(worker.ctx, registry, jobE, s.c.id, { title: "Hacknuto" }),
    ).rejects.toThrow(NotFoundError);

    const groups = await queryGroups(worker.ctx, jobE, "stage", { filters: only });
    expect(groups.reduce((n, g) => n + g.count, 0)).toBe(2);
  });

  it("bez oprávnění číst nic; číst bez zápisu nelze měnit", async () => {
    const u = await boss();
    const none = await person();
    const reader = await person([["zakazky.read", "all"]]);
    const s = await seedJobs(u);
    await expect(queryRecords(none.ctx, registry, jobE, {})).rejects.toThrow(PermissionError);
    await expect(getRecord(none.ctx, registry, jobE, s.a.id)).rejects.toThrow(PermissionError);
    await expect(
      updateRecord(reader.ctx, registry, jobE, s.a.id, { title: "Nová" }),
    ).rejects.toThrow(PermissionError);
    await expect(deleteRecord(reader.ctx, jobE, s.a.id)).rejects.toThrow(PermissionError);
    await expect(
      createRecord(reader.ctx, registry, jobE, { title: "X", company: s.c1.id }),
    ).rejects.toThrow(PermissionError);
  });

  it("Cmd+K najde jen to, co aktér smí vidět; bez diakritiky; napříč entitami", async () => {
    const u = await boss();
    const worker = await person([
      ["zakazky.read", "own"],
      ["zakazky.write", "own"],
      ["kontakty.read", "all"],
    ]);
    const tag = randomBytes(4).toString("hex");
    const c = await createRecord(u.ctx, registry, await resolveEntity(app.db, companyEntity), {
      name: `Plzeňská stavební ${tag}`,
      ico: "12345678",
      city: "Plzeň",
    });
    const mine = await createRecord(worker.ctx, registry, jobE, {
      title: `Příčky ${tag}`,
      company: c.row.id,
    });
    const theirs = await createRecord(u.ctx, registry, jobE, {
      title: `Elektro ${tag}`,
      company: c.row.id,
    });

    const found = await searchAll(worker.ctx, registry.all(), tag);
    const ids = found.map((h) => h.id);
    expect(ids).toContain(c.row.id);
    expect(ids).toContain(mine.row.id);
    expect(ids).not.toContain(theirs.row.id);
    expect(found.find((h) => h.id === mine.row.id)).toMatchObject({
      label: "Zakázka",
      url: `/zakazky/${mine.row.id}`,
    });
    expect(
      (await searchAll(worker.ctx, registry.all(), `plzenska stavebni ${tag}`)).map((h) => h.id),
    ).toContain(c.row.id);
    expect((await searchAll(u.ctx, registry.all(), tag)).map((h) => h.id)).toContain(theirs.row.id);
    expect(await searchAll(worker.ctx, registry.all(), "x")).toEqual([]);
    expect(await searchAll((await person()).ctx, registry.all(), tag)).toEqual([]);
  });
});

describe("zápis: vytvoření a inline úprava", () => {
  it("vytvoření: číslo ze řady, výchozí stav, audit, vyhledávání; jen pro čtení nejde zadat", async () => {
    const u = await boss();
    const c = await mkCompany();
    const r = await createRecord(u.ctx, registry, jobE, {
      title: "Nová zakázka",
      company: c.id,
      value: 125_000_00,
      number: "PODVRH-1",
    });
    expect(r.row.number).toMatch(/^Z-\d{4}-\d{3}$/);
    expect(r.row.number).not.toBe("PODVRH-1");
    expect(r.row.stage).toBe(stage("Nová poptávka").id);
    expect(r.row.phase).toBe("inquiry");
    expect(r.row.value).toBe(125_000_00);
    expect(r.labels.company?.[c.id]?.label).toBe(c.name);
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, r.row.id));
    expect(audit[0]).toMatchObject({ action: "create", entityType: "job", actorId: u.id });
    const r2 = await createRecord(u.ctx, registry, jobE, { title: "Druhá", company: c.id });
    // soubory integračních testů sdílejí jednu databázi a řadu čísel zakázek: mezi dvěma čísly mohl jiný soubor vzít další
    expect(Number(String(r2.row.number).slice(-3))).toBeGreaterThan(
      Number(String(r.row.number).slice(-3)),
    );
  });

  it("povinné atributy a neplatné hodnoty se odmítnou česky; nic se nevloží ani nepřidělí číslo", async () => {
    const u = await boss();
    const c = await mkCompany();
    await expect(createRecord(u.ctx, registry, jobE, { company: c.id })).rejects.toThrow(
      /„Název“ je povinné/,
    );
    await expect(createRecord(u.ctx, registry, jobE, { title: "X" })).rejects.toThrow(
      /„Zákazník“ je povinné/,
    );
    await expect(
      createRecord(u.ctx, registry, jobE, { title: "X", company: newId() }),
    ).rejects.toThrow(/záznam neexistuje/);
    await expect(
      createRecord(u.ctx, registry, jobE, { title: "X", company: c.id, manager: newId() }),
    ).rejects.toThrow(/uživatel neexistuje/);
    await expect(
      createRecord(u.ctx, registry, jobE, { title: "X", company: c.id, stage: newId() }),
    ).rejects.toThrow(/neplatný stav/);
    await expect(
      createRecord(u.ctx, registry, jobE, { title: "X", company: c.id, value: 1.5 }),
    ).rejects.toThrow(/haléřích/);
    await expect(
      createRecord(u.ctx, registry, jobE, { title: "X", company: c.id, startDate: "zítra" }),
    ).rejects.toThrow(/datum/);
    await expect(
      createRecord(u.ctx, registry, jobE, { title: "X", company: c.id, nesmysl: 1 }),
    ).rejects.toThrow(/Neznámý atribut/);
    const ok = await createRecord(u.ctx, registry, jobE, { title: "Platná", company: c.id });
    const before = Number(String(ok.row.number).slice(-3));
    const ok2 = await createRecord(u.ctx, registry, jobE, { title: "Platná 2", company: c.id });
    expect(Number(String(ok2.row.number).slice(-3))).toBe(before + 1); // neúspěšné pokusy nespálily čísla
  });

  it("tvůrce s rozsahem own se stane vedoucím, takže svou zakázku vidí", async () => {
    const worker = await person([
      ["zakazky.read", "own"],
      ["zakazky.write", "own"],
    ]);
    const c = await mkCompany();
    const r = await createRecord(worker.ctx, registry, jobE, { title: "Moje", company: c.id });
    expect(r.row.manager).toBe(worker.id);
    await expect(getRecord(worker.ctx, registry, jobE, r.row.id)).resolves.toBeDefined();
    // nesmí si zalozit zakazku pro jineho vedouciho, kterou by pak sam nevidel
    const other = await person();
    await expect(
      createRecord(worker.ctx, registry, jobE, { title: "Cizí", company: c.id, manager: other.id }),
    ).rejects.toThrow(/vás jako vlastníka/);
  });

  it("inline úprava: uloží, vrátí nový řádek, zapíše změnu s popisky do auditu; jen pro čtení nejde", async () => {
    const u = await boss();
    const s = await seedJobs(u);
    const r = await updateRecord(u.ctx, registry, jobE, s.a.id, {
      title: "Koupelna 2",
      value: 150_000_00,
      stage: stage("Realizace").id,
    });
    expect(r.row).toMatchObject({
      title: "Koupelna 2",
      value: 150_000_00,
      stage: stage("Realizace").id,
    });
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, s.a.id));
    const changes = audit.find((a) => a.action === "update")!.changes;
    expect(changes).toEqual(
      expect.arrayContaining([
        { field: "Hodnota", old: "100\u00a0000\u00a0Kč", new: "150\u00a0000\u00a0Kč" },
        { field: "Stav", old: "Příprava", new: "Realizace" },
      ]),
    );
    await expect(updateRecord(u.ctx, registry, jobE, s.a.id, { number: "Z-0" })).rejects.toThrow(
      /nejde upravit/,
    );
    await expect(updateRecord(u.ctx, registry, jobE, s.a.id, {})).rejects.toThrow(/Není co uložit/);
    await expect(updateRecord(u.ctx, registry, jobE, s.a.id, { title: "" })).rejects.toThrow(
      /povinné/,
    );
    // vymazání nepovinné hodnoty
    expect(
      (await updateRecord(u.ctx, registry, jobE, s.a.id, { address: null })).row.address,
    ).toBeNull();
  });

  it("kolize úprav: změna z neaktuální verze se odmítne", async () => {
    const u = await boss();
    const s = await seedJobs(u);
    const first = await getRecord(u.ctx, registry, jobE, s.a.id);
    await new Promise((r) => setTimeout(r, 10));
    await updateRecord(u.ctx, registry, jobE, s.a.id, { title: "Změna A" });
    await expect(
      updateRecord(
        u.ctx,
        registry,
        jobE,
        s.a.id,
        { title: "Změna B" },
        { expectedUpdatedAt: first.row.updatedAt },
      ),
    ).rejects.toThrow(/mezitím někdo změnil/);
    const fresh = await getRecord(u.ctx, registry, jobE, s.a.id);
    await expect(
      updateRecord(
        u.ctx,
        registry,
        jobE,
        s.a.id,
        { title: "Změna C" },
        { expectedUpdatedAt: fresh.row.updatedAt },
      ),
    ).resolves.toBeDefined();
  });

  it("smazání je měkké, záznam zmizí ze seznamu i hledání; obnovit smí jen správce se zápisem „vše“", async () => {
    const u = await boss();
    const worker = await person([
      ["zakazky.read", "own"],
      ["zakazky.write", "own"],
    ]);
    const c = await mkCompany();
    const r = await createRecord(u.ctx, registry, jobE, {
      title: `Ke smazání ${randomBytes(3).toString("hex")}`,
      company: c.id,
    });
    await deleteRecord(u.ctx, jobE, r.row.id);
    await expect(getRecord(u.ctx, registry, jobE, r.row.id)).rejects.toThrow(NotFoundError);
    expect(
      (await searchAll(u.ctx, registry.all(), String(r.row.title))).map((h) => h.id),
    ).not.toContain(r.row.id);
    const [raw] = await app.db.select().from(job).where(eq(job.id, r.row.id));
    expect(raw?.deletedAt).toBeInstanceOf(Date);
    await expect(restoreRecord(worker.ctx, jobE, r.row.id)).rejects.toThrow(PermissionError);
    await restoreRecord(u.ctx, jobE, r.row.id);
    await expect(getRecord(u.ctx, registry, jobE, r.row.id)).resolves.toBeDefined();
  });
});

describe("vlastní pole v entitě", () => {
  it("vlastní pole se objeví jako atribut: zápis, validace, filtr, řazení, součet, hledání", async () => {
    const u = await boss();
    const key = `typ_${randomBytes(3).toString("hex")}`;
    const numKey = `plocha_${randomBytes(3).toString("hex")}`;
    await createFieldDef(u.ctx, {
      entityType: "job",
      key,
      label: "Typ stavby",
      type: "select",
      options: {
        choices: [
          { value: "dum", label: "Dům" },
          { value: "byt", label: "Byt" },
        ],
      },
    });
    await createFieldDef(u.ctx, {
      entityType: "job",
      key: numKey,
      label: "Plocha m²",
      type: "number",
    });
    const e = await resolveEntity(app.db, jobEntity);
    expect(e.byKey.has(`custom.${key}`)).toBe(true);

    const s = await seedJobs(u);
    await updateRecord(u.ctx, registry, e, s.a.id, {
      [`custom.${key}`]: "dum",
      [`custom.${numKey}`]: 120.5,
    });
    await updateRecord(u.ctx, registry, e, s.b.id, {
      [`custom.${key}`]: "byt",
      [`custom.${numKey}`]: 60,
    });
    await expect(
      updateRecord(u.ctx, registry, e, s.c.id, { [`custom.${key}`]: "hrad" }),
    ).rejects.toThrow(/nabízených možností/);
    await expect(
      updateRecord(u.ctx, registry, e, s.c.id, { [`custom.${numKey}`]: "moc" }),
    ).rejects.toThrow(/číslo/);

    const only = { attr: "title", op: "contains", value: s.tag };
    const f = async (...c: unknown[]) =>
      titles(
        (
          await queryRecords(u.ctx, registry, e, {
            filters: { op: "and", conditions: [only, ...c] } as never,
          })
        ).rows,
      ).map((t) => t.split(" ")[0]);
    expect(await f({ attr: `custom.${key}`, op: "is", value: "dum" })).toEqual(["Koupelna"]);
    expect(await f({ attr: `custom.${numKey}`, op: "gt", value: 100 })).toEqual(["Koupelna"]);
    expect(await f({ attr: `custom.${key}`, op: "empty" })).toHaveLength(2);
    const sorted = await queryRecords(u.ctx, registry, e, {
      filters: { op: "and", conditions: [only] } as never,
      sort: [{ attr: `custom.${numKey}`, dir: "desc" }],
    });
    expect(
      titles(sorted.rows)
        .slice(0, 2)
        .map((t) => t.split(" ")[0]),
    ).toEqual(["Koupelna", "Střecha"]);
    const groups = await queryGroups(u.ctx, e, `custom.${key}`, {
      filters: { op: "and", conditions: [only] } as never,
    });
    expect(groups.find((g) => g.value === "dum")?.count).toBe(1);

    // vymazání vlastní hodnoty odebere klíč z jsonb
    await updateRecord(u.ctx, registry, e, s.a.id, { [`custom.${key}`]: null });
    const [raw] = await app.db.select().from(job).where(eq(job.id, s.a.id));
    expect(raw?.custom).not.toHaveProperty(key);
  });

  it("povinné vlastní pole se vyžaduje při vytvoření", async () => {
    const u = await boss();
    const key = `pov_${randomBytes(3).toString("hex")}`;
    const def = await createFieldDef(u.ctx, {
      entityType: "job",
      key,
      label: "Povinné",
      type: "text",
      required: true,
    });
    try {
      const e = await resolveEntity(app.db, jobEntity);
      const c = await mkCompany();
      await expect(createRecord(u.ctx, registry, e, { title: "X", company: c.id })).rejects.toThrow(
        /„Povinné“ je povinné/,
      );
      await expect(
        createRecord(u.ctx, registry, e, { title: "X", company: c.id, [`custom.${key}`]: "ok" }),
      ).resolves.toBeDefined();
    } finally {
      // sdílená testovací databáze: povinné pole nesmí zůstat a rozbíjet ostatní testy zakázek
      await deleteFieldDef(u.ctx, def.id);
    }
  });
});
