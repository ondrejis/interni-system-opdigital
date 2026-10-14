import { addOrder, addReceived, advanceInvoice, issueInvoice } from "./docs";
import { diary, WEATHER } from "./field";
import { createJob, fillOffer, moveTo, reloadBudget, sendOffer, attachPng } from "./jobs";
import { BUDGETS } from "./budgets";
import { d } from "./dates";
import type { DemoJob, World } from "./world";

/** Předávací protokol: vyplní kontrolní body a podepíše ho zákazník (podpis je nahraný obrázek). */
export async function signHandover(
  w: World,
  j: DemoJob,
  date: string,
  acceptedBy: string,
  items: [string, boolean, string?][],
) {
  const c = w.cast.office.ctx;
  const list = await w.kit.run<{ id: string; status: string }[]>(c, "realizace.handover.list", {
    jobId: j.id,
  });
  const id = list[0]?.id;
  await w.kit.run(c, "realizace.handover.save", {
    jobId: j.id,
    ...(id ? { id } : {}),
    date,
    acceptedBy,
    note: "Dílo předáno bez zásadních výhrad.",
    items: items.map(([text, ok, note]) => ({ text, ok, note: note ?? null })),
  });
  const protocolId =
    id ?? (await w.kit.run<{ id: string }[]>(c, "realizace.handover.list", { jobId: j.id }))[0]!.id;
  const sig = await attachPng(
    w,
    c,
    j,
    `podpis-predani-${j.number}.png`,
    { top: [250, 250, 250], bottom: [226, 230, 238], seed: 5 },
    [320, 120],
  );
  await w.kit.run(c, "realizace.handover.sign", {
    id: protocolId,
    signatureFileId: sig,
    acceptedBy,
  });
  return protocolId;
}

/** Prohraná nabídka: zahradní domek pro realitní firmu. */
export async function storyLost(w: World) {
  const j = await createJob(w, {
    key: "domek",
    title: "Zahradní domek a pergola",
    company: "reality",
    manager: "foreman2",
    address: "Domažlická 9, 339 01 Klatovy",
    description: "Dřevěný zahradní domek 3 × 4 m s pergolou u rekreačního objektu.",
    budget: "domek",
  });
  await moveTo(w, j, "offer");
  await fillOffer(w, j, BUDGETS.domek!);
  await sendOffer(w, j);
  await moveTo(w, j, "lost", "price");
  w.dateFixes.push({ jobId: j.id, createdAt: d(-96), phaseChangedAt: d(-71) });
}

/** Uzavřená zakázka: oprava fasády dílny, vše vyfakturováno a zaplaceno. */
export async function storyClosed(w: World) {
  const j = await createJob(w, {
    key: "fasada",
    title: "Oprava fasády dílny",
    company: "autoservis",
    person: "Karel Rychlík",
    manager: "foreman2",
    members: ["worker2"],
    address: "Dopravní 12, 334 01 Přeštice",
    description: "Sanace omítek, štuk a nový nátěr fasády autoservisu včetně lešení.",
    startDate: d(-205),
    endDate: d(-174),
  });
  await moveTo(w, j, "offer");
  await fillOffer(w, j, BUDGETS.fasada!);
  await sendOffer(w, j);
  await moveTo(w, j, "preparation");
  await reloadBudget(w, j);
  await advanceInvoice(w, j, {
    percent: 30,
    issueDate: d(-212),
    dueDate: d(-198),
    paidDate: d(-200),
  });
  await addOrder(w, j, {
    title: "Lešení a materiál na fasádu",
    supplier: "lesenari",
    section: "Oprava fasády",
    orderDate: d(-214),
    deliveryDate: d(-206),
    lines: [
      {
        description: "Montáž a pronájem lešení 210 m²",
        qty: 1,
        unit: "kpl",
        priceKc: 21000,
        item: "Pronájem lešení",
      },
    ],
    state: "received",
  });
  await moveTo(w, j, "execution");
  for (const [i, day] of [-204, -202, -198, -193, -187].entries())
    await diary(w, j, {
      date: d(day),
      by: "foreman2",
      work: [
        "Zřízení lešení, oklepání omítek v jižní části.",
        "Sanace omítek, penetrace.",
        "Štukování fasády, 1. vrstva.",
        "Štukování, oprava soklu.",
        "Finální nátěr fasády a demontáž lešení.",
      ][i]!,
      weather: [WEATHER.sun, WEATHER.part, WEATHER.sun, WEATHER.cloud, WEATHER.part][i]!,
      workers: [
        ["foreman2", 8],
        ["worker2", 8],
      ],
      photos: i === 4 ? 2 : i === 0 ? 1 : 0,
      materials: i === 2 ? [["Fasádní štuk 25 kg", "28", "pytel", "stavebniny", 289]] : undefined,
      sign: i === 4,
    });
  await addReceived(w, j, {
    number: "FA-2026-1841",
    supplier: "stavebniny",
    issueDate: d(-196),
    dueDate: d(-182),
    lines: [
      {
        description: "Fasádní materiál (štuk, penetrace, nátěr)",
        category: "material",
        netKc: 16800,
        section: "Oprava fasády",
      },
    ],
    state: "paid",
    paidDate: d(-185),
  });
  await addReceived(w, j, {
    number: "2026/0213",
    supplier: "lesenari",
    issueDate: d(-176),
    dueDate: d(-162),
    lines: [
      {
        description: "Pronájem lešení 210 m²",
        category: "subcontract",
        netKc: 21000,
        section: "Oprava fasády",
      },
    ],
    state: "paid",
    paidDate: d(-165),
  });
  await moveTo(w, j, "handover");
  await signHandover(w, j, d(-173), "Karel Rychlík", [
    ["Fasáda bez trhlin a vzduchových bublin", true],
    ["Sokl a parapety očištěny", true],
    ["Lešení odvezeno, okolí uklizeno", true],
  ]);
  const fin = await w.kit.run<{ id: string }>(w.cast.office.ctx, "fakturace.createFromJob", {
    jobId: j.id,
    kind: "final",
  });
  await issueInvoice(w, fin.id, { issueDate: d(-172), dueDate: d(-158), paidDate: d(-160) });
  await moveTo(w, j, "closed");
  w.dateFixes.push({
    jobId: j.id,
    createdAt: d(-230),
    wonAt: d(-216),
    handoverAt: d(-173),
    closedAt: d(-158),
    phaseChangedAt: d(-158),
  });
}
