import { BUDGETS } from "./budgets";
import { d, wd } from "./dates";
import { addCost, addOrder, addReceived, addStatement, advanceInvoice, issueInvoice } from "./docs";
import { diary, WEATHER } from "./field";
import { addDefect, createJob, fillOffer, moveTo, reloadBudget, sendOffer } from "./jobs";
import { signHandover } from "./stories-a";
import type { World } from "./world";

/** Záruka: víceúčelové hřiště, předáno před ~5,5 měsíci, záruka brzy končí, zádržné zatím drženo. */
export async function storyWarranty(w: World) {
  const j = await createJob(w, {
    key: "hriste",
    title: "Víceúčelové hřiště",
    company: "obec",
    person: "Mgr. Zdeněk Bartoš",
    manager: "foreman1",
    members: ["worker1", "worker2"],
    address: "Náves 1, 330 12 Bukovany",
    description: "Víceúčelové sportovní hřiště s polyuretanovým povrchem, oplocením a vybavením.",
    retentionBp: 500,
    warrantyMonths: 6,
    startDate: d(-262),
    endDate: d(-185),
  });
  await moveTo(w, j, "offer");
  await fillOffer(w, j, BUDGETS.hriste!);
  await sendOffer(w, j);
  await moveTo(w, j, "preparation");
  await reloadBudget(w, j);
  await advanceInvoice(w, j, {
    percent: 20,
    issueDate: d(-262),
    dueDate: d(-248),
    paidDate: d(-250),
  });
  await addOrder(w, j, {
    title: "Štěrk a podkladní vrstvy",
    supplier: "stavebniny",
    section: "Zemní práce",
    orderDate: d(-258),
    deliveryDate: d(-252),
    lines: [
      {
        description: "Štěrkový podklad frakce 0–32, 310 m³",
        qty: 310,
        unit: "m³",
        priceKc: 520,
        item: "Zhutněný štěrkový podklad",
      },
    ],
    state: "received",
  });
  await addOrder(w, j, {
    title: "Oplocení a herní prvky",
    supplier: "okna",
    section: "Vybavení",
    orderDate: d(-235),
    deliveryDate: d(-215),
    lines: [
      {
        description: "Oplocení s ochrannými sítěmi, 118 m",
        qty: 118,
        unit: "m",
        priceKc: 1450,
        item: "Oplocení s ochrannými sítěmi",
      },
      {
        description: "Basketbalové koše a branky",
        qty: 1,
        unit: "kpl",
        priceKc: 64000,
        item: "Basketbalové koše a branky",
      },
    ],
    state: "received",
  });
  await moveTo(w, j, "execution");
  const days: [number, string, "sun" | "part" | "cloud" | "rain" | "cold", number][] = [
    [-255, "Vytyčení hřiště, odtěžení ornice, odvoz.", "part", 1],
    [-252, "Zhutněný štěrkový podklad, první vrstva.", "cloud", 0],
    [-247, "Zhutnění podkladu, kontrola rovinnosti.", "sun", 1],
    [-232, "Příprava podkladu pro povrch, osazení obrubníků.", "part", 0],
    [-222, "Pokládka polyuretanového povrchu, 1. etapa.", "sun", 2],
    [-212, "Montáž oplocení a sítí.", "cloud", 1],
    [-203, "Osazení košů, branek a laviček.", "part", 1],
    [-196, "Čáry a značení, finální úklid.", "sun", 2],
  ];
  for (const [off, work, wx, photos] of days)
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
        off === -255 || off === -252
          ? [
              ["Minibagr Kubota KX057", 8, "Terén, odvoz zeminy"],
              ["Válec Bomag BW 120", 4],
            ]
          : undefined,
      materials:
        off === -222
          ? [["Polyuretanový nástřik, sada 25 kg", "26", "sada", "barvy", 3980]]
          : undefined,
      photos,
      forInvestor: photos > 0,
    });
  await addReceived(w, j, {
    number: "FV260412",
    supplier: "stavebniny",
    issueDate: d(-250),
    dueDate: d(-236),
    lines: [
      {
        description: "Štěrk frakce 0–32, 310 m³ vč. dopravy",
        category: "material",
        netKc: 161200,
        section: "Zemní práce",
      },
    ],
    state: "paid",
    paidDate: d(-238),
  });
  await addReceived(w, j, {
    number: "O-2026-088",
    supplier: "okna",
    issueDate: d(-208),
    dueDate: d(-194),
    lines: [
      {
        description: "Oplocení 118 m vč. sítí a vrat",
        category: "material",
        netKc: 171100,
        section: "Vybavení",
      },
      {
        description: "Basketbalové koše a branky",
        category: "material",
        netKc: 64000,
        section: "Vybavení",
      },
    ],
    state: "paid",
    paidDate: d(-196),
  });
  await addCost(w, j, {
    date: wd(-222),
    category: "machines",
    title: "Pronájem vibrační desky",
    supplier: "stroje",
    amountKc: 9800,
    section: "Zemní práce",
  });
  await addStatement(w, j, {
    from: d(-256),
    to: d(-228),
    done: { "Odtěžení a vyrovnání plochy": 480, "Zhutněný štěrkový podklad": 310 },
    note: "Zemní práce a podklad",
    state: "paid",
    issueDate: d(-225),
    dueDate: d(-211),
    paidDate: d(-213),
  });
  await addStatement(w, j, {
    from: d(-227),
    to: d(-192),
    done: { "Polyuretanový povrch sportovní": 650 },
    note: "Povrch hřiště",
    state: "paid",
    issueDate: d(-190),
    dueDate: d(-176),
    paidDate: d(-178),
  });
  await moveTo(w, j, "handover");
  const protocol = await signHandover(w, j, d(-172), "Mgr. Zdeněk Bartoš", [
    ["Povrch hřiště bez trhlin", true],
    ["Oplocení a brány funkční", true],
    ["Herní prvky osazeny a ukotveny", true, "Drobná oprava kotvení koše"],
  ]);
  void protocol;
  await addDefect(w, j, {
    title: "Uvolněné kotvení basketbalového koše",
    description: "Při předání uvolněná kotva u východního koše, dotažení a zalití.",
    severity: "minor",
    responsible: "foreman1",
    foundAt: d(-172),
    dueDate: d(-162),
    state: "Opraveno",
    fixedAt: d(-165),
  });
  const fin = await w.kit.run<{ id: string }>(w.cast.office.ctx, "fakturace.createFromJob", {
    jobId: j.id,
    kind: "final",
  });
  await issueInvoice(w, fin.id, { issueDate: d(-168), dueDate: d(-154), paidDate: d(-156) });
  await moveTo(w, j, "warranty");
  w.dateFixes.push({
    jobId: j.id,
    createdAt: d(-280),
    wonAt: d(-263),
    handoverAt: d(-172),
    warrantyUntil: d(13),
    phaseChangedAt: d(-168),
  });
}

/** Předání: rekonstrukce penzionu, protokol rozpracovaný, otevřené vady (jedna po termínu). */
export async function storyHandover(w: World) {
  const j = await createJob(w, {
    key: "penzion",
    title: "Rekonstrukce penzionu U Lípy",
    company: "penzion",
    person: "Alena Lipová",
    manager: "foreman2",
    members: ["worker1", "worker2"],
    address: "Lipová 5, 342 01 Sušice",
    description: "Nové podlahy, koupelny, malby a recepce v devíti pokojích penzionu.",
    retentionBp: 500,
    warrantyMonths: 24,
    startDate: d(-118),
    endDate: d(2),
  });
  await moveTo(w, j, "offer");
  await fillOffer(w, j, BUDGETS.penzion!);
  await sendOffer(w, j);
  await moveTo(w, j, "preparation");
  await reloadBudget(w, j);
  await advanceInvoice(w, j, {
    percent: 30,
    issueDate: d(-126),
    dueDate: d(-112),
    paidDate: d(-110),
  });
  await addOrder(w, j, {
    title: "Obklady, dlažby a sanita",
    supplier: "instalater",
    section: "Koupelny",
    orderDate: d(-122),
    deliveryDate: d(-100),
    lines: [
      {
        description: "Obklady a dlažby",
        qty: 128,
        unit: "m²",
        priceKc: 590,
        item: "Obklady a dlažby",
      },
      {
        description: "Sanitární keramika a armatury",
        qty: 9,
        unit: "kpl",
        priceKc: 8800,
        item: "Sanitární keramika a armatury",
      },
    ],
    state: "received",
  });
  await moveTo(w, j, "execution");
  const entries: [number, string, "sun" | "part" | "cloud" | "rain" | "cold"][] = [
    [-104, "Demontáž starých podlah a obkladů v pokojích 1–4.", "cold"],
    [-96, "Pokládka podlah v pokojích 1–4.", "cloud"],
    [-84, "Obklady koupelen 1–5.", "part"],
    [-70, "Obklady koupelen 6–9, osazení sanity.", "cloud"],
    [-52, "Malby pokojů, nátěry zárubní.", "sun"],
    [-34, "Montáž recepčního pultu a podhledu.", "part"],
    [-18, "Dokončovací práce, úklid pokojů.", "sun"],
  ];
  for (const [off, work, wx] of entries)
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
      photos: off % 2 === 0 ? 1 : 0,
      materials:
        off === -96 ? [["Vinylová podlaha 5 mm", "112", "m²", "sadrokarton", 540]] : undefined,
    });
  await addReceived(w, j, {
    number: "FV-0451/2026",
    supplier: "instalater",
    issueDate: d(-98),
    dueDate: d(-84),
    lines: [
      {
        description: "Obklady, dlažby, lepidla",
        category: "material",
        netKc: 75520,
        section: "Koupelny",
      },
      {
        description: "Sanita a armatury 9 sad",
        category: "material",
        netKc: 79200,
        section: "Koupelny",
      },
    ],
    state: "paid",
    paidDate: d(-86),
  });
  await addReceived(w, j, {
    number: "TR-26-014",
    supplier: "truhlar",
    issueDate: d(-40),
    dueDate: d(-26),
    lines: [
      {
        description: "Recepční pult na zakázku",
        category: "subcontract",
        netKc: 46000,
        section: "Recepce a společné prostory",
      },
    ],
    state: "paid",
    paidDate: d(-28),
  });
  await addReceived(w, j, {
    number: "FV260677",
    supplier: "sadrokarton",
    issueDate: d(-30),
    dueDate: d(-9),
    lines: [
      {
        description: "Podhledy a SDK pro recepci",
        category: "material",
        netKc: 31200,
        section: "Recepce a společné prostory",
      },
    ],
    state: "approved",
  });
  await addStatement(w, j, {
    from: d(-104),
    to: d(-60),
    done: {
      "Pokládka podlah": 210,
      "Pokládka obkladů": 128,
      "Nové podlahy, plovoucí vinyl": 210,
      "Obklady a dlažby": 128,
    },
    note: "Podlahy a koupelny",
    state: "paid",
    issueDate: d(-55),
    dueDate: d(-41),
    paidDate: d(-44),
  });
  await moveTo(w, j, "handover");
  // protokol je rozpracovaný: zákazník ho ještě nepodepsal
  const c = w.cast.office.ctx;
  const list = await w.kit.run<{ id: string }[]>(c, "realizace.handover.list", { jobId: j.id });
  await w.kit.run(c, "realizace.handover.save", {
    jobId: j.id,
    ...(list[0] ? { id: list[0].id } : {}),
    date: d(-3),
    acceptedBy: "Alena Lipová",
    note: "Předání proběhlo, zákazník podepíše po odstranění vad.",
    items: [
      { text: "Podlahy ve všech pokojích", ok: true },
      { text: "Koupelny, funkčnost sanity", ok: true },
      { text: "Silikonové spáry v koupelnách 3 a 7", ok: false, note: "Dodělat" },
      { text: "Recepční pult – seřízení zásuvek", ok: false },
    ],
  });
  await addDefect(w, j, {
    title: "Netěsné spáry v koupelně pokoje 3",
    description: "Silikonová spára u vany protéká, přespárovat.",
    severity: "normal",
    responsible: "worker1",
    foundAt: d(-6),
    dueDate: d(-1),
    state: "V řešení",
  });
  await addDefect(w, j, {
    title: "Odlupující se lak na zárubni pokoje 6",
    description: "Lak se odlupuje v dolní části, přebrousit a přelakovat.",
    severity: "minor",
    responsible: "foreman2",
    foundAt: d(-5),
    dueDate: d(6),
    state: "Nahlášená",
  });
  await addDefect(w, j, {
    title: "Vadná zásuvka v recepčním pultu",
    description: "Zásuvka nedrží, vyměnit mechanismus.",
    severity: "major",
    responsible: "foreman2",
    foundAt: d(-4),
    dueDate: d(4),
    state: "Nahlášená",
  });
  w.dateFixes.push({
    jobId: j.id,
    createdAt: d(-140),
    wonAt: d(-128),
    handoverAt: d(-3),
    phaseChangedAt: d(-3),
  });
}
