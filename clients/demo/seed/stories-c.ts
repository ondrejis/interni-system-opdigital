import { BUDGETS } from "./budgets";
import { d, wd } from "./dates";
import { addChange, addCost, addOrder, addReceived, addStatement, advanceInvoice } from "./docs";
import { diary, WEATHER } from "./field";
import { addSchedule, createJob, fillOffer, moveTo, reloadBudget, sendOffer } from "./jobs";
import type { World } from "./world";

/** Realizace 1: dostavba haly, přenesená daňová povinnost, zádržné, zpožděná fáze, faktura po splatnosti. */
export async function storyHala(w: World) {
  const j = await createJob(w, {
    key: "hala",
    title: "Dostavba skladové haly B",
    company: "logistik",
    person: "Ing. Daniel Procházka",
    manager: "foreman1",
    members: ["worker1", "worker2"],
    address: "Průmyslová 2200, 326 00 Plzeň",
    description: "Ocelová hala 2 400 m² s průmyslovou podlahou, šesti vraty a zpevněnými plochami.",
    vatMode: "reverse_charge",
    retentionBp: 500,
    warrantyMonths: 60,
    startDate: d(-95),
    endDate: d(55),
  });
  await moveTo(w, j, "offer");
  await fillOffer(w, j, BUDGETS.hala!);
  await sendOffer(w, j);
  await moveTo(w, j, "preparation");
  await reloadBudget(w, j);
  await advanceInvoice(w, j, { percent: 15, issueDate: d(-97), dueDate: d(-83), paidDate: d(-85) });
  await addOrder(w, j, {
    title: "Betonáž základů – transportbeton",
    supplier: "beton",
    section: "Základy",
    orderDate: d(-96),
    deliveryDate: d(-84),
    lines: [
      {
        description: "Beton C25/30 XC2, 185 m³",
        qty: 185,
        unit: "m³",
        priceKc: 2650,
        item: "Beton základových patek C25/30",
      },
    ],
    state: "received",
  });
  await addOrder(w, j, {
    title: "Střešní a obvodové sendvičové panely",
    supplier: "strechy",
    section: "Opláštění",
    orderDate: d(-40),
    deliveryDate: d(12),
    lines: [
      {
        description: "Střešní panely PIR 120",
        qty: 2650,
        unit: "m²",
        priceKc: 640,
        item: "Střešní sendvičové panely PIR 120",
      },
      {
        description: "Obvodové panely",
        qty: 1800,
        unit: "m²",
        priceKc: 590,
        item: "Obvodové sendvičové panely",
      },
    ],
    state: "approved",
  });
  await addOrder(w, j, {
    title: "Sekční vrata 4 × 4,5 m",
    supplier: "okna",
    section: "Podlahy a vrata",
    orderDate: d(-3),
    deliveryDate: d(40),
    lines: [
      {
        description: "Sekční vrata 4 × 4,5 m",
        qty: 6,
        unit: "ks",
        priceKc: 58000,
        item: "Sekční vrata 4 × 4,5 m",
      },
    ],
    state: "pending",
  });
  await addOrder(w, j, {
    title: "Retenční nádrž a přípojka",
    supplier: "instalater",
    section: "Odvodnění",
    orderDate: d(-1),
    lines: [
      {
        description: "Retenční nádrž 40 m³",
        qty: 1,
        unit: "kpl",
        priceKc: 310000,
        item: "Retenční nádrž 40 m³",
      },
    ],
    state: "draft",
  });
  await moveTo(w, j, "execution");

  await addSchedule(w, j, [
    {
      name: "Zemní práce",
      from: d(-94),
      to: d(-78),
      progress: 100,
      hours: 420,
      responsible: "foreman1",
      actualStart: d(-94),
      actualEnd: d(-77),
    },
    {
      name: "Základy a podlahová deska",
      from: d(-77),
      to: d(-45),
      progress: 100,
      after: true,
      hours: 900,
      responsible: "foreman1",
      actualStart: d(-77),
      actualEnd: d(-42),
    },
    {
      name: "Ocelová konstrukce",
      from: d(-44),
      to: d(-14),
      progress: 75,
      after: true,
      hours: 650,
      responsible: "foreman1",
      actualStart: d(-43),
      note: "Zpoždění: dodávka ocelových prvků o 9 dní později",
    },
    {
      name: "Opláštění střechy a stěn",
      from: d(-13),
      to: d(18),
      progress: 10,
      after: true,
      hours: 800,
      responsible: "foreman1",
      actualStart: d(-3),
    },
    {
      name: "Podlahy, vrata",
      from: d(19),
      to: d(40),
      progress: 0,
      after: true,
      hours: 500,
      responsible: "foreman1",
    },
    {
      name: "Zpevněné plochy a odvodnění",
      from: d(30),
      to: d(54),
      progress: 0,
      hours: 480,
      responsible: "foreman1",
    },
    {
      name: "Předání investorovi",
      from: d(55),
      to: d(55),
      progress: 0,
      after: true,
      milestone: true,
    },
  ]);

  const log: [number, string, "sun" | "part" | "cloud" | "rain" | "cold", number][] = [
    [-93, "Vytyčení haly geodetem, skrývka ornice.", "part", 1],
    [-88, "Výkop základových patek, odvoz zeminy.", "sun", 2],
    [-80, "Bednění a vyztužení patek, betonáž.", "cloud", 2],
    [-70, "Zásyp patek, zhutnění podsypu pod desku.", "part", 1],
    [-60, "Armování základové desky, osazení instalací.", "rain", 1],
    [-52, "Betonáž základové desky, zahlazení.", "sun", 3],
    [-41, "Příprava kotvení OK, převzetí prvních dílů ocelové konstrukce.", "part", 1],
    [-33, "Montáž sloupů a vazníků, 1. pole.", "cloud", 2],
    [-24, "Montáž sloupů a vazníků, 2.–3. pole.", "rain", 1],
    [-16, "Montáž vaznic, ztužidla.", "sun", 2],
    [-8, "Dokončení OK, kontrola svarů, příprava opláštění.", "part", 2],
    [-3, "Zahájení montáže střešních panelů.", "sun", 2],
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
        ["worker2", 8],
      ],
      machines:
        off < -50
          ? [
              ["Rypadlo CAT 320", 8, "Zemní práce"],
              ["Nakladač JCB 3CX", 6],
            ]
          : [["Autojeřáb 60 t", 8, "Montáž OK"]],
      materials:
        off === -80 ? [["Betonářská ocel B500B", "9.5", "t", "stavebniny", 24800]] : undefined,
      incidents:
        off === -24
          ? [
              {
                kind: "incident",
                text: "Zvýšený vítr v 11:00, montáž na 2 hodiny přerušena kvůli bezpečnosti.",
              },
            ]
          : off === -8
            ? [
                {
                  kind: "defect",
                  text: "Dvě patní desky mají odchylku 6 mm, vyrovnáno podlitím, nahlášeno statikovi.",
                },
              ]
            : undefined,
      photos,
      forInvestor: photos >= 2,
    });

  await addReceived(w, j, {
    number: "2026-0612",
    supplier: "beton",
    issueDate: d(-82),
    dueDate: d(-68),
    vatBp: 0,
    note: "Přenesená daňová povinnost, dodavatel stavebních prací.",
    lines: [
      {
        description: "Transportbeton C25/30, 185 m³",
        category: "material",
        netKc: 490250,
        section: "Základy",
      },
    ],
    state: "paid",
    paidDate: d(-70),
  });
  await addReceived(w, j, {
    number: "FV-26-0099",
    supplier: "stroje",
    issueDate: d(-35),
    dueDate: d(-21),
    lines: [
      {
        description: "Pronájem rypadla CAT 320, 14 dní",
        category: "machines",
        netKc: 112000,
        section: "Zemní práce",
      },
      {
        description: "Pronájem nakladače, 10 dní",
        category: "machines",
        netKc: 38000,
        section: "Zemní práce",
      },
    ],
    state: "approved",
  });
  await addReceived(w, j, {
    number: "ZD-2026-014",
    supplier: "beton",
    issueDate: d(-44),
    dueDate: d(-30),
    vatBp: 0,
    note: "Základová deska s drátkobetonem, subdodávka.",
    lines: [
      {
        description: "Základová deska s drátkobetonem, 2 400 m²",
        category: "subcontract",
        netKc: 3480000,
        section: "Základy",
      },
    ],
    state: "paid",
    paidDate: d(-31),
  });
  await addReceived(w, j, {
    number: "OK-0044",
    supplier: "strechy",
    issueDate: d(-14),
    dueDate: d(14),
    lines: [
      {
        description: "Dodávka ocelové konstrukce 66 t, 1. část",
        category: "material",
        netKc: 2772000,
        section: "Ocelová konstrukce",
      },
    ],
    state: "approved",
  });
  await addReceived(w, j, {
    number: "OK-0051",
    supplier: "strechy",
    issueDate: d(-4),
    dueDate: d(24),
    lines: [
      {
        description: "Montáž ocelové konstrukce, 60 t",
        category: "subcontract",
        netKc: 468000,
        section: "Ocelová konstrukce",
      },
    ],
    state: "pending",
  });
  await addReceived(w, j, {
    number: "GEO-2026-031",
    supplier: "geodezie",
    issueDate: d(-9),
    dueDate: d(5),
    lines: [
      { description: "Geodetické vytyčení a zaměření", category: "subcontract", netKc: 18500 },
    ],
    state: "draft",
  });
  await addCost(w, j, {
    date: wd(-60),
    category: "material",
    title: "Distanční a podkladní materiál do armatury",
    supplier: "stavebniny",
    amountKc: 8400,
  });
  await addCost(w, j, {
    date: wd(-12),
    category: "other",
    title: "Nafta do strojů, zálohově hrazeno",
    amountKc: 6120,
  });

  // soupisy: 1. a 2. vyfakturovány (druhá faktura je po splatnosti), 3. čeká na schválení
  await addStatement(w, j, {
    from: d(-94),
    to: d(-62),
    object: "SO 01",
    done: {
      "Skrývka ornice tl. 180 mm": 420,
      "Výkop základových patek": 310,
      "Zásyp a hutnění po vrstvách": 260,
      "Odvoz a uložení přebytečné zeminy": 520,
      "Beton základových patek C25/30": 185,
      "Betonářská výztuž patek": 14,
      "Bednění základových patek": 420,
    },
    note: "Zemní práce a základové patky",
    state: "paid",
    issueDate: d(-58),
    dueDate: d(-44),
    paidDate: d(-46),
  });
  await addStatement(w, j, {
    from: d(-61),
    to: d(-31),
    done: {
      "Základová deska s drátkobetonem": 2400,
      "Dodávka ocelové konstrukce haly": 52,
      "Montáž ocelové konstrukce": 38,
    },
    note: "Základová deska a první dodávka OK",
    state: "invoiced",
    issueDate: d(-28),
    dueDate: d(-14),
  });
  await addStatement(w, j, {
    from: d(-30),
    to: d(-2),
    done: {
      "Montáž ocelové konstrukce": 22,
      "Protikorozní nátěr konstrukce": 3100,
      "Dodávka ocelové konstrukce haly": 14,
    },
    note: "Montáž OK, 3.–4. pole",
    state: "submitted",
  });

  await addChange(w, j, {
    title: "Zesílení podlahové desky v zóně regálů",
    description: "Statik požaduje v zóně regálových řad zvýšit tloušťku desky a doplnit kari sítě.",
    reason: "Požadavek statika investora po změně regálového systému.",
    lines: [
      {
        kind: "add",
        title: "Doplňková výztuž kari sítě pod regály",
        unit: "m²",
        qty: 640,
        costKc: 180,
        priceKc: 260,
        section: "Základy",
        itemKind: "material",
      },
      { kind: "qty", item: "Průmyslová podlaha, vsyp a zahlazení", qty: 2480 },
    ],
    state: "approved",
  });
  await addChange(w, j, {
    title: "Sedmá vrata do expedice",
    description: "Investor požaduje další sekční vrata v severním štítu.",
    lines: [
      {
        kind: "add",
        title: "Sekční vrata 4 × 4,5 m – sedmá",
        unit: "ks",
        qty: 1,
        costKc: 58000,
        priceKc: 71500,
        section: "Podlahy a vrata",
        itemKind: "material",
      },
      {
        kind: "add",
        title: "Montáž sedmých vrat",
        unit: "ks",
        qty: 1,
        costKc: 6500,
        priceKc: 9200,
        section: "Podlahy a vrata",
        itemKind: "labour",
      },
    ],
    state: "pending",
  });
  await addChange(w, j, {
    title: "Přeložka kabelu VN v trase přístupové komunikace",
    reason: "Kabel nebyl v podkladech, čekáme na vyjádření distributora.",
    lines: [
      {
        kind: "add",
        title: "Přeložka kabelu VN",
        unit: "kpl",
        qty: 1,
        costKc: 82000,
        priceKc: 104000,
        section: "Komunikace",
        itemKind: "subcontract",
      },
    ],
    state: "draft",
  });

  w.dateFixes.push({ jobId: j.id, createdAt: d(-118), wonAt: d(-100), phaseChangedAt: d(-95) });
}

/** Realizace 2: zateplení bytového domu SVJ, snížená DPH, faktura ze soupisu čeká na úhradu. */
export async function storyZatepleni(w: World) {
  const j = await createJob(w, {
    key: "zatepleni",
    title: "Zateplení bytového domu Nad Parkem 14",
    company: "svj-park",
    person: "Ing. Marcela Kučerová",
    manager: "foreman2",
    members: ["worker1", "worker2"],
    address: "Nad Parkem 14, 323 00 Plzeň",
    description:
      "Kontaktní zateplení fasády EPS 160 mm, zateplení soklu, nová omítka a klempířské prvky.",
    retentionBp: 500,
    warrantyMonths: 36,
    startDate: d(-38),
    endDate: d(34),
  });
  await moveTo(w, j, "offer");
  await fillOffer(w, j, BUDGETS.zatepleni!);
  await sendOffer(w, j);
  await moveTo(w, j, "preparation");
  await reloadBudget(w, j);
  await advanceInvoice(w, j, { percent: 30, issueDate: d(-44), dueDate: d(-30), paidDate: d(-31) });
  await addOrder(w, j, {
    title: "Zateplovací systém EPS 160 + omítka",
    supplier: "stavebniny",
    section: "Zateplení fasády",
    orderDate: d(-43),
    deliveryDate: d(-36),
    lines: [
      {
        description: "Polystyren EPS 70F tl. 160 mm",
        qty: 1280,
        unit: "m²",
        priceKc: 235,
        vatBp: 1200,
        item: "Polystyren EPS 70F tl. 160 mm",
      },
      {
        description: "Lepicí a stěrkovací hmota",
        qty: 1280,
        unit: "m²",
        priceKc: 82,
        vatBp: 1200,
        item: "Lepicí a stěrkovací hmota",
      },
    ],
    state: "received",
  });
  await addOrder(w, j, {
    title: "Fasádní lešení",
    supplier: "lesenari",
    section: "Lešení",
    orderDate: d(-45),
    deliveryDate: d(-39),
    lines: [
      {
        description: "Montáž a pronájem lešení 1 450 m²",
        qty: 1450,
        unit: "m²",
        priceKc: 215,
        vatBp: 1200,
        item: "Montáž a demontáž fasádního lešení",
      },
    ],
    state: "received",
  });
  await moveTo(w, j, "execution");
  await addSchedule(w, j, [
    {
      name: "Lešení",
      from: d(-38),
      to: d(-33),
      progress: 100,
      hours: 160,
      responsible: "foreman2",
      actualStart: d(-38),
      actualEnd: d(-33),
    },
    {
      name: "Zateplení fasády",
      from: d(-32),
      to: d(10),
      progress: 55,
      after: true,
      hours: 1100,
      responsible: "foreman2",
      actualStart: d(-31),
    },
    {
      name: "Omítky",
      from: d(11),
      to: d(26),
      progress: 0,
      after: true,
      hours: 360,
      responsible: "foreman2",
    },
    {
      name: "Klempířské práce a sokl",
      from: d(20),
      to: d(32),
      progress: 0,
      hours: 220,
      responsible: "foreman2",
    },
    {
      name: "Demontáž lešení a předání",
      from: d(33),
      to: d(34),
      progress: 0,
      after: true,
      milestone: true,
    },
  ]);
  const log: [number, string, "sun" | "part" | "cloud" | "rain" | "cold", number][] = [
    [-37, "Montáž lešení, ochranné sítě.", "part", 1],
    [-34, "Dokončení lešení, převzetí revizí.", "cloud", 0],
    [-31, "Příprava podkladu, penetrace fasády, kotvení soklové lišty.", "sun", 1],
    [-27, "Lepení polystyrenu, severní a západní strana.", "part", 1],
    [-22, "Lepení polystyrenu, jižní strana, kotvení hmoždinkami.", "sun", 2],
    [-15, "Stěrka a síťovina, západní fasáda.", "cloud", 1],
    [-9, "Stěrka a síťovina, jižní fasáda.", "rain", 0],
    [-4, "Lepení polystyrenu na východní straně.", "part", 2],
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
        ["worker2", 8],
      ],
      materials:
        off === -27
          ? [["Hmoždinky šroubovací 200 mm", "1800", "ks", "stavebniny", 6.4]]
          : undefined,
      photos,
      forInvestor: photos > 0,
    });
  await addReceived(w, j, {
    number: "FA260587",
    supplier: "stavebniny",
    issueDate: d(-33),
    dueDate: d(-19),
    vatBp: 1200,
    lines: [
      {
        description: "Polystyren EPS 70F 160 mm, 1 280 m²",
        category: "material",
        netKc: 300800,
        section: "Zateplení fasády",
      },
      {
        description: "Lepicí a stěrkovací hmota",
        category: "material",
        netKc: 104960,
        section: "Zateplení fasády",
      },
    ],
    state: "paid",
    paidDate: d(-20),
  });
  await addReceived(w, j, {
    number: "LN-2026-017",
    supplier: "lesenari",
    issueDate: d(-12),
    dueDate: d(2),
    vatBp: 1200,
    lines: [
      {
        description: "Montáž a pronájem lešení, 1. fakturace",
        category: "subcontract",
        netKc: 138000,
        section: "Lešení",
      },
    ],
    state: "approved",
  });
  await addReceived(w, j, {
    number: "FA260641",
    supplier: "stavebniny",
    issueDate: d(-3),
    dueDate: d(11),
    vatBp: 1200,
    lines: [
      {
        description: "Silikonová omítka, síťovina, lišty",
        category: "material",
        netKc: 128000,
        section: "Zateplení fasády",
      },
    ],
    state: "pending",
  });
  await addStatement(w, j, {
    from: d(-31),
    to: d(-10),
    done: {
      "Montáž a demontáž fasádního lešení": 1450,
      "Polystyren EPS 70F tl. 160 mm": 700,
      "Lepicí a stěrkovací hmota": 700,
      "Montáž kontaktního zateplení": 600,
    },
    note: "Lešení a zateplení fasády, 1. etapa",
    state: "invoiced",
    issueDate: d(-8),
    dueDate: d(6),
  });
  await addStatement(w, j, {
    from: d(-9),
    to: d(2),
    done: {
      "Polystyren EPS 70F tl. 160 mm": 200,
      "Lepicí a stěrkovací hmota": 200,
      "Montáž kontaktního zateplení": 200,
    },
    note: "Zateplení fasády, 2. etapa (rozpracováno)",
    state: "draft",
  });
  await addChange(w, j, {
    title: "Zateplení ostění lodžií",
    reason: "Při zaměření se ukázalo, že lodžie mají neizolované ostění.",
    lines: [
      {
        kind: "add",
        title: "Zateplení ostění lodžií EPS 30 mm",
        unit: "m",
        qty: 240,
        costKc: 180,
        priceKc: 260,
        section: "Zateplení fasády",
        itemKind: "labour",
        vatBp: 1200,
      },
    ],
    state: "pending",
  });
  w.dateFixes.push({ jobId: j.id, createdAt: d(-62), wonAt: d(-46), phaseChangedAt: d(-38) });
}
