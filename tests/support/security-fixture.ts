import { randomBytes } from "node:crypto";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { collectPermissions } from "@rebar/core";
import { getPipeline } from "@rebar/core/config-data";
import { schema, type Db } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  indexRecord,
  registerEntityPolicies,
} from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { setJobFinanceProviders } from "@rebar/core/module-server";
import { createCtx, loadActor, type Ctx } from "@rebar/core/rbac";
import { DEFAULT_ROLES, runSeed } from "@rebar/core/seed";
import { createCipher, parseKeyRing } from "@rebar/core/security";
import { createSettings } from "@rebar/core/settings";
import { invoice, invoiceLine, receivedInvoice } from "@rebar/fakturace/schema";
import { company, person } from "@rebar/kontakty/schema";
import { crmActivity, crmActivityType, crmNote, inquiry } from "@rebar/poptavky/schema";
import { eventAttendee, event, calendarResource, calendarImport } from "@rebar/kalendar/schema";
import { defect, handoverProtocol, jobPhase, siteDiary } from "@rebar/realizace/schema";
import { timeEntry } from "@rebar/dochazka/schema";
import {
  stockDoc,
  stockDocLine,
  stockItem,
  stockLevel,
  warehouse,
  purchaseOrder,
  purchaseOrderLine,
  stockCount,
} from "@rebar/sklad/schema";
import {
  asset,
  assetDefect,
  assetFuel,
  assetLog,
  assetReservation,
  assetService,
} from "@rebar/stroje/schema";
import {
  approval,
  budgetItem,
  budgetObject,
  budgetSection,
  budgetVersion,
  job,
  jobChange,
  jobChangeLine,
  jobCost,
  jobMember,
  jobOrder,
  jobOrderLine,
  jobShare,
  jobTemplate,
  workStatement,
  workStatementLine,
} from "@rebar/zakazky/schema";
import { ALL_MODULES } from "../../apps/web/src/modules";
import { buildRegistry, collectServers } from "../../apps/web/src/server/modules-server";

/**
 * Pevná sestava pro matici oprávnění: výchozí role z jádra (`DEFAULT_ROLES`) a dvě zakázky se **všemi druhy peněz**
 * (rozpočet, náklady, objednávky, změny, soupisy, faktury, sklad, stroje, docházka s hodinovou sazbou).
 * Zakázka A patří mistru A a montéru A, zakázka B mistru B a montéru B (cizí zakázka z pohledu A).
 */
export const ROLE_KEYS = ["owner", "office", "foreman", "worker"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

/** Částky ve fixtuře jsou „podpisové“: 7 777 777 a podobné, aby je skener v odpovědích spolehlivě našel. */
export const MONEY = {
  contract: 7_777_700,
  cost: 3_333_300,
  sellUnit: 1_234_500,
  costUnit: 987_600,
  rate: 45_600,
  invoice: 5_550_000,
};

export type Fixture = Awaited<ReturnType<typeof buildFixture>>;

export async function buildFixture(db: Db) {
  clearEntityPolicies();
  const collected = collectServers(ALL_MODULES);
  const registry = buildRegistry(collected.entities);
  createEntityRegistry(collected.entities); // ověří konzistenci registru
  registerEntityPolicies(registry);
  setJobFinanceProviders({
    costProviders: collected.costProviders,
    invoicing: collected.jobInvoicing,
  });
  const catalog = new Set(collectPermissions(ALL_MODULES).map((p) => p.key));
  // role mají v testu vlastní klíče (`sec-owner`…), aby se nepletly s rolemi, které zakládají jiné soubory testů
  await runSeed(
    db,
    { roles: DEFAULT_ROLES.map((r) => ({ ...r, key: `sec-${r.key}` })) },
    {
      config: { security: { require2faRoles: [], idleTimeoutMinutes: 480 } } as never,
      catalog,
      moduleSeeds: ALL_MODULES.flatMap((m) => (m.seed ? [m.seed] : [])),
    },
  );

  const cipher = createCipher(
    parseKeyRing({ APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") }),
  );
  const deps: ModuleDeps = {
    registry,
    queue: { send: async () => null },
    storage: {
      put: async () => {},
      get: async () => null,
      delete: async () => {},
    } as never,
    settings: createSettings(cipher),
    cipher,
    baseURL: "http://localhost:3100",
    emit: async () => {},
    costProviders: collected.costProviders,
    calendarLayers: collected.calendarLayers,
    diaryPrefill: collected.diaryPrefill,
  };

  const entityDef = (key: string) => collected.entities.find((e) => e.key === key)!;

  /* ---------- lidé ---------- */
  const people = {} as Record<string, { id: string; ctx: Ctx; role: RoleKey; name: string }>;
  async function addUser(key: string, role: RoleKey) {
    const [r] = await db
      .select()
      .from(schema.role)
      .where(eq(schema.role.key, `sec-${role}`));
    const [u] = await db
      .insert(schema.user)
      .values({
        name: `Uživatel ${key}`,
        email: `${key}-${randomBytes(3).toString("hex")}@test.example`,
        roleId: r!.id,
      })
      .returning();
    const actor = (await loadActor(db, u!.id, { catalog }))!;
    people[key] = { id: u!.id, ctx: createCtx(db, actor), role, name: u!.name };
    return people[key]!;
  }
  const owner = await addUser("owner", "owner");
  const office = await addUser("office", "office");
  const foremanA = await addUser("foremanA", "foreman");
  const foremanB = await addUser("foremanB", "foreman");
  const workerA = await addUser("workerA", "worker");
  const workerB = await addUser("workerB", "worker");

  /* ---------- kontakty, poptávka ---------- */
  const [client] = await db
    .insert(company)
    .values({
      name: "Klient s.r.o.",
      ico: String(10_000_000 + Math.floor(Math.random() * 89_000_000)),
    })
    .returning();
  const [supplier] = await db
    .insert(company)
    .values({
      name: "Dodavatel a.s.",
      ico: String(10_000_000 + Math.floor(Math.random() * 89_000_000)),
    })
    .returning();
  const [contact] = await db
    .insert(person)
    .values({ name: "Jan Kontakt", companyId: client!.id })
    .returning();
  const inquiryStage = (await getPipeline(db, "inquiry", "default"))!.stages[0]!;
  const [inq] = await db
    .insert(inquiry)
    .values({ title: "Poptávka", stageId: inquiryStage.id, expectedValueMinor: MONEY.contract })
    .returning();

  /* ---------- zakázky ---------- */
  const jobStage = (await getPipeline(db, "job", "default"))!.stages[0]!;
  async function makeJob(tag: string, managerId: string, memberId: string) {
    const [j] = await db
      .insert(job)
      .values({
        number: `SEC-${tag}-${randomBytes(2).toString("hex")}`,
        title: `Zakázka ${tag}`,
        companyId: client!.id,
        stageId: jobStage.id,
        phase: "execution",
        managerId,
        valueMinor: MONEY.contract,
        sumContractMinor: MONEY.contract,
        sumPlannedCostMinor: MONEY.cost,
        sumCostMinor: MONEY.cost,
        sumInvoicedMinor: MONEY.invoice,
        sumPaidMinor: MONEY.invoice,
        sumMarginPct: "27.3",
        sumDrawdownPct: "61.1",
        retentionBp: 500,
        startDate: "2026-09-01",
        endDate: "2026-12-01",
      })
      .returning();
    await db.insert(jobMember).values({ jobId: j!.id, userId: memberId });
    await indexRecord(db, { def: entityDef("job") }, j!);

    const [v] = await db
      .insert(budgetVersion)
      .values({ jobId: j!.id, kind: "realization", number: 1 })
      .returning();
    const [o] = await db
      .insert(budgetObject)
      .values({ versionId: v!.id, title: "Celá zakázka", isDefault: true })
      .returning();
    const [s] = await db
      .insert(budgetSection)
      .values({ versionId: v!.id, objectId: o!.id, title: "Elektro", costCategory: "labour" })
      .returning();
    const [it] = await db
      .insert(budgetItem)
      .values({
        versionId: v!.id,
        sectionId: s!.id,
        title: "Rozvody",
        quantity: "10",
        unitCostMinor: MONEY.costUnit,
        unitPriceMinor: MONEY.sellUnit,
      })
      .returning();
    const [ov] = await db
      .insert(budgetVersion)
      .values({ jobId: j!.id, kind: "offer", number: 1, status: "won" })
      .returning();
    const [oo] = await db
      .insert(budgetObject)
      .values({ versionId: ov!.id, title: "Celá zakázka", isDefault: true })
      .returning();
    const [os] = await db
      .insert(budgetSection)
      .values({ versionId: ov!.id, objectId: oo!.id, title: "Elektro" })
      .returning();
    await db.insert(budgetItem).values({
      versionId: ov!.id,
      sectionId: os!.id,
      title: "Rozvody",
      quantity: "10",
      unitCostMinor: MONEY.costUnit,
      unitPriceMinor: MONEY.sellUnit,
    });
    const [cost] = await db
      .insert(jobCost)
      .values({
        jobId: j!.id,
        date: "2026-09-10",
        category: "material",
        title: "Kabely",
        amountMinor: MONEY.cost,
      })
      .returning();

    const [ord] = await db
      .insert(jobOrder)
      .values({
        jobId: j!.id,
        number: `OBJ-${tag}-${randomBytes(2).toString("hex")}`,
        title: "Objednávka kabelů",
        supplierId: supplier!.id,
        totalMinor: MONEY.cost,
      })
      .returning();
    await db.insert(jobOrderLine).values({
      orderId: ord!.id,
      title: "Kabel",
      quantity: "5",
      unitPriceMinor: MONEY.sellUnit,
    });

    const [chg] = await db
      .insert(jobChange)
      .values({
        jobId: j!.id,
        number: 1,
        title: "Víceprác",
        amountMinor: MONEY.cost,
        costImpactMinor: MONEY.cost,
      })
      .returning();
    await db.insert(jobChangeLine).values({
      changeId: chg!.id,
      kind: "qty",
      title: "Víceprác",
      unitPriceMinor: MONEY.sellUnit,
      unitCostMinor: MONEY.costUnit,
      priceImpactMinor: MONEY.cost,
      costImpactMinor: MONEY.cost,
    });

    const [st] = await db
      .insert(workStatement)
      .values({
        jobId: j!.id,
        number: 1,
        periodFrom: "2026-09-01",
        periodTo: "2026-09-30",
        claimedMinor: MONEY.cost,
        approvedMinor: MONEY.cost,
      })
      .returning();
    await db.insert(workStatementLine).values({
      statementId: st!.id,
      itemId: it!.id,
      quantityPeriod: "2",
      quantityTotal: "2",
      amountPeriodMinor: MONEY.cost,
      amountTotalMinor: MONEY.cost,
    });

    const [apr] = await db
      .insert(approval)
      .values({ docType: "change", docId: chg!.id, jobId: j!.id, amountMinor: MONEY.cost })
      .returning();
    const [shr] = await db
      .insert(jobShare)
      .values({
        jobId: j!.id,
        tokenHash: createHash("sha256").update(randomBytes(16)).digest("hex"),
        label: "Investor",
        scope: { diary: true } as never,
      })
      .returning();

    const [inv] = await db
      .insert(invoice)
      .values({
        title: "Faktura",
        kind: "standard",
        jobId: j!.id,
        companyId: client!.id,
        netMinor: MONEY.invoice,
        grossMinor: MONEY.invoice,
        number: `FV${randomBytes(3).toString("hex")}`,
      } as never)
      .returning();
    await indexRecord(db, { def: entityDef("invoice") }, inv!);
    await db.insert(invoiceLine).values({
      invoiceId: inv!.id,
      description: "Práce",
      unitPriceMinor: MONEY.sellUnit,
      netMinor: MONEY.invoice,
      grossMinor: MONEY.invoice,
    });
    const [rcv] = await db
      .insert(receivedInvoice)
      .values({
        number: `PF${randomBytes(3).toString("hex")}`,
        supplierId: supplier!.id,
        jobId: j!.id,
        netMinor: MONEY.cost,
        grossMinor: MONEY.cost,
      } as never)
      .returning();

    const [phase] = await db
      .insert(jobPhase)
      .values({
        jobId: j!.id,
        name: "Hrubá stavba",
        startDate: "2026-09-01",
        endDate: "2026-10-01",
      })
      .returning();
    const [diary] = await db
      .insert(siteDiary)
      .values({
        jobId: j!.id,
        date: "2026-09-15",
        work: "Práce na rozvodech",
        materialRows: [{ name: "Kabel", qty: "10", unit: "m" }] as never,
      })
      .returning();
    const [handover] = await db
      .insert(handoverProtocol)
      .values({
        jobId: j!.id,
        number: `PP-${tag}-${randomBytes(2).toString("hex")}`,
        date: "2026-09-30",
      })
      .returning();
    const defectStage = (await getPipeline(db, "defect", "default"))!.stages[0]!;
    const [df] = await db
      .insert(defect)
      .values({ jobId: j!.id, title: "Vada omítky", stageId: defectStage.id })
      .returning();

    const [memberEntry] = await db
      .insert(timeEntry)
      .values({
        userId: memberId,
        date: "2026-09-15",
        jobId: j!.id,
        minutes: 480,
        status: "approved",
        hourlyCostMinor: MONEY.rate,
      } as never)
      .returning();
    await db.insert(timeEntry).values({
      userId: managerId,
      date: "2026-09-16",
      jobId: j!.id,
      minutes: 240,
      status: "submitted",
      hourlyCostMinor: MONEY.rate,
    } as never);

    return {
      id: j!.id,
      number: j!.number,
      title: j!.title,
      budgetVersionId: v!.id,
      offerVersionId: ov!.id,
      budgetItemId: it!.id,
      sectionId: s!.id,
      orderId: ord!.id,
      changeId: chg!.id,
      statementId: st!.id,
      invoiceId: inv!.id,
      receivedId: rcv!.id,
      defectId: df!.id,
      diaryDate: "2026-09-15",
      costId: cost!.id,
      approvalId: apr!.id,
      shareId: shr!.id,
      phaseId: phase!.id,
      diaryId: diary!.id,
      handoverId: handover!.id,
      memberEntryId: memberEntry!.id,
    };
  }
  const jobA = await makeJob("A", foremanA.id, workerA.id);
  const jobB = await makeJob("B", foremanB.id, workerB.id);

  /* ---------- CRM: typ aktivity, aktivita a poznámka na cizí zakázce (B) ---------- */
  const [actType] = await db
    .insert(crmActivityType)
    .values({ key: `sonda_${randomBytes(3).toString("hex")}`, name: "Sonda" })
    .returning();
  const [act] = await db
    .insert(crmActivity)
    .values({
      typeId: actType!.id,
      subject: "Aktivita na cizí zakázce",
      assigneeId: foremanB.id,
      jobId: jobB.id,
    })
    .returning();
  const [note] = await db
    .insert(crmNote)
    .values({
      body: "Poznámka k cizí zakázce",
      entityType: "job",
      entityId: jobB.id,
      authorId: foremanB.id,
    })
    .returning();

  /* ---------- sklad, stroje, kalendář ---------- */
  const [wh] = await db.insert(warehouse).values({ name: "Hlavní sklad" }).returning();
  const [item] = await db
    .insert(stockItem)
    .values({
      code: `K-${randomBytes(2).toString("hex")}`,
      name: "Kabel CYKY",
      unit: "m",
      lastPriceMinor: MONEY.costUnit,
      avgCost: String(MONEY.costUnit),
      totalQty: "100",
      minQty: "10",
    })
    .returning();
  await db.insert(stockLevel).values({ itemId: item!.id, warehouseId: wh!.id, qty: "100" });
  const [sdoc] = await db
    .insert(stockDoc)
    .values({
      number: `PR-${randomBytes(2).toString("hex")}`,
      type: "receipt",
      date: "2026-09-01",
      warehouseId: wh!.id,
      supplierId: supplier!.id,
      jobId: jobA.id,
      totalMinor: MONEY.cost,
      lineCount: 1,
    })
    .returning();
  await db.insert(stockDocLine).values({
    docId: sdoc!.id,
    itemId: item!.id,
    qty: "100",
    unitCost: String(MONEY.costUnit),
    totalMinor: MONEY.cost,
  });
  const [po] = await db
    .insert(purchaseOrder)
    .values({
      number: `SO-${randomBytes(2).toString("hex")}`,
      supplierId: supplier!.id,
      warehouseId: wh!.id,
      date: "2026-09-02",
    })
    .returning();
  await db.insert(purchaseOrderLine).values({
    orderId: po!.id,
    itemId: item!.id,
    qty: "5",
    unitPriceMinor: MONEY.costUnit,
  } as never);
  const [cnt] = await db
    .insert(stockCount)
    .values({ number: `IN-${randomBytes(2).toString("hex")}`, warehouseId: wh!.id })
    .returning();

  const [car] = await db
    .insert(asset)
    .values({
      name: "Dodávka",
      plate: `${randomBytes(2).toString("hex").toUpperCase()} ${randomBytes(2).toString("hex")}`,
      purchasePriceMinor: MONEY.contract,
      internalRateMinor: MONEY.rate,
    })
    .returning();
  const [logB] = await db
    .insert(assetLog)
    .values({ assetId: car!.id, date: "2026-09-10", amount: "120", userId: workerB.id } as never)
    .returning();
  const [fuelB] = await db
    .insert(assetFuel)
    .values({
      assetId: car!.id,
      date: "2026-09-10",
      liters: "40",
      totalMinor: MONEY.cost,
      userId: workerB.id,
      jobId: jobB.id,
    })
    .returning();
  const [resvB] = await db
    .insert(assetReservation)
    .values({
      assetId: car!.id,
      dateFrom: "2026-10-01",
      dateTo: "2026-10-02",
      jobId: jobB.id,
      userId: workerB.id,
    })
    .returning();
  await db.insert(assetService).values({
    assetId: car!.id,
    date: "2026-09-11",
    title: "Servis",
    costMinor: MONEY.cost,
  });
  const [adf] = await db
    .insert(assetDefect)
    .values({ assetId: car!.id, title: "Brzdy", reportedBy: workerB.id })
    .returning();

  const [res] = await db.insert(calendarResource).values({ name: "Zasedačka" }).returning();
  const evStart = new Date("2026-10-20T08:00:00Z");
  const evEnd = new Date("2026-10-20T09:00:00Z");
  const [evA] = await db
    .insert(event)
    .values({
      title: "Schůzka A",
      startsAt: evStart,
      endsAt: evEnd,
      ownerId: foremanA.id,
      jobId: jobA.id,
    })
    .returning();
  const [evB] = await db
    .insert(event)
    .values({
      title: "Schůzka B",
      startsAt: evStart,
      endsAt: evEnd,
      ownerId: foremanB.id,
      jobId: jobB.id,
    })
    .returning();
  await db.insert(eventAttendee).values({ eventId: evB!.id, userId: workerB.id });
  const [impB] = await db
    .insert(calendarImport)
    .values({ userId: foremanB.id, name: "Cizí kalendář", urlEncrypted: "x" })
    .returning();
  const [tpl] = await db.insert(jobTemplate).values({ name: "Šablona", payload: {} }).returning();

  return {
    deps,
    registry,
    collected,
    catalog,
    people: { owner, office, foremanA, foremanB, workerA, workerB },
    jobA,
    jobB,
    ids: {
      client: client!.id,
      supplier: supplier!.id,
      contact: contact!.id,
      inquiry: inq!.id,
      crmActivity: act!.id,
      crmNote: note!.id,
      crmActivityType: actType!.id,
      warehouse: wh!.id,
      item: item!.id,
      stockDoc: sdoc!.id,
      purchaseOrder: po!.id,
      stockCount: cnt!.id,
      asset: car!.id,
      assetDefect: adf!.id,
      resource: res!.id,
      eventA: evA!.id,
      eventB: evB!.id,
      /** Záznamy cizích lidí (B): mistr ani montér A na ně nesmí. */
      logB: logB!.id,
      fuelB: fuelB!.id,
      reservationB: resvB!.id,
      importB: impB!.id,
      template: tpl!.id,
    },
  };
}

class Discard extends Error {}

/**
 * Celý soubor testů běží v jedné transakci, která se na konci vždy vrátí: sestava (zakázky, faktury, lidé) není vidět
 * ostatním souborům testů (např. kontrola čistoty databáze v testu demo dat) a po testu nezůstane nic.
 */
export async function isolatedDb(open: Db): Promise<{ db: Db; discard: () => Promise<void> }> {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let db!: Db;
  const done = open
    .transaction(async (tx) => {
      db = tx as unknown as Db;
      await held;
      throw new Discard();
    })
    .catch((e) => {
      if (!(e instanceof Discard)) throw e;
    });
  // transakce se otevře asynchronně; počkáme, až je `db` k dispozici
  for (let i = 0; i < 200 && !db; i++) await new Promise((r) => setTimeout(r, 5));
  if (!db) throw new Error("Transakci se nepodařilo otevřít.");
  return {
    db,
    discard: async () => {
      release();
      await done;
    },
  };
}
