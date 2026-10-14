import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { addDaysIso, todayIso } from "@rebar/core/time";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLookup, ensurePipeline, getPipeline } from "@rebar/core/config-data";
import {
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
  resolveEntity,
  updateRecord,
  type EntityRegistry,
} from "@rebar/core/entities";
import type { ModuleSeed } from "@rebar/core";
import type { ModuleDeps, ModuleJobDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { companySetting } from "@rebar/core/settings";
import { schema } from "@rebar/core/db";
import { sendMailJob, type MailDeps } from "@rebar/core/mail";
import { createCipher, parseKeyRing } from "@rebar/core/security";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { manifest } from "@rebar/fakturace";
import {
  addPayment,
  createCreditNote,
  createFromJob,
  finalSettlement,
  getInvoice,
  reopen,
  invoiceEntity,
  issue,
  jobSummary,
  overdueJob,
  releaseRetention,
  saveDraft,
} from "@rebar/fakturace/server";
import { invoice, invoiceLine } from "@rebar/fakturace/schema";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import { budgetItem, budgetObject, budgetSection, budgetVersion, job } from "@rebar/zakazky/schema";
import { jobEntity } from "@rebar/zakazky/server";
import { receivedCreate, receivedSave } from "../packages/modules/fakturace/src/received/commands";
import { receivedInvoice } from "@rebar/fakturace/schema";

/**
 * Nezávislý review (vlna C): regresní testy nalezených chyb v penězích a souběhu.
 * Každý test pojmenovává chybu, kterou kdysi odhalil.
 */
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
        def.key === companySetting.key ? supplier : def.default,
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

const accountant = () =>
  makeUser(app.db, [
    ["fakturace.read", "all"],
    ["fakturace.write", "all"],
    ["zakazky.read", "all"],
    ["kontakty.read", "all"],
  ]);

async function newJob(valueMinor = 100_000_00) {
  const ico = String(10_000_000 + Math.floor(Math.random() * 89_999_999));
  const [c] = await app.db
    .insert(company)
    .values({ name: `Odběratel ${randomBytes(3).toString("hex")}`, ico, dic: `CZ${ico}` })
    .returning();
  const stage = (await getPipeline(app.db, "job", "default"))!.stages[0]!;
  const [j] = await app.db
    .insert(job)
    .values({
      number: `R-${randomBytes(4).toString("hex")}`,
      title: "Review",
      companyId: c!.id,
      stageId: stage.id,
      valueMinor,
    })
    .returning();
  return j!;
}

const draftFromJob = (u: Awaited<ReturnType<typeof accountant>>, jobId: string, percent: number) =>
  createFromJob.handler(
    u.ctx,
    createFromJob.input.parse({ jobId, kind: "partial", percent }),
    deps(),
  );

describe("dobropisy", () => {
  it("k téže faktuře nejde vystavit víc dobropisů, než je její hodnota (dva koncepty vzniklé předem)", async () => {
    const u = await accountant();
    const j = await newJob(100_000_00);
    const { id } = await draftFromJob(u, j.id, 100);
    await issue.handler(u.ctx, issue.input.parse({ id }), deps());
    // dva koncepty dobropisu vzniknou dřív, než se první vystaví (dvojklik, dva uživatelé)
    const a = await createCreditNote.handler(u.ctx, { invoiceId: id }, deps());
    const b = await createCreditNote.handler(u.ctx, { invoiceId: id }, deps());
    await issue.handler(u.ctx, issue.input.parse({ id: a.id }), deps());
    await expect(issue.handler(u.ctx, issue.input.parse({ id: b.id }), deps())).rejects.toThrow(
      /dobropis|stornovan/i,
    );
    const issuedCredits = await app.db
      .select({ g: invoice.grossMinor, state: invoice.state })
      .from(invoice)
      .where(eq(invoice.originalInvoiceId, id));
    const total = issuedCredits.filter((c) => c.state === "issued").reduce((s, c) => s + c.g, 0);
    expect(total).toBe(-121_000_00);
  });
});

describe("souběh úprav a vystavení", () => {
  it("uložení konceptu, které čeká na zámek vystavení, nepřepíše řádky už vystavené faktury", async () => {
    const u = await accountant();
    const j = await newJob(100_000_00);
    const { id } = await draftFromJob(u, j.id, 50);
    const before = await getInvoice.handler(u.ctx, { id }, deps());

    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const lockedP = new Promise<void>((r) => (locked = r));
    // „vystavení“: transakce drží zámek řádku faktury a nakonec ji označí jako vystavenou
    const issuing = app.db.transaction(async (tx) => {
      await tx.execute(sql`select id from invoice where id = ${id} for update`);
      locked();
      await hold;
      await tx
        .update(invoice)
        .set({ state: "issued", number: "ZZ-1", lockedAt: new Date() })
        .where(eq(invoice.id, id));
    });
    await lockedP;
    const saving = saveDraft.handler(
      u.ctx,
      saveDraft.input.parse({
        id,
        companyId: before.companyId,
        lines: [
          { description: "Přepsáno", quantity: "1", unit: "ks", unitPriceMinor: 1, vatRateBp: 0 },
        ],
      }),
      deps(),
    );
    const outcome = saving.then(
      () => "saved",
      (e: Error) => e.message,
    );
    await new Promise((r) => setTimeout(r, 300));
    release();
    await issuing;
    expect(await outcome).toMatch(/vystavená a zamčená/);
    const lines = await app.db.select().from(invoiceLine).where(eq(invoiceLine.invoiceId, id));
    expect(lines.some((l) => l.description === "Přepsáno")).toBe(false);
  });
});

describe("úhrady", () => {
  it("dvě souběžné úhrady dohromady nepřekročí částku faktury", async () => {
    const u = await accountant();
    const j = await newJob(100_000_00);
    const { id } = await draftFromJob(u, j.id, 100);
    await issue.handler(u.ctx, issue.input.parse({ id }), deps());
    const pay = () =>
      addPayment.handler(
        u.ctx,
        addPayment.input.parse({ invoiceId: id, date: "2026-01-01", amountMinor: 100_000_00 }),
        deps(),
      );
    const results = await Promise.allSettled([pay(), pay()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const inv = await getInvoice.handler(u.ctx, { id }, deps());
    expect(inv.paidMinor).toBe(100_000_00);
  });
});

describe("přijaté faktury", () => {
  it("uložení konceptu, které čeká na souběžné schválení, nevrátí schválenou fakturu do konceptu", async () => {
    const u = await accountant();
    const j = await newJob();
    const [supplierCo] = await app.db
      .insert(company)
      .values({ name: `Dodavatel ${randomBytes(3).toString("hex")}` })
      .returning();
    const header = {
      number: `P-${randomBytes(4).toString("hex")}`,
      supplierId: supplierCo!.id,
      vatMode: "standard" as const,
      netMinor: 1000_00,
      grossMinor: 1210_00,
    };
    const { id } = (await receivedCreate.handler(
      u.ctx,
      receivedCreate.input.parse(header),
      deps(),
    )) as { id: string };
    void j;

    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const lockedP = new Promise<void>((r) => (locked = r));
    const approving = app.db.transaction(async (tx) => {
      await tx.execute(sql`select id from received_invoice where id = ${id} for update`);
      locked();
      await hold;
      await tx
        .update(receivedInvoice)
        .set({ state: "approved", lockedAt: new Date() })
        .where(eq(receivedInvoice.id, id));
    });
    await lockedP;
    const saving = receivedSave
      .handler(u.ctx, receivedSave.input.parse({ id, ...header, note: "po schválení" }), deps())
      .then(
        () => "saved",
        (e: Error) => e.message,
      );
    await new Promise((r) => setTimeout(r, 300));
    release();
    await approving;
    expect(await saving).toMatch(/zamčen|jen v konceptu/i);
    const [row] = await app.db.select().from(receivedInvoice).where(eq(receivedInvoice.id, id));
    expect(row!.state).toBe("approved");
    expect(row!.lockedAt).not.toBeNull();
  });
});

describe("odesílání e-mailů", () => {
  it("opakované spuštění úlohy po odeslání (pg-boss doručuje alespoň jednou) nepošle e-mail podruhé ani nepřepíše stav na failed", async () => {
    const cipher = createCipher(
      parseKeyRing({ APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") }),
    );
    const sent: unknown[] = [];
    const deps = {
      db: app.db,
      cipher,
      brand: async () => "Firma",
      storage: undefined,
      resolveTransport: async () => ({
        transport: { send: async (m: unknown) => void sent.push(m) },
        from: "system@example.cz",
      }),
    } as unknown as MailDeps;
    const to = `dup-${randomBytes(4).toString("hex")}@test.example`;
    const [log] = await app.db
      .insert(schema.emailLog)
      .values({ toEmail: to, template: "document", subject: "Faktura", status: "queued" })
      .returning({ id: schema.emailLog.id });
    const data = {
      logId: log!.id,
      to,
      template: "document" as const,
      varsEnc: cipher.encrypt(JSON.stringify({ subject: "Faktura", body: "Dobrý den" })),
      // příloha už byla po prvním odeslání uklizená
      attachments: [{ key: `mail/${log!.id}/0.bin`, name: "f.pdf", mime: "application/pdf" }],
    };
    // první běh: příloha chybí a log je „sent“ (jako po odeslání, které se jen nestihlo potvrdit frontě)
    await app.db
      .update(schema.emailLog)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(schema.emailLog.id, log!.id));
    await sendMailJob.handler(deps, data, { retryCount: 1 } as never);
    expect(sent).toHaveLength(0);
    const [after] = await app.db
      .select()
      .from(schema.emailLog)
      .where(eq(schema.emailLog.id, log!.id));
    expect(after!.status).toBe("sent");
  });
});

describe("oprávnění k atributům zakázky", () => {
  it("mistr (zapisuje jen své zakázky, bez ekonomiky) nepřepne režim DPH ani zádržné zakázky", async () => {
    const foreman = await makeUser(app.db, [
      ["zakazky.read", "own"],
      ["zakazky.write", "own"],
    ]);
    const j = await newJob();
    await app.db.update(job).set({ managerId: foreman.id }).where(eq(job.id, j.id));
    const E = await resolveEntity(app.db, jobEntity);
    // běžný atribut projde (kontrola, že odmítnutí níže je opravdu kvůli oprávnění)
    await updateRecord(foreman.ctx, registry, E, j.id, { address: "Plzeň" });
    for (const patch of [{ vatMode: "reverse_charge" }, { retentionBp: 1000 }]) {
      await expect(updateRecord(foreman.ctx, registry, E, j.id, patch)).rejects.toThrow(
        /Neznámý atribut|oprávnění/,
      );
    }
    const [row] = await app.db.select().from(job).where(eq(job.id, j.id));
    expect(row!.vatMode).toBe("standard");
  });
});

describe("vrácení do konceptu", () => {
  it("vystavený dobropis nejde vrátit do konceptu (původní doklad by zůstal stornovaný bez dobropisu)", async () => {
    const u = await makeUser(app.db, [
      ["fakturace.read", "all"],
      ["fakturace.write", "all"],
      ["zakazky.read", "all"],
      ["zakazky.approve_all", "all"],
      ["kontakty.read", "all"],
    ]);
    const j = await newJob(100_000_00);
    const { id } = await draftFromJob(u, j.id, 100);
    await issue.handler(u.ctx, issue.input.parse({ id }), deps());
    const cn = await createCreditNote.handler(u.ctx, { invoiceId: id }, deps());
    await issue.handler(u.ctx, issue.input.parse({ id: cn.id }), deps());
    expect((await getInvoice.handler(u.ctx, { id }, deps())).state).toBe("credited");
    await expect(
      reopen.handler(u.ctx, reopen.input.parse({ id: cn.id, reason: "omyl v dobropisu" }), deps()),
    ).rejects.toThrow(/dobropis/i);
    expect((await getInvoice.handler(u.ctx, { id: cn.id }, deps())).state).not.toBe("draft");
    expect((await getInvoice.handler(u.ctx, { id }, deps())).state).toBe("credited");
  });
});

describe("konečné vyúčtování a cena zakázky", () => {
  async function withBudget(valueMinor: number, budgetSellMinor: number) {
    const j = await newJob(valueMinor);
    const [v] = await app.db
      .insert(budgetVersion)
      .values({ jobId: j.id, kind: "realization", number: 1 })
      .returning();
    const [o] = await app.db
      .insert(budgetObject)
      .values({ versionId: v!.id, title: "Celá zakázka", isDefault: true })
      .returning();
    const [s] = await app.db
      .insert(budgetSection)
      .values({ versionId: v!.id, objectId: o!.id, title: "Práce" })
      .returning();
    await app.db.insert(budgetItem).values({
      versionId: v!.id,
      sectionId: s!.id,
      title: "Dílo",
      unit: "ks",
      quantity: "1",
      unitPriceMinor: budgetSellMinor,
    });
    return j;
  }
  const settle = async (jobId: string) => {
    const u = await accountant();
    return finalSettlement.handler(u.ctx, finalSettlement.input.parse({ jobId }), deps());
  };

  it("rozpočet, který nesedí s cenou zakázky (např. převedený starý odhad), vyúčtování ohlásí varováním", async () => {
    const j = await withBudget(1_000_000_00, 285_000_00);
    const f = await settle(j.id);
    expect(f.contractMinor).toBe(285_000_00);
    expect(f.warnings.join(" ")).toMatch(/Cena z rozpočtu .* liší od ceny zakázky/);
  });

  it("rozpočet, který sedí s cenou zakázky, žádné varování nemá", async () => {
    const j = await withBudget(500_000_00, 500_000_00);
    const f = await settle(j.id);
    expect(f.contractMinor).toBe(500_000_00);
    expect(f.warnings.filter((w) => /liší od ceny zakázky/.test(w))).toEqual([]);
  });
});

describe("meze částek", () => {
  it("řádek faktury, jehož základ přesáhne rozsah bigint, skončí srozumitelnou chybou a nic nezapíše", async () => {
    const u = await accountant();
    const j = await newJob(100_000_00);
    const { id } = await draftFromJob(u, j.id, 10);
    const before = await getInvoice.handler(u.ctx, { id }, deps());
    const err = await saveDraft
      .handler(
        u.ctx,
        saveDraft.input.parse({
          id,
          companyId: before.companyId,
          lines: [
            {
              description: "Obří",
              quantity: "99999999999",
              unit: "ks",
              unitPriceMinor: 9_000_000_000_000,
              vatRateBp: 2100,
            },
          ],
        }),
        deps(),
      )
      .then(
        () => null,
        (e: Error) => e,
      );
    expect(err).not.toBeNull();
    const after = await getInvoice.handler(u.ctx, { id }, deps());
    expect(after.netMinor).toBe(before.netMinor);
  });
});

describe("denní kontrola splatnosti", () => {
  it("dobropis (vystavený dřív, bez splatnosti) se nikdy neoznačí jako po splatnosti", async () => {
    const u = await accountant();
    const j = await newJob(100_000_00);
    const { id } = await draftFromJob(u, j.id, 100);
    await issue.handler(u.ctx, issue.input.parse({ id }), deps());
    const cn = await createCreditNote.handler(u.ctx, { invoiceId: id }, deps());
    await issue.handler(
      u.ctx,
      issue.input.parse({ id: cn.id, issueDate: addDaysIso(todayIso(), -10) }),
      deps(),
    );
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
    expect((await getInvoice.handler(u.ctx, { id: cn.id }, deps())).overdue).toBe(false);
  });
});

describe("účetní řetězec zakázky (náhodné scénáře se pevným seedem)", () => {
  /** mulberry32 */
  function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("záloha, dílčí faktury, konečná faktura a uvolnění zádržného dají dohromady přesně cenu zakázky", async () => {
    const r = rng(2026);
    const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
    for (let run = 0; run < 12; run++) {
      const u = await makeUser(app.db, [
        ["fakturace.read", "all"],
        ["fakturace.write", "all"],
        ["zakazky.read", "all"],
        ["kontakty.read", "all"],
      ]);
      const j = await newJob(1);
      const retentionBp = [0, 500, 1000][int(0, 2)]!;
      await app.db.update(job).set({ retentionBp, phase: "handover" }).where(eq(job.id, j.id));
      const [v] = await app.db
        .insert(budgetVersion)
        .values({ jobId: j.id, kind: "realization", number: 1 })
        .returning();
      const [o] = await app.db
        .insert(budgetObject)
        .values({ versionId: v!.id, title: "Celá zakázka", isDefault: true })
        .returning();
      const [sec] = await app.db
        .insert(budgetSection)
        .values({ versionId: v!.id, objectId: o!.id, title: "Vše" })
        .returning();
      for (let i = 0, n = int(1, 6); i < n; i++) {
        const qty = ["1", "2.5", "12.345", "100", "0.5"][int(0, 4)]!;
        const price = int(1, 900_000);
        await app.db.insert(budgetItem).values({
          versionId: v!.id,
          sectionId: sec!.id,
          position: i,
          title: `P${i}`,
          unit: "ks",
          quantity: qty,
          unitPriceMinor: price,
          vatRateBp: [0, 1000, 1200, 2100][int(0, 3)]!,
        });
      }
      // cena zakázky = součet rozpočtu (jako po výhře nabídky)
      const exact = await app.db
        .select({ q: budgetItem.quantity, p: budgetItem.unitPriceMinor })
        .from(budgetItem)
        .where(eq(budgetItem.versionId, v!.id));
      const contract = exact.reduce((a, x) => a + Math.round((Number(x.q) * 1000 * x.p) / 1000), 0);
      await app.db.update(job).set({ valueMinor: contract }).where(eq(job.id, j.id));

      const issueIt = async (id: string) => issue.handler(u.ctx, issue.input.parse({ id }), deps());
      const pay = async (id: string) => {
        const inv = await getInvoice.handler(u.ctx, { id }, deps());
        await addPayment.handler(
          u.ctx,
          addPayment.input.parse({ invoiceId: id, date: todayIso(), amountMinor: inv.grossMinor }),
          deps(),
        );
      };
      // záloha (zaplacená), 0-2 dílčí faktury procentem, konečná faktura
      const adv = await createFromJob.handler(
        u.ctx,
        createFromJob.input.parse({ jobId: j.id, kind: "proforma", percent: int(5, 30) }),
        deps(),
      );
      await issueIt(adv.id);
      await pay(adv.id);
      for (let k = 0; k < int(0, 2); k++) {
        const p = await createFromJob.handler(
          u.ctx,
          createFromJob.input.parse({ jobId: j.id, kind: "partial", percent: int(5, 25) }),
          deps(),
        );
        await issueIt(p.id);
      }
      const fin = await createFromJob.handler(
        u.ctx,
        createFromJob.input.parse({ jobId: j.id, kind: "final" }),
        deps(),
      );
      await issueIt(fin.id);
      const s = await jobSummary.handler(u.ctx, { jobId: j.id }, deps());
      if (retentionBp > 0) {
        expect(s.retentionOutstandingMinor, `run ${run}`).toBeGreaterThan(0);
        const rel = await releaseRetention.handler(u.ctx, { jobId: j.id }, deps());
        await issueIt(rel.id);
      }
      const after = await jobSummary.handler(u.ctx, { jobId: j.id }, deps());
      expect(after.retentionOutstandingMinor, `run ${run} zádržné`).toBe(0);
      expect(after.invoicedMinor, `run ${run}: fakturováno = cena zakázky ${contract}`).toBe(
        contract,
      );
    }
  });
});
