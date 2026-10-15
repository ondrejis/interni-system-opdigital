import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SplitRuleInput } from "@rebar/core/contracts";
import { newId } from "@rebar/core/db";
import { createEntityRegistry } from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { sourceCtx, UserError, type Ctx } from "@rebar/core/rbac";
import { createCipher, parseKeyRing } from "@rebar/core/security";
import { createSettings } from "@rebar/core/settings";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { completeJob, setMarketingStage } from "@rebar/zakazky/api";
import { job as jobTable } from "@rebar/zakazky/schema";
import { entities } from "../entities";
import { dataCommands } from "./commands";
import { onPhaseCompleted } from "./events";
import { createFinanceService } from "../service";
import { generateAllRetainers } from "./retainer";
import { defaultSplitSetting } from "./settings";
import { financeMetrics } from "./metrics";
import { clientCardProvider } from "./client-card";
import { addMonths } from "../logic";
import { thisMonth } from "./util";

vi.mock("@rebar/zakazky/api", () => ({
  setMarketingStage: vi.fn(async () => {}),
  completeJob: vi.fn(async () => ({
    openTasks: 0,
    unpaidPayments: 0,
    clientHasOtherActiveJob: false,
  })),
}));

const app = connectAppDb();
afterAll(() => app.close());

const nb = (s: string) => s.replaceAll(String.fromCharCode(160), " ");
const K = (n: number) => n * 100;

let O: Awaited<ReturnType<typeof makeUser>>; // Ondřej (vlastník)
let P: Awaited<ReturnType<typeof makeUser>>; // Patrik (partner)
let deps: ModuleDeps;
const cmd = (name: string) => dataCommands.find((c) => c.name === name)!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = async <T = any>(name: string, ctx: Ctx, input: object = {}): Promise<T> => {
  const c = cmd(name);
  return (await c.handler(ctx, c.input.parse(input) as never, deps)) as T;
};
const sys = () => sourceCtx(app.db, "job", "test");
const pct = (
  userId: string,
  percent: number,
  extra: Partial<SplitRuleInput> = {},
): SplitRuleInput => ({
  userId,
  mode: "percent",
  percent,
  appliesTo: "all",
  ...extra,
});

async function makeJob(over: Partial<typeof jobTable.$inferInsert> = {}, isPrivate = false) {
  const [j] = await app.db
    .insert(jobTable)
    .values({
      number: `Z-T-${newId().slice(-8)}`,
      title: "Zkušební zakázka",
      companyId: newId(),
      type: "web",
      ownerId: O.id,
      isPrivate,
      ...over,
    })
    .returning();
  return j!;
}

beforeAll(async () => {
  const fin = [
    "finance.read",
    "finance.payments_write",
    "finance.splits_edit",
    "finance.settlements_write",
    "finance.settings",
    "settings.manage",
    "private.read",
  ] as const;
  O = await makeUser(
    app.db,
    fin.map((k): [string, "all"] => [k, "all"]),
    { name: "Ondřej Test" },
  );
  P = await makeUser(
    app.db,
    [
      ["finance.read", "all"],
      ["finance.payments_write", "all"],
    ],
    { name: "Patrik Test" },
  );
  const cipher = createCipher(
    parseKeyRing({ APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") }),
  );
  const settings = createSettings(cipher);
  deps = {
    registry: createEntityRegistry(entities),
    settings,
    services: { optional: () => undefined, get: () => undefined as never, all: () => [] },
  } as unknown as ModuleDeps;
  await settings.set(O.ctx, defaultSplitSetting, { rules: [pct(O.id, 50), pct(P.id, 50)] });
});

describe("AS-02: platba → rozdělení → saldo → vyrovnání", () => {
  it("60/40, Plánovaná → Vystavená → Zaplacená, saldo a vyrovnání se stornem", async () => {
    const j = await makeJob();
    await run("finance.split.set", O.ctx, { jobId: j.id, rules: [pct(O.id, 60), pct(P.id, 40)] });
    const created = await run("finance.payment.create", O.ctx, {
      jobId: j.id,
      description: "Web",
      amountMinor: K(50_000),
      issuerId: O.id,
    });
    expect(created.status).toBe("ok");
    const id = created.payment.id as string;
    expect(created.payment.allocations).toEqual(
      expect.arrayContaining([
        { userId: O.id, amountMinor: K(30_000) },
        { userId: P.id, amountMinor: K(20_000) },
      ]),
    );
    // vystavená bez čísla faktury nejde
    await expect(run("finance.payment.transition", O.ctx, { id, to: "issued" })).rejects.toThrow(
      UserError,
    );
    const issued = await run("finance.payment.transition", O.ctx, {
      id,
      to: "issued",
      invoiceNumber: "2026001",
      issuedOn: "2026-10-01",
      dueOn: "2026-10-10",
    });
    expect(issued.payment.status).toBe("issued");
    expect(issued.payment.dueState).toBe("overdue"); // dnešek je po 10. 10. 2026
    let bal = await run("finance.balance", O.ctx);
    expect(bal.headlineText).toBe("Vyrovnáno"); // základ „zaplacené“, zatím nic
    const paid = await run("finance.payment.transition", O.ctx, {
      id,
      to: "paid",
      paidOn: "2026-10-12",
    });
    expect(paid.payment.paidOn).toBe("2026-10-12");
    bal = await run("finance.balance", O.ctx);
    expect(nb(bal.headlineText)).toBe("Ondřej dluží Patrikovi 20 000 Kč");
    expect(bal.suggestedSettlement).toEqual({
      fromUserId: O.id,
      toUserId: P.id,
      amountMinor: K(20_000),
    });
    // partner vidí totéž číslo
    expect((await run("finance.balance", P.ctx)).headline).toEqual(bal.headline);
    // měsíční rozpis a rozklik
    const months = await run("finance.balance.months", O.ctx, { month: "2026-10" });
    expect(months.months[0].difference[O.id]).toBe(K(50_000) - K(30_000));
    expect(months.payments.map((p: { id: string }) => p.id)).toContain(id);
    // widgety: příjem tento měsíc a saldo
    const income = financeMetrics.find((m) => m.key === "finance.income_month")!;
    const r = await income.compute(
      O.ctx,
      {
        from: "2026-10-01",
        to: "2026-10-31",
        jobId: null,
        userId: null,
        bucket: null,
        limit: 10,
        params: {},
        today: "2026-10-15",
      },
      deps,
    );
    expect(r).toEqual({ kind: "scalar", value: expect.any(Number) });
    // vyrovnání O → P 20 000, pak storno
    const s = await run("finance.settlement.create", O.ctx, {
      fromUserId: O.id,
      toUserId: P.id,
      amountMinor: K(20_000),
      settledOn: "2026-10-13",
      method: "transfer",
      reference: "PREV-1",
    });
    expect((await run("finance.balance", O.ctx)).headlineText).toBe("Vyrovnáno");
    await run("finance.settlement.cancel", O.ctx, { id: s.id });
    expect(nb((await run("finance.balance", O.ctx)).headlineText)).toBe(
      "Ondřej dluží Patrikovi 20 000 Kč",
    );
  });

  it("přepočet zaplacené platby vyžaduje potvrzení a bez něj nic nezapíše", async () => {
    const j = await makeJob();
    await run("finance.split.set", O.ctx, { jobId: j.id, rules: [pct(O.id, 50), pct(P.id, 50)] });
    const c = await run("finance.payment.create", O.ctx, {
      jobId: j.id,
      description: "Platba",
      amountMinor: K(10_000),
      issuerId: O.id,
      status: "paid",
      invoiceNumber: "9",
      paidOn: "2026-10-02",
      issuedOn: "2026-10-01",
    });
    const rules = [pct(O.id, 70), pct(P.id, 30)];
    const r1 = await run("finance.split.set", O.ctx, { jobId: j.id, rules });
    expect(r1.status).toBe("needs_confirmation");
    expect(r1.changes[0].before).toEqual(
      expect.arrayContaining([{ userId: P.id, amountMinor: K(5_000) }]),
    );
    expect((await run("finance.split.get", O.ctx, { jobId: j.id })).rules[0].percent).toBe(50);
    const r2 = await run("finance.split.set", O.ctx, { jobId: j.id, rules, confirmRecalc: true });
    expect(r2.status).toBe("ok");
    expect(r2.recalculated).toBe(1);
    const d = await run("finance.payment.get", O.ctx, { id: c.payment.id });
    expect(d.payment.allocations).toEqual(
      expect.arrayContaining([
        { userId: O.id, amountMinor: K(7_000) },
        { userId: P.id, amountMinor: K(3_000) },
      ]),
    );
    // součet procent nad 100 % je chyba
    await expect(
      run("finance.split.set", O.ctx, { jobId: j.id, rules: [pct(O.id, 70), pct(P.id, 50)] }),
    ).rejects.toThrow(/100/);
  });

  it("ruční přepis rozdělení a částka ručně rozdělené platby", async () => {
    const j = await makeJob();
    await run("finance.split.set", O.ctx, { jobId: j.id, rules: [pct(O.id, 50), pct(P.id, 50)] });
    const c = await run("finance.payment.create", O.ctx, {
      jobId: j.id,
      description: "X",
      amountMinor: K(1_000),
      issuerId: O.id,
    });
    const id = c.payment.id;
    const m = await run("finance.payment.overrideAllocation", O.ctx, {
      id,
      allocations: [
        { userId: O.id, amountMinor: K(100) },
        { userId: P.id, amountMinor: K(900) },
      ],
    });
    expect(m.payment.allocationMode).toBe("manual");
    await expect(
      run("finance.payment.update", O.ctx, { id, amountMinor: K(2_000) }),
    ).rejects.toThrow(/ručně/);
    const back = await run("finance.payment.overrideAllocation", O.ctx, { id, allocations: null });
    expect(back.payment.allocationMode).toBe("rules");
    expect(back.payment.allocations).toEqual(
      expect.arrayContaining([
        { userId: O.id, amountMinor: K(500) },
        { userId: P.id, amountMinor: K(500) },
      ]),
    );
    // partner bez splits_edit nezadá ruční rozdělení při založení
    await expect(
      run("finance.payment.create", P.ctx, {
        jobId: j.id,
        description: "Y",
        amountMinor: K(10),
        issuerId: P.id,
        allocations: [{ userId: P.id, amountMinor: K(10) }],
      }),
    ).rejects.toThrow(UserError);
  });

  it("fixně celkem se odečítá postupně (scénář 7) a zrušení platby uvolní zbytek", async () => {
    const j = await makeJob();
    await run("finance.split.set", O.ctx, {
      jobId: j.id,
      rules: [
        { userId: P.id, mode: "fixed_total", fixedMinor: K(10_000), appliesTo: "all" },
        pct(O.id, 100),
      ],
    });
    const a = await run("finance.payment.create", O.ctx, {
      jobId: j.id,
      description: "1",
      amountMinor: K(6_000),
      issuerId: P.id,
      issuedOn: "2026-10-01",
    });
    const b = await run("finance.payment.create", O.ctx, {
      jobId: j.id,
      description: "2",
      amountMinor: K(6_000),
      issuerId: P.id,
      issuedOn: "2026-10-02",
    });
    const amount = (p: { allocations: { userId: string; amountMinor: number }[] }, u: string) =>
      p.allocations.find((x) => x.userId === u)?.amountMinor ?? 0;
    expect(amount(a.payment, P.id)).toBe(K(6_000));
    expect(amount(b.payment, P.id)).toBe(K(4_000));
    expect(amount(b.payment, O.id)).toBe(K(2_000));
    await run("finance.payment.transition", O.ctx, { id: a.payment.id, to: "canceled" });
    const b2 = await run("finance.payment.get", O.ctx, { id: b.payment.id });
    expect(amount(b2.payment, P.id)).toBe(K(6_000));
  });
});

describe("AS-03: úvodní fáze → retainer", () => {
  it("2 × 7 000 ze šablony, saldo 0, rozhodnutí, Pokračovat a idempotentní měsíční úloha", async () => {
    const j = await makeJob({
      type: "marketing",
      billingModel: "intro_then_retainer",
      marketingStage: "intro",
    });
    const svc = createFinanceService(deps);
    const { paymentIds } = await svc.initJobFinance(O.ctx, {
      jobId: j.id,
      startDate: "2026-10-01",
      ownerId: O.id,
      billingModel: "intro_then_retainer",
      templatePayments: [
        { description: "Úvodní fáze 1/2", kind: "intro", amountMinor: K(7_000), issuerId: P.id },
        { description: "Úvodní fáze 2/2", kind: "intro", amountMinor: K(7_000), issuerId: O.id },
      ],
    });
    expect(paymentIds).toHaveLength(2);
    expect(await svc.unpaidCount(O.ctx, { jobId: j.id })).toBe(2);
    for (const id of paymentIds)
      await run("finance.payment.transition", O.ctx, {
        id,
        to: "paid",
        invoiceNumber: `I${id.slice(-4)}`,
        issuedOn: "2026-10-01",
        paidOn: "2026-10-05",
      });
    const rows = (await run("finance.job.overview", O.ctx, { jobId: j.id })).payments;
    for (const r of rows) {
      expect(r.allocations.find((a: { userId: string }) => a.userId === O.id)?.amountMinor).toBe(
        K(3_500),
      );
    }
    expect(await svc.allocatedByUser(O.ctx, j.id)).toEqual({ [O.id]: K(7_000), [P.id]: K(7_000) });
    // intro platby se u zakázky bez modelu „úvod → retainer“ nezakládají
    const j2 = await makeJob({ type: "web", billingModel: "one_off" });
    const r2 = await svc.initJobFinance(O.ctx, {
      jobId: j2.id,
      startDate: "2026-10-01",
      ownerId: O.id,
      templatePayments: [
        { description: "Úvod", kind: "intro", amountMinor: K(1), issuerId: O.id },
        { description: "Web", kind: "one_off", amountMinor: K(2), issuerId: O.id },
      ],
    });
    expect(r2.paymentIds).toHaveLength(1);

    // dokončení vyhodnocení → rozhodnutí
    vi.mocked(setMarketingStage).mockClear();
    await onPhaseCompleted(
      O.ctx,
      {
        data: {
          jobId: j.id,
          phaseId: newId(),
          name: "Vyhodnocení úvodní fáze",
          role: "intro_evaluation",
          type: "marketing",
          marketingStage: "intro",
          isLast: false,
        },
      } as never,
      deps,
    );
    expect(setMarketingStage).toHaveBeenCalledWith(expect.anything(), j.id, "decision");
    await db_setStage(j.id, "decision");

    // Pokračovat: 15 000 měsíčně od příštího měsíce, střídání (první Patrik)
    const from = addMonths(thisMonth(), 1);
    const cont = await run("finance.retainer.continue", O.ctx, {
      jobId: j.id,
      amountMinor: K(15_000),
      fromMonth: from,
      issueDay: 15,
      issuerMode: "alternate",
      issuerId: O.id,
      firstIssuerId: P.id,
    });
    expect(cont.paymentIds).toEqual([]); // zatím žádný měsíc nenastal
    expect(setMarketingStage).toHaveBeenCalledWith(expect.anything(), j.id, "retainer");
    const created = await generateAllRetainers(sys(), deps, from);
    expect(created.created).toBeGreaterThanOrEqual(1);
    const again = await generateAllRetainers(sys(), deps, from);
    expect(again.created).toBe(0);
    const next = await generateAllRetainers(sys(), deps, addMonths(from, 1));
    expect(next.created).toBeGreaterThanOrEqual(1);
    const ov = await run("finance.job.overview", O.ctx, { jobId: j.id });
    const ret = ov.payments
      .filter((p: { kind: string }) => p.kind === "retainer")
      .sort((a: { periodMonth: string }, b: { periodMonth: string }) =>
        a.periodMonth.localeCompare(b.periodMonth),
      );
    expect(ret).toHaveLength(2);
    expect(ret[0].description).toBe(`Retainer ${from.slice(5)}/${from.slice(0, 4)}`);
    expect(ret[0].issuerId).toBe(P.id);
    expect(ret[1].issuerId).toBe(O.id);
    expect(ret[0].issuedOn).toBe(`${from}-15`);
    expect(
      ret[0].allocations.reduce((s: number, a: { amountMinor: number }) => s + a.amountMinor, 0),
    ).toBe(K(15_000));
    await expect(
      run("finance.retainer.continue", O.ctx, {
        jobId: j.id,
        amountMinor: K(1),
        fromMonth: from,
        issueDay: 1,
        issuerMode: "fixed",
        issuerId: O.id,
      }),
    ).rejects.toThrow(UserError);
  });
});

async function db_setStage(jobId: string, stage: "intro" | "decision" | "retainer" | "ended") {
  const { eq } = await import("drizzle-orm");
  await app.db.update(jobTable).set({ marketingStage: stage }).where(eq(jobTable.id, jobId));
}

describe("AS-04: změna poměru retaineru bez přepočtu minulosti, ukončení", () => {
  it("70/30 do 12/2026, od 01/2027 50/50; ukončení zruší budoucí plánované platby", async () => {
    const j = await makeJob({ type: "marketing", billingModel: "retainer" });
    await run("finance.split.set", O.ctx, { jobId: j.id, rules: [pct(O.id, 50), pct(P.id, 50)] });
    await run("finance.retainer.continue", O.ctx, {
      jobId: j.id,
      amountMinor: K(15_000),
      fromMonth: "2026-12",
      issueDay: 1,
      issuerMode: "fixed",
      issuerId: O.id,
      split: [
        pct(O.id, 70, { validTo: "2026-12" }),
        pct(P.id, 30, { validTo: "2026-12" }),
        pct(O.id, 50, { validFrom: "2027-01" }),
        pct(P.id, 50, { validFrom: "2027-01" }),
      ],
    });
    await generateAllRetainers(sys(), deps, "2027-02");
    const ov = await run("finance.job.overview", O.ctx, { jobId: j.id });
    const by = (m: string) => ov.payments.find((p: { periodMonth: string }) => p.periodMonth === m);
    const sum = (p: { allocations: { userId: string; amountMinor: number }[] }, u: string) =>
      p.allocations.find((a) => a.userId === u)?.amountMinor ?? 0;
    expect([sum(by("2026-12"), O.id), sum(by("2026-12"), P.id)]).toEqual([K(10_500), K(4_500)]);
    expect([sum(by("2027-01"), O.id), sum(by("2027-01"), P.id)]).toEqual([K(7_500), K(7_500)]);
    // partner bez splits_edit nezmění pravidla retaineru
    await expect(
      run("finance.retainer.change", P.ctx, { jobId: j.id, split: [pct(P.id, 100)] }),
    ).rejects.toThrow(UserError);
    // ukončení k 12/2026: zruší se 01/2027 a 02/2027
    const prev = await run("finance.retainer.endPreview", O.ctx, {
      jobId: j.id,
      endMonth: "2026-12",
    });
    expect(prev.cancel.map((c: { periodMonth: string }) => c.periodMonth)).toEqual([
      "2027-01",
      "2027-02",
    ]);
    const end = await run("finance.retainer.end", O.ctx, { jobId: j.id, endMonth: "2026-12" });
    expect(end.canceledPaymentIds).toHaveLength(2);
    expect(end.completed).toBeNull(); // končí v budoucnu, zakázka běží
    const after = await run("finance.job.overview", O.ctx, { jobId: j.id });
    expect(after.payments.filter((p: { status: string }) => p.status === "canceled")).toHaveLength(
      2,
    );
    await generateAllRetainers(sys(), deps, "2027-06");
    expect((await run("finance.job.overview", O.ctx, { jobId: j.id })).payments).toHaveLength(
      after.payments.length,
    );
    // ukončení k minulému měsíci dokončí zakázku
    const j2 = await makeJob({
      type: "marketing",
      billingModel: "retainer",
      marketingStage: "decision",
    });
    vi.mocked(completeJob).mockClear();
    const e2 = await run("finance.retainer.end", O.ctx, { jobId: j2.id });
    expect(completeJob).toHaveBeenCalledWith(expect.anything(), deps, {
      jobId: j2.id,
      reason: "retainer_ended",
    });
    expect(e2.completed).toEqual({
      openTasks: 0,
      unpaidPayments: 0,
      clientHasOtherActiveJob: false,
    });
  });
});

describe("soukromí", () => {
  it("soukromá zakázka a platba z Fakturoidu nejsou vidět partnerovi ani v saldu", async () => {
    const pub = await makeJob();
    const priv = await makeJob({}, true);
    await run("finance.split.set", O.ctx, { jobId: pub.id, rules: [pct(O.id, 50), pct(P.id, 50)] });
    await run("finance.split.set", O.ctx, { jobId: priv.id, rules: [pct(O.id, 100)] });
    const company = newId();
    const mk = (jobId: string, desc: string) =>
      run("finance.payment.create", O.ctx, {
        jobId,
        description: desc,
        amountMinor: K(1_000),
        issuerId: O.id,
        status: "paid",
        invoiceNumber: "P",
        paidOn: "2026-10-03",
        issuedOn: "2026-10-01",
      });
    await mk(pub.id, "PRIVATE-CANARY-public-job");
    const p2 = await mk(priv.id, "PRIVATE-CANARY-private-job");
    expect(p2.payment.isPrivate).toBe(true);
    const svc = createFinanceService(deps);
    const st = await svc.createStandalonePayment(O.ctx, {
      companyId: company,
      description: "PRIVATE-CANARY-fakturoid",
      amountMinor: K(3_000),
      invoiceNumber: "F1",
      invoiceUrl: "https://x.test/f1",
      issuedOn: "2026-10-01",
    });
    const ownerList = await run("finance.payment.list", O.ctx, { search: "PRIVATE-CANARY" });
    expect(ownerList.total).toBe(3);
    const partnerList = await run("finance.payment.list", P.ctx, { search: "PRIVATE-CANARY" });
    expect(partnerList.total).toBe(1);
    expect(JSON.stringify(partnerList)).not.toContain("private-job");
    expect(JSON.stringify(partnerList)).not.toContain("fakturoid");
    await expect(run("finance.payment.get", P.ctx, { id: st.id })).rejects.toThrow();
    await expect(run("finance.job.overview", P.ctx, { jobId: priv.id })).rejects.toThrow();
    // saldo nezahrnuje soukromé ani pro vlastníka: jen veřejná platba 1 000 Kč → Ondřej dluží Patrikovi 500
    const bal = await run("finance.balance", O.ctx);
    expect(
      bal.perPerson.reduce((s: number, p: { invoicedMinor: number }) => s + p.invoicedMinor, 0),
    ).toBeGreaterThanOrEqual(K(1_000));
    expect(JSON.stringify(bal)).not.toContain("CANARY");
    // karta klienta: partner nevidí soukromé součty
    expect((await clientCardProvider.tabCounts!(P.ctx, company)).finance).toBe(0);
    expect((await clientCardProvider.tabCounts!(O.ctx, company)).finance).toBe(1);
    expect(
      (await svc.incomeSince(P.ctx, { companyIds: [company], from: "2026-01-01" }))[company],
    ).toBe(0);
    // metriky a odznak
    for (const m of financeMetrics) {
      const res = JSON.stringify(
        await m.compute(
          P.ctx,
          {
            from: null,
            to: null,
            jobId: null,
            userId: null,
            bucket: null,
            limit: 10,
            params: {},
            today: "2026-10-15",
          },
          deps,
        ),
      );
      expect(res).not.toContain("CANARY");
    }
  });
});
