import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLookup, ensurePipeline, getPipeline } from "@rebar/core/config-data";
import {
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
  type EntityRegistry,
} from "@rebar/core/entities";
import type { ModuleSeed } from "@rebar/core";
import { setJobFinanceProviders, type ModuleDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { companySetting } from "@rebar/core/settings";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { todayIso } from "@rebar/core/time";
import { manifest } from "@rebar/fakturace";
import {
  addPayment,
  billingApi,
  buildInvoiceDoc,
  createCreditNote,
  createFromJob,
  createFromStatement,
  finalSettlement,
  getInvoice,
  invoiceEntity,
  issue,
  jobSummary,
  releaseRetention,
  renderInvoicePdf,
  server as fakturaceServer,
  reopen,
  saveDraft,
} from "@rebar/fakturace/server";
import { invoice, invoiceLine } from "@rebar/fakturace/schema";
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
  workStatement,
  workStatementLine,
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
});

const accountant = (extra: [string, "all" | "own"][] = []) =>
  makeUser(app.db, [
    ["fakturace.read", "all"],
    ["fakturace.write", "all"],
    ["fakturace.export", "all"],
    ["zakazky.read", "all"],
    ["kontakty.read", "all"],
    ...extra,
  ]);

type NewJob = {
  valueMinor?: number;
  vatMode?: "standard" | "reverse_charge";
  retentionBp?: number;
  phase?: string;
  customerDic?: boolean;
};

async function newJob(o: NewJob = {}) {
  const ico = String(10_000_000 + Math.floor(Math.random() * 89_999_999));
  const [c] = await app.db
    .insert(company)
    .values({
      name: `Odběratel ${randomBytes(3).toString("hex")}`,
      ico,
      dic: o.customerDic === false ? null : `CZ${ico}`,
    })
    .returning();
  const stage = (await getPipeline(app.db, "job", "default"))!.stages[0]!;
  const [j] = await app.db
    .insert(job)
    .values({
      number: `B-${randomBytes(4).toString("hex")}`,
      title: "Rekonstrukce",
      companyId: c!.id,
      stageId: stage.id,
      valueMinor: o.valueMinor ?? 0,
      vatMode: o.vatMode ?? "standard",
      retentionBp: o.retentionBp ?? 0,
      phase: o.phase ?? "execution",
    })
    .returning();
  return j!;
}

/** Realizační rozpočet s položkami (cena a sazba jsou prodejní, bez DPH). */
async function newBudget(
  jobId: string,
  items: { title: string; quantity: string; unit?: string; price: number; rate?: number }[],
) {
  const [v] = await app.db
    .insert(budgetVersion)
    .values({ jobId, kind: "realization", number: 1, status: "locked" })
    .returning();
  const [o] = await app.db
    .insert(budgetObject)
    .values({ versionId: v!.id, title: "Celá zakázka", isDefault: true })
    .returning();
  const [s] = await app.db
    .insert(budgetSection)
    .values({ versionId: v!.id, objectId: o!.id, title: "Hlavní" })
    .returning();
  const rows = await app.db
    .insert(budgetItem)
    .values(
      items.map((it, i) => ({
        versionId: v!.id,
        sectionId: s!.id,
        position: i,
        title: it.title,
        unit: it.unit ?? "ks",
        quantity: it.quantity,
        unitPriceMinor: it.price,
        vatRateBp: it.rate ?? 2100,
      })),
    )
    .returning();
  return rows;
}

type U = Awaited<ReturnType<typeof accountant>>;
const fromJob = (
  u: U,
  jobId: string,
  kind: "proforma" | "partial" | "final",
  extra: { percent?: number; amountMinor?: number } = {},
) => createFromJob.handler(u.ctx, createFromJob.input.parse({ jobId, kind, ...extra }), deps());
const doIssue = (u: U, id: string) => issue.handler(u.ctx, issue.input.parse({ id }), deps());
const get = (u: U, id: string) => getInvoice.handler(u.ctx, { id }, deps());
const pay = (u: U, invoiceId: string, amountMinor: number) =>
  addPayment.handler(
    u.ctx,
    addPayment.input.parse({ invoiceId, date: todayIso(), amountMinor }),
    deps(),
  );

describe("faktura z rozpočtu", () => {
  it("záloha procentem se spočítá ze smluvní ceny rozpočtu a rozdělí na sazby DPH", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob();
    await newBudget(j.id, [
      { title: "Zdění", quantity: "10", unit: "m2", price: 30_000_00, rate: 2100 },
      { title: "Střecha", quantity: "1", price: 200_000_00, rate: 1200 },
    ]);
    const { id } = await fromJob(u, j.id, "proforma", { percent: 20 });
    const inv = await get(u, id);
    // 20 % z 500 000 = 100 000; rozděleno 60 : 40 mezi 21 % a 12 %
    expect(inv.netMinor).toBe(100_000_00);
    expect(inv.groups.map((g) => g.vatRateBp)).toEqual([2100, 1200]);
    expect(inv.groups[0]!.netMinor).toBe(60_000_00);
    expect(inv.vatMinor).toBe(12_600_00 + 4_800_00);
  });

  it("záloha pevnou částkou; bez procenta i částky se odmítne", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob({ valueMinor: 100_000_00 });
    const { id } = await fromJob(u, j.id, "proforma", { amountMinor: 25_000_00 });
    expect((await get(u, id)).netMinor).toBe(25_000_00);
    await expect(fromJob(u, j.id, "proforma")).rejects.toThrow(/Zadejte, kolik procent/);
  });

  it("v poptávce a nabídce se nefakturuje", async () => {
    const u = await accountant();
    const j = await newJob({ valueMinor: 100_000_00, phase: "offer" });
    await expect(fromJob(u, j.id, "proforma", { percent: 10 })).rejects.toThrow(
      /ještě nefakturuje/,
    );
  });
});

describe("přenesená daňová povinnost", () => {
  it("faktura bez DPH, režim se přenese ze zakázky, doklad nese text a DIČ odběratele", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob({ vatMode: "reverse_charge", valueMinor: 200_000_00 });
    await newBudget(j.id, [{ title: "Rozvody", quantity: "1", price: 200_000_00, rate: 2100 }]);
    const { id } = await fromJob(u, j.id, "partial", { percent: 50 });
    const inv = await get(u, id);
    expect(inv).toMatchObject({
      vatMode: "reverse_charge",
      netMinor: 100_000_00,
      vatMinor: 0,
      grossMinor: 100_000_00,
    });
    expect(inv.lines.every((l) => l.vatRateBp === 0)).toBe(true);
    await doIssue(u, id);
    const doc = await buildInvoiceDoc(u.ctx, deps(), id);
    expect(doc.vatMode).toBe("reverse_charge");
    expect(doc.vatMinor).toBe(0);
    expect(doc.customer.dic).toMatch(/^CZ/);
    const pdf = await renderInvoicePdf(u.ctx, deps(), id);
    expect(pdf.buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("ruční řádky se sazbou 21 % se při uložení konceptu v PDP srovnají na 0", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob({ valueMinor: 100_000_00 });
    const { id } = await fromJob(u, j.id, "partial", { percent: 100 });
    const inv = await get(u, id);
    expect(inv.vatMinor).toBe(21_000_00);
    await saveDraft.handler(
      u.ctx,
      saveDraft.input.parse({
        id,
        companyId: inv.companyId,
        vatMode: "reverse_charge",
        lines: [
          {
            description: "Práce",
            quantity: "1",
            unit: "ks",
            unitPriceMinor: 100_000_00,
            vatRateBp: 2100,
          },
        ],
      }),
      deps(),
    );
    expect(await get(u, id)).toMatchObject({
      vatMode: "reverse_charge",
      vatMinor: 0,
      grossMinor: 100_000_00,
    });
  });

  it("vystavení vyžaduje DIČ odběratele; neplátce DPH PDP nezaloží", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob({
      vatMode: "reverse_charge",
      valueMinor: 10_000_00,
      customerDic: false,
    });
    const { id } = await fromJob(u, j.id, "partial", { percent: 100 });
    await expect(doIssue(u, id)).rejects.toThrow(/odběratel DIČ/);
    payer = false;
    const j2 = await newJob({ vatMode: "reverse_charge", valueMinor: 10_000_00 });
    await expect(fromJob(u, j2.id, "partial", { percent: 100 })).rejects.toThrow(/plátcem DPH/);
    payer = true;
  });
});

describe("zádržné", () => {
  it("dílčí faktura strhne zádržné z čisté částky, DPH jde jen z části k úhradě, úhrada doplatí doklad", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob({ retentionBp: 1000, valueMinor: 1_000_000_00 });
    const { id } = await fromJob(u, j.id, "partial", { percent: 50 });
    const inv = await get(u, id);
    expect(inv.retentionMinor).toBe(50_000_00); // 10 % z 500 000
    expect(inv.lines.map((l) => l.role)).toEqual(["work", "retention"]);
    expect(inv.netMinor).toBe(450_000_00);
    expect(inv.vatMinor).toBe(94_500_00);
    expect(inv.grossMinor).toBe(544_500_00);
    await doIssue(u, id);
    const doc = await buildInvoiceDoc(u.ctx, deps(), id);
    expect(doc.retention).toMatchObject({
      bp: 1000,
      retentionNetMinor: 50_000_00,
      retentionGrossMinor: 60_500_00,
      grossBeforeMinor: 605_000_00,
    });
    expect(await pay(u, id, 544_500_00)).toMatchObject({ state: "paid" });
    const s = await jobSummary.handler(u.ctx, { jobId: j.id }, deps());
    expect(s).toMatchObject({
      retentionHeldMinor: 50_000_00,
      retentionReleasedMinor: 0,
      invoicedMinor: 450_000_00,
      remainingToInvoiceMinor: 550_000_00,
    });
  });

  it("úprava konceptu zádržné přepočítá a ruční řádek zádržného se zahodí", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob({ retentionBp: 500, valueMinor: 100_000_00 });
    const { id } = await fromJob(u, j.id, "partial", { percent: 100 });
    const inv = await get(u, id);
    await saveDraft.handler(
      u.ctx,
      saveDraft.input.parse({
        id,
        companyId: inv.companyId,
        lines: [
          {
            description: "Práce",
            quantity: "1",
            unit: "ks",
            unitPriceMinor: 200_000_00,
            vatRateBp: 2100,
          },
          {
            description: "Podvržené",
            quantity: "1",
            unit: "ks",
            unitPriceMinor: -1,
            vatRateBp: 2100,
            role: "retention",
          },
        ],
      }),
      deps(),
    );
    const after = await get(u, id);
    expect(after.retentionMinor).toBe(10_000_00);
    expect(after.lines.filter((l) => l.role === "retention")).toHaveLength(1);
  });

  it("uvolnění zádržného až po předání; celé, část, přesah a dvojitý koncept", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob({ retentionBp: 1000, valueMinor: 400_000_00 });
    const a = await fromJob(u, j.id, "partial", { percent: 100 });
    await doIssue(u, a.id); // zádržné 40 000
    await expect(
      releaseRetention.handler(u.ctx, releaseRetention.input.parse({ jobId: j.id }), deps()),
    ).rejects.toThrow(/až po předání/);
    await app.db.update(job).set({ phase: "handover" }).where(eq(job.id, j.id));

    await expect(
      releaseRetention.handler(
        u.ctx,
        releaseRetention.input.parse({ jobId: j.id, amountMinor: 50_000_00 }),
        deps(),
      ),
    ).rejects.toThrow(/nejvýš/);
    const part = await releaseRetention.handler(
      u.ctx,
      releaseRetention.input.parse({ jobId: j.id, amountMinor: 15_000_00 }),
      deps(),
    );
    await expect(
      releaseRetention.handler(u.ctx, releaseRetention.input.parse({ jobId: j.id }), deps()),
    ).rejects.toThrow(/Koncept uvolnění/);
    const draft = await get(u, part.id);
    expect(draft).toMatchObject({ kind: "retention", netMinor: 15_000_00, vatMinor: 3_150_00 });
    const { number } = await doIssue(u, part.id);
    expect(number).toMatch(/^FV-\d{4}-\d{4}$/);

    let s = await jobSummary.handler(u.ctx, { jobId: j.id }, deps());
    expect(s).toMatchObject({ retentionHeldMinor: 25_000_00, retentionReleasedMinor: 15_000_00 });

    const rest = await releaseRetention.handler(
      u.ctx,
      releaseRetention.input.parse({ jobId: j.id }),
      deps(),
    );
    expect((await get(u, rest.id)).netMinor).toBe(25_000_00);
    await doIssue(u, rest.id);
    s = await jobSummary.handler(u.ctx, { jobId: j.id }, deps());
    expect(s).toMatchObject({
      retentionHeldMinor: 0,
      retentionReleasedMinor: 40_000_00,
      invoicedMinor: 400_000_00,
      remainingToInvoiceMinor: 0,
    });
    await expect(
      releaseRetention.handler(u.ctx, releaseRetention.input.parse({ jobId: j.id }), deps()),
    ).rejects.toThrow(/žádné zádržné/);
  });

  it("dobropis k faktuře se zádržným vrací zádržné; uzavření zakázky hlídá neuvolněné zádržné", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob({ retentionBp: 1000, valueMinor: 100_000_00 });
    const a = await fromJob(u, j.id, "partial", { percent: 100 });
    await doIssue(u, a.id);
    const hook = fakturaceServer.phaseHooks!.find((h) => h.id === "billing.closed-retention")!;
    expect(
      await hook.check!(u.ctx, { id: j.id, currency: "CZK" }, { from: "warranty", to: "closed" }),
    ).toMatch(/Zádržné .* ještě nebylo uvolněno/);
    const cn = await createCreditNote.handler(u.ctx, { invoiceId: a.id }, deps());
    await doIssue(u, cn.id);
    expect(await billingApi.retentionOutstanding(u.ctx, j.id)).toBe(0);
    expect(
      await hook.check!(u.ctx, { id: j.id, currency: "CZK" }, { from: "warranty", to: "closed" }),
    ).toBeNull();
  });
});

describe("konečná faktura", () => {
  it("rekapitulace: smluvní cena − zaplacené zálohy − dílčí faktury − zádržné; nezaplacená záloha se neodečte", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob({ retentionBp: 1000, valueMinor: 500_000_00 });
    const [a, b] = await newBudget(j.id, [
      { title: "Obklady", quantity: "10", unit: "m2", price: 30_000_00 },
      { title: "Montáž", quantity: "1", price: 200_000_00 },
    ]);
    // schválená vícepráce, která se nepropsala do rozpočtu
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

    // záloha 40 % (200 000 z 500 000 bez změn → 550 000 × 40 % = 220 000)
    const adv = await fromJob(u, j.id, "proforma", { percent: 40 });
    const advDoc = await get(u, adv.id);
    expect(advDoc.netMinor).toBe(220_000_00);
    await doIssue(u, adv.id);

    // dokud není zaplacená, neodečítá se a hlásí se
    let fs = await finalSettlement.handler(u.ctx, { jobId: j.id }, deps());
    expect(fs.advances).toHaveLength(0);
    expect(fs.unpaidAdvances).toHaveLength(1);
    expect(fs.warnings.join(" ")).toMatch(/ještě není uhrazená/);
    expect(fs.contractMinor).toBe(550_000_00);

    await pay(u, adv.id, advDoc.grossMinor);
    // dílčí faktura ze soupisu: 4 m² obkladů za 120 000
    const [st] = await app.db
      .insert(workStatement)
      .values({
        jobId: j.id,
        number: 1,
        periodFrom: "2026-03-01",
        periodTo: "2026-03-31",
        status: "approved",
        claimedMinor: 120_000_00,
        approvedMinor: 120_000_00,
      })
      .returning();
    await app.db.insert(workStatementLine).values({
      statementId: st!.id,
      itemId: a!.id,
      quantityPeriod: "4",
      quantityTotal: "4",
      amountPeriodMinor: 120_000_00,
      amountTotalMinor: 120_000_00,
    });
    const part = await createFromStatement.handler(
      u.ctx,
      createFromStatement.input.parse({ statementId: st!.id }),
      deps(),
    );
    const partDoc = await get(u, part.id);
    expect(partDoc.statement).toMatchObject({ number: 1 });
    expect(partDoc.lines[0]).toMatchObject({ budgetItemId: a!.id, quantity: "4.000" });
    expect(partDoc.retentionMinor).toBe(12_000_00);
    await doIssue(u, part.id);
    const [stAfter] = await app.db.select().from(workStatement).where(eq(workStatement.id, st!.id));
    expect(stAfter!.invoiceId).toBe(part.id);

    fs = await finalSettlement.handler(u.ctx, { jobId: j.id }, deps());
    // zbývá: obklady 180 000 + montáž 200 000 + vícepráce 50 000 = 430 000; zádržné 10 % = 43 000; záloha 220 000
    expect(fs.advances.map((x) => x.netMinor)).toEqual([220_000_00]);
    expect(fs.billedBeforeMinor).toBe(120_000_00);
    expect(fs.retentionMinor).toBe(43_000_00);
    expect(fs.advancesMinor).toBe(220_000_00);
    expect(fs.netMinor).toBe(430_000_00 - 220_000_00 - 43_000_00);
    expect(fs.warnings).toEqual([]);

    const fin = await fromJob(u, j.id, "final");
    const finDoc = await get(u, fin.id);
    expect(finDoc.netMinor).toBe(fs.netMinor);
    expect(finDoc.retentionMinor).toBe(43_000_00);
    const roles = finDoc.lines.map((l) => l.role);
    expect(roles).toContain("advance");
    expect(finDoc.lines.find((l) => l.role === "advance")).toMatchObject({
      description: expect.stringMatching(/^Odpočet zálohy ZF-/),
      refInvoiceId: adv.id,
    });
    expect(finDoc.lines.map((l) => l.budgetItemId).filter(Boolean)).toEqual([a!.id, b!.id]);
    expect(finDoc.lines.find((l) => l.budgetItemId === a!.id)!.description).toMatch(
      /zbývající část/,
    );

    await doIssue(u, fin.id);
    await expect(fromJob(u, j.id, "final")).rejects.toThrow(/už je vystavená/);
    // záloha je odečtená a podruhé se nenabídne
    fs = await finalSettlement.handler(u.ctx, { jobId: j.id }, deps());
    expect(fs.advances).toHaveLength(0);

    // celkově vyfakturováno a zádržné drženo
    const s = await jobSummary.handler(u.ctx, { jobId: j.id }, deps());
    expect(s).toMatchObject({
      contractMinor: 550_000_00,
      retentionHeldMinor: 12_000_00 + 43_000_00,
      advancesPaidMinor: 220_000_00,
      invoicedMinor: 550_000_00 - 55_000_00,
      remainingToInvoiceMinor: 55_000_00,
    });
  });

  it("změna, která už je propsaná do rozpočtu, se nepřičítá podruhé", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob({ valueMinor: 0 });
    await newBudget(j.id, [{ title: "Práce", quantity: "1", price: 100_000_00 }]);
    await app.db.insert(jobChange).values({
      jobId: j.id,
      number: 1,
      title: "Propsaná",
      amountMinor: 30_000_00,
      status: "approved",
      appliedAt: new Date(),
    });
    const fs = await finalSettlement.handler(u.ctx, { jobId: j.id }, deps());
    expect(fs.contractMinor).toBe(100_000_00);
    expect(fs.lines).toHaveLength(1);
  });

  it("zakázka bez rozpočtu: jeden řádek z ceny zakázky a schválené vícepráce", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob({ valueMinor: 80_000_00 });
    await app.db.insert(jobChange).values({
      jobId: j.id,
      number: 1,
      title: "Vícepráce",
      amountMinor: 20_000_00,
      status: "approved",
    });
    const { id } = await fromJob(u, j.id, "final");
    const inv = await get(u, id);
    expect(inv.netMinor).toBe(100_000_00);
    expect(inv.lines).toHaveLength(2);
  });
});

describe("faktura ze soupisu", () => {
  it("jen schválený soupis, jen jednou; storno dobropisem soupis uvolní", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob();
    const [it] = await newBudget(j.id, [
      { title: "Zdění", quantity: "100", unit: "m2", price: 1_000_00 },
    ]);
    const [st] = await app.db
      .insert(workStatement)
      .values({
        jobId: j.id,
        number: 1,
        periodFrom: "2026-04-01",
        periodTo: "2026-04-30",
        status: "submitted",
        approvedMinor: 0,
      })
      .returning();
    await app.db.insert(workStatementLine).values({
      statementId: st!.id,
      itemId: it!.id,
      quantityPeriod: "25",
      quantityTotal: "25",
      amountPeriodMinor: 25_000_00,
      amountTotalMinor: 25_000_00,
    });
    const run = () =>
      createFromStatement.handler(
        u.ctx,
        createFromStatement.input.parse({ statementId: st!.id }),
        deps(),
      );
    await expect(run()).rejects.toThrow(/schváleného soupisu/);
    await app.db
      .update(workStatement)
      .set({ status: "approved", approvedMinor: 25_000_00 })
      .where(eq(workStatement.id, st!.id));
    const { id } = await run();
    await expect(run()).rejects.toThrow(/už existuje koncept/);
    const inv = await get(u, id);
    expect(inv).toMatchObject({ kind: "partial", netMinor: 25_000_00 });
    expect(inv.note).toMatch(/Soupis provedených prací č. 1/);

    await doIssue(u, id);
    await expect(run()).rejects.toThrow(/faktura už vznikla/);
    const cn = await createCreditNote.handler(u.ctx, { invoiceId: id }, deps());
    await doIssue(u, cn.id);
    const [after] = await app.db.select().from(workStatement).where(eq(workStatement.id, st!.id));
    expect(after!.invoiceId).toBeNull();
    // po stornu jde soupis vyfakturovat znovu
    await expect(run()).resolves.toHaveProperty("id");
  });
});

describe("zamykání vystavené faktury", () => {
  it("vystavená faktura je zamčená s vysvětlením; vrátit ji do konceptu smí jen schvalovatel bez limitu", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob({ valueMinor: 10_000_00 });
    const { id } = await fromJob(u, j.id, "partial", { percent: 100 });
    const { number } = await doIssue(u, id);
    const inv = await get(u, id);
    expect(inv.lockedAt).not.toBeNull();
    expect(inv.lockReason).toMatch(/zamčená.*dobropisem/);
    await expect(
      saveDraft.handler(u.ctx, saveDraft.input.parse({ id, lines: [] }), deps()),
    ).rejects.toThrow(/zamčená/);

    await expect(
      reopen.handler(u.ctx, reopen.input.parse({ id, reason: "překlep v popisu" }), deps()),
    ).rejects.toThrow(/Schvaluje doklady bez limitu/);

    const boss = await accountant([["zakazky.approve_all", "all"]]);
    // s úhradou nejde
    await pay(boss, id, 1_000_00);
    await expect(
      reopen.handler(boss.ctx, reopen.input.parse({ id, reason: "překlep v popisu" }), deps()),
    ).rejects.toThrow(/Opravte ho dobropisem/);

    const j2 = await newJob({ valueMinor: 10_000_00 });
    const b = await fromJob(boss, j2.id, "partial", { percent: 100 });
    const issued = await doIssue(boss, b.id);
    expect((await get(boss, b.id)).canReopen).toBe(true);
    await reopen.handler(
      boss.ctx,
      reopen.input.parse({ id: b.id, reason: "překlep v popisu" }),
      deps(),
    );
    const back = await get(boss, b.id);
    expect(back).toMatchObject({ state: "draft", lockedAt: null, number: issued.number });
    const again = await doIssue(boss, b.id);
    expect(again.number).toBe(issued.number); // číslo se nemění, v řadě není díra
    void number;
  });

  it("souběžné vystavení různých druhů dokladů dává jedinečná čísla", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob({ valueMinor: 100_000_00, retentionBp: 500 });
    const ids = await Promise.all(
      [1, 2, 3, 4].map(async () => (await fromJob(u, j.id, "partial", { percent: 5 })).id),
    );
    const numbers = (await Promise.all(ids.map((id) => doIssue(u, id)))).map((r) => r.number);
    expect(new Set(numbers).size).toBe(4);
  });
});

describe("souhrn zakázky pro záložku a poskytovatele", () => {
  it("poskytovatel vrací vyfakturováno a uhrazeno bez DPH; dobropis se vyruší", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob({ valueMinor: 100_000_00 });
    const a = await fromJob(u, j.id, "partial", { percent: 100 });
    await doIssue(u, a.id);
    await pay(u, a.id, 60_500_00);
    const p = fakturaceServer.jobInvoicing![0]!;
    expect(await p(u.ctx, j.id)).toEqual({ invoicedMinor: 100_000_00, paidMinor: 50_000_00 });
    const cn = await createCreditNote.handler(u.ctx, { invoiceId: a.id }, deps());
    await doIssue(u, cn.id);
    expect((await p(u.ctx, j.id)).invoicedMinor).toBe(0);
    const rows = await app.db.select().from(invoiceLine).where(eq(invoiceLine.invoiceId, cn.id));
    expect(rows.every((r) => r.unitPriceMinor < 0)).toBe(true);
    void invoice;
  });
});

describe("přepočet souhrnu zakázky po změně faktury", () => {
  it("vystavení, úhrada i dobropis přepočítají job.sum_invoiced a sum_paid přes poskytovatele", async () => {
    payer = true;
    setJobFinanceProviders({
      costProviders: [],
      invoicing: fakturaceServer.jobInvoicing ?? [],
    });
    try {
      const u = await accountant();
      const j = await newJob({ valueMinor: 100_000_00 });
      const read = async () => (await app.db.select().from(job).where(eq(job.id, j.id)))[0]!;
      const a = await fromJob(u, j.id, "partial", { percent: 100 });
      await doIssue(u, a.id);
      expect((await read()).sumInvoicedMinor).toBe(100_000_00);
      await pay(u, a.id, 60_500_00);
      expect((await read()).sumPaidMinor).toBe(50_000_00);
      const cn = await createCreditNote.handler(u.ctx, { invoiceId: a.id }, deps());
      await doIssue(u, cn.id);
      expect((await read()).sumInvoicedMinor).toBe(0);
    } finally {
      setJobFinanceProviders({ costProviders: [], invoicing: [] });
    }
  });

  it("soupis schválený níže než nárokováno: faktura odpovídá schválené částce", async () => {
    payer = true;
    const u = await accountant();
    const j = await newJob();
    const [it] = await newBudget(j.id, [
      { title: "Zdění", quantity: "100", unit: "m2", price: 1_000_00 },
    ]);
    const [st] = await app.db
      .insert(workStatement)
      .values({
        jobId: j.id,
        number: 1,
        periodFrom: "2026-05-01",
        periodTo: "2026-05-31",
        status: "approved",
        claimedMinor: 20_000_00,
        approvedMinor: 18_000_00,
      })
      .returning();
    await app.db.insert(workStatementLine).values({
      statementId: st!.id,
      itemId: it!.id,
      quantityPeriod: "20",
      quantityTotal: "20",
      amountPeriodMinor: 20_000_00,
      amountTotalMinor: 20_000_00,
    });
    const { id } = await createFromStatement.handler(
      u.ctx,
      createFromStatement.input.parse({ statementId: st!.id }),
      deps(),
    );
    const inv = await get(u, id);
    expect(inv.netMinor).toBe(18_000_00);
    expect(inv.lines.at(-1)!.description).toMatch(/Krácení soupisu č. 1/);
  });
});
