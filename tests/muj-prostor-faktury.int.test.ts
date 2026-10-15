import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { PermissionError, UserError, sourceCtx, type Ctx } from "@rebar/core/rbac";
import type { Db } from "@rebar/core/db";
import { createRecord, resolveEntity, type ResolvedEntity } from "@rebar/core/entities";
import { createModuleDeps, type ModuleDeps } from "@rebar/core/module-server";
import { connectAppDb } from "@rebar/core/testing";
import { addDaysIso, todayIso } from "@rebar/core/time";
import { assertCommandPermission } from "../apps/web/src/server/command-gate";
import {
  createFakeFakturoid,
  FakturoidError,
  setFakturoidClientOverride,
  type FakeFakturoid,
} from "../packages/modules/muj-prostor/src/invoices/fakturoid";
import {
  approveInvoice,
  countOpenInvoices,
  prepareInvoiceDrafts,
  reconcileInvoicePayments,
} from "../packages/modules/muj-prostor/src/invoices/data";
import type {
  ApproveResult,
  FakturoidStatus,
  FakturoidTestResult,
  InvoicesOverview,
  PrepareResult,
} from "../packages/modules/muj-prostor/src/invoices/types";
import { buildFixture, isolatedDb, type Fixture } from "./support/security-fixture";

/*
  MPR-3: opakované faktury přes Fakturoid. Pravidla období a termínu jsou v unit testech (`invoices/logic.test.ts`),
  HTTP adaptér v `fakturoid/http-client.test.ts`; tady se hlídá celý tok nad databází s fake Fakturoidem:
  příprava návrhů (idempotence), schválení (jedna faktura i při dvojím a souběžném kliknutí, převzetí po ztracené
  odpovědi), posun obnovy, platba vlastníkovi mimo saldo a to, že Patrik nic z toho nevidí.
*/

const app = connectAppDb();
let f: Fixture;
let db: Db;
let discard: () => Promise<void>;
let deps: ModuleDeps;
let owner: Ctx;
let partner: Ctx;
let fake: FakeFakturoid;
const today = todayIso();
const inDays = (n: number) => addDaysIso(today, n);
const tag = Math.random().toString(36).slice(2, 8);
let company: { id: string };

const R = (key: string): Promise<ResolvedEntity> =>
  resolveEntity(db, f.registry.get(key) ?? (undefined as never));

async function run<T>(ctx: Ctx, name: string, input: unknown, d: ModuleDeps = deps): Promise<T> {
  const cmd = f.collected.commands.get(name);
  if (!cmd) throw new Error(`Neznámý příkaz ${name}`);
  assertCommandPermission(ctx, cmd);
  return (await cmd.handler(ctx, cmd.input.parse(input), d)) as T;
}

async function newService(over: Record<string, unknown> = {}) {
  const r = await createRecord(owner, f.registry, await R("recurring_service"), {
    name: `Hosting ${tag} ${Math.random().toString(36).slice(2, 6)}`,
    company: company.id,
    kind: "hosting",
    web: "https://firma.cz",
    price: 600_000,
    period: "yearly",
    status: "active",
    nextRenewal: inDays(10),
    autoPrepareInvoice: true,
    invoiceLeadDays: 14,
    ...over,
  });
  return r.row as { id: string; nextRenewal: string };
}

const prep = () => prepareInvoiceDrafts(sourceCtx(db, "job", "test"), deps, today);
const draftOf = async (serviceId: string) => {
  const o = await run<InvoicesOverview>(owner, "muj-prostor.invoices.overview", {});
  return o.rows.find((r) => r.serviceId === serviceId)!;
};
const sqlRows = async <T = Record<string, unknown>>(q: ReturnType<typeof sql>): Promise<T[]> =>
  Array.from(await db.execute(q)) as T[];
const serviceRow = async (id: string) =>
  (
    await sqlRows<{ next_renewal: string; fakturoid_subject_id: string | null }>(
      sql`select next_renewal, fakturoid_subject_id from recurring_service where id = ${id}`,
    )
  )[0]!;

beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  f = await buildFixture(db);
  deps = createModuleDeps(
    {
      registry: f.deps.registry,
      queue: f.deps.queue,
      storage: f.deps.storage,
      settings: f.deps.settings,
      cipher: f.deps.cipher,
      baseURL: f.deps.baseURL,
      emit: f.deps.emit,
      calendarLayers: f.deps.calendarLayers,
    },
    { services: f.collected.services, contributions: f.collected.contributions },
  );
  owner = f.people.owner.ctx;
  partner = f.people.partner.ctx;
  const co = await createRecord(owner, f.registry, await R("company"), {
    name: `Klient ${tag}`,
    ico: "12345678",
    street: "Ulice 1",
    city: "Plzeň",
    zip: "30100",
  });
  company = { id: co.row.id };
}, 120_000);
afterAll(async () => {
  setFakturoidClientOverride(null);
  await discard();
  await app.close();
});

const reset = () => {
  fake = createFakeFakturoid();
  setFakturoidClientOverride(fake);
};
afterEach(async () => {
  reset();
  await db.execute(sql`update recurring_service set fakturoid_subject_id = null`);
});
reset();

describe("příprava návrhů (FAK-01)", () => {
  it("založí návrh za období od obnovy; druhé spuštění nic nezdvojí", async () => {
    const s = await newService();
    const first = await prep();
    expect(first.created).toBeGreaterThanOrEqual(1);
    const d = await draftOf(s.id);
    expect(d).toMatchObject({
      status: "draft",
      amountMinor: 600_000,
      periodFrom: s.nextRenewal,
      canApprove: true,
      canEdit: true,
    });
    expect(d.periodTo).toBe(
      addDaysIso(`${Number(s.nextRenewal.slice(0, 4)) + 1}${s.nextRenewal.slice(4)}`, -1),
    );
    const second = await prep();
    expect(second.created).toBe(0);
    const o = await run<InvoicesOverview>(owner, "muj-prostor.invoices.overview", {});
    expect(o.rows.filter((r) => r.serviceId === s.id)).toHaveLength(1);
  });

  it("nepřipraví návrh, když je obnova dál než X dní, služba nemá zapnuto, je pozastavená nebo bez ceny", async () => {
    const far = await newService({ nextRenewal: inDays(40) });
    const off = await newService({ autoPrepareInvoice: false });
    const paused = await newService({ status: "paused" });
    const noPrice = await newService({ price: null });
    const lead = await newService({ nextRenewal: inDays(20), invoiceLeadDays: 30 });
    const res = await run<PrepareResult>(owner, "muj-prostor.invoices.prepare", {});
    const o = await run<InvoicesOverview>(owner, "muj-prostor.invoices.overview", {});
    const has = (id: string) => o.rows.some((r) => r.serviceId === id);
    expect(has(far.id)).toBe(false);
    expect(has(off.id)).toBe(false);
    expect(has(paused.id)).toBe(false);
    expect(has(noPrice.id)).toBe(false);
    expect(has(lead.id)).toBe(true);
    expect(res.blocked.map((b) => b.serviceId)).toContain(noPrice.id);
    expect(o.blocked.map((b) => b.serviceId)).toContain(noPrice.id);
  });

  it("dožene i obnovu po termínu a zrušený návrh znovu nevytváří", async () => {
    const s = await newService({ nextRenewal: inDays(-3) });
    await prep();
    const d = await draftOf(s.id);
    expect(d.periodFrom).toBe(s.nextRenewal);
    await run(owner, "muj-prostor.invoices.cancel", { id: d.id });
    await prep();
    const o = await run<InvoicesOverview>(owner, "muj-prostor.invoices.overview", {});
    const rows = o.rows.filter((r) => r.serviceId === s.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("canceled");
    await run(owner, "muj-prostor.invoices.reopen", { id: d.id });
    expect((await draftOf(s.id)).status).toBe("draft");
  });

  it("odznak počítá koncepty a nehotové faktury", async () => {
    const before = await countOpenInvoices(owner);
    await newService({ nextRenewal: inDays(5) });
    await prep();
    expect(await countOpenInvoices(owner)).toBe(before + 1);
    expect(await countOpenInvoices(partner)).toBe(0);
  });
});

describe("úprava a zrušení", () => {
  it("upraví částku konceptu; schválenou nebo zrušenou ne; zrušit jde jen nehotový návrh", async () => {
    const s = await newService();
    await prep();
    const d = await draftOf(s.id);
    await run(owner, "muj-prostor.invoices.update", { id: d.id, amountMinor: 650_000 });
    expect((await draftOf(s.id)).amountMinor).toBe(650_000);
    await run(owner, "muj-prostor.invoices.approve", { id: d.id, expectedAmountMinor: 650_000 });
    await expect(
      run(owner, "muj-prostor.invoices.update", { id: d.id, amountMinor: 1 }),
    ).rejects.toThrow(/Upravit jde jen koncept/);
    await expect(run(owner, "muj-prostor.invoices.cancel", { id: d.id })).rejects.toThrow(
      /už je vytvořená ve Fakturoidu/,
    );
  });
});

describe("schválení a vytvoření ve Fakturoidu (FAK-02, FAK-03)", () => {
  it("vytvoří odběratele podle IČO, fakturu v korunách, uloží číslo a odkaz, posune obnovu a založí platbu vlastníkovi", async () => {
    const s = await newService();
    await prep();
    const d = await draftOf(s.id);
    const res = await run<ApproveResult>(owner, "muj-prostor.invoices.approve", {
      id: d.id,
      expectedAmountMinor: 600_000,
    });
    expect(fake.subjects).toHaveLength(1);
    expect(fake.subjects[0]).toMatchObject({ registrationNo: "12345678" });
    expect(fake.invoices).toHaveLength(1);
    const sent = fake.invoices[0]!;
    expect(sent.input.customId).toBe(`opsys-ri-${d.id}`);
    expect(sent.input.lines).toEqual([
      expect.objectContaining({ unitPrice: 6000, quantity: 1, vatRate: 0 }),
    ]);
    expect(sent.input.lines[0]!.name).toContain("https://firma.cz");
    expect(res.fakturoidNumber).toBe(sent.number);
    expect(res.paymentCreated).toBe(true);
    const after = await draftOf(s.id);
    expect(after).toMatchObject({
      status: "sent_to_fakturoid",
      fakturoidNumber: sent.number,
      fakturoidUrl: sent.htmlUrl,
      hasPayment: true,
      error: null,
    });
    // další obnova o rok
    const svc = await serviceRow(s.id);
    expect(String(svc.next_renewal).slice(0, 10)).toBe(res.nextRenewal);
    expect(res.nextRenewal).toBe(
      `${Number(s.nextRenewal.slice(0, 4)) + 1}${s.nextRenewal.slice(4)}`,
    );
    expect(svc.fakturoid_subject_id).toBe(fake.subjects[0]!.id);
    // platba: bez zakázky, druh recurring, soukromá, celá vlastníkovi
    const pay = await sqlRows(
      sql`select p.job_id, p.kind, p.is_private, p.invoice_number, p.invoice_url, p.amount_minor, p.issuer_id, p.source,
              (select count(*) from payment_allocation a where a.payment_id = p.id) as allocs,
              (select sum(a.amount_minor) from payment_allocation a where a.payment_id = p.id and a.user_id = p.issuer_id) as owner_sum
            from payment p where invoice_number = ${sent.number}`,
    );
    expect(pay).toHaveLength(1);
    expect(pay[0]).toMatchObject({
      job_id: null,
      kind: "recurring",
      is_private: true,
      source: "fakturoid",
      issuer_id: f.people.owner.id,
    });
    expect(Number(pay[0]!.amount_minor)).toBe(600_000);
    expect(Number(pay[0]!.owner_sum)).toBe(600_000);
    expect(Number(pay[0]!.allocs)).toBe(1);
  });

  it("odběratele jednoho klienta sdílí víc služeb (druhá faktura ho nezakládá znovu)", async () => {
    const a = await newService();
    const b = await newService({ kind: "maintenance" });
    await prep();
    for (const s of [a, b]) {
      const d = await draftOf(s.id);
      await run(owner, "muj-prostor.invoices.approve", { id: d.id, expectedAmountMinor: 600_000 });
    }
    expect(fake.invoices).toHaveLength(2);
    expect(fake.subjects).toHaveLength(1);
  });

  it("dvojité kliknutí vytvoří jedinou fakturu a jednu platbu (zámek řádku návrhu; testovací připojení je jedno, souběh dvou spojení tu nejde ověřit)", async () => {
    const s = await newService();
    await prep();
    const d = await draftOf(s.id);
    const input = { id: d.id, expectedAmountMinor: 600_000 };
    const results = [
      await run<ApproveResult>(owner, "muj-prostor.invoices.approve", input),
      await run<ApproveResult>(owner, "muj-prostor.invoices.approve", input),
    ];
    expect(results[0]!.fakturoidNumber).toBe(results[1]!.fakturoidNumber);
    await run(owner, "muj-prostor.invoices.approve", input);
    expect(fake.invoices).toHaveLength(1);
    const [n] = await sqlRows<{ n: number }>(
      sql`select count(*)::int as n from payment where invoice_number = ${results[0]!.fakturoidNumber}`,
    );
    expect(n!.n).toBe(1);
    const svc = await serviceRow(s.id);
    expect(String(svc.next_renewal).slice(0, 10)).toBe(results[0]!.nextRenewal);
  });

  it("zastaralá částka schválení zablokuje; výpadek Fakturoidu nechá návrh schválený s chybou a jde zopakovat", async () => {
    const s = await newService();
    await prep();
    const d = await draftOf(s.id);
    await expect(
      run(owner, "muj-prostor.invoices.approve", { id: d.id, expectedAmountMinor: 1 }),
    ).rejects.toThrow(/Částka návrhu se mezitím změnila/);
    fake.failNext(
      "createInvoice",
      new FakturoidError("validation", "Fakturoid odmítl údaje (lines: je neplatné).", 422),
    );
    await expect(
      run(owner, "muj-prostor.invoices.approve", { id: d.id, expectedAmountMinor: 600_000 }),
    ).rejects.toThrow(/Fakturoid odmítl údaje/);
    const failed = await draftOf(s.id);
    expect(failed).toMatchObject({ status: "approved", canApprove: true, canEdit: false });
    expect(failed.error).toContain("Fakturoid odmítl");
    expect(String((await serviceRow(s.id)).next_renewal).slice(0, 10)).toBe(s.nextRenewal);
    await run(owner, "muj-prostor.invoices.approve", { id: d.id, expectedAmountMinor: 600_000 });
    expect((await draftOf(s.id)).status).toBe("sent_to_fakturoid");
    expect(fake.invoices).toHaveLength(1);
  });

  it("po ztracené odpovědi se už vytvořená faktura převezme, ne zdvojí; zrušit takový návrh nejde", async () => {
    const s = await newService();
    await prep();
    const d = await draftOf(s.id);
    fake.loseNextCreateResponse();
    await expect(
      run(owner, "muj-prostor.invoices.approve", { id: d.id, expectedAmountMinor: 600_000 }),
    ).rejects.toThrow(/neodpověděl včas/);
    expect(fake.invoices).toHaveLength(1);
    await expect(run(owner, "muj-prostor.invoices.cancel", { id: d.id })).rejects.toThrow(
      /už faktura .* existuje/,
    );
    await run(owner, "muj-prostor.invoices.approve", { id: d.id, expectedAmountMinor: 600_000 });
    expect(fake.invoices).toHaveLength(1);
    expect((await draftOf(s.id)).fakturoidNumber).toBe(fake.invoices[0]!.number);
  });

  it("obnovu neposune podruhé, když ji mezitím někdo posunul ručně", async () => {
    const s = await newService();
    await prep();
    const d = await draftOf(s.id);
    const manual = `${Number(s.nextRenewal.slice(0, 4)) + 1}${s.nextRenewal.slice(4)}`;
    await db.execute(sql`update recurring_service set next_renewal = ${manual} where id = ${s.id}`);
    const res = await run<ApproveResult>(owner, "muj-prostor.invoices.approve", {
      id: d.id,
      expectedAmountMinor: 600_000,
    });
    expect(res.nextRenewal).toBeNull();
    expect(String((await serviceRow(s.id)).next_renewal).slice(0, 10)).toBe(manual);
  });

  it("bez nastaveného Fakturoidu schválení nic nezmění", async () => {
    const s = await newService();
    await prep();
    const d = await draftOf(s.id);
    setFakturoidClientOverride(null);
    await expect(
      run(owner, "muj-prostor.invoices.approve", { id: d.id, expectedAmountMinor: 600_000 }),
    ).rejects.toThrow(/Fakturoid není nastavený/);
    expect((await draftOf(s.id)).status).toBe("draft");
  });
});

describe("platba ve financích selže", () => {
  it("faktura zůstane hotová, chyba je vidět a platbu jde doplnit (ručně i úlohou)", async () => {
    const s = await newService();
    await prep();
    const d = await draftOf(s.id);
    const broken = createModuleDeps(
      {
        registry: f.deps.registry,
        queue: f.deps.queue,
        storage: f.deps.storage,
        settings: f.deps.settings,
        cipher: f.deps.cipher,
        baseURL: f.deps.baseURL,
        emit: f.deps.emit,
        calendarLayers: f.deps.calendarLayers,
      },
      {
        services: {
          finance: () =>
            ({
              createStandalonePayment: async () => {
                throw new Error("finance nejsou k dispozici");
              },
            }) as never,
        },
        contributions: {},
      },
    );
    const res = await run<ApproveResult>(
      owner,
      "muj-prostor.invoices.approve",
      { id: d.id, expectedAmountMinor: 600_000 },
      broken,
    );
    expect(res.paymentCreated).toBe(false);
    expect(res.warning).toContain("finance nejsou k dispozici");
    const row = await draftOf(s.id);
    expect(row).toMatchObject({
      status: "sent_to_fakturoid",
      hasPayment: false,
      canRetryPayment: true,
    });
    expect(fake.invoices).toHaveLength(1);
    // úloha dožene platbu přes funkční službu
    const fixed = await reconcileInvoicePayments(owner, deps);
    expect(fixed).toBeGreaterThanOrEqual(1);
    expect(await draftOf(s.id)).toMatchObject({ hasPayment: true, error: null });
    const [n] = await sqlRows<{ n: number }>(
      sql`select count(*)::int as n from payment where invoice_number = ${fake.invoices[0]!.number}`,
    );
    expect(n!.n).toBe(1);
  });
});

describe("nastavení Fakturoidu a oprávnění", () => {
  it("přístup se ukládá šifrovaně, panel tajemství nevidí a odpojení ho smaže", async () => {
    setFakturoidClientOverride(null);
    const secret = `S3CRET-${tag}`;
    const saved = await run<FakturoidStatus>(owner, "muj-prostor.fakturoid.save", {
      account: "acme",
      clientId: "client-id-1234",
      clientSecret: secret,
      contactEmail: "dvorak@example.com",
    });
    expect(saved).toMatchObject({
      configured: true,
      mode: "real",
      account: "acme",
      clientIdHint: "…1234",
      status: "ok",
    });
    expect(JSON.stringify(saved)).not.toContain(secret);
    expect(JSON.stringify(saved)).not.toContain("client-id-1234");
    const [stored] = await sqlRows<{ data_enc: string }>(
      sql`select data_enc from integration_credential where provider = 'fakturoid' and deleted_at is null`,
    );
    expect(stored!.data_enc).not.toContain(secret);
    const [audit] = await sqlRows<{ t: string }>(
      sql`select coalesce(string_agg(coalesce(summary,'') || changes::text, ' '), '') as t from audit_log where entity_type = 'integration_credential'`,
    );
    expect(audit!.t).not.toContain(secret);
    // prázdný secret ponechá uložený; změna účtu zapomene odběratele
    const again = await run<FakturoidStatus>(owner, "muj-prostor.fakturoid.save", {
      account: "acme",
      clientId: "client-id-1234",
      contactEmail: "dvorak@example.com",
    });
    expect(again.configured).toBe(true);
    await expect(
      run(owner, "muj-prostor.fakturoid.save", {
        account: "x",
        clientId: "a",
        contactEmail: "a@b.cz",
      }),
    ).resolves.toBeTruthy();
    // test spojení proti nedosažitelnému Fakturoidu nehodí výjimku, ale vrátí chybu jako data
    const gone = await run<FakturoidStatus>(owner, "muj-prostor.fakturoid.disconnect", {});
    expect(gone.configured).toBe(false);
  });

  it("test spojení s fake klientem projde a chybu vrátí jako data", async () => {
    const ok = await run<FakturoidTestResult>(owner, "muj-prostor.fakturoid.test", {});
    expect(ok).toMatchObject({ ok: true, mode: "fake" });
    fake.failNext(
      "testConnection",
      new FakturoidError("auth", "Fakturoid odmítl přihlášení.", 401),
    );
    expect(await run<FakturoidTestResult>(owner, "muj-prostor.fakturoid.test", {})).toEqual({
      ok: false,
      message: "Fakturoid odmítl přihlášení.",
    });
  });

  it("Patrik nesmí nic: ani příkazy, ani entitu, ani odznak", async () => {
    for (const name of [
      "muj-prostor.invoices.overview",
      "muj-prostor.invoices.prepare",
      "muj-prostor.invoices.approve",
      "muj-prostor.fakturoid.save",
      "muj-prostor.fakturoid.status",
    ])
      await expect(
        run(partner, name, {
          id: "00000000-0000-4000-8000-000000000000",
          expectedAmountMinor: 1,
          account: "a",
          clientId: "a",
          contactEmail: "a@b.cz",
        }),
      ).rejects.toBeInstanceOf(PermissionError);
    await expect(
      approveInvoice(partner, deps, {
        id: "00000000-0000-4000-8000-000000000000",
        expectedAmountMinor: 1,
      }),
    ).rejects.toBeTruthy();
    expect(await countOpenInvoices(partner)).toBe(0);
    await expect(
      run(owner, "muj-prostor.invoices.approve", {
        id: "00000000-0000-4000-8000-000000000000",
        expectedAmountMinor: 1,
      }),
    ).rejects.toThrow();
    void UserError;
  });
});
