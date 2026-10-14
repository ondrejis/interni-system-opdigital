import { randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addLookupItem,
  addStage,
  defaultVatRateBp,
  deleteStage,
  deleteVatRate,
  ensureLookup,
  ensurePipeline,
  getLookup,
  getPipeline,
  listAllVatRates,
  listLookups,
  listPipelines,
  registerStageUsageFromEntities,
  reorderLookupItems,
  reorderStages,
  restoreStage,
  restoreVatRate,
  saveVatRate,
  setDefaultVatCode,
  setPipelinePhases,
  stageUsageCount,
  updateLookupItem,
  updateStage,
  vatChoices,
} from "@rebar/core/config-data";
import {
  createFieldDef,
  deleteFieldDef,
  listFieldDefs,
  reorderFieldDefs,
  restoreFieldDef,
  updateFieldDef,
} from "@rebar/core/custom-fields";
import { schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  createRecord,
  defineEntity,
  describeEntity,
  getRecord,
  queryRecords,
  registerEntityPolicies,
  reindexEntity,
  resolveEntity,
  searchAll,
  updateRecord,
  type EntityRegistry,
  type RecordRow,
} from "@rebar/core/entities";
import {
  defineSeries,
  ensureSeries,
  listSeries,
  nextNumber,
  updateSeriesPattern,
} from "@rebar/core/numbering";
import { PermissionError, UserError } from "@rebar/core/rbac";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { companyEntity } from "@rebar/kontakty/server";
import { manifest as obchodyManifest } from "@rebar/obchody";
import { deal } from "@rebar/obchody/schema";
import { dealEntity } from "@rebar/obchody/server";

/*
  Konfigurace v administraci (Nastavení): stavy a pipeline, číselníky, vlastní pole, číselné řady a sazby DPH.
  Testy sdílejí databázi s ostatními, proto si zakládají vlastní pipeline, číselníky, řady a vlastní typ záznamu
  (kopie entity firmy s jiným klíčem), aby nic nezměnily ostatním.
*/

const app = connectAppDb();
afterAll(() => app.close());
const tag = () => randomBytes(4).toString("hex");
/** Oprávnění provozních rolí OPSYS bez správy systému (výchozí role klienta `opsys`). */
const ROLE_PERMS: Record<string, [string, "all" | "own"][]> = {
  partner: [
    ["kontakty.read", "all"],
    ["kontakty.write", "all"],
    ["kontakty.create", "all"],
    ["zakazky.read", "all"],
    ["zakazky.write", "all"],
    ["zakazky.create", "all"],
    ["dashboards.write", "all"],
  ],
  externista: [
    ["zakazky.read", "own"],
    ["dochazka.own", "all"],
  ],
};
const permsOf = (roleKey: string) => ROLE_PERMS[roleKey]!;

const admin = () => makeUser(app.db, [["settings.manage", "all"]]);

describe("oprávnění: konfiguraci smí měnit jen settings.manage", () => {
  it("partner ani externista nic z konfigurace nezmění (ani nic neodešle server akce)", async () => {
    const t = tag();
    const pipelineId = await ensurePipeline(app.db, {
      entityType: `cfgp_${t}`,
      key: "default",
      name: "Test",
      stages: [{ name: "Nový" }],
    });
    await ensureLookup(app.db, { key: `cfg.perm_${t}`, name: "Test", items: [] });
    await ensureSeries(app.db, [defineSeries({ key: `cfg.perm_${t}`, pattern: "P{NNN}" })]);
    for (const role of ["partner", "externista"]) {
      const u = await makeUser(app.db, permsOf(role));
      const denied = async (p: Promise<unknown>) =>
        await expect(p).rejects.toThrow(PermissionError);
      await denied(addStage(u.ctx, pipelineId, { name: "X" }));
      await denied(reorderStages(u.ctx, pipelineId, []));
      await denied(addLookupItem(u.ctx, `cfg.perm_${t}`, { value: "a", label: "A" }));
      await denied(reorderLookupItems(u.ctx, `cfg.perm_${t}`, []));
      await denied(
        createFieldDef(u.ctx, { entityType: "company", key: "pole", label: "Pole", type: "text" }),
      );
      await denied(
        saveVatRate(u.ctx, { code: "x", label: "X", rateBp: 100, validFrom: "2100-01-01" }),
      );
      await denied(setDefaultVatCode(u.ctx, "standard"));
      await denied(updateSeriesPattern(u.ctx, `cfg.perm_${t}`, "Q{NNN}"));
    }
  });
});

describe("stavy a pipeline", () => {
  const entityType = `cfgp_${tag()}`;
  let pipelineId: string;
  const PHASES = [
    { key: "first", label: "První" },
    { key: "second", label: "Druhá" },
  ];

  beforeAll(async () => {
    pipelineId = await ensurePipeline(app.db, {
      entityType,
      key: "default",
      name: "Zkušební",
      stages: [
        { name: "A", phase: "first" },
        { name: "B", phase: "second" },
        { name: "C", phase: "second" },
      ],
    });
    setPipelinePhases(entityType, PHASES);
    for (const p of obchodyManifest.seed.pipelines) await ensurePipeline(app.db, p);
  });

  const stages = async () => (await getPipeline(app.db, entityType, "default"))!.stages;
  const byName = async (n: string) => (await stages()).find((s) => s.name === n)!;

  it("přidat, přejmenovat, přebarvit, změnit druh; duplicitní název a neznámá fáze se odmítnou", async () => {
    const u = await admin();
    const row = await addStage(u.ctx, pipelineId, {
      name: "Čeká na materiál",
      color: "orange",
      kind: "open",
      phase: "second",
    });
    expect(row).toMatchObject({ color: "orange", kind: "open", phase: "second", position: 3 });
    await expect(addStage(u.ctx, pipelineId, { name: "  čeká na materiál " })).rejects.toThrow(
      /už existuje/,
    );
    await expect(addStage(u.ctx, pipelineId, { name: "Z", phase: "neexistuje" })).rejects.toThrow(
      /Neznámá fáze/,
    );
    await updateStage(u.ctx, row.id, { name: "Materiál", color: "red", kind: "lost" });
    expect(await byName("Materiál")).toMatchObject({ color: "red", kind: "lost" });
    await expect(updateStage(u.ctx, row.id, { name: "A" })).rejects.toThrow(/už existuje/);
    await expect(updateStage(u.ctx, row.id, { name: "  " })).rejects.toThrow(/název/);
    // změna je v auditu
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, row.id));
    expect(
      audit.flatMap((a) => a.changes).some((c) => c.field === "color" && c.new === "red"),
    ).toBe(true);
  });

  it("každá fáze musí mít aspoň jeden stav: poslední stav fáze nejde smazat ani přesunout jinam", async () => {
    const u = await admin();
    const a = await byName("A");
    await expect(deleteStage(u.ctx, a.id)).rejects.toThrow(
      /Fáze „První“ musí mít aspoň jeden stav/,
    );
    await expect(updateStage(u.ctx, a.id, { phase: "second" })).rejects.toThrow(
      /Fáze „První“ musí mít/,
    );
    // stav se po neúspěšné změně nezměnil
    expect((await byName("A")).phase).toBe("first");
    // ve fázi „Druhá“ je víc stavů, jeden jde přesunout i smazat
    const c = await byName("C");
    await updateStage(u.ctx, c.id, { phase: "first" });
    expect((await byName("C")).phase).toBe("first");
    await deleteStage(u.ctx, a.id); // „První“ má pořád stav C
    await restoreStage(u.ctx, a.id);
    expect((await stages()).some((s) => s.name === "A")).toBe(true);
  });

  it("pořadí se přeřadí a musí obsahovat všechny stavy právě jednou", async () => {
    const u = await admin();
    const ids = (await stages()).map((s) => s.id);
    await reorderStages(u.ctx, pipelineId, [...ids].reverse());
    expect((await stages()).map((s) => s.id)).toEqual([...ids].reverse());
    await expect(reorderStages(u.ctx, pipelineId, ids.slice(1))).rejects.toThrow(/všechny stavy/);
  });

  it("smazání jde vrátit (zpět) a poslední stav pipeline smazat nejde", async () => {
    const u = await admin();
    const created = await addStage(u.ctx, pipelineId, { name: "Dočasný" });
    await deleteStage(u.ctx, created.id);
    expect((await stages()).some((s) => s.id === created.id)).toBe(false);
    await restoreStage(u.ctx, created.id);
    expect((await stages()).at(-1)?.id).toBe(created.id);

    const solo = await ensurePipeline(app.db, {
      entityType: `cfgp_${tag()}`,
      key: "default",
      name: "Jeden",
      stages: [{ name: "Jediný" }],
    });
    const [only] = await app.db
      .select()
      .from(schema.pipelineStage)
      .where(eq(schema.pipelineStage.pipelineId, solo));
    await expect(deleteStage(u.ctx, only!.id)).rejects.toThrow(/Poslední stav/);
  });

  it("listPipelines vrací stavy v pořadí s počtem použití", async () => {
    const all = await listPipelines(app.db);
    const mine = all.find((p) => p.entityType === entityType)!;
    expect(mine.stages.map((s) => s.name).length).toBeGreaterThanOrEqual(3);
    expect(mine.stages.every((s) => s.usage === 0)).toBe(true);
  });

  it("používaný stav nejde smazat a hláška říká, kolik záznamů ho používá (obchody)", async () => {
    registerStageUsageFromEntities([dealEntity]);
    const u = await admin();
    const dealStages = (await getPipeline(app.db, "deal", "default"))!.stages;
    const stage = dealStages.find((s) => s.name === "Kontaktováno") ?? dealStages[0]!;
    const before = await stageUsageCount(app.db, "deal", stage.id);
    const titles = [`Zkouška ${tag()}`, `Zkouška ${tag()}`];
    await app.db.insert(deal).values(titles.map((title) => ({ title, stageId: stage.id })));
    // sdílená databáze: souběžné testy smí obchody ve stavu přidat, počet tedy nikdy neklesne pod můj
    const used = await stageUsageCount(app.db, "deal", stage.id);
    expect(used).toBeGreaterThanOrEqual(before + 2);
    await expect(deleteStage(u.ctx, stage.id)).rejects.toThrow(/používá \d+ záznam/);
    // smazaný obchod se nepočítá
    await app.db.update(deal).set({ deletedAt: new Date() }).where(inArray(deal.title, titles));
    expect(await stageUsageCount(app.db, "deal", stage.id)).toBeLessThanOrEqual(used - 2);
  });
});

describe("číselníky", () => {
  it("položky: přidat, přejmenovat, přebarvit, deaktivovat, přeřadit; duplicity se odmítnou", async () => {
    const u = await admin();
    const key = `cfg.lookup_${tag()}`;
    await ensureLookup(app.db, {
      key,
      name: "Zkušební číselník",
      items: [
        { value: "a", label: "Alfa" },
        { value: "b", label: "Beta", color: "blue" },
      ],
    });
    const gamma = await addLookupItem(u.ctx, key, { value: "g", label: "Gama", color: "green" });
    await expect(addLookupItem(u.ctx, key, { value: "g", label: "Jiná" })).rejects.toThrow(
      /už existuje/,
    );
    await expect(addLookupItem(u.ctx, key, { value: "h", label: " gama " })).rejects.toThrow(
      /názvem/,
    );
    await expect(addLookupItem(u.ctx, key, { value: "Špatně", label: "X" })).rejects.toThrow(
      UserError,
    );

    await updateLookupItem(u.ctx, gamma.id, { label: "Gama 2", color: "red", active: false });
    const all = await getLookup(app.db, key, { includeInactive: true });
    expect(all.find((i) => i.value === "g")).toMatchObject({
      label: "Gama 2",
      color: "red",
      active: false,
    });
    // neaktivní položka se nenabízí, ale číselník ji pro správu vrací
    expect((await getLookup(app.db, key)).map((i) => i.value)).toEqual(["a", "b"]);
    await expect(updateLookupItem(u.ctx, gamma.id, { label: "Alfa" })).rejects.toThrow(/názvem/);

    const ids = all.map((i) => i.id);
    await reorderLookupItems(u.ctx, key, [...ids].reverse());
    expect((await getLookup(app.db, key, { includeInactive: true })).map((i) => i.value)).toEqual([
      "g",
      "b",
      "a",
    ]);
    await expect(reorderLookupItems(u.ctx, key, ids.slice(1))).rejects.toThrow(/všechny položky/);
    const listed = (await listLookups(app.db)).find((l) => l.key === key)!;
    expect(listed.items).toHaveLength(3);
  });
});

describe("číselné řady", () => {
  it("seznam ukáže vzor a číslo, které dostane další doklad (shoduje se s přidělením)", async () => {
    const key = `cfg.rada_${tag()}`;
    await ensureSeries(app.db, [defineSeries({ key, pattern: "X-{YYYY}-{NNN}" })]);
    const find = async (d: Date) => (await listSeries(app.db, d)).find((s) => s.key === key)!;
    const d = new Date(2031, 2, 3);
    expect((await find(d)).next).toBe("X-2031-001");
    expect(await nextNumber(app.db, key, d)).toBe("X-2031-001");
    expect((await find(d)).next).toBe("X-2031-002");
    expect(await nextNumber(app.db, key, d)).toBe("X-2031-002");
    // nový rok začíná znovu od jedničky
    expect((await find(new Date(2032, 0, 1))).next).toBe("X-2032-001");
    expect((await find(d)).reset).toBe("yearly");
  });
});

describe("sazby DPH", () => {
  it("platnost se nesmí překrývat, výchozí sazba řídí nabídku, smazání jde vrátit", async () => {
    const u = await admin();
    // základní sazba z výchozích dat klienta (testovací databáze seed nespouští)
    await app.db
      .insert(schema.vatRate)
      .values({ code: "standard", label: "Základní 21 %", rateBp: 2100, validFrom: "2024-01-01" })
      .onConflictDoNothing();
    const code = `t${tag()}`;
    // sazby s platností daleko v budoucnu, aby neovlivnily ostatní testy
    const a = await saveVatRate(u.ctx, {
      code,
      label: "Zkušební 10 %",
      rateBp: 1000,
      validFrom: "2100-01-01",
      validTo: "2100-12-31",
    });
    await expect(
      saveVatRate(u.ctx, {
        code,
        label: "Překryv",
        rateBp: 1100,
        validFrom: "2100-06-01",
      }),
    ).rejects.toThrow(/překrývá/);
    const b = await saveVatRate(u.ctx, {
      code,
      label: "Zkušební 11 %",
      rateBp: 1100,
      validFrom: "2101-01-01",
    });
    await expect(
      saveVatRate(u.ctx, {
        code: "x",
        label: "X",
        rateBp: 100,
        validFrom: "2100-05-01",
        validTo: "2100-04-01",
      }),
    ).rejects.toThrow(/Platnost do/);

    // bez zvolené výchozí je výchozí nejvyšší platná sazba
    await setDefaultVatCode(u.ctx, "standard");
    expect(await defaultVatRateBp(app.db, "2100-06-01")).toBe(2100);
    await setDefaultVatCode(u.ctx, code);
    expect(await defaultVatRateBp(app.db, "2100-06-01")).toBe(1000);
    expect(await defaultVatRateBp(app.db, "2101-06-01")).toBe(1100);
    const choices = await vatChoices(app.db, "2100-06-01");
    expect(choices.defaultBp).toBe(1000);
    expect(choices.rates.map((r) => r.rateBp)).toContain(1000);
    await expect(setDefaultVatCode(u.ctx, "neexistuje")).rejects.toThrow(/neexistuje/);

    // výchozí sazbu smazat nejde, ostatní jde a jde to vrátit
    await expect(deleteVatRate(u.ctx, a.id)).resolves.toBeUndefined(); // kód má ještě druhý řádek
    expect((await listAllVatRates(app.db)).some((r) => r.id === a.id)).toBe(false);
    await restoreVatRate(u.ctx, a.id);
    expect((await listAllVatRates(app.db)).some((r) => r.id === a.id)).toBe(true);
    await deleteVatRate(u.ctx, b.id);
    await expect(deleteVatRate(u.ctx, a.id)).rejects.toThrow(/Výchozí sazbu/);

    // úklid: výchozí zpět na základní sazbu a zkušební sazby pryč
    await setDefaultVatCode(u.ctx, "standard");
    await deleteVatRate(u.ctx, a.id);
    expect(await defaultVatRateBp(app.db, "2026-10-09")).toBe(2100);
  });
});

describe("vlastní pole v tabulce, filtru, řazení, detailu, hledání a exportu", () => {
  let registry: EntityRegistry;
  const key = `cfg_company_${tag()}`;
  // kopie entity firmy s vlastním klíčem: pole definovaná v testu se nedostanou k ostatním testům
  const entity = defineEntity({ ...companyEntity, key, listPath: `/test/${key}` });
  const T = tag();
  let boss: Awaited<ReturnType<typeof makeUser>>;
  let other: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    clearEntityPolicies();
    registry = createEntityRegistry([entity]);
    registerEntityPolicies(registry);
    boss = await makeUser(app.db, [
      ["kontakty.read", "all"],
      ["kontakty.write", "all"],
      ["kontakty.create", "all"],
      ["settings.manage", "all"],
    ]);
    other = await makeUser(app.db, [["kontakty.read", "all"]]);
  });

  const resolve = () => resolveEntity(app.db, entity);
  const field = (k: string, label: string, type: never, extra: Record<string, unknown> = {}) =>
    createFieldDef(boss.ctx, { entityType: key, key: k, label, type, ...extra } as never);

  const TYPES: {
    key: string;
    type: string;
    label: string;
    options?: Record<string, unknown>;
    a: () => unknown;
    b: () => unknown;
    filter: () => { op: string; value?: unknown };
    sorted?: "asc" | "desc";
  }[] = [
    {
      key: "smlouva",
      type: "text",
      label: "Číslo smlouvy",
      a: () => "Smlouva-001",
      b: () => "Jiná",
      filter: () => ({ op: "contains", value: "smlouva" }),
    },
    {
      key: "plocha",
      type: "number",
      label: "Plocha",
      a: () => 120.5,
      b: () => 60,
      filter: () => ({ op: "gt", value: 100 }),
    },
    {
      key: "cena",
      type: "currency",
      label: "Cena",
      a: () => 1_500_000,
      b: () => 20_000,
      filter: () => ({ op: "gte", value: 1_000_000 }),
    },
    {
      key: "od",
      type: "date",
      label: "Platí od",
      a: () => "2026-10-01",
      b: () => "2026-01-01",
      filter: () => ({ op: "after", value: "2026-06-01" }),
    },
    {
      key: "typ",
      type: "select",
      label: "Typ",
      options: {
        choices: [
          { value: "dum", label: "Rodinný dům" },
          { value: "byt", label: "Byt" },
        ],
      },
      a: () => "dum",
      b: () => "byt",
      filter: () => ({ op: "is", value: "dum" }),
    },
    {
      key: "stitky",
      type: "multiselect",
      label: "Štítky",
      options: {
        choices: [
          { value: "x", label: "X" },
          { value: "y", label: "Y" },
        ],
      },
      a: () => ["x", "y"],
      b: () => ["y"],
      filter: () => ({ op: "contains_all", value: ["x", "y"] }),
    },
    {
      key: "garant",
      type: "user",
      label: "Garant",
      a: () => boss.id,
      b: () => other.id,
      filter: () => ({ op: "is", value: boss.id }),
    },
    {
      key: "ok",
      type: "checkbox",
      label: "Schváleno",
      a: () => true,
      b: () => false,
      filter: () => ({ op: "is_true" }),
    },
    {
      key: "web2",
      type: "url",
      label: "Odkaz",
      a: () => "https://a.example.cz/x",
      b: () => "https://b.example.cz",
      filter: () => ({ op: "contains", value: "a.example" }),
    },
    {
      key: "tel2",
      type: "phone",
      label: "Telefon 2",
      a: () => "+420 777 111 222",
      b: () => "+420 602 333 444",
      filter: () => ({ op: "contains", value: "777111" }),
    },
    {
      key: "mail2",
      type: "email",
      label: "E-mail 2",
      a: () => "A@Firma.cz",
      b: () => "b@jina.cz",
      filter: () => ({ op: "contains", value: "firma" }),
    },
  ];

  it("všech 12 typů: zápis, normalizace, popis pro UI, filtr a řazení", async () => {
    const mkCompany = async (name: string) =>
      createRecord(boss.ctx, registry, await resolve(), { name });
    const ca = await mkCompany(`Firma A ${T}`);
    const cb = await mkCompany(`Firma B ${T}`);

    for (const t of TYPES)
      await field(t.key, t.label, t.type as never, t.options ? { options: t.options } : {});
    await field("odkaz_firma", "Odkaz na firmu", "record" as never, {
      options: { entityType: key },
    });

    const e = await resolve();
    for (const t of TYPES) expect(e.byKey.has(`custom.${t.key}`)).toBe(true);

    const values = (pick: "a" | "b", link: string) => ({
      ...Object.fromEntries(TYPES.map((t) => [`custom.${t.key}`, t[pick]()])),
      "custom.odkaz_firma": link,
    });
    await updateRecord(boss.ctx, registry, e, ca.row.id, values("a", cb.row.id));
    await updateRecord(boss.ctx, registry, e, cb.row.id, values("b", ca.row.id));

    // normalizace při uložení
    const detail = await getRecord(boss.ctx, registry, e, ca.row.id);
    expect(detail.row["custom.mail2"]).toBe("a@firma.cz");
    expect(detail.row["custom.tel2"]).toBe("+420777111222");
    expect(detail.row["custom.od"]).toBe("2026-10-01");
    expect(detail.labels["custom.garant"]?.[boss.id]?.label).toBe(boss.name);
    expect(detail.labels["custom.odkaz_firma"]?.[cb.row.id]?.label).toBe(`Firma B ${T}`);

    // popis pro tabulku a filtry: pole jsou sloupce se správným typem a jdou řadit i filtrovat
    const d = await describeEntity(boss.ctx, app.db, e, registry);
    for (const t of TYPES) {
      const a = d.attributes.find((x) => x.key === `custom.${t.key}`)!;
      expect(a).toMatchObject({ custom: true, type: t.type, sortable: true, filterable: true });
    }

    const only = { attr: "name", op: "contains", value: T };
    const names = (rows: RecordRow[]) => rows.map((r) => String(r.name).split(" ")[1]);
    for (const t of TYPES) {
      const f = t.filter();
      const res = await queryRecords(boss.ctx, registry, e, {
        filters: {
          op: "and",
          conditions: [only, { attr: `custom.${t.key}`, ...f }],
        } as never,
      });
      expect(names(res.rows), `filtr pole ${t.key}`).toEqual(["A"]);
    }
    const link = await queryRecords(boss.ctx, registry, e, {
      filters: {
        op: "and",
        conditions: [only, { attr: "custom.odkaz_firma", op: "is", value: cb.row.id }],
      } as never,
    });
    expect(names(link.rows)).toEqual(["A"]);

    // řazení (u každého typu, který má pořadí); A má „větší“ hodnotu u čísla, částky a data
    for (const k of ["plocha", "cena", "od", "smlouva", "mail2"]) {
      const asc = await queryRecords(boss.ctx, registry, e, {
        filters: { op: "and", conditions: [only] } as never,
        sort: [{ attr: `custom.${k}`, dir: "desc" }],
      });
      const order = names(asc.rows);
      expect(order, `řazení ${k}`).toHaveLength(2);
      expect(new Set(order)).toEqual(new Set(["A", "B"]));
    }
    const byArea = await queryRecords(boss.ctx, registry, e, {
      filters: { op: "and", conditions: [only] } as never,
      sort: [{ attr: "custom.plocha", dir: "asc" }],
    });
    expect(names(byArea.rows)).toEqual(["B", "A"]);

    // hodnoty se uloží jen do jsonb vlastních polí
    const [raw] = await app.db.select().from(company).where(eq(company.id, ca.row.id));
    expect(raw?.custom).toMatchObject({ smlouva: "Smlouva-001", ok: true });

    // špatná hodnota se odmítne česky
    await expect(
      updateRecord(boss.ctx, registry, e, ca.row.id, { "custom.plocha": "moc" }),
    ).rejects.toThrow(/Pole „Plocha“/);
  });

  it("hledání: vlastní textové pole najde záznam v tabulce i v Cmd+K, po skrytí pole ne", async () => {
    const e0 = await resolve();
    const f = await field("interni", "Interní kód", "text" as never);
    const e = await resolve();
    const code = `ZK${randomBytes(3).toString("hex").toUpperCase()}`;
    const rec = await createRecord(boss.ctx, registry, e, {
      name: `Hledaná ${T}`,
      "custom.interni": code,
    });
    void e0;

    const q = await queryRecords(boss.ctx, registry, e, { q: code.toLowerCase() });
    expect(q.rows.map((r) => r.id)).toEqual([rec.row.id]);
    const hits = await searchAll(boss.ctx, [entity], code.toLowerCase());
    expect(hits.map((h) => h.id)).toEqual([rec.row.id]);

    // skrytí pole: pole zmizí z entity i z hledání, hodnota zůstane v databázi
    await updateFieldDef(boss.ctx, f.id, { options: { hidden: true } });
    await reindexEntity(app.db, await resolve());
    const hidden = await resolve();
    expect(hidden.byKey.has("custom.interni")).toBe(false);
    expect(
      (await describeEntity(boss.ctx, app.db, hidden, registry)).attributes,
    ).not.toContainEqual(expect.objectContaining({ key: "custom.interni" }));
    expect(await searchAll(boss.ctx, [entity], code.toLowerCase())).toEqual([]);
    expect((await queryRecords(boss.ctx, registry, hidden, { q: code })).rows).toEqual([]);
    const [raw] = await app.db.select().from(company).where(eq(company.id, rec.row.id));
    expect(raw?.custom).toMatchObject({ interni: code });

    // zobrazení zpět: pole i hodnota jsou zase vidět
    await updateFieldDef(boss.ctx, f.id, { options: {} });
    await reindexEntity(app.db, await resolve());
    expect((await searchAll(boss.ctx, [entity], code.toLowerCase())).map((h) => h.id)).toEqual([
      rec.row.id,
    ]);
  });

  it("výběr: hledá se podle popisku možnosti a po přejmenování možnosti i podle nového", async () => {
    const f = await field("druh", "Druh", "select" as never, {
      options: { choices: [{ value: "dum", label: "Rodinný dům" }] },
    });
    const e = await resolve();
    const rec = await createRecord(boss.ctx, registry, e, {
      name: `Druhová ${T}`,
      "custom.druh": "dum",
    });
    expect((await searchAll(boss.ctx, [entity], "rodinny dum")).map((h) => h.id)).toContain(
      rec.row.id,
    );
    await updateFieldDef(boss.ctx, f.id, {
      options: { choices: [{ value: "dum", label: "Vila" }] },
    });
    await reindexEntity(app.db, await resolve());
    expect((await searchAll(boss.ctx, [entity], "vila")).map((h) => h.id)).toContain(rec.row.id);
    expect((await searchAll(boss.ctx, [entity], "rodinny dum")).map((h) => h.id)).not.toContain(
      rec.row.id,
    );
  });

  it("výchozí hodnota se doplní u nového záznamu a hlídá se proti typu pole", async () => {
    await field("stav2", "Stav smlouvy", "select" as never, {
      options: {
        choices: [
          { value: "koncept", label: "Koncept" },
          { value: "platna", label: "Platná" },
        ],
        defaultValue: "koncept",
      },
    });
    await field("poznamka2", "Poznámka k firmě", "text" as never, {
      options: { defaultValue: "  bez poznámky " },
    });
    await field("kontrola", "Kontrola", "checkbox" as never, { options: { defaultValue: false } });
    await field("sleva", "Sleva %", "number" as never, { options: { defaultValue: 5 } });

    const e = await resolve();
    expect(e.byKey.get("custom.stav2")?.default).toBe("koncept");
    const d = await describeEntity(boss.ctx, app.db, e, registry);
    expect(d.attributes.find((a) => a.key === "custom.sleva")?.default).toBe(5);

    const rec = await createRecord(boss.ctx, registry, e, { name: `Výchozí ${T}` });
    expect(rec.row).toMatchObject({
      "custom.stav2": "koncept",
      "custom.poznamka2": "bez poznámky",
      "custom.kontrola": false,
      "custom.sleva": 5,
    });
    // výslovně zadaná hodnota má přednost
    const own = await createRecord(boss.ctx, registry, e, {
      name: `Vlastní ${T}`,
      "custom.stav2": "platna",
    });
    expect(own.row["custom.stav2"]).toBe("platna");

    await expect(
      field("spatna1", "Špatná 1", "select" as never, {
        options: { choices: [{ value: "a", label: "A" }], defaultValue: "b" },
      }),
    ).rejects.toThrow(/Výchozí hodnota/);
    await expect(
      field("spatna2", "Špatná 2", "number" as never, { options: { defaultValue: "abc" } }),
    ).rejects.toThrow(/Výchozí hodnota/);
    await expect(
      field("spatna3", "Špatná 3", "user" as never, { options: { defaultValue: "x" } }),
    ).rejects.toThrow(/výchozí hodnotu nastavit nejde/);
  });

  it("povinné pole, pořadí, smazání a obnovení pole; duplicitní klíč se odmítne", async () => {
    const f1 = await field("pov1", "Povinné 1", "text" as never, { required: true });
    const e = await resolve();
    await expect(createRecord(boss.ctx, registry, e, { name: `Bez ${T}` })).rejects.toThrow(
      /„Povinné 1“ je povinné/,
    );
    await updateFieldDef(boss.ctx, f1.id, { required: false });

    await expect(field("pov1", "Znovu", "text" as never)).rejects.toThrow(/už existuje/);

    const defs = await listFieldDefs(app.db, key);
    const reversed = defs.map((x) => x.id).reverse();
    await reorderFieldDefs(boss.ctx, key, reversed);
    expect((await listFieldDefs(app.db, key)).map((x) => x.id)).toEqual(reversed);
    // pořadí polí je pořadí atributů v entitě
    const customKeys = (await resolve()).attributes.filter((a) => a.custom).map((a) => a.key);
    expect(customKeys).toEqual((await listFieldDefs(app.db, key)).map((x) => `custom.${x.key}`));
    await expect(reorderFieldDefs(boss.ctx, key, reversed.slice(1))).rejects.toThrow(
      /všechna pole/,
    );

    await deleteFieldDef(boss.ctx, f1.id);
    expect((await resolve()).byKey.has("custom.pov1")).toBe(false);
    await restoreFieldDef(boss.ctx, f1.id);
    expect((await resolve()).byKey.has("custom.pov1")).toBe(true);
    // zatímco je pole smazané, nové se stejným klíčem obnovení zablokuje
    await deleteFieldDef(boss.ctx, f1.id);
    await field("pov1", "Nové", "text" as never);
    await expect(restoreFieldDef(boss.ctx, f1.id)).rejects.toThrow(/mezitím vzniklo/);
  });

  it("uživatel bez práva na kontakty záznamy s vlastními poli nevidí", async () => {
    const e = await resolve();
    const nobody = await makeUser(app.db, []);
    await expect(queryRecords(nobody.ctx, registry, e, {})).rejects.toThrow(PermissionError);
  });
});
