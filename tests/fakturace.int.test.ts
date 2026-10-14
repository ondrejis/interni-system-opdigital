import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLookup, ensurePipeline, getPipeline } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  deleteRecord,
  queryRecords,
  registerEntityPolicies,
  resolveEntity,
  updateRecord,
  type EntityRegistry,
} from "@rebar/core/entities";
import type { ModuleSeed } from "@rebar/core";
import type { ModuleDeps, ModuleJobDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { NotFoundError, PermissionError } from "@rebar/core/rbac";
import { companySetting } from "@rebar/core/settings";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { addDaysIso, todayIso } from "@rebar/core/time";
import { manifest } from "@rebar/fakturace";
import {
  addPayment,
  createCreditNote,
  createFromJob,
  exportInvoices,
  getInvoice,
  invoiceEntity,
  issue,
  jobSummary,
  notifyInvoicesDueSoon,
  notifyReceivedOverdue,
  overdueJob,
  removePayment,
  renderInvoicePdf,
  saveDraft,
} from "@rebar/fakturace/server";
import { invoice, receivedInvoice } from "@rebar/fakturace/schema";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import {
  budgetItem,
  budgetObject,
  budgetSection,
  budgetVersion,
  job,
  jobChange,
} from "@rebar/zakazky/schema";
import { jobEntity } from "@rebar/zakazky/server";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
let payer = true;
const supplier = {
  name: "Stavby Test s.r.o.",
  ico: "12345678",
  dic: "CZ12345678",
  street: "Hlavní 1",
  city: "Plzeň",
  zip: "30100",
  email: null,
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
        def.key === companySetting.key
          ? { ...supplier, dic: payer ? supplier.dic : null }
          : def.default,
    },
  }) as unknown as ModuleDeps;

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, jobEntity, invoiceEntity]);
  registerEntityPolicies(registry);
  for (const m of [zakazkyManifest, manifest]) {
    const seed = m.seed as ModuleSeed;
    for (const p of seed.pipelines ?? []) await ensurePipeline(app.db, p);
    for (const l of seed.lookups ?? []) await ensureLookup(app.db, l);
    await ensureSeries(app.db, seed.series ?? []);
  }
  // sazby DPH z výchozího seedu jádra mohou v testovací DB chybět; výchozí 21 % se použije samo
});

const accountant = () =>
  makeUser(app.db, [
    ["fakturace.read", "all"],
    ["fakturace.write", "all"],
    ["fakturace.export", "all"],
    ["zakazky.read", "all"],
    ["kontakty.read", "all"],
  ]);

async function newJob(valueMinor = 1_000_000_00) {
  const ico = String(10_000_000 + Math.floor(Math.random() * 89_999_999));
  const [c] = await app.db
    .insert(company)
    .values({
      name: `Odběratel ${randomBytes(3).toString("hex")}`,
      ico,
      dic: `CZ${ico}`,
    })
    .returning();
  const stage = (await getPipeline(app.db, "job", "default"))!.stages[0]!;
  const [j] = await app.db
    .insert(job)
    .values({
      number: `F-${randomBytes(4).toString("hex")}`,
      title: "Rekonstrukce",
      companyId: c!.id,
      stageId: stage.id,
      valueMinor,
    })
    .returning();
  return { ...j!, ico };
}

const fromJob = (
  u: Awaited<ReturnType<typeof accountant>>,
  jobId: string,
  kind: "proforma" | "partial" | "final",
  percent?: number,
) =>
  createFromJob.handler(
    u.ctx,
    createFromJob.input.parse({ jobId, kind, ...(percent ? { percent } : {}) }),
    deps(),
  );

describe("faktura od konceptu po vystavení", () => {
  it("záloha 30 % se spočítá z ceny zakázky a koncept nemá číslo; vystavením dostane číslo z řady a údaje se zamknou", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob(1_000_000_00);
    const { id } = await fromJob(u, j.id, "proforma", 30);
    let inv = await getInvoice.handler(u.ctx, { id }, deps());
    expect(inv).toMatchObject({
      number: null,
      state: "draft",
      kind: "proforma",
      netMinor: 300_000_00,
      vatMinor: 63_000_00,
      grossMinor: 363_000_00,
    });
    expect(inv.vatPayer).toBe(true);

    const { number } = await issue.handler(u.ctx, issue.input.parse({ id }), deps());
    expect(number).toMatch(/^ZF-\d{4}-\d{4}$/);
    inv = await getInvoice.handler(u.ctx, { id }, deps());
    expect(inv).toMatchObject({
      state: "issued",
      number,
      issueDate: todayIso(),
      dueDate: addDaysIso(todayIso(), 14),
    });
    const [row] = await app.db.select().from(invoice).where(eq(invoice.id, id));
    expect(row!.supplier?.name).toBe(supplier.name);
    expect(row!.customer?.ico).toBe(j.ico);
    expect(row!.variableSymbol).toBe(number.replace(/\D/g, ""));

    await expect(
      saveDraft.handler(u.ctx, saveDraft.input.parse({ id, lines: [] }), deps()),
    ).rejects.toThrow(/už nejde měnit/);
    await expect(issue.handler(u.ctx, issue.input.parse({ id }), deps())).rejects.toThrow(
      /už je vystavený/,
    );
    const E = await resolveEntity(app.db, invoiceEntity);
    await expect(updateRecord(u.ctx, registry, E, id, { dueDate: "2030-01-01" })).rejects.toThrow(
      /nejde měnit/,
    );
    await updateRecord(u.ctx, registry, E, id, { note: "Poznámku lze měnit" });
    await expect(deleteRecord(u.ctx, E, id)).rejects.toThrow(/jen stornovat dobropisem/);
  });

  it("souběžné vystavení dává unikátní čísla bez děr", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob();
    const ids = await Promise.all(
      [1, 2, 3, 4].map(async () => (await fromJob(u, j.id, "partial", 10)).id),
    );
    const numbers = (
      await Promise.all(ids.map((id) => issue.handler(u.ctx, issue.input.parse({ id }), deps())))
    ).map((r) => Number(r.number.split("-").pop()));
    expect(new Set(numbers).size).toBe(4);
    const sorted = [...numbers].sort((a, b) => a - b);
    // jiný soubor testů může ve stejné řadě vystavovat souběžně, proto jen: čísla jsou rostoucí a unikátní
    // (že řada nemá díry, hlídají testy číslování v jádru)
    expect(sorted[3]! - sorted[0]!).toBeGreaterThanOrEqual(3);
  });

  it("neplátce DPH: faktura bez DPH; koncept bez položek nebo se zápornou částkou nejde vystavit", async () => {
    payer = false;
    const u = await accountant();
    const j = await newJob(100_000_00);
    const { id } = await fromJob(u, j.id, "partial", 50);
    const inv = await getInvoice.handler(u.ctx, { id }, deps());
    expect(inv).toMatchObject({ vatPayer: false, vatMinor: 0, grossMinor: 50_000_00 });
    await saveDraft.handler(
      u.ctx,
      saveDraft.input.parse({ id, companyId: inv.companyId, lines: [] }),
      deps(),
    );
    await expect(issue.handler(u.ctx, issue.input.parse({ id }), deps())).rejects.toThrow(
      /žádné položky/,
    );
    await saveDraft.handler(
      u.ctx,
      saveDraft.input.parse({
        id,
        companyId: inv.companyId,
        lines: [
          { description: "Záporná", quantity: "1", unit: "ks", unitPriceMinor: -100, vatRateBp: 0 },
        ],
      }),
      deps(),
    );
    await expect(issue.handler(u.ctx, issue.input.parse({ id }), deps())).rejects.toThrow(
      /musí být kladná/,
    );
    payer = true;
  });
});

describe("úhrady", () => {
  it("částečná a plná úhrada mění stav, přeplacení se odmítne, odebrání úhrady vrací stav", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob(100_000_00);
    const { id } = await fromJob(u, j.id, "partial", 100);
    await expect(
      addPayment.handler(
        u.ctx,
        addPayment.input.parse({ invoiceId: id, date: todayIso(), amountMinor: 100 }),
        deps(),
      ),
    ).rejects.toThrow(/ještě není vystavený/);
    await issue.handler(u.ctx, issue.input.parse({ id }), deps());
    const p1 = await addPayment.handler(
      u.ctx,
      addPayment.input.parse({ invoiceId: id, date: todayIso(), amountMinor: 50_000_00 }),
      deps(),
    );
    expect(p1.state).toBe("partial");
    await expect(
      addPayment.handler(
        u.ctx,
        addPayment.input.parse({ invoiceId: id, date: todayIso(), amountMinor: 80_000_00 }),
        deps(),
      ),
    ).rejects.toThrow(/vyšší než zbývající/);
    expect(
      (
        await addPayment.handler(
          u.ctx,
          addPayment.input.parse({ invoiceId: id, date: todayIso(), amountMinor: 71_000_00 }),
          deps(),
        )
      ).state,
    ).toBe("paid");
    await removePayment.handler(u.ctx, { id: p1.id }, deps());
    const inv = await getInvoice.handler(u.ctx, { id }, deps());
    expect(inv).toMatchObject({ state: "partial", paidMinor: 71_000_00 });
    const s = await jobSummary.handler(u.ctx, { jobId: j.id }, deps());
    expect(s).toMatchObject({
      contractMinor: 100_000_00,
      invoicedNetMinor: 100_000_00,
      outstandingMinor: 121_000_00 - 71_000_00,
    });
  });
});

describe("vyúčtování a dobropis", () => {
  it("konečná faktura skládá položky z rozpočtu a schválených víceprací a odečítá vystavené zálohy", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob(500_000_00);
    const [v] = await app.db
      .insert(budgetVersion)
      .values({ jobId: j.id, kind: "realization", number: 1, status: "locked" })
      .returning();
    const [o] = await app.db
      .insert(budgetObject)
      .values({ versionId: v!.id, title: "Celá zakázka", isDefault: true })
      .returning();
    const [sec] = await app.db
      .insert(budgetSection)
      .values({ versionId: v!.id, objectId: o!.id, title: "Hlavní" })
      .returning();
    await app.db.insert(budgetItem).values([
      {
        versionId: v!.id,
        sectionId: sec!.id,
        position: 0,
        title: "Obklady",
        unit: "m2",
        quantity: "10",
        unitPriceMinor: 30_000_00,
      },
      {
        versionId: v!.id,
        sectionId: sec!.id,
        position: 1,
        title: "Montáž",
        quantity: "1",
        unitPriceMinor: 200_000_00,
      },
    ]);
    await app.db.insert(jobChange).values({
      jobId: j.id,
      number: 1,
      title: "Podlahové topení",
      amountMinor: 50_000_00,
      status: "approved",
    });
    await app.db.insert(jobChange).values({
      jobId: j.id,
      number: 2,
      title: "Nepotvrzeno",
      amountMinor: 9_999_00,
      status: "sent",
    });

    const adv = await fromJob(u, j.id, "proforma", 40);
    // nevystavená záloha se neodečítá
    let fin = await getInvoice.handler(u.ctx, { id: (await fromJob(u, j.id, "final")).id }, deps());
    expect(fin.lines.map((l) => l.description)).toEqual([
      "Obklady",
      "Montáž",
      "VP-1 Podlahové topení",
    ]);
    expect(fin.netMinor).toBe(300_000_00 + 200_000_00 + 50_000_00);

    await issue.handler(u.ctx, issue.input.parse({ id: adv.id }), deps());
    // vystavená, ale nezaplacená záloha se také neodečítá, odečtou se až zaplacené zálohy
    fin = await getInvoice.handler(u.ctx, { id: (await fromJob(u, j.id, "final")).id }, deps());
    expect(fin.lines.some((l) => l.description.startsWith("Odpočet zálohy"))).toBe(false);
    const advInv = await getInvoice.handler(u.ctx, { id: adv.id }, deps());
    await addPayment.handler(
      u.ctx,
      addPayment.input.parse({
        invoiceId: adv.id,
        date: todayIso(),
        amountMinor: advInv.grossMinor,
      }),
      deps(),
    );
    fin = await getInvoice.handler(u.ctx, { id: (await fromJob(u, j.id, "final")).id }, deps());
    const deduction = fin.lines.find((l) => l.description.startsWith("Odpočet zálohy"));
    expect(deduction?.unitPriceMinor).toBe(-advInv.netMinor);
    expect(fin.netMinor).toBe(550_000_00 - advInv.netMinor);
  });

  it("dobropis storno celé faktury: koncept se zápornými položkami, po vystavení je původní doklad stornovaný", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob(100_000_00);
    const { id } = await fromJob(u, j.id, "partial", 100);
    await expect(createCreditNote.handler(u.ctx, { invoiceId: id }, deps())).rejects.toThrow(
      /Koncept stačí smazat/,
    );
    const { number } = await issue.handler(u.ctx, issue.input.parse({ id }), deps());
    const cn = await createCreditNote.handler(u.ctx, { invoiceId: id }, deps());
    const draft = await getInvoice.handler(u.ctx, { id: cn.id }, deps());
    expect(draft).toMatchObject({ kind: "credit_note", state: "draft", grossMinor: -121_000_00 });
    const issued = await issue.handler(u.ctx, issue.input.parse({ id: cn.id }), deps());
    expect(issued.number).toMatch(/^DB-/);
    const original = await getInvoice.handler(u.ctx, { id }, deps());
    expect(original.state).toBe("credited");
    await expect(createCreditNote.handler(u.ctx, { invoiceId: id }, deps())).rejects.toThrow(
      /už je stornovaný/,
    );
    await expect(
      addPayment.handler(
        u.ctx,
        addPayment.input.parse({ invoiceId: id, date: todayIso(), amountMinor: 100 }),
        deps(),
      ),
    ).rejects.toThrow(/stornovaný/);
    void number;
  });
});

describe("PDF, export, po splatnosti, oprávnění", () => {
  it("PDF vystavené faktury je platný dokument, koncept má vodoznak; cizí záznam se nevydá", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob();
    const { id } = await fromJob(u, j.id, "proforma", 20);
    const draft = await renderInvoicePdf(u.ctx, deps(), id);
    expect(draft.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(draft.filename).toBe("navrh.pdf");
    const { number } = await issue.handler(u.ctx, issue.input.parse({ id }), deps());
    const pdf = await renderInvoicePdf(u.ctx, deps(), id);
    expect(pdf.filename).toBe(`${number}.pdf`);
    expect(pdf.buffer.length).toBeGreaterThan(3000);
    const nobody = await makeUser(app.db, [["fakturace.read", "own"]]);
    await expect(renderInvoicePdf(nobody.ctx, deps(), id)).rejects.toThrow(NotFoundError);
  });

  it("export CSV obsahuje jen vystavené doklady za období, vyžaduje oprávnění, prázdné období hlásí srozumitelně", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob();
    const { id } = await fromJob(u, j.id, "partial", 10);
    const { number } = await issue.handler(u.ctx, issue.input.parse({ id }), deps());
    const draft = await fromJob(u, j.id, "partial", 5);
    const out = await exportInvoices.handler(
      u.ctx,
      exportInvoices.input.parse({ adapter: "csv", from: todayIso(), to: todayIso() }),
      deps(),
    );
    expect(out.content.startsWith("﻿")).toBe(true);
    expect(out.content).toContain(number);
    expect(out.content).not.toContain("NÁVRH");
    expect(out.filename).toMatch(/^faktury-\d{4}-\d{2}-\d{2}\.csv$/);
    void draft;
    await expect(
      exportInvoices.handler(
        u.ctx,
        exportInvoices.input.parse({ adapter: "csv", from: "2001-01-01", to: "2001-01-31" }),
        deps(),
      ),
    ).rejects.toThrow(/nejsou žádné vystavené/);
    await expect(
      exportInvoices.handler(
        u.ctx,
        exportInvoices.input.parse({ adapter: "xyz", from: todayIso(), to: todayIso() }),
        deps(),
      ),
    ).rejects.toThrow(/Neznámý formát/);
  });

  it("denní úloha označí po splatnosti a upozorní fakturanty; uhrazená faktura se neoznačí", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob();
    const { id } = await fromJob(u, j.id, "partial", 10);
    await issue.handler(
      u.ctx,
      issue.input.parse({
        id,
        issueDate: addDaysIso(todayIso(), -30),
        dueDate: addDaysIso(todayIso(), -5),
      }),
      deps(),
    );
    const paid = await fromJob(u, j.id, "partial", 10);
    await issue.handler(
      u.ctx,
      issue.input.parse({
        id: paid.id,
        issueDate: addDaysIso(todayIso(), -30),
        dueDate: addDaysIso(todayIso(), -5),
      }),
      deps(),
    );
    await addPayment.handler(
      u.ctx,
      addPayment.input.parse({ invoiceId: paid.id, date: todayIso(), amountMinor: 121_000_00 }),
      deps(),
    );
    // issue už označil po splatnosti; pro test úlohy to vynulujeme u neuhrazené
    await app.db.update(invoice).set({ overdue: false }).where(eq(invoice.id, id));
    await overdueJob.handler(
      {
        db: app.db,
        registry,
        queue: { send: async () => null },
        settings: deps().settings,
        baseURL: "http://localhost",
      } as unknown as ModuleJobDeps,
      {},
      {} as never,
    );
    expect((await getInvoice.handler(u.ctx, { id }, deps())).overdue).toBe(true);
    expect((await getInvoice.handler(u.ctx, { id: paid.id }, deps())).overdue).toBe(false);
    const notes = await app.db
      .select()
      .from(schema.notification)
      .where(eq(schema.notification.userId, u.id));
    expect(notes.some((n) => n.kind === "invoice.overdue" && n.entityId === id)).toBe(true);
    const mine = notes.find((n) => n.kind === "invoice.overdue" && n.entityId === id)!;
    expect(mine.title).toMatch(/^Faktura FV-\d{4}-\d{4} je po splatnosti$/);
    expect(mine.body).toMatch(/Zbývá uhradit 12\d\s000\s/);
    expect(mine.url).toBe(`/fakturace/${id}`);
    expect(notes.some((n) => n.kind === "invoice.overdue" && n.entityId === paid.id)).toBe(false);

    // jednou za fakturu: i po novém označení se upozornění nezdvojí
    await app.db.update(invoice).set({ overdue: false }).where(eq(invoice.id, id));
    await overdueJob.handler(
      {
        db: app.db,
        registry,
        queue: { send: async () => null },
        settings: deps().settings,
        baseURL: "http://localhost",
      } as unknown as ModuleJobDeps,
      {},
      {} as never,
    );
    const again = await app.db
      .select()
      .from(schema.notification)
      .where(
        and(
          eq(schema.notification.userId, u.id),
          eq(schema.notification.kind, "invoice.overdue"),
          eq(schema.notification.entityId, id),
        ),
      );
    expect(again).toHaveLength(1);
  });

  it("bez oprávnění faktury nevidí ani nevystaví", async () => {
    const u = await accountant();
    const j = await newJob();
    const { id } = await fromJob(u, j.id, "partial", 10);
    const nobody = await makeUser(app.db, [["zakazky.read", "all"]]);
    // záznam bez oprávnění se tváří jako neexistující (oprávnění příkazu navíc hlídá vstupní bod aplikace)
    await expect(getInvoice.handler(nobody.ctx, { id }, deps())).rejects.toThrow(NotFoundError);
    const readOnly = await makeUser(app.db, [
      ["fakturace.read", "all"],
      ["zakazky.read", "all"],
    ]);
    await expect(issue.handler(readOnly.ctx, issue.input.parse({ id }), deps())).rejects.toThrow(
      PermissionError,
    );
    const E = await resolveEntity(app.db, invoiceEntity);
    expect(
      (await queryRecords(nobody.ctx, registry, E, {}).catch((e) => e)) instanceof PermissionError,
    ).toBe(true);
  });
});

const notesOf = (userId: string, kind: string, entityId: string) =>
  app.db
    .select()
    .from(schema.notification)
    .where(
      and(
        eq(schema.notification.userId, userId),
        eq(schema.notification.kind, kind),
        eq(schema.notification.entityId, entityId),
      ),
    );

describe("upozornění: faktura zaplacena", () => {
  it("poslední úhrada upozorní zakladatele a vedoucího zakázky s právem číst fakturu; ten, kdo úhradu zapsal, nic nedostane", async () => {
    payer = true;
    const creator = await accountant();
    const bookkeeper = await accountant();
    const manager = await makeUser(app.db, [
      ["fakturace.read", "all"],
      ["zakazky.read", "all"],
    ]);
    const outsider = await makeUser(app.db, [["zakazky.read", "all"]]);
    const j = await newJob();
    await app.db.update(job).set({ managerId: manager.id }).where(eq(job.id, j.id));
    const { id } = await fromJob(creator, j.id, "partial", 10);
    await issue.handler(creator.ctx, issue.input.parse({ id }), deps());

    // částečná úhrada: ještě není co oznamovat
    await addPayment.handler(
      bookkeeper.ctx,
      addPayment.input.parse({ invoiceId: id, date: todayIso(), amountMinor: 50_000_00 }),
      deps(),
    );
    expect(await notesOf(creator.id, "invoice.paid", id)).toHaveLength(0);

    await addPayment.handler(
      bookkeeper.ctx,
      addPayment.input.parse({ invoiceId: id, date: todayIso(), amountMinor: 71_000_00 }),
      deps(),
    );
    const [c] = await notesOf(creator.id, "invoice.paid", id);
    expect(c).toBeDefined();
    expect(c!.title).toMatch(/^Faktura FV-\d{4}-\d{4} je zaplacená$/);
    expect(c!.body).toMatch(/Uhrazeno 121\s000\s/);
    expect(c!.url).toBe(`/fakturace/${id}`);
    expect(await notesOf(manager.id, "invoice.paid", id)).toHaveLength(1);
    // zapsal úhradu sám: neupozorňuje se
    expect(await notesOf(bookkeeper.id, "invoice.paid", id)).toHaveLength(0);
    // bez práva číst fakturu žádné upozornění (ani když je vedoucím zakázky)
    expect(await notesOf(outsider.id, "invoice.paid", id)).toHaveLength(0);
  });

  it("vedoucí zakázky bez práva číst fakturu upozornění nedostane", async () => {
    payer = true;
    const u = await accountant();
    const manager = await makeUser(app.db, [["zakazky.read", "all"]]);
    const j = await newJob();
    await app.db.update(job).set({ managerId: manager.id }).where(eq(job.id, j.id));
    const { id } = await fromJob(u, j.id, "partial", 10);
    await issue.handler(u.ctx, issue.input.parse({ id }), deps());
    const other = await accountant();
    await addPayment.handler(
      other.ctx,
      addPayment.input.parse({ invoiceId: id, date: todayIso(), amountMinor: 121_000_00 }),
      deps(),
    );
    expect(await notesOf(u.id, "invoice.paid", id)).toHaveLength(1);
    expect(await notesOf(manager.id, "invoice.paid", id)).toHaveLength(0);
  });
});

describe("upozornění: faktura brzy po splatnosti", () => {
  /** Vystavená faktura se splatností k danému dni (po vystavení se splatnost přepíše a příznak „po splatnosti“ shodí). */
  async function issuedDue(u: Awaited<ReturnType<typeof accountant>>, dueDate: string) {
    const j = await newJob();
    const { id } = await fromJob(u, j.id, "partial", 10);
    await issue.handler(u.ctx, issue.input.parse({ id }), deps());
    await app.db.update(invoice).set({ dueDate, overdue: false }).where(eq(invoice.id, id));
    return id;
  }

  it("ohlásí splatnost do tří dní jednou za fakturu a datum splatnosti; pozdější ani cizí faktury ne", async () => {
    payer = true;
    const u = await accountant();
    // úterý 2026-06-09 ráno; okno je 9.–12. 6.
    const now = new Date("2026-06-09T05:00:00Z");
    const soon = await issuedDue(u, "2026-06-12");
    const tomorrow = await issuedDue(u, "2026-06-10");
    const later = await issuedDue(u, "2026-06-14");
    const past = await issuedDue(u, "2026-06-08");

    await notifyInvoicesDueSoon(app.db, now);
    const [s] = await notesOf(u.id, "invoice.due_soon", soon);
    expect(s!.title).toMatch(/^Faktura FV-\d{4}-\d{4} je splatná za 3 dny$/);
    expect(s!.body).toMatch(/Splatnost 12\. 6\. 2026/);
    expect(s!.body).toMatch(/Zbývá uhradit 121\s000\s/);
    expect(s!.url).toBe(`/fakturace/${soon}`);
    expect((await notesOf(u.id, "invoice.due_soon", tomorrow))[0]!.title).toMatch(/splatná zítra$/);
    expect(await notesOf(u.id, "invoice.due_soon", later)).toHaveLength(0);
    expect(await notesOf(u.id, "invoice.due_soon", past)).toHaveLength(0);

    // opakované spuštění i další den nic nezdvojí
    await notifyInvoicesDueSoon(app.db, now);
    await notifyInvoicesDueSoon(app.db, new Date("2026-06-10T05:00:00Z"));
    expect(await notesOf(u.id, "invoice.due_soon", soon)).toHaveLength(1);
    // 14. 6. se dostane do okna až ve čtvrtek 11. 6.
    expect(await notesOf(u.id, "invoice.due_soon", later)).toHaveLength(0);
    await notifyInvoicesDueSoon(app.db, new Date("2026-06-11T05:00:00Z"));
    expect(await notesOf(u.id, "invoice.due_soon", later)).toHaveLength(1);

    // posunutá splatnost (vrácení do konceptu a nové vystavení) = nové upozornění
    await app.db.update(invoice).set({ dueDate: "2026-06-15" }).where(eq(invoice.id, soon));
    await notifyInvoicesDueSoon(app.db, new Date("2026-06-12T05:00:00Z"));
    expect(await notesOf(u.id, "invoice.due_soon", soon)).toHaveLength(2);
  });

  it("uhrazená a po splatnosti označená faktura se neohlásí; víkend a svátek se přeskočí, pátek pokryje víkend", async () => {
    payer = true;
    const u = await accountant();
    const paid = await issuedDue(u, "2026-09-02");
    await app.db.update(invoice).set({ state: "paid" }).where(eq(invoice.id, paid));
    const overdue = await issuedDue(u, "2026-09-02");
    await app.db.update(invoice).set({ overdue: true }).where(eq(invoice.id, overdue));
    const weekend = await issuedDue(u, "2026-09-06"); // neděle
    // sobota 2026-09-05: nic se neposílá
    await notifyInvoicesDueSoon(app.db, new Date("2026-09-05T05:00:00Z"));
    expect(await notesOf(u.id, "invoice.due_soon", weekend)).toHaveLength(0);
    // pátek 4. 9. dosáhne do neděle
    await notifyInvoicesDueSoon(app.db, new Date("2026-09-04T05:00:00Z"));
    const [w] = await notesOf(u.id, "invoice.due_soon", weekend);
    expect(w!.title).toMatch(/splatná za 2 dny$/);
    expect(await notesOf(u.id, "invoice.due_soon", paid)).toHaveLength(0);
    expect(await notesOf(u.id, "invoice.due_soon", overdue)).toHaveLength(0);

    // státní svátek (28. 9. 2026): nic se neposílá
    const holiday = await issuedDue(u, "2026-09-30");
    await notifyInvoicesDueSoon(app.db, new Date("2026-09-28T05:00:00Z"));
    expect(await notesOf(u.id, "invoice.due_soon", holiday)).toHaveLength(0);
  });

  it("„dnes“ je české místní datum: noc po přechodu na letní čas už patří pondělí", async () => {
    payer = true;
    const u = await accountant();
    const id = await issuedDue(u, "2026-04-01");
    // sobota 28. 3. 2026 00:30 v Praze (pátek 23:30 UTC): v UTC je ještě pracovní pátek, v Praze už víkend
    await notifyInvoicesDueSoon(app.db, new Date("2026-03-27T23:30:00Z"));
    expect(await notesOf(u.id, "invoice.due_soon", id)).toHaveLength(0);
    // pondělí 30. 3. 2026 00:30 SELČ (neděle 22:30 UTC): v UTC ještě neděle, v Praze už pracovní pondělí
    await notifyInvoicesDueSoon(app.db, new Date("2026-03-29T22:30:00Z"));
    const [n] = await notesOf(u.id, "invoice.due_soon", id);
    expect(n!.title).toMatch(/splatná za 2 dny$/);
  });
});

describe("upozornění: přijatá faktura po splatnosti", () => {
  it("včera splatná schválená faktura upozorní fakturanty jednou; uhrazená ne", async () => {
    const u = await accountant();
    const reader = await makeUser(app.db, [["kontakty.read", "all"]]);
    const now = new Date("2026-07-14T05:00:00Z");
    const mk = async (state: string) =>
      (
        await app.db
          .insert(receivedInvoice)
          .values({
            number: `P-${randomBytes(4).toString("hex")}`,
            state,
            dueDate: "2026-07-13",
            grossMinor: 48_400_00,
            paidMinor: state === "paid" ? 48_400_00 : 0,
          })
          .returning({ id: receivedInvoice.id, number: receivedInvoice.number })
      )[0]!;
    const open = await mk("approved");
    const paid = await mk("paid");
    await notifyReceivedOverdue(app.db, now);
    await notifyReceivedOverdue(app.db, now);
    const mine = await notesOf(u.id, "received_invoice.overdue", open.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.title).toBe(`Přijatá faktura ${open.number} je po splatnosti`);
    expect(mine[0]!.body).toMatch(/Splatnost byla 13\. 7\. 2026\nK úhradě 48\s400\s/);
    expect(mine[0]!.url).toBe(`/fakturace/prijate/${open.id}`);
    expect(await notesOf(u.id, "received_invoice.overdue", paid.id)).toHaveLength(0);
    expect(await notesOf(reader.id, "received_invoice.overdue", open.id)).toHaveLength(0);
  });
});
