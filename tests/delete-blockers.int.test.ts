import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensurePipeline, getPipeline } from "@rebar/core/config-data";
import {
  clearEntityPolicies,
  createEntityRegistry,
  deleteRecord,
  registerEntityPolicies,
  resolveEntity,
  setDeleteBlockers,
  type ResolvedEntity,
} from "@rebar/core/entities";
import type { ModuleSeed } from "@rebar/core";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { invoice, receivedInvoice } from "@rebar/fakturace/schema";
import { server as fakturace, invoiceEntity } from "@rebar/fakturace/server";
import { company, person } from "@rebar/kontakty/schema";
import { companyEntity, personEntity, server as kontakty } from "@rebar/kontakty/server";
import { inquiry } from "@rebar/poptavky/schema";
import { server as poptavky } from "@rebar/poptavky/server";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import { job, jobChange, jobOrder } from "@rebar/zakazky/schema";
import { jobEntity, server as zakazky } from "@rebar/zakazky/server";

/**
 * Smazání firmy, osoby a zakázky s vazbami (`deleteBlockers` modulů): srozumitelná věta, počítají se jen nesmazané
 * záznamy, zakázka se zamčeným dokladem nebo vystavenou fakturou se nesmaže vůbec.
 */
const app = connectAppDb();
afterAll(async () => {
  setDeleteBlockers([]);
  await app.close();
});

let companyE: ResolvedEntity;
let personE: ResolvedEntity;
let jobE: ResolvedEntity;
let stageId: string;

beforeAll(async () => {
  clearEntityPolicies();
  const registry = createEntityRegistry([companyEntity, personEntity, jobEntity, invoiceEntity]);
  registerEntityPolicies(registry);
  setDeleteBlockers(
    [kontakty, zakazky, fakturace, poptavky].flatMap((s) => [...(s.deleteBlockers ?? [])]),
  );
  for (const p of (zakazkyManifest.seed as ModuleSeed).pipelines ?? [])
    await ensurePipeline(app.db, p);
  stageId = (await getPipeline(app.db, "job", "default"))!.stages[0]!.id;
  companyE = await resolveEntity(app.db, companyEntity);
  personE = await resolveEntity(app.db, personEntity);
  jobE = await resolveEntity(app.db, jobEntity);
});

const boss = () =>
  makeUser(app.db, [
    ["kontakty.read", "all"],
    ["kontakty.write", "all"],
    ["zakazky.read", "all"],
    ["zakazky.write", "all"],
  ]);
const hex = () => randomBytes(4).toString("hex");

async function newCompany() {
  const [c] = await app.db
    .insert(company)
    .values({ name: `Firma ${hex()}` })
    .returning();
  return c!;
}
async function newJob(companyId: string, over: Partial<typeof job.$inferInsert> = {}) {
  const [j] = await app.db
    .insert(job)
    .values({ number: `D-${hex()}`, title: "Zakázka", companyId, stageId, ...over })
    .returning();
  return j!;
}
const newInvoice = async (companyId: string, state: string, over = {}) =>
  (
    await app.db
      .insert(invoice)
      .values({ kind: "partial", state, companyId, ...over })
      .returning()
  )[0]!;

describe("smazání firmy s vazbami", () => {
  it("firma bez vazeb jde smazat", async () => {
    const u = await boss();
    const c = await newCompany();
    await deleteRecord(u.ctx, companyE, c.id);
    const [row] = await app.db.select().from(company).where(eq(company.id, c.id));
    expect(row?.deletedAt).not.toBeNull();
  });

  it("firma se zakázkami a fakturami: věta s počty a radou, nic se nesmaže", async () => {
    const u = await boss();
    const c = await newCompany();
    for (let i = 0; i < 3; i++) await newJob(c.id);
    await newInvoice(c.id, "issued");
    await newInvoice(c.id, "draft");
    await expect(deleteRecord(u.ctx, companyE, c.id)).rejects.toThrow(
      "Firma má 3 zakázky a 2 faktury; nejdřív je přesuňte nebo smažte.",
    );
    const [row] = await app.db.select().from(company).where(eq(company.id, c.id));
    expect(row?.deletedAt).toBeNull();
  });

  it("počítají se jen nesmazané záznamy: po smazání zakázky už firmu jde smazat", async () => {
    const u = await boss();
    const c = await newCompany();
    const j = await newJob(c.id);
    await expect(deleteRecord(u.ctx, companyE, c.id)).rejects.toThrow(/Firma má 1 zakázku;/);
    await deleteRecord(u.ctx, jobE, j.id);
    await deleteRecord(u.ctx, companyE, c.id);
  });

  it("poptávka, přijatá faktura i kontaktní osoba firmu drží", async () => {
    const u = await boss();
    const c = await newCompany();
    await app.db
      .insert(inquiry)
      .values({ title: "Poptávka", companyId: c.id, stageId: await anyInquiryStage() });
    await app.db.insert(receivedInvoice).values({ number: `P-${hex()}`, supplierId: c.id });
    await app.db.insert(person).values({ name: "Jan Novák", companyId: c.id });
    await expect(deleteRecord(u.ctx, companyE, c.id)).rejects.toThrow(
      /Firma má 1 osobu, 1 přijatou fakturu a 1 poptávku;/,
    );
  });
});

async function anyInquiryStage() {
  const p = await getPipeline(app.db, "inquiry", "default");
  if (p) return p.stages[0]!.id;
  return stageId; // pipeline poptávek v testu nezaložená: stav zakázky stačí pro cizí klíč
}

describe("smazání osoby s vazbami", () => {
  it("osoba u zakázky se nesmaže, volná ano", async () => {
    const u = await boss();
    const c = await newCompany();
    const [p] = await app.db.insert(person).values({ name: "Eva", companyId: c.id }).returning();
    await newJob(c.id, { personId: p!.id });
    await expect(deleteRecord(u.ctx, personE, p!.id)).rejects.toThrow(
      "Osoba má 1 zakázku; nejdřív je přesuňte nebo smažte.",
    );
    const [free] = await app.db.insert(person).values({ name: "Volná" }).returning();
    await deleteRecord(u.ctx, personE, free!.id);
  });
});

describe("smazání zakázky s doklady", () => {
  it("zakázka s vystavenou fakturou se nesmaže, s konceptem až po jeho smazání", async () => {
    const u = await boss();
    const c = await newCompany();
    const j = await newJob(c.id);
    const draft = await newInvoice(c.id, "draft", { jobId: j.id });
    await expect(deleteRecord(u.ctx, jobE, j.id)).rejects.toThrow(
      "Zakázka má 1 koncept faktury; nejdřív je přesuňte nebo smažte.",
    );
    await app.db.update(invoice).set({ state: "issued" }).where(eq(invoice.id, draft.id));
    await expect(deleteRecord(u.ctx, jobE, j.id)).rejects.toThrow(
      /Zakázka má 1 vystavenou fakturu; takovou zakázku nejde smazat/,
    );
    const [row] = await app.db.select().from(job).where(eq(job.id, j.id));
    expect(row?.deletedAt).toBeNull();
  });

  it("zamčený doklad (schválená změna, schválená objednávka) zakázku zamkne proti smazání", async () => {
    const u = await boss();
    const c = await newCompany();
    const j = await newJob(c.id);
    await app.db.insert(jobChange).values({
      jobId: j.id,
      number: 1,
      title: "Vícepráce",
      amountMinor: 100_00,
      status: "approved",
      lockedAt: new Date(),
    });
    await app.db
      .insert(jobOrder)
      .values({ jobId: j.id, number: `O-${hex()}`, title: "Cement", status: "approved" });
    await expect(deleteRecord(u.ctx, jobE, j.id)).rejects.toThrow(
      /Zakázka má 2 zamčené doklady; takovou zakázku nejde smazat, uzavřete ji/,
    );
  });

  it("koncept objednávky nejdřív smazat; zakázka bez dokladů jde smazat", async () => {
    const u = await boss();
    const c = await newCompany();
    const j = await newJob(c.id);
    const [o] = await app.db
      .insert(jobOrder)
      .values({ jobId: j.id, number: `O-${hex()}`, title: "Cement" })
      .returning();
    await expect(deleteRecord(u.ctx, jobE, j.id)).rejects.toThrow(/Zakázka má 1 objednávku;/);
    await app.db.update(jobOrder).set({ deletedAt: new Date() }).where(eq(jobOrder.id, o!.id));
    await deleteRecord(u.ctx, jobE, j.id);
  });
});
