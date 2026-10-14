import { BUDGETS } from "./budgets";
import { d, wd } from "./dates";
import { addChange, addCost, addOrder, addReceived, advanceInvoice } from "./docs";
import { diary, WEATHER } from "./field";
import {
  addSchedule,
  createJob,
  fillOffer,
  moveTo,
  reloadBudget,
  sendOffer,
  stageId,
} from "./jobs";
import type { World } from "./world";

/** Realizace 3: rekonstrukce pekárny; změny ve všech stavech, nespárované náklady, čerpání rozpočtu nad plánem. */
export async function storyPekarna(w: World) {
  const j = await createJob(w, {
    key: "pekarna",
    title: "Rekonstrukce provozu pekárny",
    company: "pekarna",
    person: "Josef Vondráček",
    manager: "foreman1",
    members: ["worker1", "worker2"],
    address: "Pekařská 8, 337 01 Rokycany",
    description: "Nová podlaha a obklady výrobní haly, odsávání nad pecemi a nové silové rozvody.",
    startDate: d(-24),
    endDate: d(26),
  });
  await moveTo(w, j, "offer");
  await fillOffer(w, j, BUDGETS.pekarna!);
  await sendOffer(w, j);
  await moveTo(w, j, "preparation");
  await reloadBudget(w, j);
  await advanceInvoice(w, j, { percent: 25, issueDate: d(-28), dueDate: d(-14), paidDate: d(-16) });
  await addOrder(w, j, {
    title: "Odsávání nad pecemi",
    supplier: "elektro",
    section: "Vzduchotechnika a elektro",
    orderDate: d(-27),
    deliveryDate: d(-10),
    lines: [
      {
        description: "Odsávací systém nad pecemi, kompletní",
        qty: 1,
        unit: "kpl",
        priceKc: 168000,
        item: "Odsávání nad pecemi",
      },
    ],
    state: "received",
  });
  await addOrder(w, j, {
    title: "Obklady do výrobní haly",
    supplier: "stavebniny",
    section: "Podlaha a stěny provozu",
    orderDate: d(-8),
    deliveryDate: d(-2),
    lines: [
      {
        description: "Keramický obklad 20 × 25, 180 m²",
        qty: 180,
        unit: "m²",
        priceKc: 410,
        item: "Obkladový materiál",
      },
    ],
    state: "approved",
  });
  await moveTo(w, j, "execution");
  await addSchedule(w, j, [
    {
      name: "Bourání a příprava",
      from: d(-24),
      to: d(-17),
      progress: 100,
      hours: 220,
      responsible: "foreman1",
      actualStart: d(-24),
      actualEnd: d(-16),
    },
    {
      name: "Podlaha a obklady",
      from: d(-16),
      to: d(4),
      progress: 60,
      after: true,
      hours: 480,
      responsible: "foreman1",
      actualStart: d(-15),
    },
    {
      name: "Vzduchotechnika a elektro",
      from: d(-10),
      to: d(14),
      progress: 35,
      hours: 360,
      responsible: "foreman1",
      actualStart: d(-9),
    },
    {
      name: "Malby, úklid a předání",
      from: d(15),
      to: d(26),
      progress: 0,
      hours: 140,
      responsible: "foreman1",
    },
  ]);
  const log: [number, string, "sun" | "part" | "cloud" | "rain" | "cold", number][] = [
    [-23, "Bourání příček a staré podlahy, odvoz suti kontejnerem.", "cloud", 1],
    [-20, "Bourání podlahy hlavního provozu, uzavřený provoz pece.", "part", 1],
    [-16, "Vyrovnání podkladu, penetrace pod epoxid.", "sun", 1],
    [-13, "Pokládka epoxidové podlahy, 1. vrstva.", "part", 2],
    [-9, "Pokládka obkladů stěn, kuchyň a sklad.", "cloud", 1],
    [-6, "Osazení odsávání nad pecemi, montáž potrubí.", "rain", 1],
    [-2, "Rozvody elektro, kabelové žlaby.", "part", 2],
  ];
  for (const [off, work, wx, photos] of log)
    await diary(w, j, {
      date: wd(off),
      by: "foreman1",
      work,
      weather: WEATHER[wx],
      workers: [
        ["foreman1", 8],
        ["worker1", 8],
        ["worker2", off % 2 === 0 ? 8 : 6],
      ],
      materials:
        off === -16
          ? [
              ["Epoxidová pryskyřice, sada 20 kg", "14", "sada", "barvy", 3950],
              ["Kvarcový písek 0,3–0,8 mm", "28", "pytel", "stavebniny", 189],
            ]
          : undefined,
      photos,
      forInvestor: off === -13,
    });
  await addReceived(w, j, {
    number: "EH-2026-0307",
    supplier: "elektro",
    issueDate: d(-12),
    dueDate: d(2),
    lines: [
      {
        description: "Odsávací systém nad pecemi vč. dopravy a uvedení do provozu",
        category: "subcontract",
        netKc: 176000,
        section: "Vzduchotechnika a elektro",
      },
    ],
    state: "approved",
  });
  await addReceived(w, j, {
    number: "BD-260145",
    supplier: "barvy",
    issueDate: d(-9),
    dueDate: d(5),
    lines: [
      {
        description: "Epoxidová podlaha 210 m², materiál a systém",
        category: "material",
        netKc: 242000,
        section: "Podlaha a stěny provozu",
      },
    ],
    state: "pending",
  });
  await addReceived(w, j, {
    number: "SM-2026-0071",
    supplier: "elektro",
    issueDate: d(-3),
    dueDate: d(11),
    lines: [
      {
        description: "Rozvaděč, jističe, kabely a zásuvky pro výrobu",
        category: "material",
        netKc: 168000,
        section: "Vzduchotechnika a elektro",
      },
      {
        description: "Svítidla průmyslová LED, 24 ks",
        category: "material",
        netKc: 41000,
        section: "Vzduchotechnika a elektro",
      },
    ],
    state: "approved",
  });
  // náklady bez párování na rozpočet (úkol k doplnění v záložce Náklady)
  await addCost(w, j, {
    date: wd(-18),
    category: "other",
    title: "Kontejner na suť 7 m³ (3×)",
    supplier: "doprava",
    amountKc: 11400,
  });
  await addCost(w, j, {
    date: wd(-7),
    category: "material",
    title: "Hmoždinky, kotvy, spojovací materiál",
    supplier: "stavebniny",
    amountKc: 4860,
  });
  await addCost(w, j, {
    date: wd(-5),
    category: "machines",
    title: "Pronájem vysavače a brusky na beton",
    supplier: "stroje",
    amountKc: 7300,
    section: "Podlaha a stěny provozu",
  });
  await addCost(w, j, {
    date: wd(-8),
    category: "other",
    title: "Likvidace nalezených azbestových rour a odvoz",
    supplier: "doprava",
    amountKc: 75000,
  });
  await addChange(w, j, {
    title: "Odsávání nad chladicím boxem",
    description: "Provozovatel požádal o doplnění odsávání nad novým chladicím boxem.",
    reason: "Požadavek investora při obhlídce.",
    lines: [
      {
        kind: "add",
        title: "Odsávání nad chladicím boxem vč. potrubí",
        unit: "kpl",
        qty: 1,
        costKc: 38500,
        priceKc: 52000,
        section: "Vzduchotechnika a elektro",
        itemKind: "subcontract",
      },
    ],
    state: "approved",
  });
  await addChange(w, j, {
    title: "Protiskluzová dlažba místo obkladu soklu",
    lines: [{ kind: "qty", item: "Keramický obklad stěn do výšky 2,2 m", qty: 205 }],
    state: "pending",
  });
  await addChange(w, j, {
    title: "Přeložení rozvaděče do technické místnosti",
    description: "Rozvaděč zasahuje do evakuační cesty, dodavatel navrhl přeložku.",
    lines: [
      {
        kind: "add",
        title: "Přeložka hlavního rozvaděče",
        unit: "kpl",
        qty: 1,
        costKc: 26500,
        priceKc: 36000,
        section: "Vzduchotechnika a elektro",
        itemKind: "subcontract",
      },
    ],
    state: "draft",
  });
  w.dateFixes.push({ jobId: j.id, createdAt: d(-45), wonAt: d(-30), phaseChangedAt: d(-24) });
}

/** Realizace 4: menší zakázka, střecha rodinného domu. */
export async function storyStrecha(w: World) {
  const j = await createJob(w, {
    key: "strecha",
    title: "Výměna střechy rodinného domu",
    company: "pospisil",
    person: "Jana Pospíšilová",
    manager: "foreman2",
    members: ["worker1"],
    address: "Lesní 3, 333 01 Stod",
    description: "Demontáž eternitové krytiny, nová betonová taška, okapy a dvě střešní okna.",
    warrantyMonths: 60,
    startDate: d(-12),
    endDate: d(9),
  });
  await moveTo(w, j, "offer");
  await fillOffer(w, j, BUDGETS.strecha!);
  await sendOffer(w, j);
  await moveTo(w, j, "preparation");
  await reloadBudget(w, j);
  await advanceInvoice(w, j, { percent: 40, issueDate: d(-16), dueDate: d(-2), paidDate: d(-4) });
  await addOrder(w, j, {
    title: "Střešní krytina a okna",
    supplier: "strechy",
    section: "Nová střecha",
    orderDate: d(-15),
    deliveryDate: d(-11),
    lines: [
      {
        description: "Betonová taška, 168 m²",
        qty: 168,
        unit: "m²",
        priceKc: 360,
        vatBp: 1200,
        item: "Betonová taška, dodávka",
      },
      {
        description: "Střešní fólie a kontralatě",
        qty: 168,
        unit: "m²",
        priceKc: 92,
        vatBp: 1200,
        item: "Střešní fólie a kontralatě",
      },
    ],
    state: "received",
  });
  await moveTo(w, j, "execution");
  await addSchedule(w, j, [
    {
      name: "Demontáž krytiny",
      from: d(-12),
      to: d(-8),
      progress: 100,
      hours: 90,
      responsible: "foreman2",
      actualStart: d(-12),
      actualEnd: d(-8),
    },
    {
      name: "Latě a fólie",
      from: d(-7),
      to: d(-4),
      progress: 100,
      after: true,
      hours: 60,
      responsible: "foreman2",
      actualStart: d(-7),
      actualEnd: d(-4),
    },
    {
      name: "Pokládka tašek",
      from: d(-3),
      to: d(4),
      progress: 45,
      after: true,
      hours: 120,
      responsible: "foreman2",
      actualStart: d(-3),
    },
    {
      name: "Klempířské a dokončovací práce",
      from: d(5),
      to: d(9),
      progress: 0,
      after: true,
      hours: 50,
      responsible: "foreman2",
    },
  ]);
  const log: [number, string, "sun" | "part" | "cloud" | "rain" | "cold", number][] = [
    [-11, "Demontáž eternitové krytiny včetně bezpečného odvozu.", "cloud", 2],
    [-9, "Dokončení demontáže, kontrola krovu, výměna dvou krokví.", "part", 1],
    [-6, "Pokládka fólie a kontralatí.", "sun", 1],
    [-5, "Latě, oplechování komína.", "sun", 0],
    [-2, "Pokládka tašek, severní strana.", "part", 2],
  ];
  for (const [off, work, wx, photos] of log)
    await diary(w, j, {
      date: wd(off),
      by: "foreman2",
      work,
      weather: WEATHER[wx],
      workers: [
        ["foreman2", 8],
        ["worker1", 8],
      ],
      photos,
      forInvestor: photos > 0,
    });
  await addReceived(w, j, {
    number: "SH-26-0188",
    supplier: "strechy",
    issueDate: d(-10),
    dueDate: d(4),
    vatBp: 1200,
    lines: [
      {
        description: "Betonová taška 168 m², latě, fólie",
        category: "material",
        netKc: 76000,
        section: "Nová střecha",
      },
      {
        description: "Likvidace azbestové krytiny, 4 t",
        category: "subcontract",
        netKc: 39200,
        section: "Demontáž staré krytiny",
      },
    ],
    state: "approved",
  });
  await addReceived(w, j, {
    number: "RD-2026-031",
    supplier: "truhlar",
    issueDate: d(-3),
    dueDate: d(11),
    vatBp: 1200,
    note: "Nad rámec rozpočtu: shnilé krokve a laťování zjištěné po sundání krytiny.",
    lines: [
      {
        description: "Výměna 9 krokví a doplnění laťování",
        category: "subcontract",
        netKc: 54000,
        section: "Nová střecha",
      },
    ],
    state: "approved",
  });
  await addCost(w, j, {
    date: wd(-3),
    category: "material",
    title: "Řezivo a tesařské spoje, doplnění krovu",
    supplier: "stavebniny",
    amountKc: 31500,
    section: "Nová střecha",
  });
  w.dateFixes.push({ jobId: j.id, createdAt: d(-30), wonAt: d(-18), phaseChangedAt: d(-12) });
}

/** Příprava 1: novostavba rodinného domu (vyhráno před týdnem). */
export async function storyNovostavba(w: World) {
  const j = await createJob(w, {
    key: "novostavba",
    title: "Novostavba rodinného domu Havlíkovi",
    company: "havlik",
    person: "Petr Havlík",
    manager: "foreman1",
    members: ["worker1", "worker2"],
    address: "Zahradní 17, 334 41 Dobřany",
    description: "Dvoupodlažní rodinný dům 4+kk, zděný, s valbovou střechou a garáží.",
    retentionBp: 500,
    warrantyMonths: 60,
    startDate: d(14),
    endDate: d(210),
  });
  await moveTo(w, j, "offer");
  await fillOffer(w, j, BUDGETS.novostavba!);
  await sendOffer(w, j);
  await moveTo(w, j, "preparation");
  await reloadBudget(w, j);
  await advanceInvoice(w, j, { percent: 20, issueDate: d(-6), dueDate: d(8) });
  await addOrder(w, j, {
    title: "Okna a vchodové dveře",
    supplier: "okna",
    section: "Okna a dveře",
    orderDate: d(-4),
    deliveryDate: d(120),
    lines: [
      {
        description: "Plastová okna trojsklo",
        qty: 14,
        unit: "ks",
        priceKc: 12800,
        vatBp: 1200,
        item: "Plastová okna trojsklo",
      },
      {
        description: "Vchodové dveře",
        qty: 1,
        unit: "ks",
        priceKc: 32000,
        vatBp: 1200,
        item: "Vchodové dveře",
      },
    ],
    state: "pending",
  });
  await addOrder(w, j, {
    title: "Zdicí materiál",
    supplier: "stavebniny",
    section: "Hrubá stavba",
    orderDate: d(-2),
    deliveryDate: d(30),
    lines: [
      {
        description: "Porotherm 38 Profi, 410 m²",
        qty: 410,
        unit: "m²",
        priceKc: 780,
        vatBp: 1200,
        item: "Zdivo Porotherm 38 Profi",
      },
    ],
    state: "draft",
  });
  await addSchedule(w, j, [
    { name: "Základy", from: d(14), to: d(35), progress: 0, hours: 380, responsible: "foreman1" },
    {
      name: "Hrubá stavba",
      from: d(36),
      to: d(100),
      progress: 0,
      after: true,
      hours: 1400,
      responsible: "foreman1",
    },
    {
      name: "Krov a střecha",
      from: d(101),
      to: d(125),
      progress: 0,
      after: true,
      hours: 420,
      responsible: "foreman1",
    },
    {
      name: "Okna a dveře",
      from: d(126),
      to: d(140),
      progress: 0,
      after: true,
      hours: 120,
      responsible: "foreman1",
    },
    {
      name: "Vnitřní práce a dokončení",
      from: d(141),
      to: d(210),
      progress: 0,
      after: true,
      hours: 1600,
      responsible: "foreman1",
    },
  ]);
  w.dateFixes.push({ jobId: j.id, createdAt: d(-40), wonAt: d(-8), phaseChangedAt: d(-8) });
}

/** Příprava 2: rekonstrukce ordinace, zatím bez zálohy a objednávek. */
export async function storyOrdinace(w: World) {
  const j = await createJob(w, {
    key: "ordinace",
    title: "Rekonstrukce ordinace MUDr. Králové",
    company: "ordinace",
    person: "MUDr. Hana Králová",
    manager: "foreman2",
    members: ["worker2"],
    address: "Americká 41, 301 00 Plzeň",
    description: "Přestavba ordinace na dvě ambulance: příčky, podhledy, podlahy a instalace.",
    warrantyMonths: 24,
    startDate: d(10),
    endDate: d(45),
  });
  await moveTo(w, j, "offer");
  await fillOffer(w, j, BUDGETS.ordinace!);
  await sendOffer(w, j);
  await moveTo(w, j, "preparation");
  await reloadBudget(w, j);
  await addOrder(w, j, {
    title: "Sádrokarton, podhledy a profily",
    supplier: "sadrokarton",
    section: "Sádrokartonové konstrukce",
    orderDate: d(-1),
    deliveryDate: d(8),
    lines: [
      {
        description: "SDK příčky s izolací, 86 m²",
        qty: 86,
        unit: "m²",
        priceKc: 340,
        item: "SDK příčky s izolací",
      },
    ],
    state: "approved",
  });
  await addSchedule(w, j, [
    {
      name: "Bourání a příprava",
      from: d(10),
      to: d(15),
      progress: 0,
      hours: 80,
      responsible: "foreman2",
    },
    {
      name: "Sádrokartony",
      from: d(16),
      to: d(28),
      progress: 0,
      after: true,
      hours: 190,
      responsible: "foreman2",
    },
    {
      name: "Instalace a povrchy",
      from: d(29),
      to: d(44),
      progress: 0,
      after: true,
      hours: 260,
      responsible: "foreman2",
    },
  ]);
  w.dateFixes.push({ jobId: j.id, createdAt: d(-26), wonAt: d(-4), phaseChangedAt: d(-4) });
}

/** Nabídka odeslaná před třemi týdny bez odpovědi (vyžaduje pozornost); druhá revize nabídky. */
export async function storyPristavba(w: World) {
  const j = await createJob(w, {
    key: "pristavba",
    title: "Přístavba kancelářské budovy",
    company: "logistik",
    person: "Ivana Hrubá",
    manager: "office",
    address: "Průmyslová 2200, 326 00 Plzeň",
    description: "Jednopodlažní přístavba kanceláří 12 × 8 m ke stávající budově správy areálu.",
  });
  await moveTo(w, j, "offer");
  await fillOffer(w, j, BUDGETS.pristavba!);
  await sendOffer(w, j);
  w.dateFixes.push({ jobId: j.id, createdAt: d(-45), phaseChangedAt: d(-21) });
}

/** Nabídka rozpracovaná, zatím neodeslaná. */
export async function storySbd(w: World) {
  const j = await createJob(w, {
    key: "sbd",
    title: "Fasáda a zateplení bytových domů SBD Západ",
    company: "sbd",
    person: "Bc. Roman Štěpán",
    manager: "office",
    address: "Koterovská 80, 326 00 Plzeň",
    description: "Zateplení obvodového pláště a stropů pod půdou u tří panelových vchodů.",
  });
  await moveTo(w, j, "offer");
  await fillOffer(w, j, BUDGETS.zatepleniSbd!);
  w.dateFixes.push({ jobId: j.id, createdAt: d(-9), phaseChangedAt: d(-5) });
}

/** Schránka poptávek: nové, převedené na zakázku (kvalifikované) a zamítnutá. Obchod samotný řeší zakázky v obchodních stavech. */
export async function storyInquiries(w: World) {
  const c = w.cast.office.ctx;
  const stage = (name: string) => stageId(w, "inquiry", name);
  const mk = async (v: Record<string, unknown>) =>
    w.kit.create(c, "inquiry", { owner: w.cast.office.id, ...v });
  await mk({
    title: "Oprava střechy skladu",
    stage: await stage("Nová"),
    companyName: "Zemědělské družstvo Kozolupy",
    contactName: "Vladimír Janda",
    contactEmail: "janda@zd-kozolupy.example",
    contactPhone: "+420 604 300 501",
    source: "web",
    value: 450000_00,
    message:
      "Dobrý den, potřebujeme opravit střechu skladu (cca 600 m²), poškozená po bouři. Můžete se přijet podívat?",
    nextStep: "Zavolat a domluvit obhlídku",
    nextStepAt: d(1),
  });
  await mk({
    title: "Přestavba bytu 3+1 na 4+kk",
    stage: await stage("Nová"),
    company: w.contacts.company.simek,
    person: w.contacts.person["Michal Šimek"],
    source: "referral",
    value: 780000_00,
    message: "Doporučení od pana Havlíka. Rozšíření bytu o půdní prostor.",
    nextStep: "Obhlídka bytu a zaměření",
    nextStepAt: d(3),
  });
  await mk({
    title: "Nová fasáda a plot, firemní areál",
    stage: await stage("Nová"),
    company: w.contacts.company.autoservis,
    person: w.contacts.person["Karel Rychlík"],
    source: "personal",
    value: 620000_00,
    nextStep: "Ozvat se po týdnu",
    nextStepAt: d(-2),
  });
  await mk({
    title: "Chata Šumava – rekonstrukce koupelny",
    stage: await stage("Nová"),
    companyName: "Ing. Jiří Matoušek",
    contactName: "Ing. Jiří Matoušek",
    contactEmail: "matousek@demo-firma.example",
    contactPhone: "+420 604 300 504",
    source: "phone",
    value: 340000_00,
    nextStep: "Upravit cenu, zákazník chce slevu za materiál",
    nextStepAt: d(2),
  });
  const lost = await mk({
    title: "Dřevěná terasa u penzionu",
    stage: await stage("Nová"),
    company: w.contacts.company.penzion,
    source: "email",
    value: 220000_00,
    message: "Poptávka terasy cca 40 m², cena nejdůležitější.",
  });
  await w.kit.run(c, "poptavky.markLost", { id: lost.id, reason: "price" }); // stav „Zamítnutá“

  // kvalifikované poptávky: zakázka vzniká v prvním stavu fáze poptávka (adresu stavby a nabídku doplní kancelář)
  for (const x of [
    {
      title: "Půdní vestavba bytového domu Nad Parkem",
      company: "svj-park",
      person: "Ing. Marcela Kučerová",
      value: 1_700_000,
      msg: "Výbor SVJ chce vestavět dva byty do půdy. Prosíme o cenovou nabídku.",
      src: "referral",
    },
    {
      title: "Rekonstrukce koupelny",
      company: "simek",
      person: "Michal Šimek",
      value: 280_000,
      msg: "Rekonstrukce koupelny v rodinném domě, cca 6 m².",
      src: "web",
    },
  ] as const) {
    const inq = await mk({
      title: x.title,
      stage: await stage("Nová"),
      company: w.contacts.company[x.company],
      person: w.contacts.person[x.person],
      source: x.src,
      value: x.value * 100,
      message: x.msg,
    });
    const res = await w.kit.run<{ jobId: string }>(c, "poptavky.convert", { id: inq.id });
    const row = (await w.kit.s.db.execute(w.kit.sqlJob(res.jobId))) as unknown as {
      number: string;
    }[];
    const job = {
      key: x.company === "svj-park" ? "vestavba" : "koupelna",
      id: res.jobId,
      number: row[0]!.number,
      title: x.title,
      items: [],
      sections: {},
      manager: "office" as const,
      members: [],
    };
    w.jobs[job.key] = job;
    w.jobList.push(job);
    const addr =
      x.company === "svj-park" ? "Nad Parkem 14, 323 00 Plzeň" : "Úslavská 133, 326 00 Plzeň";
    await w.kit.run(c, "zakazky.team.add", {
      jobId: job.id,
      userId: w.cast.foreman2.id,
      role: "Mistr",
    });
    await w.kit.s.db.execute(w.kit.sqlSetAddress(job.id, addr));
    w.dateFixes.push({ jobId: job.id, createdAt: d(-14), phaseChangedAt: d(-12) });
  }
}
