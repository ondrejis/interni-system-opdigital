import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLookup, ensurePipeline, getPipeline } from "@rebar/core/config-data";
import { createFieldDef } from "@rebar/core/custom-fields";
import { schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
  resolveEntity,
  type EntityRegistry,
} from "@rebar/core/entities";
import { EXPORT_MAX_ROWS, prepareEntityExport } from "@rebar/core/export";
import type { StorageDriver } from "@rebar/core/files";
import type { ModuleSeed } from "@rebar/core";
import type { ModuleDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { PermissionError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { companySetting } from "@rebar/core/settings";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { addDaysIso, todayIso } from "@rebar/core/time";
import { manifest } from "@rebar/fakturace";
import {
  addPayment,
  buildAccountingPackage,
  createFromJob,
  EXPORT_ADAPTERS,
  exportInvoices,
  invoiceEntity,
  issue,
} from "@rebar/fakturace/server";
import { invoice, receivedInvoice } from "@rebar/fakturace/schema";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import { job } from "@rebar/zakazky/schema";
import { jobEntity } from "@rebar/zakazky/server";
import { receivedEntity } from "../packages/modules/fakturace/src/received/entity";
import { collect, unzip } from "./support/unzip";

/** Exporty: XLSX/CSV seznamů entit (celá filtrovaná sada, typy buněk, oprávnění) a balík pro účetní. */
const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
const supplier = {
  name: "Stavby Test s.r.o.",
  ico: "12345678",
  dic: "CZ12345678",
  street: "Hlavní 1",
  city: "Plzeň",
  zip: "30100",
  email: "kancelar@stavby-test.example",
  phone: null,
  web: null,
  bankAccount: "19-2000145399/0800",
};
const files = new Map<string, Buffer>();
const storage: StorageDriver = {
  put: async (k, d) => void files.set(k, d),
  get: async (k) => Readable.from([files.get(k)!]),
  delete: async (k) => void files.delete(k),
  exists: async (k) => files.has(k),
};
const deps = () =>
  ({
    registry,
    baseURL: "http://localhost",
    costProviders: [],
    calendarLayers: [],
    diaryPrefill: [],
    emit: async () => {},
    storage,
    settings: {
      get: async (_db: unknown, def: { key: string; default: unknown }) =>
        def.key === companySetting.key ? supplier : def.default,
    },
  }) as unknown as ModuleDeps;

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([
    companyEntity,
    personEntity,
    jobEntity,
    invoiceEntity,
    receivedEntity,
  ]);
  registerEntityPolicies(registry);
  for (const m of [zakazkyManifest, manifest]) {
    const seed = m.seed as ModuleSeed;
    for (const p of seed.pipelines ?? []) await ensurePipeline(app.db, p);
    for (const l of seed.lookups ?? []) await ensureLookup(app.db, l);
    await ensureSeries(app.db, seed.series ?? []);
  }
});

/** Řádky listu z XML: pole buněk `{ref, t, s, v}` podle `<c>`. */
function cells(sheetXml: string) {
  return [...sheetXml.matchAll(/<row r="(\d+)">(.*?)<\/row>/g)].map((m) => ({
    row: Number(m[1]),
    cells: [
      ...m[2]!.matchAll(
        /<c r="([A-Z]+)\d+"([^>]*)>(?:<is><t[^>]*>(.*?)<\/t><\/is>|<v>(.*?)<\/v>)?<\/c>/g,
      ),
    ].map((c) => ({
      col: c[1]!,
      attrs: c[2]!,
      text: c[3] ?? null,
      value: c[4] ?? null,
    })),
  }));
}

describe("export seznamu entity (XLSX a CSV)", () => {
  const tag = `ExpTest${randomBytes(3).toString("hex")}`;
  let admin: Awaited<ReturnType<typeof makeUser>>;
  beforeAll(async () => {
    admin = await makeUser(app.db, [
      ["settings.manage", "all"],
      ["kontakty.read", "all"],
      ["kontakty.write", "all"],
    ]);
    await createFieldDef(admin.ctx, {
      entityType: "company",
      key: "obrat",
      label: "Roční obrat",
      type: "currency",
    });
    await createFieldDef(admin.ctx, {
      entityType: "company",
      key: "zamestnancu",
      label: "Zaměstnanců",
      type: "number",
    });
    await createFieldDef(admin.ctx, {
      entityType: "company",
      key: "klientem_od",
      label: "Klientem od",
      type: "date",
    });
    await createFieldDef(admin.ctx, {
      entityType: "company",
      key: "vip",
      label: "VIP",
      type: "checkbox",
    });
    await app.db.insert(company).values(
      Array.from({ length: 450 }, (_, i) => ({
        name: `${tag} ${String(i).padStart(3, "0")}`,
        ico: String(10_000_000 + i),
        custom: {
          obrat: 123_456_78 + i, // v haléřích
          zamestnancu: i,
          klientem_od: "2026-03-05",
          vip: i % 2 === 0,
        },
      })),
    );
    // jiné firmy, které filtr nesmí vzít
    await app.db.insert(company).values({ name: "Cizí firma bez značky", ico: "99999999" });
  }, 60_000);

  const prep = async (
    ctx: Ctx,
    extra: Record<string, unknown> = {},
    format: "xlsx" | "csv" = "xlsx",
  ) =>
    prepareEntityExport(ctx, registry, await resolveEntity(app.db, companyEntity), {
      format,
      query: { q: `${tag} `, sort: [{ attr: "name", dir: "asc" }] },
      columns: [
        "name",
        "ico",
        "custom.obrat",
        "custom.zamestnancu",
        "custom.klientem_od",
        "custom.vip",
      ],
      ...extra,
    } as never);

  it("exportuje celou filtrovanou sadu (450 řádků přes stránky po 200), ne jen zobrazené", async () => {
    const out = await prep(admin.ctx);
    expect(out.count).toBe(450);
    expect(out.filename).toMatch(/^firmy-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const files = unzip(await collect(out.chunks));
    const rows = cells(files.get("xl/worksheets/sheet1.xml")!.toString());
    // 1 titulek + 1 hlavička + 450 dat
    expect(rows).toHaveLength(452);
    const names = rows.slice(2).map((r) => r.cells[0]!.text);
    expect(names[0]).toBe(`${tag} 000`);
    expect(names[449]).toBe(`${tag} 449`);
    expect(new Set(names).size).toBe(450); // žádná stránka se neopakuje ani nechybí
    expect(names.some((n) => n?.startsWith("Cizí"))).toBe(false);
  });

  it("vlastní pole a peníze mají správný typ: číslo, peníze v korunách, datum, ano/ne", async () => {
    const out = await prep(admin.ctx, {
      query: { q: `${tag} 001`, sort: [{ attr: "name", dir: "asc" }] },
    });
    expect(out.count).toBe(1);
    const sheet = unzip(await collect(out.chunks))
      .get("xl/worksheets/sheet1.xml")!
      .toString();
    const header = cells(sheet)[1]!.cells.map((c) => c.text);
    expect(header).toEqual(["Název", "IČO", "Roční obrat", "Zaměstnanců", "Klientem od", "VIP"]);
    const r = cells(sheet)[2]!.cells;
    expect(r[0]!.text).toBe(`${tag} 001`);
    expect(r[1]!.text).toBe("10000001"); // IČO zůstane textem (nuly na začátku)
    // obrat 12345678 + 1 haléřů = 123 456,79 Kč → číslo s formátem měny (styl 2)
    expect(r[2]).toMatchObject({ value: "123456.79" });
    expect(r[2]!.attrs).toContain('s="2"');
    expect(r[3]).toMatchObject({ value: "1" }); // počet jako číslo
    expect(r[3]!.attrs).not.toContain("inlineStr");
    // datum jako datum (serial 2026-03-05 = 46086) s datovým formátem (styl 3)
    expect(r[4]).toMatchObject({ value: "46086" });
    expect(r[4]!.attrs).toContain('s="3"');
    expect(r[5]!.text).toBe("ne");
  });

  it("CSV: čárka jako desetinný oddělovač, data česky, texty zabezpečené proti vzorcům", async () => {
    await app.db.insert(company).values({ name: `=1+1 ${tag} vzorec`, ico: "11111111" });
    const out = await prep(admin.ctx, { query: { q: `${tag} vzorec` } }, "csv");
    expect(out.filename).toMatch(/\.csv$/);
    const text = (await collect(out.chunks)).toString("utf8");
    expect(text.startsWith("﻿Název;IČO;Roční obrat;Zaměstnanců;Klientem od;VIP\r\n")).toBe(true);
    expect(text).toContain(`'=1+1 ${tag} vzorec;11111111`);
    const full = await prep(admin.ctx, { query: { q: `${tag} 002` } }, "csv");
    const row = (await collect(full.chunks)).toString("utf8").split("\r\n")[1]!;
    expect(row).toBe(`${tag} 002;10000002;123456,80;2;5. 3. 2026;ano`);
  });

  it("bez oprávnění ke čtení export nevydá nic; neznámý nebo nedostupný sloupec se odmítne", async () => {
    const nobody = await makeUser(app.db, [["zakazky.read", "all"]]);
    await expect(prep(nobody.ctx)).rejects.toThrow(PermissionError);
    await expect(prep(admin.ctx, { columns: ["name", "neexistuje"] })).rejects.toThrow(
      /neznámý nebo nedostupný sloupec/,
    );
  });

  it("limit řádků: příliš velký výsledek se odmítne srozumitelnou hláškou (nenačte se do paměti)", async () => {
    await expect(prep(admin.ctx, { maxRows: 100 })).rejects.toThrow(/Zúžte filtr/);
    expect(EXPORT_MAX_ROWS).toBe(50_000);
  });

  it("peníze zakázky vidí jen oprávnění k ekonomice; export nevydá skrytý sloupec ani jeho hodnoty", async () => {
    const [c] = await app.db
      .insert(company)
      .values({ name: `Odběratel ${tag}`, ico: "22222222" })
      .returning();
    const stage = (await getPipeline(app.db, "job", "default"))!.stages[0]!;
    await app.db.insert(job).values({
      number: `X-${tag}`,
      title: `Zakázka ${tag}`,
      companyId: c!.id,
      stageId: stage.id,
      valueMinor: 987_654_321,
    });
    const E = await resolveEntity(app.db, jobEntity);
    const withMoney = await makeUser(app.db, [
      ["zakazky.read", "all"],
      ["zakazky.economics", "all"],
    ]);
    const noMoney = await makeUser(app.db, [["zakazky.read", "all"]]);
    const q = { q: `Zakázka ${tag}` };
    const a = await prepareEntityExport(withMoney.ctx, registry, E, {
      format: "xlsx",
      query: q,
      columns: ["title", "value"],
    });
    expect(a.count).toBe(1);
    expect(
      unzip(await collect(a.chunks))
        .get("xl/worksheets/sheet1.xml")!
        .toString(),
    ).toContain("<v>9876543.21</v>");
    await expect(
      prepareEntityExport(noMoney.ctx, registry, E, {
        format: "xlsx",
        query: q,
        columns: ["title", "value"],
      }),
    ).rejects.toThrow(/nedostupný sloupec/);
    // výchozí sloupce bez oprávnění cenu neobsahují
    const b = await prepareEntityExport(noMoney.ctx, registry, E, { format: "csv", query: q });
    const text = (await collect(b.chunks)).toString("utf8");
    expect(text).not.toContain("987");
    expect(text).not.toContain("Hodnota");
  });

  it("export faktur vyžaduje fakturace.export (samotné čtení nestačí)", async () => {
    const E = await resolveEntity(app.db, invoiceEntity);
    const reader = await makeUser(app.db, [["fakturace.read", "all"]]);
    await expect(prepareEntityExport(reader.ctx, registry, E, { format: "xlsx" })).rejects.toThrow(
      PermissionError,
    );
    const accountant = await makeUser(app.db, [
      ["fakturace.read", "all"],
      ["fakturace.export", "all"],
    ]);
    await expect(
      prepareEntityExport(accountant.ctx, registry, E, { format: "xlsx" }),
    ).resolves.toBeTruthy();
    // popis entity: tlačítko Export se ukáže jen oprávněným
    const { describeEntity } = await import("@rebar/core/entities");
    expect((await describeEntity(reader.ctx, app.db, E, registry)).can.export).toBe(false);
    expect((await describeEntity(accountant.ctx, app.db, E, registry)).can.export).toBe(true);
  });
});

/* ---------- vystavené a přijaté faktury ---------- */

const accountant = () =>
  makeUser(app.db, [
    ["fakturace.read", "all"],
    ["fakturace.write", "all"],
    ["fakturace.export", "all"],
    ["zakazky.read", "all"],
    ["kontakty.read", "all"],
  ]);

async function newJob(extra: Partial<typeof job.$inferInsert> = {}) {
  const ico = String(10_000_000 + Math.floor(Math.random() * 89_999_999));
  const [c] = await app.db
    .insert(company)
    .values({ name: `Odběratel ${randomBytes(3).toString("hex")}`, ico, dic: `CZ${ico}` })
    .returning();
  const stage = (await getPipeline(app.db, "job", "default"))!.stages[0]!;
  const [j] = await app.db
    .insert(job)
    .values({
      number: `E-${randomBytes(4).toString("hex")}`,
      title: "Rekonstrukce",
      companyId: c!.id,
      stageId: stage.id,
      valueMinor: 100_000_00,
      ...extra,
    })
    .returning();
  return j!;
}

async function issueFor(
  u: Awaited<ReturnType<typeof accountant>>,
  jobId: string,
  percent: number,
  date = todayIso(),
) {
  const { id } = await createFromJob.handler(
    u.ctx,
    createFromJob.input.parse({ jobId, kind: "partial", percent }),
    deps(),
  );
  const { number } = await issue.handler(u.ctx, issue.input.parse({ id, issueDate: date }), deps());
  return { id, number };
}

describe("export faktur: PDP, zádržné a adaptéry", () => {
  it("CSV i XLSX nesou režim DPH a zádržné; částky jsou čísla; XLSX má řádek součtů", async () => {
    const u = await accountant();
    const std = await issueFor(u, (await newJob()).id, 10);
    const pdp = await issueFor(u, (await newJob({ vatMode: "reverse_charge" })).id, 20);
    const ret = await issueFor(u, (await newJob({ retentionBp: 1000 })).id, 50);

    const csv = await exportInvoices.handler(
      u.ctx,
      exportInvoices.input.parse({ adapter: "csv", from: todayIso(), to: todayIso() }),
      deps(),
    );
    expect(csv.encoding).toBe("utf8");
    const lines = csv.content.split("\r\n");
    const row = (n: string) => lines.find((l) => l.startsWith(n))!.split(";");
    // sloupce: …, 11 Základ, 12 DPH, 13 Celkem, 14 Uhrazeno, 15 Zakázka, 16 Režim DPH, 17 Zádržné
    expect(row(pdp.number)[12]).toBe("0,00"); // bez DPH
    expect(row(pdp.number)[16]).toBe("přenesená daňová povinnost");
    expect(row(pdp.number)[11]).toBe("20000,00");
    expect(row(std.number)[16]).toBe("běžný");
    expect(row(std.number)[12]).toBe("2100,00");
    expect(row(ret.number)[17]).toBe("5000,00"); // 10 % z 50 000
    expect(row(ret.number)[11]).toBe("45000,00"); // základ po zádržném

    const xlsx = await exportInvoices.handler(
      u.ctx,
      exportInvoices.input.parse({ adapter: "xlsx", from: todayIso(), to: todayIso() }),
      deps(),
    );
    expect(xlsx.encoding).toBe("base64");
    expect(xlsx.filename).toMatch(/\.xlsx$/);
    const sheet = unzip(Buffer.from(xlsx.content, "base64"))
      .get("xl/worksheets/sheet1.xml")!
      .toString();
    const rows = cells(sheet);
    const find = (n: string) => rows.find((r) => r.cells[0]?.text === n)!.cells;
    expect(find(pdp.number)[16]!.text).toBe("přenesená daňová povinnost");
    expect(find(pdp.number)[12]).toMatchObject({ value: "0" }); // DPH: číslo 0
    expect(find(ret.number)[17]).toMatchObject({ value: "5000" });
    expect(find(ret.number)[17]!.attrs).toContain('s="2"');
    expect(rows[rows.length - 1]!.cells[0]!.text).toBe("Celkem");
    expect(EXPORT_ADAPTERS.map((a) => a.key)).toEqual(["csv", "xlsx"]);
  });

  it("CSV: odběratel začínající „=“ nespustí vzorec v Excelu", async () => {
    const u = await accountant();
    const j = await newJob();
    await app.db
      .update(company)
      .set({ name: '=HYPERLINK("http://x")' })
      .where(eq(company.id, j.companyId));
    const inv = await issueFor(u, j.id, 10);
    const csv = await exportInvoices.handler(
      u.ctx,
      exportInvoices.input.parse({ adapter: "csv", from: todayIso(), to: todayIso() }),
      deps(),
    );
    const line = csv.content.split("\r\n").find((l) => l.startsWith(inv.number))!;
    expect(line).toContain(`"'=HYPERLINK(""http://x"")"`);
  });
});

describe("měsíční balík pro účetní", () => {
  async function receivedFor(
    u: Awaited<ReturnType<typeof accountant>>,
    state: string,
    over: Partial<typeof receivedInvoice.$inferInsert> = {},
    withFile = true,
  ) {
    let fileId: string | null = null;
    if (withFile) {
      const key = `test/${randomBytes(6).toString("hex")}.pdf`;
      await storage.put(key, Buffer.from("%PDF-1.4 sken dodavatele"));
      const [f] = await app.db
        .insert(schema.file)
        .values({
          storageKey: key,
          name: "faktura-dodavatele.pdf",
          mime: "application/pdf",
          size: 24,
          sha256: "x".repeat(64),
          kind: "document",
          uploadedBy: u.id,
        })
        .returning();
      fileId = f!.id;
    }
    const [r] = await app.db
      .insert(receivedInvoice)
      .values({
        number: `P-${randomBytes(3).toString("hex")}`,
        supplier: {
          name: "Dodavatel Materiál s.r.o.",
          ico: "87654321",
          dic: "CZ87654321",
          street: null,
          city: null,
          zip: null,
        },
        issueDate: "2026-08-15",
        taxableDate: "2026-08-15",
        dueDate: "2026-08-29",
        netMinor: 10_000_00,
        vatMinor: 2_100_00,
        grossMinor: 12_100_00,
        state,
        fileId,
        createdBy: u.id,
        updatedBy: u.id,
        ...over,
      })
      .returning();
    return r!;
  }

  it("ZIP obsahuje PDF vydaných faktur, sken přijaté a souhrn s označením uhrazených; draft a neschválené se nepřidají", async () => {
    const u = await accountant();
    const date = "2026-08-10";
    const paid = await issueFor(u, (await newJob()).id, 10, date);
    await addPayment.handler(
      u.ctx,
      addPayment.input.parse({ invoiceId: paid.id, date: "2026-08-20", amountMinor: 12_100_00 }),
      deps(),
    );
    const open = await issueFor(u, (await newJob({ vatMode: "reverse_charge" })).id, 20, date);
    const approved = await receivedFor(u, "approved");
    const rejected = await receivedFor(u, "rejected");
    const noScan = await receivedFor(
      u,
      "paid",
      { paidMinor: 12_100_00, paidDate: "2026-08-25" },
      false,
    );
    // jiné období nesmí do balíku
    await issueFor(u, (await newJob()).id, 10, "2026-07-01");

    const pkg = await buildAccountingPackage(u.ctx, deps(), {
      from: "2026-08-01",
      to: "2026-08-31",
      format: "xlsx",
    });
    expect(pkg.filename).toBe("ucetni-balik-2026-08.zip");
    expect(pkg.issuedCount).toBe(2);
    expect(pkg.receivedCount).toBe(2);
    const zip = unzip(await collect(pkg.chunks));
    const names = [...zip.keys()];
    expect(names).toContain("souhrn.xlsx");
    expect(names).toContain(`vydane/${paid.number}.pdf`);
    expect(names).toContain(`vydane/${open.number}.pdf`);
    expect(zip.get(`vydane/${paid.number}.pdf`)!.subarray(0, 5).toString()).toBe("%PDF-");
    const scan = names.find((n) => n.startsWith("prijate/") && n.includes(approved.number))!;
    expect(scan).toMatch(/\.pdf$/);
    expect(zip.get(scan)!.toString()).toContain("sken dodavatele");
    expect(names.some((n) => n.includes(rejected.number))).toBe(false);
    expect(zip.get("poznamky.txt")!.toString()).toContain(`${noScan.number}`); // bez skenu = poznámka

    // souhrn je vnořené XLSX: tři listy, uhrazené označeno, PDP v režimu DPH
    const inner = unzip(zip.get("souhrn.xlsx")!);
    expect(inner.get("xl/workbook.xml")!.toString()).toMatch(
      /Souhrn.*Vydané faktury.*Přijaté faktury/s,
    );
    const issuedSheet = inner.get("xl/worksheets/sheet2.xml")!.toString();
    const rows = cells(issuedSheet);
    const byNumber = (n: string) =>
      rows.find((r) => r.cells[0]?.text === n)!.cells.map((c) => c.text ?? c.value);
    expect(byNumber(paid.number)).toContain("uhrazeno");
    expect(byNumber(paid.number)).toContain("46254"); // datum úhrady 2026-08-20
    expect(byNumber(open.number)).toContain("neuhrazeno");
    expect(byNumber(open.number)).toContain("přenesená daňová povinnost");
    const receivedRows = cells(inner.get("xl/worksheets/sheet3.xml")!.toString());
    const rc = (n: string) =>
      receivedRows.find((r) => r.cells[0]?.text === n)!.cells.map((c) => c.text ?? c.value);
    expect(rc(noScan.number)).toContain("uhrazeno");
    expect(rc(approved.number)).toContain("neuhrazeno");
    // součet na listu Souhrn: vydané = 12 100 + 20 000 (PDP bez DPH)
    const summary = cells(inner.get("xl/worksheets/sheet1.xml")!.toString());
    const issuedLine = summary
      .find((r) => r.cells[0]?.text === "Vydané faktury")!
      .cells.map((c) => c.value ?? c.text);
    expect(issuedLine).toContain("2"); // počet
    expect(issuedLine).toContain("32100"); // celkem
    expect(issuedLine).toContain("12100"); // uhrazeno
    expect(issuedLine).toContain("20000"); // neuhrazeno
  });

  it("souhrn jako CSV (dva soubory) a bez skenů přijatých faktur", async () => {
    const u = await accountant();
    const inv = await issueFor(u, (await newJob()).id, 10, "2026-05-10");
    const rec = await receivedFor(u, "approved", { issueDate: "2026-05-12" });
    const pkg = await buildAccountingPackage(u.ctx, deps(), {
      from: "2026-05-01",
      to: "2026-05-31",
      format: "csv",
      receivedFiles: false,
    });
    const zip = unzip(await collect(pkg.chunks));
    expect([...zip.keys()].sort()).toEqual(
      ["prijate-faktury.csv", `vydane/${inv.number}.pdf`, "vydane-faktury.csv"].sort(),
    );
    const csv = zip.get("vydane-faktury.csv")!.toString();
    expect(csv.startsWith("﻿Číslo;Druh;")).toBe(true);
    expect(csv).toContain(`${inv.number};průběžná;10. 5. 2026`);
    expect(csv).toContain("neuhrazeno");
    expect(zip.get("prijate-faktury.csv")!.toString()).toContain(rec.number);
  });

  it("oprávnění a hranice: bez fakturace.export nic; prázdné období a obrácené období hlásí srozumitelně", async () => {
    const nobody = await makeUser(app.db, [["fakturace.read", "all"]]);
    await expect(
      buildAccountingPackage(nobody.ctx, deps(), {
        from: "2026-08-01",
        to: "2026-08-31",
        format: "xlsx",
      }),
    ).rejects.toThrow(PermissionError);
    const u = await accountant();
    await expect(
      buildAccountingPackage(u.ctx, deps(), {
        from: "2001-01-01",
        to: "2001-01-31",
        format: "xlsx",
      }),
    ).rejects.toThrow(/nejsou žádné/);
    await expect(
      buildAccountingPackage(u.ctx, deps(), {
        from: "2026-02-01",
        to: "2026-01-01",
        format: "xlsx",
      }),
    ).rejects.toThrow(UserError);
  });

  it("uživatel s rozsahem „jen moje“ dostane jen své doklady", async () => {
    const mine = await makeUser(app.db, [
      ["fakturace.read", "own"],
      ["fakturace.write", "own"],
      ["fakturace.export", "all"],
      ["zakazky.read", "all"],
      ["kontakty.read", "all"],
    ]);
    const other = await accountant();
    const date = "2026-03-10";
    const a = await issueFor(mine, (await newJob()).id, 10, date);
    const b = await issueFor(other, (await newJob()).id, 10, date);
    const pkg = await buildAccountingPackage(mine.ctx, deps(), {
      from: "2026-03-01",
      to: "2026-03-31",
      format: "csv",
      receivedFiles: false,
    });
    const names = [...unzip(await collect(pkg.chunks)).keys()];
    expect(names).toContain(`vydane/${a.number}.pdf`);
    expect(names).not.toContain(`vydane/${b.number}.pdf`);
    void invoice;
    void addDaysIso;
  });
});
