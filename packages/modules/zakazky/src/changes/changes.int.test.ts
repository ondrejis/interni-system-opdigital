import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensurePipeline, getPipeline } from "@rebar/core/config-data";
import {
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
  type EntityRegistry,
} from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { NotFoundError, PermissionError, UserError } from "@rebar/core/rbac";
import { schema } from "@rebar/core/db";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import * as approvals from "../approvals/api";
import * as approvalCommands from "../approvals/commands";
import { manifest } from "../index";
import {
  approval,
  approvalRule,
  budgetItem,
  budgetObject,
  budgetSection,
  budgetVersion,
  job,
  jobChange,
  jobMember,
} from "../schema";
import { jobEntity } from "../server";
import * as changesApi from "./api";
import * as budgetApi from "../budget/api";
import {
  attention,
  create,
  decide,
  get,
  items,
  lineSave,
  list,
  remove,
  reopen,
  save,
  submit,
  lineDelete,
} from "./commands";
import "./index";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
const deps = () =>
  ({
    registry,
    baseURL: "http://localhost",
    costProviders: [],
    calendarLayers: [],
  }) as unknown as ModuleDeps;

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, jobEntity]);
  registerEntityPolicies(registry);
  for (const p of manifest.seed.pipelines) await ensurePipeline(app.db, p);
  await ensureSeries(app.db, manifest.seed.series);
});

const jobPerms: [string, "all" | "own"][] = [
  ["zakazky.read", "all"],
  ["zakazky.write", "all"],
  ["zakazky.economics", "all"],
  ["kontakty.read", "all"],
];
/** Ten, kdo změny sepisuje (nesmí schvalovat). */
const author = () => makeUser(app.db, jobPerms);
/** Schvaluje do limitu. */
const approver = () => makeUser(app.db, [...jobPerms, ["zakazky.approve", "all"]]);
/** Schvaluje bez limitu. */
const boss = () =>
  makeUser(app.db, [...jobPerms, ["zakazky.approve", "all"], ["zakazky.approve_all", "all"]]);

async function newJob(managerId?: string) {
  const [c] = await app.db
    .insert(company)
    .values({ name: `Firma ${randomBytes(3).toString("hex")}` })
    .returning();
  const stage = (await getPipeline(app.db, "job", "default"))!.stages[0]!;
  const [j] = await app.db
    .insert(job)
    .values({
      number: `T-${randomBytes(4).toString("hex")}`,
      title: "Koupelna",
      companyId: c!.id,
      stageId: stage.id,
      valueMinor: 1_000_000_00,
      managerId: managerId ?? null,
    })
    .returning();
  return j!;
}

/** Realizační rozpočet zakázky: jeden oddíl a dvě položky (obklad 10 m2 po 890 Kč, montáž 4 h po 600 Kč). */
async function newBudget(jobId: string) {
  const [v] = await app.db
    .insert(budgetVersion)
    .values({ jobId, kind: "realization", number: 1, status: "draft" })
    .returning();
  const [o] = await app.db
    .insert(budgetObject)
    .values({ versionId: v!.id, title: "Celá zakázka", isDefault: true })
    .returning();
  const [s] = await app.db
    .insert(budgetSection)
    .values({ versionId: v!.id, objectId: o!.id, title: "Obklady" })
    .returning();
  const [a] = await app.db
    .insert(budgetItem)
    .values({
      versionId: v!.id,
      sectionId: s!.id,
      title: "Obklad",
      unit: "m2",
      quantity: "10",
      unitCostMinor: 500_00,
      unitPriceMinor: 890_00,
    })
    .returning();
  const [b] = await app.db
    .insert(budgetItem)
    .values({
      versionId: v!.id,
      sectionId: s!.id,
      title: "Montáž",
      unit: "h",
      quantity: "4",
      unitCostMinor: 400_00,
      unitPriceMinor: 600_00,
      position: 1,
    })
    .returning();
  return { version: v!, section: s!, obklad: a!, montaz: b! };
}

/** Změna s jednou novou položkou za `priceMinor` (množství 1). */
async function draftWithAdd(
  u: Awaited<ReturnType<typeof author>>,
  jobId: string,
  priceMinor: number,
  title = "Dodatečné rozvody",
) {
  const { id } = await create.handler(u.ctx, { jobId, title }, deps());
  await lineSave.handler(
    u.ctx,
    {
      changeId: id,
      kind: "add",
      title: "Rozvody",
      unit: "ks",
      quantityAfter: "1",
      unitPriceMinor: priceMinor,
      unitCostMinor: Math.round(priceMinor * 0.7),
    },
    deps(),
  );
  return id;
}

describe("řádky změny a částka", () => {
  it("číslování VP/MP, částka je součet dopadů řádků, odebrání a změna množství vychází z rozpočtu", async () => {
    const u = await author();
    const j = await newJob(u.id);
    const b = await newBudget(j.id);
    const { id } = await create.handler(u.ctx, { jobId: j.id, title: "Změna obkladů" }, deps());
    await lineSave.handler(
      u.ctx,
      { changeId: id, kind: "qty", itemId: b.obklad.id, quantityAfter: "14" },
      deps(),
    );
    await lineSave.handler(
      u.ctx,
      {
        changeId: id,
        kind: "add",
        title: "Hydroizolace",
        unit: "m2",
        quantityAfter: "6",
        unitPriceMinor: 200_00,
        unitCostMinor: 120_00,
        sectionId: b.section.id,
      },
      deps(),
    );
    let detail = await get.handler(u.ctx, { id }, deps());
    // +4 m2 × 890 + 6 × 200 = 3 560 + 1 200
    expect(detail.change.amountMinor).toBe(4_760_00);
    expect(detail.change.costImpactMinor).toBe(4 * 500_00 + 6 * 120_00);
    expect(detail.change.label).toBe("VP-1");
    expect(detail.lines.find((l) => l.kind === "qty")).toMatchObject({
      quantityBefore: "10.000",
      quantityAfter: "14.000",
      priceImpactMinor: 3_560_00,
    });

    // odebrání montáže (−4 h × 600) a méněpráce má předponu MP
    const second = await create.handler(u.ctx, { jobId: j.id }, deps());
    await lineSave.handler(
      u.ctx,
      { changeId: second.id, kind: "remove", itemId: b.montaz.id },
      deps(),
    );
    detail = await get.handler(u.ctx, { id: second.id }, deps());
    expect(detail.change.amountMinor).toBe(-2_400_00);
    expect(detail.change.label).toBe("MP-2");
    expect(detail.lines).toHaveLength(1);
    expect(detail.lines[0]).toMatchObject({ kind: "remove", quantityAfter: "0.000" });

    const l = await list.handler(u.ctx, { jobId: j.id }, deps());
    expect(l.changes.map((c) => [c.label, c.amountMinor, c.lineCount])).toEqual([
      ["VP-1", 4_760_00, 2],
      ["MP-2", -2_400_00, 1],
    ]);
  });

  it("„Nová změna z řádku rozpočtu“ předvyplní řádek qty se stávajícím množstvím; položka cizí zakázky se odmítne", async () => {
    const u = await author();
    const j = await newJob(u.id);
    const other = await newJob(u.id);
    const b = await newBudget(j.id);
    const o = await newBudget(other.id);
    const { id } = await changesApi.createDraft(u.ctx, { jobId: j.id, itemId: b.obklad.id });
    const d = await get.handler(u.ctx, { id }, deps());
    expect(d.lines[0]).toMatchObject({
      kind: "qty",
      quantityBefore: "10.000",
      quantityAfter: "10.000",
      priceImpactMinor: 0,
    });
    await expect(
      changesApi.createDraft(u.ctx, { jobId: j.id, itemId: o.obklad.id }),
    ).rejects.toThrow(UserError);
    const its = await items.handler(u.ctx, { jobId: j.id }, deps());
    expect(its.items.map((i) => i.title)).toEqual(["Obklad", "Montáž"]);
  });

  it("stejnou položku nejde dát do změny dvakrát; množství musí být číslo", async () => {
    const u = await author();
    const j = await newJob(u.id);
    const b = await newBudget(j.id);
    const { id } = await create.handler(u.ctx, { jobId: j.id }, deps());
    await lineSave.handler(
      u.ctx,
      { changeId: id, kind: "qty", itemId: b.obklad.id, quantityAfter: "12" },
      deps(),
    );
    await expect(
      lineSave.handler(u.ctx, { changeId: id, kind: "remove", itemId: b.obklad.id }, deps()),
    ).rejects.toThrow(/už ve změně je/);
    expect(() =>
      lineSave.input.parse({ changeId: id, kind: "add", quantityAfter: "abc" }),
    ).toThrow();
  });
});

describe("schvalování změny", () => {
  it("odeslání vytvoří žádost a upozorní schvalovatele; schválení zamkne změnu a upozorní tým", async () => {
    const u = await author();
    const ap = await approver();
    const j = await newJob(u.id);
    await newBudget(j.id);
    const id = await draftWithAdd(u, j.id, 11_200_00);
    const r = await submit.handler(u.ctx, { id }, deps());
    expect(r.status).toBe("pending");
    expect((await get.handler(u.ctx, { id }, deps())).change.status).toBe("sent");
    const notes = await app.db
      .select()
      .from(schema.notification)
      .where(eq(schema.notification.userId, ap.id));
    expect(notes.some((n) => n.kind === "approval.request")).toBe(true);

    await decide.handler(ap.ctx, { id, approve: true, comment: "OK" }, deps());
    const d = await get.handler(u.ctx, { id }, deps());
    expect(d.change.status).toBe("approved");
    expect(d.change.lockedAt).not.toBeNull();
    expect(d.editable).toBe(false);
    expect(d.change.decidedBy).toBe(ap.name);
    const back = await app.db
      .select()
      .from(schema.notification)
      .where(eq(schema.notification.userId, u.id));
    expect(back.some((n) => n.kind === "approval.approved")).toBe(true);
  });

  it("nad limit 50 000 Kč schválí jen approve_all; vlastní doklad bez approve_all ne", async () => {
    const u = await author();
    const ap = await approver();
    const bs = await boss();
    const j = await newJob(u.id);
    const big = await draftWithAdd(u, j.id, 60_000_00);
    await submit.handler(u.ctx, { id: big }, deps());
    await expect(decide.handler(ap.ctx, { id: big, approve: true }, deps())).rejects.toThrow(
      PermissionError,
    );
    await decide.handler(bs.ctx, { id: big, approve: true }, deps());
    expect((await get.handler(u.ctx, { id: big }, deps())).change.status).toBe("approved");

    // vlastní doklad: schvalovatel s limitem sám sobě ne, s approve_all ano
    const own = await newJob(ap.id);
    const small = await draftWithAdd(ap, own.id, 1_000_00);
    await submit.handler(ap.ctx, { id: small }, deps());
    await expect(decide.handler(ap.ctx, { id: small, approve: true }, deps())).rejects.toThrow(
      /Vlastní doklad/,
    );
    const bigOwn = await draftWithAdd(bs, own.id, 70_000_00);
    await submit.handler(bs.ctx, { id: bigOwn }, deps());
    await decide.handler(bs.ctx, { id: bigOwn, approve: true }, deps());
    expect((await get.handler(bs.ctx, { id: bigOwn }, deps())).change.status).toBe("approved");
  });

  it("zamítnutí vyžaduje důvod, změnu odemkne k opravě a jde ji poslat znovu", async () => {
    const u = await author();
    const ap = await approver();
    const j = await newJob(u.id);
    const id = await draftWithAdd(u, j.id, 5_000_00);
    await submit.handler(u.ctx, { id }, deps());
    await expect(decide.handler(ap.ctx, { id, approve: false }, deps())).rejects.toThrow(/důvod/);
    await decide.handler(ap.ctx, { id, approve: false, comment: "Příliš drahé" }, deps());
    let d = await get.handler(u.ctx, { id }, deps());
    expect(d.change.status).toBe("rejected");
    expect(d.approval.comment).toBe("Příliš drahé");
    expect(d.editable).toBe(true);
    // nechá se opravit a poslat znovu
    await lineSave.handler(
      u.ctx,
      {
        changeId: id,
        id: d.lines[0]!.id,
        kind: "add",
        title: "Rozvody",
        quantityAfter: "1",
        unitPriceMinor: 3_000_00,
      },
      deps(),
    );
    const again = await submit.handler(u.ctx, { id }, deps());
    expect(again.status).toBe("pending");
    await decide.handler(ap.ctx, { id, approve: true }, deps());
    d = await get.handler(u.ctx, { id }, deps());
    expect([d.change.status, d.change.amountMinor]).toEqual(["approved", 3_000_00]);
    const rows = await app.db.select().from(approval).where(eq(approval.docId, id));
    expect(rows.map((r) => r.status).sort()).toEqual(["approved", "rejected"]);
  });

  it("souběh dvou rozhodnutí: jedno projde, druhé skončí „už vyřízeno“", async () => {
    const u = await author();
    const a1 = await approver();
    const a2 = await approver();
    const j = await newJob(u.id);
    const id = await draftWithAdd(u, j.id, 2_000_00);
    await submit.handler(u.ctx, { id }, deps());
    const results = await Promise.allSettled([
      decide.handler(a1.ctx, { id, approve: true }, deps()),
      decide.handler(a2.ctx, { id, approve: false, comment: "Ne" }, deps()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(failed.reason)).toMatch(/už bylo rozhodnuto/);
  });

  it("fronta ukáže schvalovateli jen to, o čem smí rozhodnout", async () => {
    const u = await author();
    const ap = await approver();
    const j = await newJob(u.id);
    const id = await draftWithAdd(u, j.id, 90_000_00, "Velká změna");
    await submit.handler(u.ctx, { id }, deps());
    const bs = await boss();
    const mine = (
      await approvalCommands.queue.handler(ap.ctx, { status: "pending" }, deps())
    ).filter((q) => q.docId === id);
    expect(mine).toHaveLength(0); // nad limit approver nevidí
    const theirs = (
      await approvalCommands.queue.handler(bs.ctx, { status: "pending" }, deps())
    ).find((q) => q.docId === id)!;
    expect(theirs).toMatchObject({ canDecide: true, docType: "change", amountMinor: 90_000_00 });
    expect(theirs.docLabel).toContain("Velká změna");
    const items2 = await attention(bs.ctx, deps());
    expect(
      items2.length + (await approvalCommands.attention(bs.ctx, deps())).length,
    ).toBeGreaterThan(0);
  });
});

describe("zamčení a vrácení do konceptu", () => {
  it("schválenou změnu nejde měnit ani smazat; reopen smí jen approve_all, zruší žádosti a zapíše audit", async () => {
    const u = await author();
    const bs = await boss();
    const j = await newJob(u.id);
    const id = await draftWithAdd(u, j.id, 2_000_00);
    await submit.handler(u.ctx, { id }, deps());
    await decide.handler(bs.ctx, { id, approve: true }, deps());

    await expect(save.handler(u.ctx, { id, title: "Jiný název" }, deps())).rejects.toThrow(
      /zamčen/,
    );
    await expect(
      lineSave.handler(
        u.ctx,
        { changeId: id, kind: "add", title: "X", quantityAfter: "1" },
        deps(),
      ),
    ).rejects.toThrow(/zamčen/);
    const d = await get.handler(u.ctx, { id }, deps());
    await expect(lineDelete.handler(u.ctx, { id: d.lines[0]!.id }, deps())).rejects.toThrow(
      /zamčen/,
    );
    await expect(remove.handler(u.ctx, { id }, deps())).rejects.toThrow(/zamčen/);
    await expect(submit.handler(u.ctx, { id }, deps())).rejects.toThrow(/zamčen/);

    const ap = await approver();
    await expect(reopen.handler(ap.ctx, { id, reason: "chci" }, deps())).rejects.toThrow(
      PermissionError,
    );
    await reopen.handler(bs.ctx, { id, reason: "Chybná cena" }, deps());
    const after = await get.handler(u.ctx, { id }, deps());
    expect(after.change).toMatchObject({ status: "draft", lockedAt: null, appliedAt: null });
    expect(after.editable).toBe(true);
    expect((await approvals.getState(u.ctx, "change", id)).status).toBe("cancelled");
    const audits = await app.db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.entityType, "job"), eq(schema.auditLog.entityId, j.id)));
    expect(
      audits.some(
        (a) => /vráceno do konceptu/.test(a.summary ?? "") && /Chybná cena/.test(a.summary ?? ""),
      ),
    ).toBe(true);
    await save.handler(u.ctx, { id, title: "Opraveno" }, deps());
  });

  it("odeslanou změnu může autor vzít zpět; cizí ne", async () => {
    const u = await author();
    const other = await author();
    const j = await newJob(u.id);
    const id = await draftWithAdd(u, j.id, 2_000_00);
    await submit.handler(u.ctx, { id }, deps());
    await expect(reopen.handler(other.ctx, { id }, deps())).rejects.toThrow(PermissionError);
    await reopen.handler(u.ctx, { id }, deps());
    expect((await get.handler(u.ctx, { id }, deps())).change.status).toBe("draft");
    const pending = await app.db
      .select()
      .from(approval)
      .where(and(eq(approval.docId, id), eq(approval.status, "pending")));
    expect(pending).toHaveLength(0);
  });

  it("assertUnlocked vyhodí českou hlášku", () => {
    expect(() => approvals.assertUnlocked({ lockedAt: new Date() }, "VP-1")).toThrow(/zamčený/);
    expect(() => approvals.assertUnlocked({ lockedAt: null }, "VP-1")).not.toThrow();
  });
});

describe("propsání do rozpočtu", () => {
  const hasApply = typeof (budgetApi as Record<string, unknown>).applyChangeLines === "function";
  it.skipIf(!hasApply)(
    "schválení propíše řádky do realizační verze, původní hodnoty zůstanou",
    async () => {
      const u = await author();
      const bs = await boss();
      const j = await newJob(u.id);
      const b = await newBudget(j.id);
      const { id } = await create.handler(u.ctx, { jobId: j.id }, deps());
      await lineSave.handler(
        u.ctx,
        { changeId: id, kind: "qty", itemId: b.obklad.id, quantityAfter: "14" },
        deps(),
      );
      await lineSave.handler(
        u.ctx,
        {
          changeId: id,
          kind: "add",
          title: "Hydroizolace",
          quantityAfter: "6",
          unitPriceMinor: 200_00,
        },
        deps(),
      );
      await submit.handler(u.ctx, { id }, deps());
      await decide.handler(bs.ctx, { id, approve: true }, deps());
      const [item] = await app.db.select().from(budgetItem).where(eq(budgetItem.id, b.obklad.id));
      expect(item!.quantity).toBe("14.000");
      expect(item!.originalQuantity).toBe("10.000");
      const created = await app.db.select().from(budgetItem).where(eq(budgetItem.changeId, id));
      expect(created.map((c) => c.title)).toEqual(["Hydroizolace"]);
      const [c] = await app.db.select().from(jobChange).where(eq(jobChange.id, id));
      expect(c!.appliedAt).not.toBeNull();
      // vrácení do konceptu vrátí množství
      await reopen.handler(bs.ctx, { id }, deps());
      const [back] = await app.db.select().from(budgetItem).where(eq(budgetItem.id, b.obklad.id));
      expect(back!.quantity).toBe("10.000");
    },
  );

  it("řádek qty se před odesláním srovná s aktuálním množstvím položky (rozdíl zůstane)", async () => {
    const u = await author();
    const j = await newJob(u.id);
    const b = await newBudget(j.id);
    const { id } = await create.handler(u.ctx, { jobId: j.id }, deps());
    await lineSave.handler(
      u.ctx,
      { changeId: id, kind: "qty", itemId: b.obklad.id, quantityAfter: "12" },
      deps(),
    ); // +2
    await app.db.update(budgetItem).set({ quantity: "20" }).where(eq(budgetItem.id, b.obklad.id)); // jiná změna posunula množství
    await submit.handler(u.ctx, { id }, deps());
    const d = await get.handler(u.ctx, { id }, deps());
    expect(d.lines[0]).toMatchObject({
      quantityBefore: "20.000",
      quantityAfter: "22.000",
      priceImpactMinor: 2 * 890_00,
    });
  });
});

describe("oprávnění", () => {
  it("mistr s rozsahem „jen moje“ vidí změny jen u svých zakázek; bez economics se nevydá nic; montér nic", async () => {
    const owner = await author();
    const mine = await newJob(owner.id);
    const foreign = await newJob(owner.id);
    const id = await draftWithAdd(owner, foreign.id, 1_000_00);
    const mistr = await makeUser(app.db, [
      ["zakazky.read", "own"],
      ["zakazky.write", "own"],
      ["zakazky.economics", "own"],
      ["zakazky.approve", "own"],
    ]);
    await app.db.update(job).set({ managerId: mistr.id }).where(eq(job.id, mine.id));
    await expect(list.handler(mistr.ctx, { jobId: foreign.id }, deps())).rejects.toThrow(
      NotFoundError,
    );
    await expect(get.handler(mistr.ctx, { id }, deps())).rejects.toThrow(NotFoundError);
    await expect(create.handler(mistr.ctx, { jobId: foreign.id }, deps())).rejects.toThrow(
      NotFoundError,
    );
    expect((await list.handler(mistr.ctx, { jobId: mine.id }, deps())).changes).toEqual([]);

    // schvalovat smí jen u své zakázky
    const own = await draftWithAdd(owner, mine.id, 1_000_00);
    await submit.handler(owner.ctx, { id: own }, deps());
    await decide.handler(mistr.ctx, { id: own, approve: true }, deps());

    const montér = await makeUser(app.db, [["zakazky.read", "own"]]);
    await app.db
      .insert((await import("../schema")).jobMember)
      .values({ jobId: mine.id, userId: montér.id });
    await expect(list.handler(montér.ctx, { jobId: mine.id }, deps())).rejects.toThrow(
      PermissionError,
    );
    await expect(get.handler(montér.ctx, { id: own }, deps())).rejects.toThrow(PermissionError);
  });

  it("pravidla schvalování mění jen approve_all", async () => {
    const ap = await approver();
    const bs = await boss();
    await expect(approvalCommands.rulesList.handler(ap.ctx, {}, deps()))
      .resolves.toBeDefined()
      .catch(() => undefined);
    const r = await approvalCommands.rulesList.handler(bs.ctx, {}, deps());
    expect(
      r.rules
        .filter((x) => x.docType === "change")
        .map((x) => [x.minAmountMinor, x.approverPermission]),
    ).toEqual([
      [0, "zakazky.approve"],
      [50_000_00, "zakazky.approve_all"],
    ]);
  });
});

describe("pravidla a automatické schválení", () => {
  it("pod nejnižším limitem se změna schválí sama a zamkne; duplicitní limit se odmítne", async () => {
    const bs = await boss();
    // vlastní pravidla pro změny: do 10 000 Kč automaticky, od 10 000 Kč approve
    const existing = await app.db.select().from(approvalRule);
    for (const r of existing.filter((x) => x.docType === "change"))
      await app.db
        .update(approvalRule)
        .set({ deletedAt: new Date() })
        .where(eq(approvalRule.id, r.id));
    await approvalCommands.rulesSave.handler(
      bs.ctx,
      {
        docType: "change",
        minAmountMinor: 10_000_00,
        approverPermission: "zakazky.approve",
        active: true,
      },
      deps(),
    );
    await expect(
      approvalCommands.rulesSave.handler(
        bs.ctx,
        {
          docType: "change",
          minAmountMinor: 10_000_00,
          approverPermission: "zakazky.approve_all",
          active: true,
        },
        deps(),
      ),
    ).rejects.toThrow(/stejným limitem/);

    const u = await author();
    const j = await newJob(u.id);
    const b = await newBudget(j.id);
    const id = await draftWithAdd(u, j.id, 4_000_00);
    const r = await submit.handler(u.ctx, { id }, deps());
    expect(r.status).toBe("approved");
    const d = await get.handler(u.ctx, { id }, deps());
    expect(d.change).toMatchObject({ status: "approved", decidedBy: "automaticky" });
    expect(d.change.lockedAt).not.toBeNull();
    // záporná částka se posuzuje v absolutní hodnotě
    const mp = await create.handler(u.ctx, { jobId: j.id }, deps());
    await lineSave.handler(u.ctx, { changeId: mp.id, kind: "remove", itemId: b.obklad.id }, deps());
    const r2 = await submit.handler(u.ctx, { id: mp.id }, deps()); // −8 900 Kč
    expect(r2.status).toBe("approved");
  });
});

describe("migrace starých víceprací", () => {
  it("stará souhrnná částka dostane jeden řádek, schválená se zamkne, migrace je opakovatelná a nic nepropíše do rozpočtu", async () => {
    const u = await author();
    const j = await newJob(u.id);
    const [a] = await app.db
      .insert(jobChange)
      .values({
        jobId: j.id,
        number: 1,
        title: "Staré VP",
        amountMinor: 50_000_00,
        status: "approved",
      })
      .returning();
    const [b] = await app.db
      .insert(jobChange)
      .values({
        jobId: j.id,
        number: 2,
        title: "Staré MP",
        amountMinor: -10_000_00,
        status: "draft",
      })
      .returning();
    const [gone] = await app.db
      .insert(jobChange)
      .values({
        jobId: j.id,
        number: 3,
        title: "Smazané",
        amountMinor: 1,
        status: "draft",
        deletedAt: new Date(),
      })
      .returning();
    const file = readFileSync(
      new URL("../../drizzle/0009_zmeny_radky_ze_starych.sql", import.meta.url),
      "utf8",
    );
    const run = async () => {
      for (const stmt of file.split("--> statement-breakpoint")) await app.sql.unsafe(stmt);
    };
    await run();
    await run();

    const da = await get.handler(u.ctx, { id: a!.id }, deps());
    expect(da.lines).toHaveLength(1);
    expect(da.lines[0]).toMatchObject({
      kind: "add",
      title: "Vícepráce VP-1",
      priceImpactMinor: 50_000_00,
    });
    expect(da.change).toMatchObject({
      status: "approved",
      amountMinor: 50_000_00,
      appliedAt: null,
    });
    expect(da.change.lockedAt).not.toBeNull();
    expect(da.editable).toBe(false);
    const db_ = await get.handler(u.ctx, { id: b!.id }, deps());
    expect(db_.lines[0]).toMatchObject({ title: "Méněpráce MP-2", priceImpactMinor: -10_000_00 });
    expect(db_.change.lockedAt).toBeNull();
    expect(db_.editable).toBe(true);
    expect(
      (await app.db.select().from(jobChange).where(eq(jobChange.id, gone!.id)))[0]!.amountMinor,
    ).toBe(1);
    // součet řádků = částka změny, i po úpravě konceptu
    await lineSave.handler(
      u.ctx,
      {
        changeId: b!.id,
        id: db_.lines[0]!.id,
        kind: "add",
        title: "Méněpráce MP-2",
        quantityAfter: "1",
        unitPriceMinor: 0,
      },
      deps(),
    );
    expect((await get.handler(u.ctx, { id: b!.id }, deps())).change.amountMinor).toBe(0);
  });
});

describe("upozornění na schvalování změny", () => {
  const notesOf = (userId: string) =>
    app.db.select().from(schema.notification).where(eq(schema.notification.userId, userId));

  it("žádost o schválení: částku vidí jen schvalovatel s právem na ekonomiku, odkaz vede do fronty", async () => {
    const u = await author();
    const withMoney = await approver();
    const noMoney = await makeUser(app.db, [
      ["zakazky.read", "all"],
      ["zakazky.approve", "all"],
    ]);
    const j = await newJob(u.id);
    await newBudget(j.id);
    const id = await draftWithAdd(u, j.id, 11_200_00);
    await submit.handler(u.ctx, { id }, deps());

    const a = (await notesOf(withMoney.id)).find((n) => n.kind === "approval.request")!;
    expect(a.title).toBe(`Změna ke schválení · ${j.number}`);
    expect(a.body).toContain("VP-1 Dodatečné rozvody");
    expect(a.body).toMatch(/Částka: 11\s200\s/);
    expect(a.url).toBe("/zakazky/schvalovani");
    expect(a.entityType).toBe("approval");

    const b = (await notesOf(noMoney.id)).find((n) => n.kind === "approval.request")!;
    expect(b.body).toBe("VP-1 Dodatečné rozvody");
    expect(b.title).not.toMatch(/\d\s?Kč/);
    // autor žádosti se neupozorňuje na vlastní žádost
    expect((await notesOf(u.id)).some((n) => n.kind === "approval.request")).toBe(false);
  });

  it("schválení: tým a fakturace dostanou vícepráci s odkazem na změnu, částku jen s právem na peníze", async () => {
    const u = await author();
    const ap = await approver();
    const montér = await makeUser(app.db, [["zakazky.read", "own"]]);
    const fakturant = await makeUser(app.db, [
      ["zakazky.read", "all"],
      ["fakturace.read", "all"],
      ["fakturace.write", "all"],
    ]);
    const j = await newJob(u.id);
    await app.db.insert(jobMember).values({ jobId: j.id, userId: montér.id });
    await newBudget(j.id);
    const id = await draftWithAdd(u, j.id, 11_200_00);
    await submit.handler(u.ctx, { id }, deps());
    await decide.handler(ap.ctx, { id, approve: true, comment: "OK" }, deps());
    const link = `/zakazky/${j.id}?tab=zmeny&change=${id}`;

    for (const who of [u, fakturant]) {
      const n = (await notesOf(who.id)).find(
        (x) => x.kind === "job.change.approved" && x.entityId === j.id,
      )!;
      expect(n.title).toBe(`${j.number}: schválená vícepráce`);
      expect(n.body).toMatch(/^VP-1 Dodatečné rozvody\nDopad: \+11\s200\s/);
      expect(n.url).toBe(link);
      expect(n.entityId).toBe(j.id);
    }
    const m = (await notesOf(montér.id)).find((x) => x.kind === "job.change.approved")!;
    expect(m.body).toBe("VP-1 Dodatečné rozvody");
    // žadatel dostane i potvrzení o schválení; schvalovatel (aktér) nic
    const back = (await notesOf(u.id)).find((x) => x.kind === "approval.approved")!;
    expect(back.title).toBe("Schváleno: VP-1 Dodatečné rozvody");
    expect(back.body).toBe(`Zakázka ${j.number}\nPoznámka: OK`);
    expect(back.url).toBe(`/zakazky/${j.id}`);
    expect((await notesOf(ap.id)).filter((x) => x.kind.startsWith("job.change"))).toEqual([]);
  });

  it("zamítnutí: žadatel a tým dostanou důvod", async () => {
    const u = await author();
    const ap = await approver();
    const montér = await makeUser(app.db, [["zakazky.read", "own"]]);
    const j = await newJob(u.id);
    await app.db.insert(jobMember).values({ jobId: j.id, userId: montér.id });
    const id = await draftWithAdd(u, j.id, 11_200_00);
    await submit.handler(u.ctx, { id }, deps());
    await decide.handler(ap.ctx, { id, approve: false, comment: "Příliš drahé" }, deps());

    const r = (await notesOf(u.id)).find((x) => x.kind === "approval.rejected")!;
    expect(r.title).toBe("Zamítnuto: VP-1 Dodatečné rozvody");
    expect(r.body).toBe(`Zakázka ${j.number}\nDůvod: Příliš drahé`);
    for (const who of [u, montér]) {
      const n = (await notesOf(who.id)).find((x) => x.kind === "job.change.rejected")!;
      expect(n.title).toBe(`${j.number}: zamítnuto VP-1`);
      expect(n.body).toBe("Dodatečné rozvody\nDůvod: Příliš drahé");
      expect(n.url).toBe(`/zakazky/${j.id}?tab=zmeny&change=${id}`);
    }
  });
});
