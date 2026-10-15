import { eq } from "drizzle-orm";
import { getPipeline } from "@rebar/core/config-data";
import { newId, type Db } from "@rebar/core/db";
import { createRecord, resolveEntity, type ResolvedEntity } from "@rebar/core/entities";
import { createModuleDeps, type ModuleDeps } from "@rebar/core/module-server";
import type { Ctx } from "@rebar/core/rbac";
import { addDaysIso, todayIso } from "@rebar/core/time";
import { calendar, calendarAccount, calendarEvent } from "@rebar/kalendar/schema";
import { driveFolder, driveRequest } from "@rebar/disk/schema";
import { company as companyTable } from "@rebar/kontakty/schema";
import { job as jobTable } from "@rebar/zakazky/schema";
import { taskType } from "@rebar/ukoly/schema";
import { canary, PRIVATE_AMOUNT_MINOR, SHARED_AMOUNT_MINOR } from "./canary";
import type { Fixture } from "./security-fixture";

/**
 * Sestava soukromých a sdílených záznamů pro testy viditelnosti (D §5.4): pro každou entitu se zámkem jeden sdílený
 * záznam a jeden soukromý s canary řetězcem v názvu (u plateb i v částce). Zakládá je vlastník přes engine, takže se
 * testuje i založení. Použije ji `private-matrix` (C1) a `private-paths` (QA-SEC): ručně čtené cesty modulů (widgety,
 * metriky, vrstvy, služby) se tu ověřují nad stejnými daty.
 */
export type PrivateFixture = {
  /** Klíče entit se zámkem, pro které sestava zakládá záznamy. */
  entities: string[];
  /** Id sdíleného záznamu podle klíče entity. */
  shared: Record<string, string>;
  /** Id soukromého záznamu podle klíče entity. */
  priv: Record<string, string>;
  /** Název (nebo jiný hledatelný text) soukromého záznamu s canary řetězcem. */
  privTitle: Record<string, string>;
  /** Název sdíleného záznamu. */
  sharedTitle: Record<string, string>;
  /** Id soukromé a sdílené zakázky a obchodu (rodiče, pod které patří děti). */
  parents: { privateJob: string; sharedJob: string; privateDeal: string; sharedDeal: string };
  /** Resolvovaná entita podle klíče (pro volání enginu). */
  resolve: (key: string) => Promise<ResolvedEntity>;
};

/**
 * `ModuleDeps` se službami a příspěvky všech zapnutých modulů (jako v běžící aplikaci). `Fixture.deps` služby nemá,
 * protože ho staví dřív, než moduly existovaly.
 */
export function fullDeps(f: Fixture): ModuleDeps {
  const { services: _services, ...base } = f.deps;
  void _services;
  return createModuleDeps(base, f.collected);
}

/**
 * Platba zakázky přes příkaz `finance.payment.create` (entita `payment` je `noCreate`: platba se rozdělí mezi lidi,
 * takže ji nelze založit přímo přes engine). Vrací id platby.
 */
export async function addPayment(
  f: Fixture,
  ctx: Ctx,
  values: {
    jobId: string;
    description: string;
    amountMinor: number;
    status?: "planned" | "issued" | "paid";
    invoiceNumber?: string;
    issuedOn?: string;
    dueOn?: string;
    paidOn?: string;
  },
): Promise<string> {
  const cmd = f.collected.commands.get("finance.payment.create");
  if (!cmd) throw new Error("Příkaz finance.payment.create není zapnutý.");
  const input = cmd.input.parse({ issuerId: ctx.actor.userId, ...values });
  const res = (await cmd.handler(ctx, input, fullDeps(f))) as {
    status?: string;
    payment?: { id: string };
  };
  if (!res.payment?.id)
    throw new Error(`finance.payment.create nevrátil platbu (${res.status ?? "?"}).`);
  return res.payment.id;
}

/** Hodnoty (pod klíči atributů) pro založení záznamu entity; `via` = zámek vzniká jen zděděním od rodiče. */
type Build = { values: Record<string, unknown>; via?: "parent" };

/** Entity se zámkem, pro které sestava umí založit záznamy. Nová entita se zámkem bez záznamu tu shodí matici. */
export const BUILDABLE = [
  "company",
  "person",
  "job",
  "deal",
  "task",
  "note",
  "time_entry",
  "payment",
  "email_template",
] as const;

/** Založí sestavu jako vlastník. Volat jednou na soubor testů (v izolované transakci). */
export async function buildPrivateFixture(f: Fixture, db: Db): Promise<PrivateFixture> {
  const owner = f.people.owner;
  const partner = f.people.partner;
  const resolve = (key: string) => {
    const def = f.registry.get(key);
    if (!def) throw new Error(`Entita „${key}“ není v registru.`);
    return resolveEntity(db, def);
  };
  const create = async (key: string, values: Record<string, unknown>) => {
    try {
      // platba je `noCreate` (zakládá se příkazem financí, kvůli rozdělení mezi lidi), ostatní přes engine
      if (key === "payment") return await createPaymentViaCommand(values);
      return (await createRecord(owner.ctx, f.registry, await resolve(key), values)).row;
    } catch (e) {
      throw new Error(`Fixture: entitu „${key}“ se nepodařilo založit: ${(e as Error).message}`, {
        cause: e,
      });
    }
  };

  const createPaymentViaCommand = async (values: Record<string, unknown>) => ({
    id: await addPayment(f, owner.ctx, values as Parameters<typeof addPayment>[2]),
  });

  // typ úkolu `task` a stav obchodu potřebují hooky modulů; zakládají se, kdyby je seed nedodal
  if (f.registry.get("task")) {
    const have = await db.select().from(taskType).where(eq(taskType.key, "task"));
    if (!have.length)
      await db.insert(taskType).values({ key: "task", name: "Úkol", isSystem: true } as never);
  }
  const stage = f.registry.get("deal")
    ? (await getPipeline(db, "deal", "default"))?.stages[0]?.id
    : undefined;

  const company = await create("company", { name: "Sdílená firma fixture" });
  const privCompany = await create("company", { name: canary("company"), isPrivate: true });
  const built: Record<string, { shared: Build; priv: Build }> = {};
  const names: Record<string, { shared: string; priv: string }> = {};
  const set = (key: string, shared: Build, priv: Build, sharedName: string, privName: string) => {
    built[key] = { shared, priv };
    names[key] = { shared: sharedName, priv: privName };
  };

  const sharedJobRow = f.registry.get("job")
    ? await create("job", { title: "Sdílená zakázka fixture", company: company.id, type: "web" })
    : undefined;
  const privJobRow = f.registry.get("job")
    ? await create("job", {
        title: canary("job"),
        company: company.id,
        type: "web",
        isPrivate: true,
      })
    : undefined;
  const sharedDealRow = stage
    ? await create("deal", { title: "Sdílený obchod fixture", company: company.id, status: stage })
    : undefined;
  const privDealRow = stage
    ? await create("deal", {
        title: canary("deal"),
        company: company.id,
        status: stage,
        isPrivate: true,
      })
    : undefined;

  set(
    "company",
    { values: { name: "Sdílená firma 2" } },
    { values: { name: canary("company-2"), isPrivate: true } },
    "Sdílená firma 2",
    canary("company-2"),
  );
  set(
    "person",
    { values: { lastName: "Sdílený", firstName: "Kontakt" } },
    { values: { lastName: canary("person"), firstName: "Soukromý", isPrivate: true } },
    "Kontakt Sdílený",
    `Soukromý ${canary("person")}`,
  );
  if (sharedJobRow && privJobRow) {
    set(
      "job",
      { values: { title: "Sdílená zakázka 2", company: company.id, type: "web" } },
      { values: { title: canary("job-2"), company: company.id, type: "web", isPrivate: true } },
      "Sdílená zakázka 2",
      canary("job-2"),
    );
    set(
      "time_entry",
      {
        values: { date: "2026-10-01", user: owner.id, job: sharedJobRow.id, minutes: 60 },
      },
      {
        via: "parent",
        values: { date: "2026-10-02", user: owner.id, job: privJobRow.id, minutes: 90 },
      },
      "Hodiny sdílené",
      "Hodiny soukromé",
    );
    set(
      "payment",
      {
        values: {
          description: "Sdílená platba fixture",
          amountMinor: SHARED_AMOUNT_MINOR,
          jobId: sharedJobRow.id,
        },
      },
      {
        via: "parent",
        values: {
          description: canary("payment"),
          amountMinor: PRIVATE_AMOUNT_MINOR,
          jobId: privJobRow.id,
        },
      },
      "Sdílená platba fixture",
      canary("payment"),
    );
  }
  if (stage)
    set(
      "deal",
      { values: { title: "Sdílený obchod 2", company: company.id, status: stage } },
      {
        values: {
          title: canary("deal-2"),
          company: company.id,
          status: stage,
          isPrivate: true,
        },
      },
      "Sdílený obchod 2",
      canary("deal-2"),
    );
  set(
    "task",
    { values: { title: "Sdílený úkol fixture" } },
    { values: { title: canary("task"), isPrivate: true } },
    "Sdílený úkol fixture",
    canary("task"),
  );
  set(
    "note",
    { values: { title: "Sdílená poznámka fixture" } },
    { values: { title: canary("note"), isPrivate: true } },
    "Sdílená poznámka fixture",
    canary("note"),
  );
  set(
    "email_template",
    { values: { name: "Sdílená šablona fixture" } },
    { values: { name: canary("email_template"), isPrivate: true } },
    "Sdílená šablona fixture",
    canary("email_template"),
  );

  const shared: Record<string, string> = {};
  const priv: Record<string, string> = {};
  const entities: string[] = [];
  for (const key of BUILDABLE) {
    const b = built[key];
    if (!b || !f.registry.get(key)) continue;
    entities.push(key);
    shared[key] = (await create(key, b.shared.values)).id;
    priv[key] = (await create(key, b.priv.values)).id;
  }
  void partner;
  void privCompany;
  return {
    entities,
    shared,
    priv,
    privTitle: Object.fromEntries(Object.entries(names).map(([k, v]) => [k, v.priv])),
    sharedTitle: Object.fromEntries(Object.entries(names).map(([k, v]) => [k, v.shared])),
    parents: {
      privateJob: privJobRow?.id ?? "",
      sharedJob: sharedJobRow?.id ?? "",
      privateDeal: privDealRow?.id ?? "",
      sharedDeal: sharedDealRow?.id ?? "",
    },
    resolve,
  };
}

/**
 * Doplněk sestavy pro scénáře napříč moduly (AS-05): úkoly po termínu, platby po splatnosti, hodiny tento týden,
 * složky Disku, události kalendáře, zakázka sdílená pod soukromou firmou (R-31). Soukromé záznamy mají canary v názvu
 * (`CANARY-…`), sdílené protějšky jsou na číslech vidět (součty nejsou nulové), takže „bez soukromých“ je měřitelné.
 */
export type RichData = {
  today: string;
  yesterday: string;
  /** Soukromá a sdílená firma (soukromá má složku na Disku). */
  privCompany: string;
  sharedCompany: string;
  /** Sdílená zakázka, jejíž firma je soukromá (R-31), a její sdílená platba. */
  jobOnPrivCompany: string;
  paymentOnPrivCompany: string;
  /** Soukromá zakázka (z `fx.parents`) a platby po splatnosti (soukromá/sdílená). */
  privOverduePayment: string;
  sharedOverduePayment: string;
  tasks: {
    privOverdue: string;
    sharedOverdue: string;
    underPrivJob: string;
    sharedUnderPrivJob?: never;
  };
  noteUnderPrivJob: string;
  calendar: {
    privateTaskEvent: string;
    googlePrivateEvent: string;
    linkedPrivateDealEvent: string;
    sharedEvent: string;
  };
};

/** Doplní sestavu (jako vlastník). Volat po `buildPrivateFixture`. */
export async function buildRichData(f: Fixture, fx: PrivateFixture, db: Db): Promise<RichData> {
  const owner = f.people.owner;
  const today = todayIso();
  const yesterday = addDaysIso(today, -1);
  const create = async (key: string, values: Record<string, unknown>) => {
    try {
      return (await createRecord(owner.ctx, f.registry, await fx.resolve(key), values)).row;
    } catch (e) {
      throw new Error(`Rich fixture: „${key}“: ${(e as Error).message}`, { cause: e });
    }
  };
  const privCompany = await create("company", {
    name: canary("rich-company"),
    ico: "27082440",
    isPrivate: true,
  });
  const sharedCompany = await create("company", { name: "Sdílená firma rich", ico: "45274649" });
  // R-31: sdílená zakázka pod soukromou firmou (firma nekaskáduje)
  const jobOnPrivCompany = await create("job", {
    title: "Sdílená zakázka u soukromé firmy",
    company: privCompany.id,
    type: "web",
    price: 77_000_00,
  });
  const paymentOnPrivCompany = await addPayment(f, owner.ctx, {
    jobId: jobOnPrivCompany.id,
    description: "Platba sdílené zakázky u soukromé firmy",
    amountMinor: 777_00,
  });
  const sharedJob = fx.parents.sharedJob;
  const privJob = fx.parents.privateJob;
  const overdue = { status: "issued" as const, issuedOn: addDaysIso(today, -30), dueOn: yesterday };
  const privOverduePayment = await addPayment(f, owner.ctx, {
    jobId: privJob,
    description: canary("overdue-payment"),
    amountMinor: PRIVATE_AMOUNT_MINOR,
    invoiceNumber: canary("faktura"),
    ...overdue,
  });
  const sharedOverduePayment = await addPayment(f, owner.ctx, {
    jobId: sharedJob,
    description: "Sdílená platba po splatnosti",
    amountMinor: SHARED_AMOUNT_MINOR,
    invoiceNumber: "F-2026-0042",
    ...overdue,
  });
  const task = (title: string, extra: Record<string, unknown>) =>
    create("task", { title, assignee: owner.id, dueDate: yesterday, ...extra });
  const tasks = {
    privOverdue: (await task(canary("task-overdue"), { isPrivate: true })).id,
    sharedOverdue: (await task("Sdílený úkol po termínu", {})).id,
    underPrivJob: (await task(canary("task-under-job"), { job: privJob })).id,
  };
  const noteUnderPrivJob = (await create("note", { title: canary("note-under-job"), job: privJob }))
    .id;
  // peníze a práce kolem sdílené firmy: bez soukromých položek jsou součty a počty jiné čísla (měřitelné)
  const soon = addDaysIso(today, 3);
  const richJob = (title: string, extra: Record<string, unknown>) =>
    create("job", {
      title,
      company: sharedCompany.id,
      type: "web",
      status: "active",
      dueDate: soon,
      price: 90_000_00,
      ...extra,
    });
  const richPrivJob = await richJob(canary("rich-job"), { isPrivate: true });
  const richSharedJob = await richJob("Sdílená zakázka rich", {});
  // stav „probíhá“ se nastavuje příkazem zakázek; sestava ho zapíše přímo (zakázka by jinak zůstala v plánu)
  for (const j of [richPrivJob, richSharedJob])
    await db
      .update(jobTable)
      .set({ status: "active" } as never)
      .where(eq(jobTable.id, j.id));
  for (const [jobId, tag, amountMinor] of [
    [richPrivJob.id, "priv", PRIVATE_AMOUNT_MINOR + 11],
    [richSharedJob.id, "shared", SHARED_AMOUNT_MINOR + 11],
  ] as const) {
    await addPayment(f, owner.ctx, {
      jobId,
      description: tag === "priv" ? canary("paid-payment") : "Sdílená zaplacená platba",
      amountMinor,
      status: "paid",
      invoiceNumber: tag === "priv" ? canary("faktura-paid") : "F-2026-0100",
      issuedOn: addDaysIso(today, -3),
      paidOn: today,
    });
    await addPayment(f, owner.ctx, {
      jobId,
      description: tag === "priv" ? canary("due-soon") : "Sdílená platba brzy splatná",
      amountMinor: amountMinor + 100,
      status: "issued",
      invoiceNumber: tag === "priv" ? canary("faktura-soon") : "F-2026-0101",
      issuedOn: today,
      dueOn: soon,
    });
  }
  const stageId = fx.parents.sharedDeal
    ? ((await getPipeline(db, "deal", "default"))?.stages[0]?.id ?? undefined)
    : undefined;
  if (stageId) {
    await create("deal", {
      title: canary("rich-deal"),
      company: sharedCompany.id,
      status: stageId,
      value: 5_000_000_00,
      expectedCloseDate: soon,
      isPrivate: true,
    });
    await create("deal", {
      title: "Sdílený obchod rich",
      company: sharedCompany.id,
      status: stageId,
      value: 100_000_00,
      expectedCloseDate: soon,
    });
  }
  for (const priv of [true, false]) {
    await create("person", {
      lastName: priv ? canary("person-company") : "Sdílený kontakt firmy",
      firstName: priv ? "Soukromý" : "Sdílený",
      company: sharedCompany.id,
      ...(priv ? { isPrivate: true } : {}),
    });
    await create("task", {
      title: priv ? canary("task-today") : "Sdílený úkol dnes",
      assignee: owner.id,
      dueDate: today,
      company: sharedCompany.id,
      ...(priv ? { isPrivate: true } : {}),
    });
    await create("note", {
      title: priv ? canary("note-company") : "Sdílená poznámka u firmy",
      company: sharedCompany.id,
      ...(priv ? { isPrivate: true } : {}),
    });
  }
  // hodiny tento týden na soukromé i sdílené zakázce
  for (const job of [privJob, sharedJob])
    await create("time_entry", {
      date: today,
      user: owner.id,
      job,
      minutes: job === privJob ? 117 : 45,
    });

  // složky Disku a požadavky (R-13): soukromá firma a zakázka mají složky, požadavky jsou označené soukromě
  for (const [entityType, entityId, folderId] of [
    ["company", privCompany.id, "CANARY-FOLDER-company"],
    ["job", privJob, "CANARY-FOLDER-job"],
    ["company", sharedCompany.id, "folder-shared-company"],
  ] as const)
    await db.insert(driveFolder).values({ entityType, entityId, folderId, subkey: "" });
  await db.insert(driveRequest).values({
    id: newId(),
    event: "drive.client.create",
    entityType: "company",
    entityId: privCompany.id,
    payload: { name: canary("rich-company") },
    state: "error",
    error: "n8n: selhalo",
    clientId: privCompany.id,
    isPrivate: true,
  });
  await db
    .update(companyTable)
    .set({ driveFolderId: "CANARY-FOLDER-company", driveStatus: "ready" } as never)
    .where(eq(companyTable.id, privCompany.id));
  await db
    .update(jobTable)
    .set({ driveFolderId: "CANARY-FOLDER-job", driveStatus: "ready" } as never)
    .where(eq(jobTable.id, privJob));

  // kalendář vlastníka: soukromý úkol s událostí, soukromá událost z Googlu, událost svázaná se soukromým obchodem
  const [account] = await db
    .insert(calendarAccount)
    .values({ userId: owner.id, googleEmail: "owner@example.test", tokensEnc: "x" })
    .returning();
  const [cal] = await db
    .insert(calendar)
    .values({ accountId: account!.id, googleId: "primary", name: "Primární", accessRole: "owner" })
    .returning();
  const at = (h: number) => new Date(`${today}T${String(h).padStart(2, "0")}:00:00+02:00`);
  const ev = async (title: string, h: number, extra: Record<string, unknown>) =>
    (
      await db
        .insert(calendarEvent)
        .values({
          calendarId: cal!.id,
          googleId: newId(),
          title,
          startsAt: at(h),
          endsAt: at(h + 1),
          ...extra,
        } as never)
        .returning()
    )[0]!.id;
  const calendarIds = {
    privateTaskEvent: await ev(canary("event-task"), 9, { taskId: tasks.privOverdue }),
    googlePrivateEvent: await ev(canary("event-google"), 10, { isGooglePrivate: true }),
    linkedPrivateDealEvent: await ev("Schůzka (odkaz na soukromý obchod)", 11, {
      dealId: fx.parents.privateDeal,
    }),
    sharedEvent: await ev("Sdílená schůzka", 13, {}),
  };

  return {
    today,
    yesterday,
    privCompany: privCompany.id,
    sharedCompany: sharedCompany.id,
    jobOnPrivCompany: jobOnPrivCompany.id,
    paymentOnPrivCompany,
    privOverduePayment,
    sharedOverduePayment,
    tasks,
    noteUnderPrivJob,
    calendar: calendarIds,
  };
}
