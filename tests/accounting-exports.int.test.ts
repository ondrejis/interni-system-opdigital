import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLookup, ensurePipeline, getPipeline } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import { excelDate } from "@rebar/core/export";
import {
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
  type EntityRegistry,
} from "@rebar/core/entities";
import type { ModuleSeed } from "@rebar/core";
import type { ModuleDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { NotFoundError, PermissionError, UserError } from "@rebar/core/rbac";
import { companySetting } from "@rebar/core/settings";
import { todayIso } from "@rebar/core/time";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { manifest } from "@rebar/fakturace";
import {
  buildAccountingPackage,
  buildIsdocExport,
  buildSingleIsdoc,
  buildVatReport,
  createCreditNote,
  createFromJob,
  invoiceEntity,
  issue,
  saveDraft,
} from "@rebar/fakturace/server";
import { invoice, receivedInvoice, receivedInvoiceLine } from "@rebar/fakturace/schema";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import { job } from "@rebar/zakazky/schema";
import { jobEntity } from "@rebar/zakazky/server";
import { receivedEntity } from "../packages/modules/fakturace/src/received/entity";
import {
  checkIsdocStructure,
  checkIsdocTotals,
  child,
  childAll,
  minorOf,
  parseXml,
  textOf,
} from "../packages/modules/fakturace/src/export/testing/xml";
import { collect, unzip } from "./support/unzip";

/**
 * Účetní exporty: ISDOC (jeden doklad, ZIP), podklady DPH (CSV, XLSX) a jejich přibalení do balíku pro účetní.
 * Doklady jsou vždy v běžném roce (číselná řada faktur nesmí skočit do jiného roku) a patří uživateli s rozsahem „jen moje“,
 * takže se v součtech nepletou s doklady z ostatních testů ve sdílené databázi.
 */
const Y = todayIso().slice(0, 4);
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
const deps = () =>
  ({
    registry,
    baseURL: "http://localhost",
    costProviders: [],
    calendarLayers: [],
    diaryPrefill: [],
    emit: async () => {},
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

type User = Awaited<ReturnType<typeof makeUser>>;
/** Účetní s rozsahem „jen moje“ pro doklady (jeho doklady se nepletou s doklady z ostatních testů), export má vždy. */
const accountant = () =>
  makeUser(app.db, [
    ["fakturace.read", "own"],
    ["fakturace.write", "own"],
    ["fakturace.export", "all"],
    ["zakazky.read", "all"],
    ["kontakty.read", "all"],
  ]);

async function newJob(
  extra: Partial<typeof job.$inferInsert> = {},
  customer: Partial<typeof company.$inferInsert> = {},
) {
  const ico = String(10_000_000 + Math.floor(Math.random() * 89_999_999));
  const [c] = await app.db
    .insert(company)
    .values({
      name: `Odběratel ${randomBytes(3).toString("hex")}`,
      ico,
      dic: `CZ${ico}`,
      street: "Dlouhá 5",
      city: "Praha",
      zip: "11000",
      ...customer,
    })
    .returning();
  const stage = (await getPipeline(app.db, "job", "default"))!.stages[0]!;
  const [j] = await app.db
    .insert(job)
    .values({
      number: `A-${randomBytes(4).toString("hex")}`,
      title: "Rekonstrukce",
      companyId: c!.id,
      stageId: stage.id,
      valueMinor: 100_000_00,
      ...extra,
    })
    .returning();
  return j!;
}

type L = { description: string; qty: string; price: number; rate: number };
const lineIn = (l: L) => ({
  description: l.description,
  quantity: l.qty,
  unit: "ks",
  unitPriceMinor: l.price,
  vatRateBp: l.rate,
});

/** Vydaná faktura z vlastních řádků: koncept z zakázky, přepsané řádky, vystavení v zadaných datech. */
async function issued(
  u: User,
  lines: L[],
  opts: {
    kind?: "partial" | "proforma";
    issueDate: string;
    taxableDate?: string;
    jobExtra?: Partial<typeof job.$inferInsert>;
    customer?: Partial<typeof company.$inferInsert>;
  },
) {
  const j = await newJob(opts.jobExtra, opts.customer);
  const { id } = await createFromJob.handler(
    u.ctx,
    createFromJob.input.parse({ jobId: j.id, kind: opts.kind ?? "partial", percent: 10 }),
    deps(),
  );
  await saveDraft.handler(u.ctx, saveDraft.input.parse({ id, lines: lines.map(lineIn) }), deps());
  const { number } = await issue.handler(
    u.ctx,
    issue.input.parse({
      id,
      issueDate: opts.issueDate,
      ...(opts.taxableDate ? { taxableDate: opts.taxableDate } : {}),
    }),
    deps(),
  );
  const [row] = await app.db.select().from(invoice).where(eq(invoice.id, id));
  return { id, number, row: row!, job: j };
}

type RL = { net: number; rate: number; vat: number };
async function received(
  u: User,
  over: Partial<typeof receivedInvoice.$inferInsert>,
  lines: RL[] = [],
) {
  const net = lines.reduce((a, l) => a + l.net, 0);
  const vat = lines.reduce((a, l) => a + l.vat, 0);
  const issueDate = over.issueDate ?? `${Y}-12-04`;
  const [r] = await app.db
    .insert(receivedInvoice)
    .values({
      number: `P-${randomBytes(3).toString("hex")}`,
      supplier: {
        name: "Dodavatel Materiál s.r.o.",
        ico: "87654321",
        dic: "CZ87654321",
        street: "Skladová 7",
        city: "Brno",
        zip: "60200",
        bankAccount: "123456789/0100",
      },
      variableSymbol: "9876",
      issueDate,
      taxableDate: "taxableDate" in over ? over.taxableDate : issueDate,
      dueDate: `${Y}-12-31`,
      netMinor: net,
      vatMinor: vat,
      grossMinor: net + vat,
      state: "approved",
      createdBy: u.id,
      updatedBy: u.id,
      ...over,
    })
    .returning();
  if (lines.length)
    await app.db.insert(receivedInvoiceLine).values(
      lines.map((l, i) => ({
        invoiceId: r!.id,
        position: i,
        description: `Materiál ${i + 1}`,
        netMinor: l.net,
        vatRateBp: l.rate,
        vatMinor: l.vat,
        grossMinor: l.net + l.vat,
      })),
    );
  return r!;
}

const FIRST: L = { description: "Práce", qty: "2", price: 1_000_00, rate: 2100 };
const SECOND: L = { description: "Materiál", qty: "1", price: 500_00, rate: 1200 };

const auditOf = (actorId: string) =>
  app.db
    .select()
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.actorId, actorId), eq(schema.auditLog.action, "export")));

describe("ISDOC jednoho dokladu", () => {
  it("vydaná faktura: struktura, součty sedí na hlavičku, dodavatel je firma klienta, odběratel snapshot, audit", async () => {
    const u = await accountant();
    const inv = await issued(u, [FIRST, SECOND], {
      issueDate: `${Y}-12-02`,
      taxableDate: `${Y}-12-01`,
      customer: { name: "Odběratel & Syn <test>" },
    });
    const out = await buildSingleIsdoc(u.ctx, deps(), inv.id);
    expect(out.filename).toBe(`${inv.number}.isdoc`);
    const root = parseXml(out.xml);
    checkIsdocStructure(root);
    checkIsdocTotals(root);
    // součty v ISDOC = hlavička dokladu: 2 000 + 500 bez DPH, 420 + 60 DPH
    const m = child(root, "LegalMonetaryTotal")!;
    expect(minorOf(m, "TaxExclusiveAmount")).toBe(inv.row.netMinor);
    expect(minorOf(m, "TaxInclusiveAmount")).toBe(inv.row.grossMinor);
    expect(minorOf(child(root, "TaxTotal")!, "TaxAmount")).toBe(inv.row.vatMinor);
    expect(inv.row.netMinor).toBe(250_000);
    expect(inv.row.vatMinor).toBe(48_000);
    const subs = childAll(child(root, "TaxTotal")!, "TaxSubTotal");
    expect(subs.map((s) => textOf(child(s, "TaxCategory")!, "Percent"))).toEqual(["21", "12"]);
    expect(textOf(root, "ID")).toBe(inv.number);
    expect(textOf(root, "UUID")).toBe(inv.id);
    expect(textOf(root, "DocumentType")).toBe("1");
    expect(textOf(root, "IssueDate")).toBe(`${Y}-12-02`);
    expect(textOf(root, "TaxPointDate")).toBe(`${Y}-12-01`);
    expect(textOf(root, "VATApplicable")).toBe("true");
    const sup = child(child(root, "AccountingSupplierParty")!, "Party")!;
    expect(textOf(child(sup, "PartyName")!, "Name")).toBe(supplier.name);
    expect(textOf(child(sup, "PartyIdentification")!, "ID")).toBe("12345678");
    const cus = child(child(root, "AccountingCustomerParty")!, "Party")!;
    expect(textOf(child(cus, "PartyName")!, "Name")).toBe("Odběratel & Syn <test>");
    expect(textOf(child(cus, "PostalAddress")!, "StreetName")).toBe("Dlouhá");
    expect(textOf(child(cus, "PostalAddress")!, "BuildingNumber")).toBe("5");
    const det = child(child(child(root, "PaymentMeans")!, "Payment")!, "Details")!;
    expect(textOf(det, "ID")).toBe("19-2000145399");
    expect(textOf(det, "BankCode")).toBe("0800");
    expect(textOf(det, "VariableSymbol")).toBe(inv.row.variableSymbol);
    expect(textOf(det, "PaymentDueDate")).toBe(inv.row.dueDate);
    // export se zapsal do auditu
    const a = await auditOf(u.id);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ entityType: "invoice", entityId: inv.id });
    expect(a[0]!.summary).toContain(`vydaná faktura ${inv.number}`);
  });

  it("vystavený doklad se nemění ani po změně údajů odběratele (snapshot)", async () => {
    const u = await accountant();
    const inv = await issued(u, [FIRST], { issueDate: `${Y}-12-03` });
    await app.db
      .update(company)
      .set({ name: "Přejmenovaná firma", street: "Jiná 99" })
      .where(eq(company.id, inv.job.companyId));
    const root = parseXml((await buildSingleIsdoc(u.ctx, deps(), inv.id)).xml);
    const cus = child(child(root, "AccountingCustomerParty")!, "Party")!;
    expect(textOf(child(cus, "PartyName")!, "Name")).toMatch(/^Odběratel /);
    expect(textOf(child(cus, "PostalAddress")!, "StreetName")).toBe("Dlouhá");
  });

  it("dobropis: typ 2, záporné částky shodné s hlavičkou, v poznámce původní doklad", async () => {
    const u = await accountant();
    const orig = await issued(u, [FIRST], { issueDate: `${Y}-12-05` });
    const { id } = await createCreditNote.handler(
      u.ctx,
      createCreditNote.input.parse({ invoiceId: orig.id }),
      deps(),
    );
    const { number } = await issue.handler(
      u.ctx,
      issue.input.parse({ id, issueDate: `${Y}-12-06` }),
      deps(),
    );
    const [row] = await app.db.select().from(invoice).where(eq(invoice.id, id));
    expect(row!.grossMinor).toBe(-242_000);
    const root = parseXml((await buildSingleIsdoc(u.ctx, deps(), id)).xml);
    checkIsdocStructure(root);
    checkIsdocTotals(root);
    expect(textOf(root, "DocumentType")).toBe("2");
    expect(textOf(root, "ID")).toBe(number);
    expect(textOf(root, "Note")).toContain(`k faktuře ${orig.number} ze dne 5. 12. ${Y}`);
    expect(minorOf(child(root, "LegalMonetaryTotal")!, "PayableAmount")).toBe(row!.grossMinor);
    // původní doklad (stornovaný dobropisem) jde vyexportovat dál
    const o = parseXml((await buildSingleIsdoc(u.ctx, deps(), orig.id)).xml);
    expect(textOf(o, "DocumentType")).toBe("1");
  });

  it("přenesená daňová povinnost a zálohová faktura", async () => {
    const u = await accountant();
    const pdp = await issued(u, [FIRST], {
      issueDate: `${Y}-12-04`,
      jobExtra: { vatMode: "reverse_charge" },
    });
    const p = parseXml((await buildSingleIsdoc(u.ctx, deps(), pdp.id)).xml);
    checkIsdocStructure(p);
    checkIsdocTotals(p);
    const sub = childAll(child(p, "TaxTotal")!, "TaxSubTotal");
    expect(sub).toHaveLength(1);
    expect(textOf(child(sub[0]!, "TaxCategory")!, "LocalReverseChargeFlag")).toBe("true");
    expect(textOf(child(sub[0]!, "TaxCategory")!, "Percent")).toBe("0");
    expect(textOf(child(p, "TaxTotal")!, "TaxAmount")).toBe("0.00");
    expect(textOf(child(p, "LegalMonetaryTotal")!, "PayableAmount")).toBe("2000.00");
    expect(textOf(p, "Note")).toContain("Daň odvede zákazník");

    const pro = await issued(u, [SECOND], { kind: "proforma", issueDate: `${Y}-12-04` });
    const r = parseXml((await buildSingleIsdoc(u.ctx, deps(), pro.id)).xml);
    checkIsdocStructure(r);
    expect(textOf(r, "DocumentType")).toBe("4");
    expect(child(r, "TaxPointDate")).toBeUndefined();
  });

  it("přijatá faktura: dodavatel ze snapshotu, odběratel firma klienta, DPH z hlavičky, PDP, odmítnuté stavy", async () => {
    const u = await accountant();
    const r = await received(u, { note: "Na zakázku <A>" }, [
      { net: 100_000, rate: 2100, vat: 21_000 },
      { net: 50_000, rate: 1200, vat: 6_000 },
    ]);
    const out = await buildSingleIsdoc(u.ctx, deps(), r.id);
    expect(out.filename).toBe(`Dodavatel_Material_s.r.o.-${r.number}.isdoc`);
    const root = parseXml(out.xml);
    checkIsdocStructure(root);
    checkIsdocTotals(root);
    expect(textOf(root, "ID")).toBe(r.number);
    expect(textOf(root, "UUID")).toBe(r.id);
    expect(minorOf(child(root, "LegalMonetaryTotal")!, "TaxInclusiveAmount")).toBe(177_000);
    const sup = child(child(root, "AccountingSupplierParty")!, "Party")!;
    expect(textOf(child(sup, "PartyName")!, "Name")).toBe("Dodavatel Materiál s.r.o.");
    expect(textOf(child(sup, "PartyTaxScheme")!, "CompanyID")).toBe("CZ87654321");
    const cus = child(child(root, "AccountingCustomerParty")!, "Party")!;
    expect(textOf(child(cus, "PartyName")!, "Name")).toBe(supplier.name);
    expect(textOf(root, "Note")).toBe("Na zakázku <A>");
    const det = child(child(child(root, "PaymentMeans")!, "Payment")!, "Details")!;
    expect(textOf(det, "BankCode")).toBe("0100");
    expect(textOf(det, "VariableSymbol")).toBe("9876");

    const pdp = await received(u, { vatMode: "reverse_charge" }, [
      { net: 70_000, rate: 2100, vat: 0 },
    ]);
    const p = parseXml((await buildSingleIsdoc(u.ctx, deps(), pdp.id)).xml);
    checkIsdocStructure(p);
    checkIsdocTotals(p);
    expect(
      textOf(
        child(childAll(child(p, "TaxTotal")!, "TaxSubTotal")[0]!, "TaxCategory")!,
        "LocalReverseChargeFlag",
      ),
    ).toBe("true");

    const pending = await received(u, { state: "pending" }, [{ net: 1_000, rate: 2100, vat: 210 }]);
    await expect(buildSingleIsdoc(u.ctx, deps(), pending.id)).rejects.toThrow(
      /schválené a uhrazené/,
    );
  });

  it("koncept a neznámý doklad se odmítnou srozumitelně", async () => {
    const u = await accountant();
    const j = await newJob();
    const { id } = await createFromJob.handler(
      u.ctx,
      createFromJob.input.parse({ jobId: j.id, kind: "partial", percent: 10 }),
      deps(),
    );
    await expect(buildSingleIsdoc(u.ctx, deps(), id)).rejects.toThrow(UserError);
    await expect(buildSingleIsdoc(u.ctx, deps(), crypto.randomUUID())).rejects.toThrow(
      NotFoundError,
    );
  });

  it("oprávnění: bez fakturace.export nic; „jen moje“ nevydá cizí doklad", async () => {
    const owner = await accountant();
    const inv = await issued(owner, [FIRST], { issueDate: `${Y}-12-05` });
    const reader = await makeUser(app.db, [
      ["fakturace.read", "all"],
      ["kontakty.read", "all"],
    ]);
    await expect(buildSingleIsdoc(reader.ctx, deps(), inv.id)).rejects.toThrow(PermissionError);
    const mine = await makeUser(app.db, [
      ["fakturace.read", "own"],
      ["fakturace.write", "own"],
      ["fakturace.export", "all"],
      ["zakazky.read", "all"],
      ["kontakty.read", "all"],
    ]);
    await expect(buildSingleIsdoc(mine.ctx, deps(), inv.id)).rejects.toThrow(NotFoundError);
    expect(await auditOf(reader.id)).toHaveLength(0);
    expect(await auditOf(mine.id)).toHaveLength(0);
  });
});

describe("ZIP s ISDOC za období", () => {
  it("vydané i přijaté, soubory se rozbalí a mají správnou strukturu; audit s počty", async () => {
    const u = await accountant();
    const a = await issued(u, [FIRST, SECOND], { issueDate: `${Y}-07-10` });
    const b = await issued(u, [FIRST], {
      issueDate: `${Y}-07-15`,
      customer: { name: "</Name><Evil/> & spol." },
    });
    const pro = await issued(u, [SECOND], { kind: "proforma", issueDate: `${Y}-07-16` });
    const r = await received(u, { issueDate: `${Y}-07-12`, taxableDate: `${Y}-07-12` }, [
      { net: 100_000, rate: 2100, vat: 21_000 },
    ]);
    await received(u, { issueDate: `${Y}-07-12`, state: "rejected" }, [
      { net: 1_000, rate: 2100, vat: 210 },
    ]);
    await issued(u, [FIRST], { issueDate: `${Y}-12-09` }); // jiné období

    const out = await buildIsdocExport(u.ctx, deps(), { from: `${Y}-07-01`, to: `${Y}-07-30` });
    expect(out.filename).toBe(`isdoc-${Y}-07.zip`);
    expect([out.issuedCount, out.receivedCount]).toEqual([3, 1]);
    const zip = unzip(await collect(out.chunks));
    expect([...zip.keys()].sort()).toEqual(
      [
        `${a.number}.isdoc`,
        `${b.number}.isdoc`,
        `${pro.number}.isdoc`,
        `prijate/Dodavatel_Material_s.r.o.-${r.number}.isdoc`,
      ].sort(),
    );
    for (const [name, data] of zip) {
      const root = parseXml(data.toString("utf8"));
      checkIsdocStructure(root);
      checkIsdocTotals(root);
      expect(name.endsWith(".isdoc")).toBe(true);
    }
    // text odběratele s značkami zůstal textem
    const bx = parseXml(zip.get(`${b.number}.isdoc`)!.toString("utf8"));
    expect(
      textOf(child(child(child(bx, "AccountingCustomerParty")!, "Party")!, "PartyName")!, "Name"),
    ).toBe("</Name><Evil/> & spol.");
    expect(zip.get(`${b.number}.isdoc`)!.toString("utf8")).not.toContain("<Evil/>");
    expect(textOf(parseXml(zip.get(`${pro.number}.isdoc`)!.toString("utf8")), "DocumentType")).toBe(
      "4",
    );

    const audit = await auditOf(u.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]!.summary).toBe(
      `Export ISDOC ${Y}-07-01 – ${Y}-07-30: 3 vydaných, 1 přijatých faktur`,
    );
  });

  it("jen vydané, jen přijaté; DUZP místo data vystavení", async () => {
    const u = await accountant();
    const a = await issued(u, [FIRST], { issueDate: `${Y}-01-31`, taxableDate: `${Y}-02-02` });
    const b = await issued(u, [FIRST], { issueDate: `${Y}-02-01`, taxableDate: `${Y}-01-29` });
    const r = await received(u, { issueDate: `${Y}-01-15`, taxableDate: null }, [
      { net: 1_000, rate: 2100, vat: 210 },
    ]);
    const march = { from: `${Y}-01-01`, to: `${Y}-01-31` };
    const names = async (o: Parameters<typeof buildIsdocExport>[2]) =>
      [...unzip(await collect((await buildIsdocExport(u.ctx, deps(), o)).chunks)).keys()].sort();
    expect(await names({ ...march, kind: "issued" })).toEqual([`${a.number}.isdoc`]);
    expect(await names({ ...march, kind: "issued", basis: "duzp" })).toEqual([`${b.number}.isdoc`]);
    expect(await names({ ...march, kind: "received" })).toEqual([
      `prijate/Dodavatel_Material_s.r.o.-${r.number}.isdoc`,
    ]);
    // přijatá bez DUZP se v režimu DUZP zařadí podle data vystavení
    expect(await names({ ...march, kind: "received", basis: "duzp" })).toEqual([
      `prijate/Dodavatel_Material_s.r.o.-${r.number}.isdoc`,
    ]);
  });

  it("oprávnění, prázdné a obrácené období", async () => {
    const reader = await makeUser(app.db, [["fakturace.read", "all"]]);
    await expect(
      buildIsdocExport(reader.ctx, deps(), { from: `${Y}-07-01`, to: `${Y}-07-30` }),
    ).rejects.toThrow(PermissionError);
    const u = await accountant();
    await expect(
      buildIsdocExport(u.ctx, deps(), { from: "2001-01-01", to: "2001-01-31" }),
    ).rejects.toThrow(/nejsou žádné/);
    await expect(
      buildIsdocExport(u.ctx, deps(), { from: `${Y}-07-30`, to: `${Y}-07-01` }),
    ).rejects.toThrow(/před začátkem/);
    expect(await auditOf(reader.id)).toHaveLength(0);
  });

  it("rozsah „jen moje“: vydané i přijaté jen vlastní", async () => {
    const mine = await makeUser(app.db, [
      ["fakturace.read", "own"],
      ["fakturace.write", "own"],
      ["fakturace.export", "all"],
      ["zakazky.read", "all"],
      ["kontakty.read", "all"],
    ]);
    const other = await accountant();
    const a = await issued(mine, [FIRST], { issueDate: `${Y}-02-10` });
    const b = await issued(other, [FIRST], { issueDate: `${Y}-02-10` });
    const ra = await received(mine, { issueDate: `${Y}-02-11` }, [
      { net: 1_000, rate: 2100, vat: 210 },
    ]);
    const rb = await received(other, { issueDate: `${Y}-02-11` }, [
      { net: 1_000, rate: 2100, vat: 210 },
    ]);
    const period = { from: `${Y}-02-01`, to: `${Y}-02-28` };
    const zip = unzip(await collect((await buildIsdocExport(mine.ctx, deps(), period)).chunks));
    const names = [...zip.keys()];
    expect(names).toContain(`${a.number}.isdoc`);
    expect(names.some((n) => n.includes(ra.number))).toBe(true);
    expect(names).not.toContain(`${b.number}.isdoc`);
    expect(names.some((n) => n.includes(rb.number))).toBe(false);

    const vat = await buildVatReport(mine.ctx, deps(), { ...period, format: "csv" });
    expect([vat.issuedCount, vat.receivedCount]).toEqual([1, 1]);
    const csv = (await collect(vat.chunks)).toString("utf8");
    expect(csv).toContain(a.number);
    expect(csv).not.toContain(b.number);
    expect(csv).not.toContain(rb.number);
  });
});

describe("podklady DPH", () => {
  /** Sada dokladů v zadaném měsíci (`rok-04`); každý test má svůj měsíc. */
  async function dataset(month: string) {
    const u = await accountant();
    const i1 = await issued(u, [FIRST, SECOND], {
      issueDate: `${month}-10`,
      customer: { name: '=HYPERLINK("http://x")' },
    });
    const i2 = await issued(u, [{ ...FIRST, qty: "3", price: 1_000_00 }], {
      issueDate: `${month}-11`,
      jobExtra: { vatMode: "reverse_charge" },
    });
    const pro = await issued(u, [SECOND], { kind: "proforma", issueDate: `${month}-12` });
    const r1 = await received(u, { issueDate: `${month}-12` }, [
      { net: 100_000, rate: 2100, vat: 21_000 },
      { net: 50_000, rate: 1200, vat: 6_000 },
    ]);
    const r2 = await received(u, { issueDate: `${month}-13`, vatMode: "reverse_charge" }, [
      { net: 70_000, rate: 2100, vat: 0 },
    ]);
    await received(u, { issueDate: `${month}-14`, state: "pending" }, [
      { net: 9_999, rate: 2100, vat: 2_100 },
    ]);
    return { u, i1, i2, pro, r1, r2 };
  }

  it("CSV: řádky po sazbách, PDP zvlášť, zálohová faktura mimo, souhrn pod tabulkou, vzorec zneškodněn, audit", async () => {
    const { u, i1, i2, pro, r1, r2 } = await dataset(`${Y}-04`);
    const out = await buildVatReport(u.ctx, deps(), {
      from: `${Y}-04-01`,
      to: `${Y}-04-17`,
      format: "csv",
    });
    expect(out.filename).toBe(`dph-podklady-${Y}-04.csv`);
    expect(out.mime).toContain("text/csv");
    expect([out.issuedCount, out.receivedCount]).toEqual([2, 2]);
    const text = (await collect(out.chunks)).toString("utf8");
    expect(text.startsWith("﻿Evidence;Číslo dokladu;")).toBe(true);
    const rows = text.split("\r\n").map((l) => l.split(";"));
    const find = (n: string, rate: string) => rows.find((r) => r[1] === n && r[11] === rate)!;
    // vydaná i1: 2 × 1 000 při 21 % (420), 500 při 12 % (60)
    expect(find(i1.number, "21 %").slice(12, 15)).toEqual(["2000,00", "420,00", "2420,00"]);
    expect(find(i1.number, "12 %").slice(12, 15)).toEqual(["500,00", "60,00", "560,00"]);
    expect(find(i1.number, "21 %")[3]).toBe(`10. 4. ${Y}`);
    expect(find(i2.number, "přenesená daňová povinnost").slice(12, 15)).toEqual([
      "3000,00",
      "0,00",
      "3000,00",
    ]);
    expect(find(i2.number, "přenesená daňová povinnost")[9]).toBe("přenesená daňová povinnost");
    expect(find(r1.number, "21 %")[0]).toBe("Přijaté");
    expect(find(r2.number, "přenesená daňová povinnost").slice(12, 15)).toEqual([
      "700,00",
      "0,00",
      "700,00",
    ]);
    // zálohová a nevyřízená přijatá nejsou v podkladech
    expect(text).not.toContain(pro.number);
    // vzorec v názvu odběratele
    expect(text).toContain(`"'=HYPERLINK(""http://x"")"`);
    // souhrn
    const sum = (src: string, label: string) =>
      rows.find((r) => r[0] === src && r[11] === label)!.slice(12, 15);
    expect(sum("Souhrn – vydané", "21 %")).toEqual(["2000,00", "420,00", "2420,00"]);
    expect(sum("Souhrn – vydané", "12 %")).toEqual(["500,00", "60,00", "560,00"]);
    expect(sum("Souhrn – vydané", "přenesená daňová povinnost")).toEqual([
      "3000,00",
      "0,00",
      "3000,00",
    ]);
    expect(sum("Souhrn – vydané", "Celkem")).toEqual(["5500,00", "480,00", "5980,00"]);
    expect(sum("Souhrn – přijaté", "Celkem")).toEqual(["2200,00", "270,00", "2470,00"]);
    expect(rows.find((r) => r[0] === "Souhrn – rozdíl DPH")![13]).toBe("210,00");
    expect(rows.find((r) => r[0] === "Souhrn – vydané" && r[11] === "Celkem")![1]).toBe("počet 2");
    const a = await auditOf(u.id);
    expect(a).toHaveLength(1);
    expect(a[0]!.summary).toBe(
      `Podklady DPH (CSV) ${Y}-04-01 – ${Y}-04-17: 2 vydaných, 2 přijatých faktur`,
    );
  });

  it("CSV s čárkou: desetinná tečka, data ISO", async () => {
    const { u, i1 } = await dataset(`${Y}-12`);
    const out = await buildVatReport(u.ctx, deps(), {
      from: `${Y}-12-01`,
      to: `${Y}-12-31`,
      format: "csv",
      csv: { delimiter: "," },
    });
    const text = (await collect(out.chunks)).toString("utf8");
    expect(text).toContain(`Vydané,${i1.number},průběžná,${Y}-12-10,${Y}-12-10,`);
    expect(text).toContain(",21 %,2000.00,420.00,2420.00");
    expect(text).not.toMatch(/\d;\d/);
  });

  it("XLSX: tři listy, částky jako money, data jako data, součty; vydané seřazené před přijatými", async () => {
    const { u, i1, r1 } = await dataset(`${Y}-06`);
    const out = await buildVatReport(u.ctx, deps(), {
      from: `${Y}-06-01`,
      to: `${Y}-06-30`,
      format: "xlsx",
    });
    expect(out.filename).toBe(`dph-podklady-${Y}-06.xlsx`);
    const x = unzip(await collect(out.chunks));
    expect(x.get("xl/workbook.xml")!.toString()).toMatch(/Souhrn.*Vydané.*Přijaté/s);
    const sheet = (n: number) => x.get(`xl/worksheets/sheet${n}.xml`)!.toString();
    // vydané: číslo jako text, DUZP (06-10) jako datum, částky jako peníze v korunách
    expect(sheet(2)).toContain(
      `<c r="A3" t="inlineStr"><is><t xml:space="preserve">${i1.number}</t>`,
    );
    expect(sheet(2)).toContain(`<c r="C3" s="3"><v>${excelDate(`${Y}-06-10`)}</v></c>`);
    expect(sheet(2)).toContain('<c r="L3" s="2"><v>2000</v></c>');
    expect(sheet(2)).toContain('<c r="M3" s="2"><v>420</v></c>');
    expect(sheet(3)).toContain(r1.number);
    // řádek součtů vydaných: základ 2 500 + 3 000, DPH 480
    expect(sheet(2)).toContain('s="7"><v>5500</v>');
    expect(sheet(2)).toContain('s="7"><v>480</v>');
    expect(sheet(1)).toContain("Rozdíl DPH");
    expect(sheet(1)).toContain("<v>210</v>");
  });

  it("DUZP vs. datum vystavení vybírají jiné doklady; zálohová faktura se vynechá vždy", async () => {
    const u = await accountant();
    const a = await issued(u, [FIRST], { issueDate: `${Y}-12-19`, taxableDate: `${Y}-12-21` });
    const b = await issued(u, [FIRST], { issueDate: `${Y}-12-20`, taxableDate: `${Y}-12-18` });
    await issued(u, [FIRST], { kind: "proforma", issueDate: `${Y}-12-16` });
    const june = { from: `${Y}-12-15`, to: `${Y}-12-19`, format: "csv" as const };
    const text = async (basis?: "issue" | "duzp") =>
      (
        await collect(
          (await buildVatReport(u.ctx, deps(), { ...june, ...(basis ? { basis } : {}) })).chunks,
        )
      ).toString("utf8");
    const byDuzp = await text(); // výchozí je DUZP
    expect(byDuzp).toContain(b.number);
    expect(byDuzp).not.toContain(a.number);
    const byIssue = await text("issue");
    expect(byIssue).toContain(a.number);
    expect(byIssue).not.toContain(b.number);
    // období jen se zálohovou fakturou: podklady DPH nevzniknou (zálohová není daňový doklad)
    const only = await accountant();
    await issued(only, [FIRST], { kind: "proforma", issueDate: `${Y}-12-28` });
    await expect(
      buildVatReport(only.ctx, deps(), { from: `${Y}-12-25`, to: `${Y}-12-31`, format: "csv" }),
    ).rejects.toThrow(/nejsou žádné/);
  });

  it("dobropis se v souhrnu odečte od původní faktury", async () => {
    const u = await accountant();
    const orig = await issued(u, [FIRST], { issueDate: `${Y}-04-20` });
    const { id } = await createCreditNote.handler(
      u.ctx,
      createCreditNote.input.parse({ invoiceId: orig.id }),
      deps(),
    );
    await issue.handler(u.ctx, issue.input.parse({ id, issueDate: `${Y}-04-25` }), deps());
    const out = await buildVatReport(u.ctx, deps(), {
      from: `${Y}-04-18`,
      to: `${Y}-04-30`,
      format: "csv",
    });
    const rows = (await collect(out.chunks))
      .toString("utf8")
      .split("\r\n")
      .map((l) => l.split(";"));
    const total = rows.find((r) => r[0] === "Souhrn – vydané" && r[11] === "Celkem")!;
    expect(total.slice(12, 15)).toEqual(["0,00", "0,00", "0,00"]);
    expect(total[1]).toBe("počet 2");
    expect(rows.some((r) => r[2] === "dobropis" && r[12] === "-2000,00")).toBe(true);
  });

  it("oprávnění: bez fakturace.export dostane PermissionError a nic se nezapíše", async () => {
    const reader = await makeUser(app.db, [["fakturace.read", "all"]]);
    await expect(
      buildVatReport(reader.ctx, deps(), { from: `${Y}-04-01`, to: `${Y}-04-17`, format: "xlsx" }),
    ).rejects.toThrow(PermissionError);
    expect(await auditOf(reader.id)).toHaveLength(0);
    const u = await accountant();
    await expect(
      buildVatReport(u.ctx, deps(), { from: "2001-01-01", to: "2001-01-31", format: "csv" }),
    ).rejects.toThrow(/nejsou žádné/);
  });
});

describe("balík pro účetní s ISDOC a podklady DPH", () => {
  it("volitelně přibalí isdoc/ i dph-podklady; bez voleb zůstává chování beze změny", async () => {
    const u = await accountant();
    const a = await issued(u, [FIRST, SECOND], { issueDate: `${Y}-11-10` });
    const pdp = await issued(u, [FIRST], {
      issueDate: `${Y}-11-11`,
      jobExtra: { vatMode: "reverse_charge" },
    });
    const r = await received(u, { issueDate: `${Y}-11-12`, taxableDate: `${Y}-11-12` }, [
      { net: 100_000, rate: 2100, vat: 21_000 },
    ]);
    const period = { from: `${Y}-11-01`, to: `${Y}-11-30`, receivedFiles: false } as const;

    const plain = unzip(
      await collect(
        (await buildAccountingPackage(u.ctx, deps(), { ...period, format: "xlsx" })).chunks,
      ),
    );
    expect([...plain.keys()].some((n) => n.startsWith("isdoc/") || n.startsWith("dph-"))).toBe(
      false,
    );

    const full = unzip(
      await collect(
        (
          await buildAccountingPackage(u.ctx, deps(), {
            ...period,
            format: "xlsx",
            isdoc: true,
            vatReport: true,
          })
        ).chunks,
      ),
    );
    const names = [...full.keys()];
    expect(names).toContain("souhrn.xlsx");
    expect(names).toContain("dph-podklady.xlsx");
    expect(names).toContain(`vydane/${a.number}.pdf`);
    expect(names).toContain(`isdoc/${a.number}.isdoc`);
    expect(names).toContain(`isdoc/${pdp.number}.isdoc`);
    expect(names).toContain(`isdoc/prijate/Dodavatel_Material_s.r.o.-${r.number}.isdoc`);
    for (const n of names.filter((x) => x.endsWith(".isdoc"))) {
      const root = parseXml(full.get(n)!.toString("utf8"));
      checkIsdocStructure(root);
      checkIsdocTotals(root);
    }
    // dph-podklady.xlsx je vnořený sešit s vydanými i přijatými
    const inner = unzip(full.get("dph-podklady.xlsx")!);
    expect(inner.get("xl/workbook.xml")!.toString()).toMatch(/Souhrn.*Vydané.*Přijaté/s);
    expect(inner.get("xl/worksheets/sheet3.xml")!.toString()).toContain(r.number);
    // poznámky chybějí (všechno se povedlo)
    expect(names).not.toContain("poznamky.txt");

    // CSV varianta s čárkou: souhrn i podklady DPH mají tečku a ISO data
    const csvZip = unzip(
      await collect(
        (
          await buildAccountingPackage(u.ctx, deps(), {
            ...period,
            format: "csv",
            vatReport: true,
            csv: { delimiter: "," },
          })
        ).chunks,
      ),
    );
    expect([...csvZip.keys()].sort()).toEqual(
      [
        "dph-podklady.csv",
        "prijate-faktury.csv",
        "vydane-faktury.csv",
        `vydane/${a.number}.pdf`,
        `vydane/${pdp.number}.pdf`,
      ].sort(),
    );
    const issuedCsv = csvZip.get("vydane-faktury.csv")!.toString();
    expect(issuedCsv.split("\r\n")[0]).toContain("Číslo,Druh,Vystaveno,DUZP");
    expect(issuedCsv).toContain(`${a.number},průběžná,${Y}-11-10,${Y}-11-10`);
    expect(issuedCsv).toContain(",2500.00,480.00,2980.00"); // celý doklad: 2 000 při 21 % a 500 při 12 %
    expect(issuedCsv).toContain(",2000.00,0.00,2000.00"); // doklad v přenesené daňové povinnosti
    expect(csvZip.get("dph-podklady.csv")!.toString()).toContain(",21 %,2000.00,420.00,2420.00");
  });

  it("ISDOC a podklady DPH v balíku vyžadují stejná oprávnění jako balík", async () => {
    const reader = await makeUser(app.db, [["fakturace.read", "all"]]);
    await expect(
      buildAccountingPackage(reader.ctx, deps(), {
        from: `${Y}-11-01`,
        to: `${Y}-11-30`,
        format: "xlsx",
        isdoc: true,
        vatReport: true,
      }),
    ).rejects.toThrow(PermissionError);
  });
});
