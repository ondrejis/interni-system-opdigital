import { sql } from "drizzle-orm";
import { getPipeline } from "@rebar/core/config-data";
import { createRecord, resolveEntity } from "@rebar/core/entities";
import type { Ctx } from "@rebar/core/rbac";
import { addDaysIso, todayIso } from "@rebar/core/time";
import type { DevSeedResult, DevSeedRuntime } from "./runtime";

/*
  Vývojová data OPSYS (`pnpm dev:seed`): smyšlené firmy, lidé, obchody, zakázky všech tří typů, platby, retainer, hodiny,
  úkoly a poznámky včetně soukromých záznamů Ondřeje. Všechno je zjevně fiktivní: názvy končí „(ukázka)“, e-maily jsou
  v rezervované doméně `.example`, telefony `+420 999 000 0NN`, firmy nemají IČO, čísla faktur mají předponu UKAZKA.
  Zakládá se výhradně přes příkazy a služby modulů (hooky, historie fází, rozdělení plateb, viditelnost), ne SQL.
  Data jsou vztažená k dnešku, aby přehledy ukazovaly po termínu, dnes i nadcházející.
*/

/** Název první organizace; podle něj se pozná, že vývojová data už v databázi jsou. */
export const DEV_MARKER_COMPANY = "Truhlářství Vzorník (ukázka)";

type R = Record<string, unknown>;
const need = (v: unknown, what: string): string => {
  if (typeof v !== "string" || !v) throw new Error(`Chybí ${what} ve výsledku příkazu.`);
  return v;
};

/** Je v databázi už vývojová sestava? */
export async function hasDevData(rt: Pick<DevSeedRuntime, "db">): Promise<boolean> {
  const rows = await rt.db.execute(
    sql`select 1 from company where name = ${DEV_MARKER_COMPANY} and deleted_at is null limit 1`,
  );
  return rows.length > 0;
}

/** Tiptap dokument z odstavců (poznámky). */
const doc = (...paragraphs: string[]) => ({
  type: "doc",
  content: paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
});

/** Založí vývojová data. Když už existují (organizace `DEV_MARKER_COMPANY`), nedělá nic. */
export async function seedDevData(rt: DevSeedRuntime): Promise<DevSeedResult> {
  const { db, registry, owner, partner, run } = rt;
  const log = rt.log ?? (() => {});
  const out: DevSeedResult = {
    skipped: false,
    companies: 0,
    people: 0,
    deals: 0,
    jobs: 0,
    payments: 0,
    tasks: 0,
    notes: 0,
    timeEntries: 0,
    privateJobId: null,
  };
  if (await hasDevData(rt)) return { ...out, skipped: true };

  const ownerId = need(owner.actor.userId, "id vlastníka");
  const partnerId = need(partner.actor.userId, "id partnera");
  const today = todayIso();
  const d = (n: number) => addDaysIso(today, n);
  const ym = (n: number) => d(n * 30).slice(0, 7);

  /* ---------- výchozí rozdělení nových zakázek 50/50 mezi vývojové uživatele ---------- */
  // V jedné databázi může být i skutečný vlastník z OWNER_*; odvozené 50/50 by pak nefungovalo (jsou tři lidé).
  await run("finance.settings.set", owner, {
    defaultSplit: [ownerId, partnerId].map((userId) => ({
      userId,
      mode: "percent",
      percent: 50,
      appliesTo: "all",
    })),
  });

  // Složky na Disku se ve vývojových datech nezakládají (bez n8n by požadavky skončily jako vypršelé).
  // Zapnutí: Nastavení → Google Disk.
  await run("disk.enabled.set", owner, { enabled: false });

  /* ---------- organizace ---------- */
  const entity = async (ctx: Ctx, key: string, values: R) => {
    const e = registry.get(key);
    if (!e) throw new Error(`Entita ${key} není v registru (modul není zapnutý).`);
    return (await createRecord(ctx, registry, await resolveEntity(db, e), values)).row;
  };
  const company = async (ctx: Ctx, name: string, values: R = {}) => {
    const row = await entity(ctx, "company", { name, ...values });
    out.companies++;
    return need(row.id, `id organizace ${name}`);
  };
  const c = {
    truhlarstvi: await company(owner, DEV_MARKER_COMPANY, {
      city: "Plzeň",
      street: "Ukázková 1",
      zip: "30100",
      web: "https://truhlarstvi-vzornik.example",
      email: "info@truhlarstvi-vzornik.example",
      phone: "+420 999 000 001",
      industry: "Truhlářství",
    }),
    autoservis: await company(partner, "Autoservis Příklad s.r.o. (ukázka)", {
      city: "Rokycany",
      web: "https://autoservis-priklad.example",
      email: "info@autoservis-priklad.example",
      phone: "+420 999 000 002",
      industry: "Autoservis",
    }),
    stavby: await company(owner, "Stavby Neexistující a.s. (ukázka)", {
      city: "Praha",
      web: "https://stavby-neexistujici.example",
      email: "kancelar@stavby-neexistujici.example",
      industry: "Stavebnictví",
    }),
    pekarna: await company(partner, "Pekárna Fiktivní (ukázka)", {
      city: "Klatovy",
      email: "objednavky@pekarna-fiktivni.example",
      industry: "Potravinářství",
    }),
    zahradnictvi: await company(owner, "Zahradnictví Testovací (ukázka)", {
      city: "Domažlice",
      web: "https://zahradnictvi-testovaci.example",
      industry: "Zahradnictví",
    }),
    kavarna: await company(partner, "Kavárna Ukázková (ukázka)", { city: "Plzeň" }),
    papirnictvi: await company(owner, "Papírnictví Pozastavené (ukázka)", { city: "Cheb" }),
    bivaly: await company(owner, "Bývalý Klient Demo s.r.o. (ukázka)", {
      city: "Sušice",
      email: "info@byvaly-klient.example",
    }),
    soukroma: await company(owner, "Soukromý klient Ondřeje (ukázka)", { isPrivate: true }),
  };

  /* ---------- osoby ---------- */
  let phoneSeq = 10;
  const person = async (
    companyId: string,
    firstName: string,
    lastName: string,
    position: string,
    email: string,
    withPhone = true,
  ) => {
    const points: R[] = [{ kind: "email", value: email, label: "work", isPrimary: true }];
    if (withPhone)
      points.push({
        kind: "phone",
        value: `+420 999 000 0${phoneSeq++}`,
        label: "mobile",
        isPrimary: true,
      });
    const r = await run<R>("kontakty.person.quickCreate", owner, {
      firstName,
      lastName,
      companyId,
      position,
      isDecisionMaker: true,
      points,
    });
    out.people++;
    return need(r.personId, `id osoby ${lastName}`);
  };
  const p = {
    truhlarstvi: await person(
      c.truhlarstvi,
      "Jan",
      "Vzorný",
      "Jednatel",
      "jan.vzorny@truhlarstvi-vzornik.example",
    ),
    autoservis: await person(
      c.autoservis,
      "Marie",
      "Ukázková",
      "Majitelka",
      "marie@autoservis-priklad.example",
    ),
    stavby: await person(
      c.stavby,
      "Petr",
      "Testovací",
      "Ředitel",
      "petr.testovaci@stavby-neexistujici.example",
    ),
    pekarna: await person(
      c.pekarna,
      "Eva",
      "Fiktivní",
      "Majitelka",
      "eva@pekarna-fiktivni.example",
    ),
    zahradnictvi: await person(
      c.zahradnictvi,
      "Karel",
      "Příkladný",
      "Majitel",
      "karel@zahradnictvi-testovaci.example",
    ),
    kavarna: await person(
      c.kavarna,
      "Lucie",
      "Demonstrační",
      "Provozní",
      "lucie@kavarna-ukazkova.example",
      false,
    ),
    bivaly: await person(c.bivaly, "Tomáš", "Dřívější", "Jednatel", "tomas@byvaly-klient.example"),
  };

  /* ---------- stavy klientů ---------- */
  await run("klienti.setStatus", owner, { companyId: c.pekarna, status: "lead" });
  await run("klienti.setStatus", owner, { companyId: c.zahradnictvi, status: "lead" });
  await run("klienti.setStatus", owner, { companyId: c.papirnictvi, status: "active" });
  await run("klienti.setStatus", owner, {
    companyId: c.papirnictvi,
    status: "paused",
    reason: "Dočasně bez rozpočtu na marketing (ukázka).",
  });

  /* ---------- obchody ---------- */
  const pipe = await getPipeline(db, "deal", "default");
  const stages = pipe?.stages ?? [];
  const stageId = (name: string) => need(stages.find((s) => s.name === name)?.id, `fáze ${name}`);
  const deal = async (ctx: Ctx, input: R) => {
    const r = await run<R>("obchody.create", ctx, input);
    out.deals++;
    return need(r.dealId, "id obchodu");
  };
  const dealMeta = (
    title: string,
    companyId: string,
    personId: string,
    value: number,
    svc: string[],
  ) => ({
    title,
    companyId,
    personId,
    valueMinor: value,
    services: svc,
    expectedCloseDate: d(21),
  });

  const dKavarna = await deal(partner, {
    ...dealMeta("Poptávka z Meta: web kavárny (ukázka)", c.kavarna, p.kavarna, 4_500_000, ["web"]),
    ownerId: partnerId,
    source: "meta",
    sourceDetail: "Formulář „Nový web“ (ukázka)",
    stageId: stageId("Nová poptávka"),
  });
  const dPekarna = await deal(partner, {
    ...dealMeta("Reklamy na Meta: pekárna (ukázka)", c.pekarna, p.pekarna, 2_400_000, [
      "marketing",
    ]),
    ownerId: partnerId,
    source: "referral",
    stageId: stageId("Nová poptávka"),
  });
  await run("obchody.moveStage", partner, { dealId: dPekarna, stageId: stageId("Kontaktováno") });
  const dZahradnictvi = await deal(owner, {
    ...dealMeta("Nový web zahradnictví (ukázka)", c.zahradnictvi, p.zahradnictvi, 6_800_000, [
      "web",
      "marketing",
    ]),
    ownerId: ownerId,
    source: "web_form",
    stageId: stageId("Nová poptávka"),
  });
  await run("obchody.moveStage", owner, {
    dealId: dZahradnictvi,
    stageId: stageId("Kontaktováno"),
  });
  await run("obchody.moveStage", owner, {
    dealId: dZahradnictvi,
    stageId: stageId("Schůzka / konzultace"),
  });
  await deal(partner, {
    ...dealMeta("Retainer pro autoservis (ukázka)", c.autoservis, p.autoservis, 1_800_000, [
      "marketing",
    ]),
    ownerId: partnerId,
    stageId: stageId("Nabídka odeslaná"),
  });
  const dStavby = await deal(owner, {
    ...dealMeta("Interní systém, 2. etapa (ukázka)", c.stavby, p.stavby, 24_000_000, ["systemy"]),
    ownerId: ownerId,
    stageId: stageId("Vyjednávání"),
  });
  const dLost = await deal(owner, {
    ...dealMeta("Redesign webu (ukázka)", c.bivaly, p.bivaly, 5_500_000, ["web"]),
    ownerId: ownerId,
    stageId: stageId("Nabídka odeslaná"),
  });
  await run("obchody.lose", owner, {
    dealId: dLost,
    reason: "price",
    note: "Vybrali levnější variantu (ukázka).",
  });
  await deal(owner, {
    title: "Soukromý obchod Ondřeje (ukázka)",
    companyId: c.soukroma,
    valueMinor: 9_000_000,
    services: ["systemy"],
    ownerId,
    stageId: stageId("Schůzka / konzultace"),
    isPrivate: true,
  });

  /* ---------- výhry obchodů → klienti a zakázky ---------- */
  const win = async (ctx: Ctx, dealId: string, wonOn: string, jobs: R[]) => {
    const r = await run<{ jobs: { id: string; number: string; type: string }[] }>(
      "obchody.win",
      ctx,
      {
        dealId,
        wonOn,
        jobs,
      },
    );
    out.jobs += r.jobs.length;
    return r.jobs;
  };
  const dWonTruhlarstvi = await deal(owner, {
    ...dealMeta("Web a reklamy pro truhlářství (ukázka)", c.truhlarstvi, p.truhlarstvi, 9_600_000, [
      "web",
      "marketing",
    ]),
    ownerId,
    stageId: stageId("Vyjednávání"),
  });
  const [jWeb, jRetainer] = await win(owner, dWonTruhlarstvi, d(-60), [
    {
      type: "web",
      templateId: null,
      title: "Web truhlářství (ukázka)",
      startDate: d(-55),
      ownerId,
      memberIds: [partnerId],
    },
    {
      type: "marketing",
      templateId: null,
      title: "Retainer: reklamy truhlářství (ukázka)",
      startDate: d(-100),
      ownerId: partnerId,
      memberIds: [ownerId],
      billingModel: "retainer",
      retainer: {
        amountMinor: 1_200_000,
        fromMonth: ym(-3),
        issueDay: 5,
        issuerMode: "alternate",
        issuerId: partnerId,
        firstIssuerId: ownerId,
        split: [],
      },
    },
  ]);
  const dWonAutoservis = await deal(partner, {
    ...dealMeta(
      "Marketing: úvodní fáze autoservisu (ukázka)",
      c.autoservis,
      p.autoservis,
      1_400_000,
      ["marketing"],
    ),
    ownerId: partnerId,
    stageId: stageId("Vyjednávání"),
  });
  const [jIntro] = await win(partner, dWonAutoservis, d(-35), [
    {
      type: "marketing",
      templateId: null,
      title: "Marketing: úvodní fáze autoservisu (ukázka)",
      startDate: d(-30),
      ownerId,
      memberIds: [partnerId],
    },
  ]);
  const dWonStavby = await deal(owner, {
    ...dealMeta("Interní systém, 1. etapa (ukázka)", c.stavby, p.stavby, 18_000_000, ["systemy"]),
    ownerId,
    stageId: stageId("Vyjednávání"),
  });
  const [jSystem] = await win(owner, dWonStavby, d(-25), [
    {
      type: "systemy",
      templateId: null,
      title: "Interní systém stavební firmy (ukázka)",
      startDate: d(-20),
      ownerId,
      memberIds: [partnerId],
    },
  ]);

  /* ---------- zakázka dokončená u bývalého klienta ---------- */
  const former = await run<{ id: string }>("zakazky.create", owner, {
    title: "Web bývalého klienta (ukázka)",
    type: "web",
    companyId: c.bivaly,
    ownerId,
    memberIds: [partnerId],
    startDate: d(-260),
    dueDate: d(-190),
    withoutTemplate: true,
  });
  out.jobs++;
  await run("zakazky.complete", owner, { jobId: former.id, reason: "finished" });
  await run("klienti.setStatus", owner, {
    companyId: c.bivaly,
    status: "former",
    reason: "Projekt dokončen, další spolupráce není plánovaná (ukázka).",
    endedOn: d(-180),
  });

  /* ---------- soukromá zakázka Ondřeje ---------- */
  const priv = await run<{ id: string }>("zakazky.create", owner, {
    title: "Soukromá zakázka Ondřeje (ukázka)",
    type: "systemy",
    companyId: c.soukroma,
    ownerId,
    memberIds: [],
    startDate: d(-15),
    isPrivate: true,
    priceMinor: 6_000_000,
    // soukromá zakázka patří jen Ondřejovi: nic se nedělí s partnerem
    split: [{ userId: ownerId, mode: "percent", percent: 100, appliesTo: "all" }],
  });
  out.jobs++;
  out.privateJobId = priv.id;

  /* ---------- fáze zakázek ---------- */
  const jobDetail = async (ctx: Ctx, jobId: string) =>
    run<{ phases?: { id: string; name: string; role: string | null; status: string }[] }>(
      "zakazky.detail",
      ctx,
      { jobId },
    );
  const phaseByName = async (jobId: string, name: string) => {
    const detail = await jobDetail(owner, jobId);
    return need(detail.phases?.find((x) => x.name === name)?.id, `fáze ${name}`);
  };
  // web: už se vyvíjí (předchozí fáze hotové, otevřené úkoly se dokončí)
  await run("zakazky.setPhase", owner, {
    jobId: jWeb!.id,
    phaseId: await phaseByName(jWeb!.id, "Vývoj"),
    completeOpenTasks: true,
  });
  // systém: ve vývoji
  await run("zakazky.setPhase", owner, {
    jobId: jSystem!.id,
    phaseId: await phaseByName(jSystem!.id, "Vývoj"),
    completeOpenTasks: true,
  });
  // úvodní fáze marketingu: vyhodnocena → rozhodnutí o retaineru (R-36)
  const introDetail = await jobDetail(owner, jIntro!.id);
  const evalPhase = introDetail.phases?.find((x) => x.role === "intro_evaluation");
  if (evalPhase)
    await run("zakazky.phase.complete", owner, {
      jobId: jIntro!.id,
      phaseId: evalPhase.id,
      completeOpenTasks: true,
    });
  // retainer běží: aktuální fáze je „Retainer“
  await run("zakazky.setPhase", owner, {
    jobId: jRetainer!.id,
    phaseId: await phaseByName(jRetainer!.id, "Retainer"),
    completeOpenTasks: true,
  });

  /* ---------- platby ---------- */
  const payments = async (ctx: Ctx, jobId: string) =>
    (
      await run<{ rows?: { id: string; description: string; status: string; kind: string }[] }>(
        "finance.payment.list",
        ctx,
        { jobId, limit: 100 },
      )
    ).rows ?? [];
  const pay = async (ctx: Ctx, input: R) => {
    await run("finance.payment.create", ctx, input);
    out.payments++;
  };
  let invoiceSeq = 1;
  const inv = () => `UKAZKA-${today.slice(0, 4)}-${String(invoiceSeq++).padStart(4, "0")}`;

  // web: záloha zaplacená, doplatek plánovaný
  await pay(owner, {
    jobId: jWeb!.id,
    description: "Záloha 50 % (ukázka)",
    kind: "one_off",
    amountMinor: 4_800_000,
    issuerId: ownerId,
    status: "paid",
    invoiceNumber: inv(),
    issuedOn: d(-50),
    dueOn: d(-36),
    paidOn: d(-40),
  });
  await pay(owner, {
    jobId: jWeb!.id,
    description: "Doplatek po předání (ukázka)",
    kind: "one_off",
    amountMinor: 4_800_000,
    issuerId: partnerId,
    status: "planned",
    issuedOn: d(20),
    dueOn: d(34),
  });
  // úvodní fáze marketingu: z šablony vznikly dvě platby 2 × 7 000 Kč (1. vlastník, 2. druhý partner)
  const intro = (await payments(owner, jIntro!.id)).filter((x) => x.kind === "intro");
  if (intro[0])
    await run("finance.payment.transition", owner, {
      id: intro[0].id,
      to: "paid",
      invoiceNumber: inv(),
      issuedOn: d(-28),
      dueOn: d(-14),
      paidOn: d(-20),
    });
  if (intro[1])
    await run("finance.payment.transition", partner, {
      id: intro[1].id,
      to: "issued",
      invoiceNumber: inv(),
      issuedOn: d(-5),
      dueOn: d(9),
    });
  // systém: etapy
  await pay(owner, {
    jobId: jSystem!.id,
    description: "Etapa 1: analýza a specifikace (ukázka)",
    kind: "one_off",
    amountMinor: 6_000_000,
    issuerId: ownerId,
    status: "paid",
    invoiceNumber: inv(),
    issuedOn: d(-18),
    dueOn: d(-4),
    paidOn: d(-6),
  });
  await pay(owner, {
    jobId: jSystem!.id,
    description: "Etapa 2: vývoj (ukázka)",
    kind: "one_off",
    amountMinor: 9_000_000,
    issuerId: partnerId,
    status: "issued",
    invoiceNumber: inv(),
    issuedOn: d(-3),
    dueOn: d(11),
  });
  await pay(owner, {
    jobId: jSystem!.id,
    description: "Etapa 3: testování a nasazení (ukázka)",
    kind: "one_off",
    amountMinor: 3_000_000,
    issuerId: ownerId,
    status: "planned",
    issuedOn: d(50),
    dueOn: d(64),
  });
  // retainer: starší měsíce zaplacené, předchozí měsíc vystavený, aktuální plánovaná platba zůstane
  const ret = (await payments(owner, jRetainer!.id))
    .filter((x) => x.kind === "retainer")
    .sort((a, b) => a.description.localeCompare(b.description));
  for (const [i, row] of ret.entries()) {
    const fromEnd = ret.length - 1 - i;
    if (row.status !== "planned" || fromEnd === 0) continue;
    const ago = fromEnd * 30;
    await run("finance.payment.transition", owner, {
      id: row.id,
      to: fromEnd === 1 ? "issued" : "paid",
      invoiceNumber: inv(),
      issuedOn: d(-ago + 5),
      dueOn: d(-ago + 19),
      ...(fromEnd === 1 ? {} : { paidOn: d(-ago + 12) }),
    });
  }
  // soukromá zakázka: platba je soukromá automaticky (zdědí zámek zakázky)
  await pay(owner, {
    jobId: priv.id,
    description: "Soukromá platba (ukázka)",
    kind: "one_off",
    amountMinor: 3_000_000,
    issuerId: ownerId,
    status: "paid",
    invoiceNumber: inv(),
    issuedOn: d(-10),
    dueOn: d(4),
    paidOn: d(-3),
  });
  // část salda je vyrovnaná zápisem (Ondřej vyfakturoval víc, než mu patří, a část rozdílu už Patrikovi poslal)
  await run("finance.settlement.create", owner, {
    fromUserId: ownerId,
    toUserId: partnerId,
    amountMinor: 500_000,
    settledOn: d(-2),
    method: "transfer",
    reference: "UKAZKA-VYROVNANI-1",
    note: "Částečné vyrovnání (ukázka)",
  });

  /* ---------- úkoly a události ---------- */
  const task = async (ctx: Ctx, input: R) => {
    const r = await run<R>("ukoly.create", ctx, input);
    out.tasks++;
    return need(r.id, "id úkolu");
  };
  await task(owner, {
    title: "Poslat upravenou nabídku (ukázka)",
    typeKey: "email",
    dueDate: d(-3),
    priority: "high",
    assigneeId: ownerId,
    dealId: dStavby,
  });
  await task(partner, {
    title: "Zavolat paní Fiktivní ohledně reklam",
    typeKey: "call",
    dueDate: today,
    dueTime: "10:00",
    durationMin: 15,
    assigneeId: partnerId,
    dealId: dPekarna,
    personId: p.pekarna,
  });
  await task(owner, {
    title: "Schůzka: konzultace k novému webu",
    typeKey: "meeting",
    dueDate: d(1),
    dueTime: "14:00",
    durationMin: 60,
    place: "Online (odkaz doplnit)",
    assigneeId: ownerId,
    dealId: dZahradnictvi,
    personId: p.zahradnictvi,
  });
  await task(owner, {
    title: "Termín: předání prvního návrhu webu",
    typeKey: "deadline",
    dueDate: d(6),
    allDay: true,
    assigneeId: ownerId,
    jobId: jWeb!.id,
  });
  await task(partner, {
    title: "Připravit podklady pro vyhodnocení úvodní fáze",
    dueDate: d(2),
    priority: "medium",
    assigneeId: partnerId,
    jobId: jIntro!.id,
  });
  await task(partner, {
    title: "Ozvat se kavárně z Meta formuláře",
    typeKey: "call",
    dueDate: today,
    dueTime: "15:30",
    durationMin: 15,
    assigneeId: partnerId,
    dealId: dKavarna,
  });
  await task(owner, {
    title: "Úkol bez řešitele (ukázka)",
    dueDate: d(10),
    assigneeId: null,
  });
  const done = await task(owner, {
    title: "Kickoff schůzka s autoservisem",
    typeKey: "meeting",
    dueDate: d(-29),
    dueTime: "09:00",
    durationMin: 90,
    assigneeId: partnerId,
    jobId: jIntro!.id,
    done: true,
    outcome: "Domluveny přístupy a termíny prvních kreativ (ukázka).",
  });
  await task(owner, {
    title: "Podúkol: shromáždit loga a fotografie",
    dueDate: d(4),
    assigneeId: partnerId,
    parentId: done,
    jobId: jIntro!.id,
  });
  await task(owner, {
    title: "Soukromý úkol: rozmyslet cenovou politiku",
    dueDate: d(3),
    priority: "medium",
    assigneeId: ownerId,
    isPrivate: true,
  });
  await task(owner, {
    title: "Soukromá zakázka: dopsat specifikaci",
    dueDate: d(5),
    assigneeId: ownerId,
    jobId: priv.id,
  });

  /* ---------- poznámky ---------- */
  const note = async (ctx: Ctx, input: R) => {
    await run("ukoly.note.create", ctx, input);
    out.notes++;
  };
  await note(owner, {
    title: "Rozhodovací osoba a zvyklosti",
    bodyJson: doc(
      "Jednatel rozhoduje sám, komunikace nejlépe telefonem dopoledne.",
      "Zajímá ho hlavně počet poptávek, ne proklikovost (ukázka).",
    ),
    companyId: c.truhlarstvi,
    pinned: true,
  });
  await note(partner, {
    title: "Z jednání o systému",
    bodyJson: doc("Chtějí napojit objednávky a sklad, 2. etapa po spuštění první (ukázka)."),
    dealId: dStavby,
  });
  await note(owner, {
    title: "Soukromá poznámka",
    bodyJson: doc("Jen pro vlastníka: úvahy o cenách a rozdělení práce (ukázka)."),
    isPrivate: true,
  });
  await run("klienti.saveContext", owner, {
    companyId: c.truhlarstvi,
    decisionMaker: "Jan Vzorný, jednatel.",
    howToCommunicate: "Telefon dopoledne, e-mail jen shrnutí.",
    history: "Klient od loňska, nejdřív web, potom reklamy (ukázka).",
  });

  /* ---------- hodiny ---------- */
  const hours = async (
    ctx: Ctx,
    jobId: string,
    date: string,
    minutes: number,
    noteText: string,
  ) => {
    await run("hodiny.save", ctx, { jobId, date, minutes, note: noteText });
    out.timeEntries++;
  };
  await hours(owner, jWeb!.id, d(-6), 180, "Návrh domovské stránky");
  await hours(owner, jWeb!.id, d(-5), 240, "Vývoj šablon");
  await hours(partner, jWeb!.id, d(-5), 90, "Texty a podklady");
  await hours(owner, jWeb!.id, d(-1), 150, "Úpravy po připomínkách");
  await hours(partner, jIntro!.id, d(-8), 120, "Příprava kampaní");
  await hours(partner, jIntro!.id, d(-2), 60, "Kontrola výsledků");
  await hours(owner, jSystem!.id, d(-7), 300, "Datový model");
  await hours(owner, jSystem!.id, d(-3), 270, "Přihlášení a role");
  await hours(partner, jSystem!.id, d(-3), 120, "Testování");
  await hours(owner, priv.id, d(-4), 120, "Soukromá zakázka: analýza");

  /* ---------- Můj prostor (jen vlastník): hosting a domény ---------- */
  if (registry.get("recurring_service")) {
    await entity(owner, "recurring_service", {
      name: "Hosting webu truhlářství (ukázka)",
      company: c.truhlarstvi,
      kind: "hosting",
      web: "https://truhlarstvi-vzornik.example",
      price: 360_000,
      period: "yearly",
      nextRenewal: d(40),
      status: "active",
      since: d(-325),
      runsAt: "Vlastní server (ukázka)",
    });
    await entity(owner, "recurring_service", {
      name: "Měsíční údržba webu autoservisu (ukázka)",
      company: c.autoservis,
      kind: "maintenance",
      price: 90_000,
      period: "monthly",
      nextRenewal: d(12),
      status: "active",
    });
  }
  if (registry.get("web_domain")) {
    const domains: [string, string | null, number, "agency" | "client"][] = [
      ["truhlarstvi-vzornik.example", c.truhlarstvi, 25, "agency"],
      ["autoservis-priklad.example", c.autoservis, 140, "client"],
      ["pekarna-fiktivni.example", null, 55, "agency"],
    ];
    for (const [domain, companyId, inDays, payer] of domains)
      await entity(owner, "web_domain", {
        domain,
        ...(companyId ? { company: companyId } : {}),
        registrar: "Registrátor Ukázka (ukázka)",
        expiresOn: d(inDays),
        payer,
        autoRenew: payer === "agency",
      });
  }

  log(
    `Vývojová data: ${out.companies} organizací, ${out.people} osob, ${out.deals} obchodů, ${out.jobs} zakázek, ${out.payments} plateb, ${out.tasks} úkolů, ${out.notes} poznámek, ${out.timeEntries} záznamů hodin.`,
  );
  return out;
}
