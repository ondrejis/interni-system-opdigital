import { addComment, createTask } from "@rebar/core/collab";
import { resolveEntity } from "@rebar/core/entities";
import { createView } from "@rebar/core/views";
import { d, today, wd } from "./dates";
import { sql } from "./kit";
import { book, settleTimesheets } from "./timesheets";
import { weekStartIso, addDaysIso, isWorkday, holidayName } from "@rebar/core/time";
import type { DemoUserKey } from "./users";
import type { World } from "./world";
import { money } from "./world";

/* ---------- sklad ---------- */

type StockSpec = [
  code: string,
  name: string,
  category: string,
  unit: string,
  min: number,
  supplier: string,
  priceKc: number,
  vat?: number,
];

const STOCK: StockSpec[] = [
  ["CEM-25", "Cement CEM II/B-M 32,5 R, 25 kg", "suche-smesi", "pytel", 40, "stavebniny", 142],
  ["LEP-C2T", "Lepidlo flexibilní C2T, 25 kg", "obklady", "pytel", 30, "stavebniny", 289],
  [
    "EPS-160",
    "Polystyren fasádní EPS 70F, tl. 160 mm",
    "izolace",
    "m²",
    100,
    "stavebniny",
    235,
    12,
  ],
  [
    "SIT-160",
    "Sklotextilní síťovina 160 g/m², role 50 m²",
    "izolace",
    "role",
    10,
    "stavebniny",
    1190,
    12,
  ],
  ["HMO-200", "Hmoždinky šroubovací 200 mm, 100 ks", "spojovaci", "bal", 6, "stavebniny", 1450],
  [
    "SDK-125",
    "Sádrokartonová deska 12,5 mm, 1250 × 2000",
    "sadrokarton",
    "ks",
    40,
    "sadrokarton",
    168,
  ],
  ["PRO-CD60", "Profil CD 60 / 3000", "sadrokarton", "ks", 60, "sadrokarton", 82],
  ["TMEL-25", "Sádrový tmel, 25 kg", "sadrokarton", "pytel", 15, "sadrokarton", 356],
  ["OBK-2025", "Obklad keramický 20 × 25 cm", "obklady", "m²", 50, "stavebniny", 410],
  ["SIL-BIL", "Silikon sanitární bílý, 310 ml", "chemie", "ks", 24, "stavebniny", 129],
  ["PEN-10", "Penetrace hloubková, 10 l", "barvy", "ks", 10, "barvy", 780],
  ["MAL-15", "Malba interiérová bílá, 15 l", "barvy", "ks", 12, "barvy", 920],
  ["KAB-CYKY", "Kabel CYKY-J 3 × 2,5 mm²", "elektro", "m", 300, "elektro", 38],
  ["ZAS-2x", "Zásuvka dvojitá s rámečkem", "elektro", "ks", 30, "elektro", 112],
  ["TR-HT110", "Trubka HT 110 mm, 1 m", "instalace", "ks", 20, "instalater", 94],
  ["SRB-6x80", "Šrouby do betonu 6 × 80, 100 ks", "spojovaci", "bal", 10, "stavebniny", 399],
  ["KVH-80160", "Hranol KVH 80 × 160 mm", "rezivo", "m", 100, "strechy", 285],
  ["RUK-PRAC", "Pracovní rukavice, pár", "bozp", "ks", 40, "stavebniny", 49],
  ["FOL-PE", "Fólie PE 4 × 50 m", "spotrebni", "role", 5, "stavebniny", 690],
];

export async function seedStock(w: World, assets: Record<string, string>) {
  const { kit, cast, contacts } = w;
  const office = cast.office.ctx;
  const wh: Record<string, string> = {};
  const mkWh = async (key: string, v: Record<string, unknown>) => {
    wh[key] = (await kit.create(office, "warehouse", { responsible: cast.foreman1.id, ...v })).id;
  };
  await mkWh("main", {
    name: "Hlavní sklad Plzeň",
    kind: "warehouse",
    responsible: cast.office.id,
  });
  await mkWh("workshop", {
    name: "Dílna Rokycany",
    kind: "workshop",
    responsible: cast.foreman2.id,
  });
  await mkWh("van", {
    name: "Renault Master (pojízdný sklad)",
    kind: "vehicle",
    asset: assets.master,
  });
  await mkWh("site", {
    name: "Stavba Nad Parkem 14",
    kind: "site",
    job: w.jobs.zatepleni!.id,
    responsible: cast.foreman2.id,
  });

  const item: Record<string, string> = {};
  for (const [code, name, category, unit, min, supplier, price, vat] of STOCK) {
    item[code] = (
      await kit.create(office, "stock_item", {
        code,
        name,
        category,
        unit,
        minQty: min,
        supplier: contacts.company[supplier],
        lastPrice: money(price),
        vatRate: vat ?? 21,
      })
    ).id;
  }
  const post = (ctx: typeof office, o: Record<string, unknown>) =>
    kit.run<{ id: string }>(ctx, "sklad.post", o);
  const L = (code: string, qty: number | string, price?: number) => ({
    itemId: item[code]!,
    qty: String(qty),
    ...(price ? { unitPriceMinor: money(price) } : {}),
  });

  // příjemky od dodavatelů
  await post(office, {
    type: "receipt",
    date: d(-62),
    warehouseId: wh.main,
    supplierId: contacts.company.stavebniny,
    supplierDocNo: "DL-26-4117",
    lines: [
      L("CEM-25", 240, 142),
      L("LEP-C2T", 120, 289),
      L("EPS-160", 900, 235),
      L("SIT-160", 30, 1190),
      L("HMO-200", 40, 1450),
      L("OBK-2025", 260, 410),
      L("SIL-BIL", 60, 129),
      L("SRB-6x80", 40, 399),
      L("RUK-PRAC", 120, 49),
      L("FOL-PE", 24, 690),
    ],
  });
  await post(office, {
    type: "receipt",
    date: d(-44),
    warehouseId: wh.main,
    supplierId: contacts.company.sadrokarton,
    supplierDocNo: "SP-2026-0912",
    lines: [L("SDK-125", 220, 168), L("PRO-CD60", 300, 82), L("TMEL-25", 40, 356)],
  });
  await post(office, {
    type: "receipt",
    date: d(-31),
    warehouseId: wh.main,
    supplierId: contacts.company.barvy,
    supplierDocNo: "BD-26-0731",
    lines: [L("PEN-10", 48, 780), L("MAL-15", 56, 920)],
  });
  await post(office, {
    type: "receipt",
    date: d(-27),
    warehouseId: wh.main,
    supplierId: contacts.company.elektro,
    supplierDocNo: "EH-260611",
    lines: [L("KAB-CYKY", 1500, 38), L("ZAS-2x", 140, 112)],
  });
  await post(office, {
    type: "receipt",
    date: d(-20),
    warehouseId: wh.workshop,
    supplierId: contacts.company.instalater,
    supplierDocNo: "IK-2026-233",
    lines: [L("TR-HT110", 90, 94)],
  });
  await post(office, {
    type: "receipt",
    date: d(-15),
    warehouseId: wh.main,
    supplierId: contacts.company.strechy,
    supplierDocNo: "SH-26-0142",
    lines: [L("KVH-80160", 420, 285)],
  });

  // výdeje na zakázky (kdo vydává, ten odpovídá; mistři mají právo vydávat)
  const foreman2 = cast.foreman2.ctx;
  const foreman1 = cast.foreman1.ctx;
  const j = w.jobs;
  await post(foreman2, {
    type: "issue",
    date: wd(-29),
    warehouseId: wh.main,
    jobId: j.zatepleni!.id,
    lines: [L("EPS-160", 620), L("LEP-C2T", 56), L("SIT-160", 18), L("HMO-200", 21)],
  });
  await post(foreman1, {
    type: "issue",
    date: wd(-17),
    warehouseId: wh.main,
    jobId: j.pekarna!.id,
    lines: [L("OBK-2025", 190), L("LEP-C2T", 34), L("SIL-BIL", 52), L("PEN-10", 14)],
  });
  await post(foreman2, {
    type: "issue",
    date: wd(-12),
    warehouseId: wh.main,
    jobId: j.strecha!.id,
    lines: [L("KVH-80160", 110), L("SRB-6x80", 18), L("FOL-PE", 6)],
  });
  await post(foreman1, {
    type: "issue",
    date: wd(-9),
    warehouseId: wh.main,
    jobId: j.hala!.id,
    lines: [L("SRB-6x80", 16), L("RUK-PRAC", 60), L("FOL-PE", 14)],
  });
  await post(foreman2, {
    type: "issue",
    date: wd(-6),
    warehouseId: wh.main,
    jobId: j.zatepleni!.id,
    lines: [L("EPS-160", 210), L("LEP-C2T", 24), L("SIL-BIL", 3)],
  });
  await post(foreman1, {
    type: "issue",
    date: wd(-4),
    warehouseId: wh.main,
    jobId: j.pekarna!.id,
    lines: [L("KAB-CYKY", 620), L("ZAS-2x", 48)],
  });
  // převod do pojízdného skladu a vratka nevyužitého materiálu ze stavby
  await post(cast.office.ctx, {
    type: "transfer",
    date: wd(-5),
    warehouseId: wh.main,
    targetWarehouseId: wh.van,
    lines: [L("SIL-BIL", 3), L("RUK-PRAC", 20)],
  });
  await post(foreman2, {
    type: "return",
    date: wd(-3),
    warehouseId: wh.main,
    jobId: j.zatepleni!.id,
    note: "Nevyužité hmoždinky vráceny na sklad",
    lines: [L("HMO-200", 2)],
  });

  // objednávka dodavateli na položky pod minimem, jedna ještě koncept
  await kit.run(office, "sklad.order.create", {
    supplierId: contacts.company.stavebniny,
    warehouseId: wh.main,
    expectedDate: d(3),
    send: true,
    note: "Doplnit zásobu: silikony a lepidla",
    lines: [L("SIL-BIL", 120, 129), L("LEP-C2T", 60, 289), L("EPS-160", 400, 235)],
  });
  await kit.run(office, "sklad.order.create", {
    supplierId: contacts.company.barvy,
    warehouseId: wh.main,
    send: false,
    lines: [L("MAL-15", 24, 920), L("PEN-10", 20, 780)],
  });
  // rozpracovaná inventura dílny
  await kit.run(cast.office.ctx, "sklad.count.start", { warehouseId: wh.workshop });
}

/* ---------- vozový park ---------- */

type AssetSpec = {
  key: string;
  values: Record<string, unknown>;
};

export async function seedFleet(w: World): Promise<Record<string, string>> {
  const { kit, cast } = w;
  const office = cast.office.ctx;
  const specs: AssetSpec[] = [
    {
      key: "master",
      values: {
        name: "Renault Master",
        kind: "van",
        plate: "4P1 2345",
        responsible: cast.foreman1.id,
        meter: "km",
        meterValue: 148200,
        stkDate: d(18),
        insuranceDate: d(160),
        vignetteDate: d(230),
        fuel: "diesel",
        tankLiters: 80,
        brand: "Renault",
        model: "Master dCi 135",
        year: 2019,
        vin: "VF1MA000000000001",
        internalRate: money(9),
        purchaseDate: "2019-05-14",
        purchasePrice: money(640000),
      },
    },
    {
      key: "transit",
      values: {
        name: "Ford Transit Custom",
        kind: "van",
        plate: "5P3 8812",
        responsible: cast.foreman2.id,
        meter: "km",
        meterValue: 96400,
        stkDate: d(210),
        insuranceDate: d(140),
        vignetteDate: d(220),
        fuel: "diesel",
        tankLiters: 70,
        brand: "Ford",
        model: "Transit Custom 2.0 TDCi",
        year: 2021,
        vin: "WF0XXXTTGXKA00002",
        internalRate: money(8.5),
        purchaseDate: "2021-03-02",
        purchasePrice: money(720000),
      },
    },
    {
      key: "octavia",
      values: {
        name: "Škoda Octavia Combi (kancelář)",
        kind: "car",
        plate: "3P7 4410",
        responsible: cast.office.id,
        meter: "km",
        meterValue: 62100,
        stkDate: d(95),
        insuranceDate: d(120),
        vignetteDate: d(200),
        fuel: "diesel",
        tankLiters: 50,
        brand: "Škoda",
        model: "Octavia Combi 2.0 TDI",
        year: 2022,
        vin: "TMBJJ7NE0N0000003",
        internalRate: money(7),
        purchaseDate: "2022-06-20",
        purchasePrice: money(690000),
      },
    },
    {
      key: "sklapec",
      values: {
        name: "Sklápěč MAN TGS 26.360",
        kind: "truck",
        plate: "2P9 1170",
        responsible: cast.foreman1.id,
        meter: "km",
        meterValue: 211800,
        stkDate: d(140),
        insuranceDate: d(100),
        vignetteDate: d(180),
        fuel: "diesel",
        tankLiters: 400,
        brand: "MAN",
        model: "TGS 26.360 6×4",
        year: 2017,
        vin: "WMAN00000000000004",
        internalRate: money(24),
        purchaseDate: "2017-09-01",
        purchasePrice: money(2150000),
      },
    },
    {
      key: "kubota",
      values: {
        name: "Minibagr Kubota KX057-4",
        kind: "excavator",
        responsible: cast.foreman1.id,
        meter: "mth",
        meterValue: 3420,
        fuel: "diesel",
        tankLiters: 90,
        brand: "Kubota",
        model: "KX057-4",
        year: 2018,
        vin: "KBTKX0570000005",
        internalRate: money(480),
        purchaseDate: "2018-04-10",
        purchasePrice: money(1280000),
      },
    },
    {
      key: "bomag",
      values: {
        name: "Vibrační válec Bomag BW 120",
        kind: "roller",
        responsible: cast.foreman2.id,
        meter: "mth",
        meterValue: 1180,
        fuel: "diesel",
        tankLiters: 30,
        brand: "Bomag",
        model: "BW 120 AD-5",
        year: 2016,
        internalRate: money(310),
        purchaseDate: "2016-08-22",
        purchasePrice: money(540000),
      },
    },
  ];
  const ids: Record<string, string> = {};
  for (const s of specs) ids[s.key] = (await kit.create(office, "asset", s.values)).id;

  // kniha jízd a tankování za poslední tři týdny
  type Trip = [
    number,
    "foreman1" | "foreman2" | "worker1" | "worker2" | "office",
    string,
    number,
    string,
    string,
  ];
  const trips: Record<string, Trip[]> = {
    master: [
      [
        -19,
        "foreman1",
        "hala",
        74,
        "Plzeň – Průmyslová – Plzeň",
        "Převoz materiálu a nářadí na halu",
      ],
      [-17, "worker1", "pekarna", 96, "Plzeň – Rokycany – Plzeň", "Dovoz obkladů na pekárnu"],
      [
        -14,
        "foreman1",
        "pekarna",
        88,
        "Plzeň – Rokycany – Plzeň",
        "Kontrola stavby, převzetí odsávání",
      ],
      [-10, "worker1", "hala", 62, "Plzeň – Průmyslová – Plzeň", "Převoz bednění"],
      [-6, "foreman1", "pekarna", 90, "Plzeň – Rokycany – Plzeň", "Dovoz kabelů a zásuvek"],
      [-3, "worker2", "hala", 58, "Plzeň – Průmyslová – Plzeň", "Spojovací materiál na halu"],
    ],
    transit: [
      [
        -18,
        "foreman2",
        "zatepleni",
        38,
        "Plzeň – Nad Parkem – Plzeň",
        "Lešení, převoz polystyrenu",
      ],
      [-13, "worker1", "strecha", 84, "Plzeň – Stod – Plzeň", "Převoz řeziva na střechu"],
      [
        -9,
        "foreman2",
        "zatepleni",
        41,
        "Plzeň – Nad Parkem – Plzeň",
        "Kontrola fasády, odvoz odpadu",
      ],
      [-5, "worker1", "strecha", 80, "Plzeň – Stod – Plzeň", "Dovoz tašek"],
      [
        -2,
        "foreman2",
        "zatepleni",
        39,
        "Plzeň – Nad Parkem – Plzeň",
        "Stěrka a síťovina, převoz materiálu",
      ],
    ],
    octavia: [
      [-16, "office", "pristavba", 52, "Plzeň – Průmyslová – Plzeň", "Obhlídka u Logistik Park"],
      [
        -11,
        "office",
        "ordinace",
        22,
        "Plzeň – Americká – Plzeň",
        "Zaměření ordinace s MUDr. Královou",
      ],
      [-4, "office", "novostavba", 68, "Plzeň – Dobřany – Plzeň", "Schůzka s investorem Havlíkem"],
    ],
    sklapec: [
      [-15, "foreman1", "hala", 46, "Plzeň – Průmyslová – Plzeň", "Odvoz zeminy na skládku"],
      [-8, "foreman1", "hala", 52, "Plzeň – Průmyslová – Plzeň", "Odvoz zeminy a dovoz štěrku"],
    ],
  };
  const meter: Record<string, number> = {
    master: 148200,
    transit: 96400,
    octavia: 62100,
    sklapec: 211800,
  };
  const track: Record<string, [number, number][]> = {};
  const meterAt = (key: string, off: number) =>
    (track[key] ?? []).filter(([o]) => o <= off).at(-1)?.[1] ??
    { master: 148200, transit: 96400, octavia: 62100, sklapec: 211800 }[key]!;
  for (const [key, list] of Object.entries(trips))
    for (const [off, who, jobKey, km, route, purpose] of list) {
      const start = meter[key]!;
      meter[key] = start + km;
      (track[key] ??= []).push([off, meter[key]!]);
      await kit.run(cast[who].ctx, "stroje.log.save", {
        assetId: ids[key],
        date: wd(off),
        meterStart: start,
        meterEnd: start + km,
        route,
        purpose,
        jobId: w.jobs[jobKey]?.id ?? null,
      });
    }
  // soukromá jízda (cizí vidí jen „soukromá“)
  await kit.run(cast.foreman2.ctx, "stroje.log.save", {
    assetId: ids.transit,
    date: wd(-7),
    meterStart: meter.transit,
    meterEnd: meter.transit! + 24,
    private: true,
    route: "Plzeň – Dobřany",
    purpose: "Soukromá jízda",
  });
  meter.transit! += 24;
  // provoz strojů v motohodinách
  await kit.run(cast.worker1.ctx, "stroje.log.save", {
    assetId: ids.kubota,
    date: wd(-19),
    meterStart: 3420,
    meterEnd: 3428,
    purpose: "Výkop pro retenční nádrž",
    jobId: w.jobs.hala!.id,
  });
  await kit.run(cast.worker1.ctx, "stroje.log.save", {
    assetId: ids.kubota,
    date: wd(-18),
    meterStart: 3428,
    meterEnd: 3435.5,
    purpose: "Zásyp a hutnění, hala B",
    jobId: w.jobs.hala!.id,
  });
  await kit.run(cast.worker2.ctx, "stroje.log.save", {
    assetId: ids.bomag,
    date: wd(-18),
    meterStart: 1180,
    meterEnd: 1186,
    purpose: "Hutnění podsypu",
    jobId: w.jobs.hala!.id,
  });

  const fuel = async (key: string, who: DemoUserKey, off: number, liters: number, kc: number) =>
    kit.run(cast[who].ctx, "stroje.fuel.save", {
      assetId: ids[key],
      date: wd(off),
      liters,
      totalMinor: money(kc),
      meterValue: meterAt(key, off),
      fullTank: true,
      station: "Shell Plzeň – Karlovarská",
      payment: "card",
    });
  await fuel("master", "foreman1", -17, 58.4, 3560);
  await fuel("master", "foreman1", -10, 62.1, 3790);
  await fuel("master", "foreman1", -3, 55.2, 3380);
  await fuel("transit", "foreman2", -13, 49.6, 3040);
  await fuel("transit", "foreman2", -5, 52.3, 3210);
  await fuel("octavia", "office", -11, 41.0, 2520);
  await kit.run(cast.worker1.ctx, "stroje.fuel.save", {
    assetId: ids.kubota,
    date: wd(-18),
    liters: 38,
    totalMinor: money(2330),
    meterValue: 3435.5,
    fullTank: true,
    station: "Čerpací stanice na stavbě",
    payment: "cash",
    jobId: w.jobs.hala!.id,
  });

  // servis a servisní intervaly
  await kit.run(office, "stroje.service.save", {
    assetId: ids.master,
    date: d(-210),
    kind: "service",
    title: "Výměna oleje a filtrů",
    vendor: "Autoservis Rychlík s.r.o.",
    costMinor: money(8450),
    meterValue: 133400,
  });
  await kit.run(office, "stroje.service.save", {
    assetId: ids.transit,
    date: d(-120),
    kind: "tires",
    title: "Přezutí na zimní pneumatiky",
    vendor: "Pneuservis Plzeň",
    costMinor: money(2800),
    meterValue: 91200,
  });
  await kit.run(office, "stroje.service.save", {
    assetId: ids.sklapec,
    date: d(-75),
    kind: "repair",
    title: "Výměna brzdových destiček náprava 2",
    vendor: "Autoservis Rychlík s.r.o.",
    costMinor: money(24800),
    meterValue: 208500,
  });
  await kit.run(office, "stroje.interval.save", {
    assetId: ids.master,
    title: "Výměna oleje a filtrů",
    everyMeter: 15000,
    everyMonths: 12,
    lastDate: d(-210),
    lastMeter: 133400,
  });
  await kit.run(office, "stroje.interval.save", {
    assetId: ids.transit,
    title: "Servisní prohlídka",
    everyMeter: 20000,
    everyMonths: 12,
    lastDate: d(-300),
    lastMeter: 78600,
  });
  await kit.run(office, "stroje.interval.save", {
    assetId: ids.kubota,
    title: "Výměna hydraulického oleje",
    everyMeter: 500,
    lastDate: d(-400),
    lastMeter: 2980,
  });
  await kit.run(office, "stroje.interval.save", {
    assetId: ids.octavia,
    title: "Servisní prohlídka",
    everyMeter: 15000,
    everyMonths: 12,
    lastDate: d(-140),
    lastMeter: 55000,
  });

  // rezervace strojů na zakázky
  await kit.run(office, "stroje.reservation.save", {
    assetId: ids.kubota,
    dateFrom: d(14),
    dateTo: d(22),
    jobId: w.jobs.novostavba!.id,
    userId: cast.worker1.id,
    note: "Výkop stavební jámy",
  });
  await kit.run(office, "stroje.reservation.save", {
    assetId: ids.sklapec,
    dateFrom: d(14),
    dateTo: d(18),
    jobId: w.jobs.novostavba!.id,
    note: "Odvoz zeminy",
  });
  await kit.run(office, "stroje.reservation.save", {
    assetId: ids.bomag,
    dateFrom: d(2),
    dateTo: d(6),
    jobId: w.jobs.hala!.id,
    userId: cast.worker2.id,
    note: "Hutnění štěrkového lože komunikací",
  });
  await kit.run(office, "stroje.reservation.save", {
    assetId: ids.transit,
    dateFrom: d(10),
    dateTo: d(12),
    jobId: w.jobs.ordinace!.id,
    userId: cast.foreman2.id,
    note: "Převoz materiálu na ordinaci",
  });

  // závada z terénu
  await kit.run(cast.worker1.ctx, "stroje.defect.report", {
    assetId: ids.kubota,
    title: "Slabě zvedá rameno, pravděpodobně prosakuje hydraulika",
    description: "Při plném výložníku klesá rameno asi o 2 cm za minutu.",
    severity: "normal",
  });
  return ids;
}

/* ---------- kalendář ---------- */

export async function seedCalendar(w: World) {
  const { kit, cast } = w;
  const res: Record<string, string> = {};
  for (const [key, name, kind, note] of [
    ["room", "Zasedací místnost", "room", "Kancelář, 1. patro, 10 míst"],
    ["plosina", "Montážní plošina 12 m", "equipment", "Nůžková plošina, sdílená mezi stavbami"],
    ["projektor", "Projektor a plátno", "equipment", ""],
  ] as const)
    res[key] = (
      await kit.create(cast.owner.ctx, "calendar_resource", {
        name,
        kind,
        ...(note ? { note } : {}),
      })
    ).id;

  const J = w.jobs;
  type Ev = {
    title: string;
    type: "meeting" | "survey" | "handover" | "other";
    date: string;
    start?: string;
    end?: string;
    endDate?: string;
    allDay?: boolean;
    resource?: string;
    job?: string;
    who?: DemoUserKey;
    attendees?: DemoUserKey[];
    location?: string;
    note?: string;
    recurrence?: "weekly";
    until?: string;
    reminder?: 15 | 60 | 1440;
  };
  const events: Ev[] = [
    {
      title: "Týdenní porada vedení",
      type: "meeting",
      date: addDaysIso(weekStartIso(today()), 0),
      start: "08:00",
      end: "09:00",
      resource: "room",
      who: "owner",
      attendees: ["office", "foreman1", "foreman2"],
      recurrence: "weekly",
      until: d(90),
      reminder: 60,
      location: "Zasedací místnost",
    },
    {
      title: "Kontrolní den – hala B",
      type: "meeting",
      date: d(1),
      start: "09:00",
      end: "10:30",
      job: "hala",
      who: "foreman1",
      attendees: ["owner", "office"],
      location: "Průmyslová 2200, Plzeň",
      note: "Investor řeší posun dodávky OK a sedmá vrata.",
      reminder: 1440,
    },
    {
      title: "Obhlídka střechy – Zemědělské družstvo Kozolupy",
      type: "survey",
      date: d(1),
      start: "13:00",
      end: "14:00",
      who: "office",
      attendees: ["foreman2"],
      location: "Kozolupy",
      reminder: 60,
    },
    {
      title: "Zaměření ordinace",
      type: "survey",
      date: d(4),
      start: "10:00",
      end: "11:30",
      job: "ordinace",
      who: "foreman2",
      attendees: ["office"],
      location: "Americká 41, Plzeň",
    },
    {
      title: "Schůzka k nabídce – přístavba kanceláří",
      type: "meeting",
      date: d(2),
      start: "14:00",
      end: "15:00",
      job: "pristavba",
      who: "owner",
      attendees: ["office"],
      location: "Logistik Park Plzeň",
      reminder: 60,
    },
    {
      title: "Předání pekárny – přípravná prohlídka",
      type: "other",
      date: d(22),
      start: "08:30",
      end: "09:30",
      job: "pekarna",
      who: "foreman1",
      attendees: ["owner"],
    },
    {
      title: "Předání penzionu zákazníkovi",
      type: "handover",
      date: d(5),
      start: "10:00",
      end: "11:00",
      job: "penzion",
      who: "foreman2",
      attendees: ["office", "owner"],
      location: "Lipová 5, Sušice",
      reminder: 1440,
    },
    {
      title: "Dodávka sendvičových panelů na halu",
      type: "other",
      date: d(12),
      allDay: true,
      job: "hala",
      who: "foreman1",
      note: "Příjezd 4 kamionů, zajistit jeřáb.",
    },
    {
      title: "Montáž střešních oken – výměna střechy Stod",
      type: "other",
      date: d(4),
      start: "08:00",
      end: "15:00",
      job: "strecha",
      who: "foreman2",
      resource: "plosina",
    },
    {
      title: "Školení BOZP pro všechny zaměstnance",
      type: "meeting",
      date: d(8),
      start: "13:00",
      end: "15:00",
      resource: "room",
      who: "owner",
      attendees: ["office", "foreman1", "foreman2", "worker1", "worker2"],
      reminder: 1440,
    },
    {
      title: "Dovolená – Martin Holub",
      type: "other",
      date: d(15),
      endDate: d(19),
      allDay: true,
      who: "office",
      attendees: ["worker2"],
    },
    {
      title: "Výrobní porada s dodavateli okenních výplní",
      type: "meeting",
      date: d(-3),
      start: "11:00",
      end: "12:00",
      job: "novostavba",
      who: "office",
      attendees: ["foreman1"],
    },
  ];
  for (const e of events) {
    await kit.run(cast[e.who ?? "office"].ctx, "kalendar.event.save", {
      title: e.title,
      type: e.type,
      allDay: e.allDay ?? false,
      startDate: e.date,
      startTime: e.allDay ? null : (e.start ?? "09:00"),
      endDate: e.endDate ?? e.date,
      endTime: e.allDay ? null : (e.end ?? "10:00"),
      ...(e.location ? { location: e.location } : {}),
      ...(e.note ? { note: e.note } : {}),
      ...(e.resource ? { resourceId: res[e.resource] } : {}),
      ...(e.job ? { jobId: J[e.job]!.id } : {}),
      attendeeIds: (e.attendees ?? []).map((k) => cast[k].id),
      ...(e.recurrence ? { recurrence: e.recurrence, recurrenceUntil: e.until } : {}),
      ...(e.reminder ? { reminderMinutes: e.reminder } : {}),
    });
  }
}

/* ---------- úkoly, komentáře, upozornění, pohledy ---------- */

export async function seedCollab(w: World) {
  const { kit, cast } = w;
  const J = w.jobs;
  const task = async (
    by: DemoUserKey,
    t: {
      title: string;
      description?: string;
      assignee: DemoUserKey;
      due?: string;
      priority?: "low" | "normal" | "high";
      job?: string;
    },
  ) =>
    createTask(cast[by].ctx, {
      title: t.title,
      ...(t.description ? { description: t.description } : {}),
      assigneeId: cast[t.assignee].id,
      ...(t.due ? { dueDate: t.due } : {}),
      priority: t.priority ?? "normal",
      ...(t.job ? { entityType: "job", entityId: J[t.job]!.id } : {}),
    });
  await task("owner", {
    title: "Schválit změnu: sedmá vrata do expedice",
    assignee: "owner",
    due: d(1),
    priority: "high",
    job: "hala",
  });
  await task("office", {
    title: "Ozvat se zákazníkovi k nabídce přístavby kanceláří",
    description: "Nabídka je odeslaná tři týdny bez odpovědi.",
    assignee: "office",
    due: d(0),
    priority: "high",
    job: "pristavba",
  });
  await task("office", {
    title: "Dokončit cenovou nabídku pro SBD Západ",
    assignee: "office",
    due: d(3),
    job: "sbd",
  });
  await task("office", {
    title: "Doplnit adresu a rozpočet: půdní vestavba Nad Parkem",
    assignee: "office",
    due: d(5),
    job: "vestavba",
  });
  await task("owner", {
    title: "Objednat sekční vrata – čeká na schválení objednávky",
    assignee: "foreman1",
    due: d(2),
    job: "hala",
  });
  await task("foreman1", {
    title: "Objednat geodeta na zaměření skutečného stavu haly",
    assignee: "foreman1",
    due: d(6),
    priority: "low",
    job: "hala",
  });
  await task("office", {
    title: "Spárovat nespárované náklady pekárny na rozpočet",
    assignee: "office",
    due: d(2),
    job: "pekarna",
  });
  await task("foreman2", {
    title: "Odstranit vady z předání penzionu",
    assignee: "foreman2",
    due: d(4),
    priority: "high",
    job: "penzion",
  });
  await task("office", {
    title: "Uvolnit zádržné hřiště Bukovany před koncem záruky",
    assignee: "office",
    due: d(9),
    job: "hriste",
  });
  await task("owner", { title: "Prodloužit STK Renault Master", assignee: "foreman1", due: d(10) });
  // úkoly řemeslníků na dnešek: ukázka mobilního terminálu (Moje úkoly, odškrtnutí jedním ťuknutím)
  await task("foreman1", {
    title: "Zkontrolovat kotvení patních desek v ose C",
    assignee: "worker1",
    due: d(0),
    priority: "high",
    job: "hala",
  });
  await task("foreman1", {
    title: "Přivézt a vyložit bednění stropu",
    assignee: "worker1",
    due: d(0),
    job: "hala",
  });
  await task("foreman2", {
    title: "Zabezpečit lešení po včerejší bouřce",
    assignee: "worker1",
    due: d(-1),
    priority: "high",
    job: "strecha",
  });
  await task("foreman1", {
    title: "Vyfotit hotovou omítku v dílně pekárny",
    assignee: "worker2",
    due: d(0),
    job: "pekarna",
  });
  await task("foreman2", {
    title: "Doplnit hmoždinky a lepidlo do vozidla",
    assignee: "worker2",
    due: d(1),
    priority: "low",
    job: "zatepleni",
  });
  // další uživatelé s rolí majitele (např. správce, který instalaci zakládal) dostanou úkoly také, ať Přehled nevypadá prázdně
  const others = (await kit.s.db.execute(
    sql`select u.id from "user" u join role r on r.id = u.role_id
        where r.key = 'owner' and u.active and u.deleted_at is null and u.id <> ${cast.owner.id}
        order by u.created_at limit 3`,
  )) as unknown as { id: string }[];
  for (const o of others) {
    for (const t of [
      {
        title: "Rozhodnout o změně: sedmá vrata do expedice",
        job: "hala",
        due: d(1),
        priority: "high" as const,
      },
      {
        title: "Zkontrolovat faktury po splatnosti (hala B)",
        job: "hala",
        due: d(0),
        priority: "normal" as const,
      },
      {
        title: "Připravit odpověď k nabídce přístavby kanceláří",
        job: "pristavba",
        due: d(3),
        priority: "normal" as const,
      },
    ])
      await createTask(cast.owner.ctx, {
        title: t.title,
        assigneeId: o.id,
        dueDate: t.due,
        priority: t.priority,
        entityType: "job",
        entityId: J[t.job]!.id,
      });
  }

  const comment = (by: DemoUserKey, job: string, body: string) =>
    addComment(cast[by].ctx, { entityType: "job", entityId: J[job]!.id, body });
  await comment(
    "foreman1",
    "hala",
    `Statik potvrdil kotvení patních desek, odchylka 6 mm je v toleranci. @[${cast.owner.name}](${cast.owner.id}) prosím o schválení dodatku pro zesílení desky.`,
  );
  await comment(
    "owner",
    "hala",
    "Dodatek schvaluji, investor s tím souhlasí. Dejte pozor na termín dodávky panelů.",
  );
  await comment(
    "office",
    "hala",
    "Soupis č. 3 čeká na schválení, faktura č. 2 je po splatnosti, volala jsem na účtárnu investora.",
  );
  await comment(
    "foreman2",
    "zatepleni",
    "Zítra hlásí déšť, zateplování východní strany posuneme na čtvrtek.",
  );
  await comment(
    "office",
    "pekarna",
    "Zákazník chce odsávání i nad chladicím boxem – změna je ve schvalování.",
  );
  await comment(
    "foreman1",
    "pekarna",
    "Epoxid vytvrzuje, do pátku se na podlahu nesmí. Obklady dokončíme v úterý.",
  );
  await comment(
    "owner",
    "pristavba",
    "Zkus zavolat jejich technickému dozoru, pan Procházka má o přístavbu zájem, jen čeká na rozpočet.",
  );
  await comment(
    "foreman2",
    "penzion",
    "Zbývají tři drobné vady, zákazník podepíše protokol, až je odstraníme.",
  );

  // saved views
  const mkView = async (
    entity: string,
    by: DemoUserKey,
    name: string,
    shared: boolean,
    config: Parameters<typeof createView>[3]["config"],
  ) => {
    // opakované nasazení (--reset) nesmí pohledy zdvojit
    await kit.exec(
      sql`delete from saved_view where entity_type = ${entity} and name = ${name} and owner_id = ${cast[by].id}`,
    );
    const def = kit.s.registry.get(entity)!;
    const resolved = await resolveEntity(cast[by].ctx.db, def);
    await createView(cast[by].ctx, def, new Set(resolved.attributes.map((a) => a.key)), {
      name,
      shared,
      config,
    });
  };
  await mkView("job", "owner", "Zakázky s problémem", true, {
    viewType: "table",
    filters: {
      op: "and",
      conditions: [{ attr: "sumHealth", op: "is_any_of", value: ["danger", "warning"] }],
    },
    sort: [{ attr: "number", dir: "desc" }],
    columns: [
      "number",
      "title",
      "company",
      "phase",
      "sumContract",
      "sumMarginPct",
      "sumDrawdownPct",
      "endDate",
      "sumHealth",
    ],
  });
  await mkView("company", "office", "Dodavatelé", true, {
    viewType: "table",
    filters: {
      op: "and",
      conditions: [{ attr: "roles", op: "contains_any", value: ["supplier", "subcontractor"] }],
    },
    sort: [{ attr: "name", dir: "asc" }],
    columns: ["name", "roles", "city", "email", "phone"],
  });
  await mkView("invoice", "office", "Faktury po splatnosti", true, {
    viewType: "table",
    filters: { op: "and", conditions: [{ attr: "overdue", op: "is", value: true }] },
    columns: ["number", "title", "kind", "company", "job", "dueDate", "gross", "paid"],
  });
  await mkView("stock_item", "office", "Pod minimem", true, {
    viewType: "table",
    filters: { op: "and", conditions: [{ attr: "belowMin", op: "is", value: true }] },
    columns: ["code", "name", "category", "totalQty", "minQty", "supplier"],
  });
  await mkView("inquiry", "office", "Poptávky podle stavu", true, {
    viewType: "kanban",
    filters: { op: "and", conditions: [] },
    group: "stage",
    cardAttributes: ["company", "value", "nextStepAt"],
  });
}

/* ---------- docházka a zakázkové nákladové zbytky ---------- */

/** Doplní docházku za poslední tři týdny na hlavní zakázky, zapíše kancelář, dovolenou a nemoc, týdny odešle a schválí. */
export async function seedTimesheets(w: World) {
  const t = today();
  const firstWeek = addDaysIso(weekStartIso(t), -21);
  const main: Record<DemoUserKey, string | null> = {
    owner: null,
    office: null,
    accountant: null,
    foreman1: "hala",
    foreman2: "zatepleni",
    worker1: "hala",
    worker2: "pekarna",
  };
  const hasEntry = async (userId: string, date: string) => {
    const rows = (await w.kit.s.db.execute(
      sql`select 1 from time_entry where user_id = ${userId} and date = ${date} and deleted_at is null limit 1`,
    )) as unknown as unknown[];
    return rows.length > 0;
  };
  for (let day = firstWeek; day < t; day = addDaysIso(day, 1)) {
    if (!isWorkday(day) || holidayName(day)) continue;
    const week = Math.floor(
      (new Date(`${day}T12:00:00Z`).getTime() - new Date(`${firstWeek}T12:00:00Z`).getTime()) /
        (7 * 86_400_000),
    );
    // účetní docházku v systému nevede
    for (const u of (Object.keys(main) as DemoUserKey[]).filter((k) => k !== "accountant")) {
      if (await hasEntry(w.cast[u].id, day)) continue;
      // dovolená a nemoc
      if (
        u === "worker2" &&
        week === 0 &&
        day >= addDaysIso(firstWeek, 3) &&
        day <= addDaysIso(firstWeek, 4)
      ) {
        await book(w, u, day, 8, { kind: "vacation" });
        continue;
      }
      if (u === "worker1" && week === 1 && day === addDaysIso(firstWeek, 8)) {
        await book(w, u, day, 8, { kind: "sick" });
        continue;
      }
      const job = main[u];
      if (!job) {
        await book(w, u, day, u === "owner" ? 6 : 8, {
          kind: "admin",
          start: 8 * 60,
          note: u === "owner" ? "Obchod, schvalování" : "Nabídky, fakturace, administrativa",
        });
        continue;
      }
      await book(w, u, day, 8, { job: w.jobs[job]! });
    }
  }
  const weeks = [0, 1, 2, 3].map((n) => addDaysIso(firstWeek, n * 7));
  // nejstarší týdny jsou schválené, předminulý týden i aktuální zůstávají ke schválení / rozpracované
  await settleTimesheets(w, weeks.slice(0, 3), { submittedWeeks: [weeks[2]!] });
  for (const u of ["foreman1", "worker1"] as const)
    try {
      await w.kit.run(w.cast[u].ctx, "dochazka.submitWeek", { weekStart: weeks[3]! });
    } catch {
      /* nic k odeslání */
    }
}

/** Souhrn operací po seedu: sklad, vozový park, kalendář, docházka, úkoly. */
export async function runOperations(w: World): Promise<void> {
  const assets = await seedFleet(w);
  await seedStock(w, assets);
  await seedCalendar(w);
  await seedCollab(w);
  await seedTimesheets(w);
  // automatické spárování nákladů na oddíly u starších zakázek, nové zůstávají k doplnění
  for (const key of ["hriste", "penzion", "fasada", "hala"])
    await w.kit.run(w.cast.office.ctx, "zakazky.costs.autoAllocate", { jobId: w.jobs[key]!.id });
  // odkaz pro investora haly
  const share = await w.kit.run<{ url: string }>(w.cast.office.ctx, "zakazky.share.create", {
    jobId: w.jobs.hala!.id,
    label: "Technický dozor investora",
    scope: { schedule: true, diary: "flagged", photos: true, documentIds: [] },
    expiresInDays: 365,
  });
  w.kit.log(`Odkaz pro investora haly (platí jen v této databázi): ${share.url}`);
}
