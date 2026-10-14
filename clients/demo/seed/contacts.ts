import { icoFrom } from "./ico";
import { type Kit } from "./kit";
import type { Ctx } from "@rebar/core/rbac";

type Role = "client" | "supplier" | "subcontractor";

type CompanyDef = {
  key: string;
  name: string;
  /** Sedmimístný základ IČO (osmá číslice se dopočítá). */
  icoBase: number | null;
  roles: Role[];
  city: string;
  street: string;
  zip: string;
  email: string;
  phone: string;
  /** Plátce DPH (DIČ = CZ + IČO). */
  vat?: boolean;
  note?: string;
};

/** Investoři (zákazníci) a dodavatelé; všechny firmy a kontakty jsou vymyšlené. */
export const COMPANIES: readonly CompanyDef[] = [
  // zákazníci
  {
    key: "svj-park",
    name: "SVJ Nad Parkem 14",
    icoBase: 7100211,
    roles: ["client"],
    city: "Plzeň",
    street: "Nad Parkem 14",
    zip: "32300",
    email: "svj.nadparkem14@demo-firma.example",
    phone: "+420 377 100 201",
  },
  {
    key: "pekarna",
    name: "Pekárna Vondráček s.r.o.",
    icoBase: 2810344,
    roles: ["client"],
    city: "Rokycany",
    street: "Pekařská 8",
    zip: "33701",
    email: "info@pekarna-vondracek.example",
    phone: "+420 371 100 202",
    vat: true,
  },
  {
    key: "ordinace",
    name: "MUDr. Hana Králová s.r.o.",
    icoBase: 482915,
    roles: ["client"],
    city: "Plzeň",
    street: "Americká 41",
    zip: "30100",
    email: "ordinace@kralova-mudr.example",
    phone: "+420 377 100 203",
    vat: true,
  },
  {
    key: "logistik",
    name: "Logistik Park Plzeň s.r.o.",
    icoBase: 2615073,
    roles: ["client"],
    city: "Plzeň",
    street: "Průmyslová 2200",
    zip: "32600",
    email: "stavby@logistikpark.example",
    phone: "+420 377 100 204",
    vat: true,
  },
  {
    key: "obec",
    name: "Obec Bukovany",
    icoBase: 25113,
    roles: ["client"],
    city: "Bukovany",
    street: "Náves 1",
    zip: "33012",
    email: "podatelna@obec-bukovany.example",
    phone: "+420 377 100 205",
  },
  {
    key: "autoservis",
    name: "Autoservis Rychlík s.r.o.",
    icoBase: 2230967,
    roles: ["client"],
    city: "Přeštice",
    street: "Dopravní 12",
    zip: "33401",
    email: "servis@rychlik-auto.example",
    phone: "+420 377 100 206",
    vat: true,
  },
  {
    key: "penzion",
    name: "Penzion U Lípy s.r.o.",
    icoBase: 2745128,
    roles: ["client"],
    city: "Sušice",
    street: "Lipová 5",
    zip: "34201",
    email: "recepce@penzion-ulipy.example",
    phone: "+420 376 100 207",
    vat: true,
  },
  {
    key: "sbd",
    name: "Stavební bytové družstvo Západ",
    icoBase: 43619,
    roles: ["client"],
    city: "Plzeň",
    street: "Koterovská 80",
    zip: "32600",
    email: "sbd@sbd-zapad.example",
    phone: "+420 377 100 208",
    vat: true,
  },
  {
    key: "havlik",
    name: "Rodina Havlíkova",
    icoBase: null,
    roles: ["client"],
    city: "Dobřany",
    street: "Zahradní 17",
    zip: "33441",
    email: "havlikovi@demo-firma.example",
    phone: "+420 604 100 209",
  },
  {
    key: "pospisil",
    name: "Rodina Pospíšilova",
    icoBase: null,
    roles: ["client"],
    city: "Stod",
    street: "Lesní 3",
    zip: "33301",
    email: "pospisilovi@demo-firma.example",
    phone: "+420 604 100 210",
  },
  {
    key: "simek",
    name: "Rodina Šimkova",
    icoBase: null,
    roles: ["client"],
    city: "Plzeň",
    street: "Úslavská 133",
    zip: "32600",
    email: "simkovi@demo-firma.example",
    phone: "+420 604 100 211",
  },
  {
    key: "reality",
    name: "Reality Zahrada s.r.o.",
    icoBase: 2954817,
    roles: ["client"],
    city: "Klatovy",
    street: "Domažlická 9",
    zip: "33901",
    email: "zahrada@reality-zahrada.example",
    phone: "+420 376 100 212",
    vat: true,
  },
  // dodavatelé
  {
    key: "stavebniny",
    name: "Stavebniny Plzeňka s.r.o.",
    icoBase: 2611035,
    roles: ["supplier"],
    city: "Plzeň",
    street: "Rokycanská 150",
    zip: "31200",
    email: "objednavky@stavebniny-plzenka.example",
    phone: "+420 377 100 301",
    vat: true,
  },
  {
    key: "beton",
    name: "Betonárna Západ a.s.",
    icoBase: 4510392,
    roles: ["supplier"],
    city: "Plzeň",
    street: "Cukrovarská 31",
    zip: "32600",
    email: "dispecink@betonarna-zapad.example",
    phone: "+420 377 100 302",
    vat: true,
  },
  {
    key: "elektro",
    name: "Elektro Hrdina s.r.o.",
    icoBase: 2682446,
    roles: ["supplier"],
    city: "Plzeň",
    street: "Karlovarská 99",
    zip: "32300",
    email: "prodejna@elektro-hrdina.example",
    phone: "+420 377 100 303",
    vat: true,
  },
  {
    key: "instalater",
    name: "Instalatérské potřeby Kovář",
    icoBase: 7302118,
    roles: ["supplier"],
    city: "Plzeň",
    street: "Zborovská 12",
    zip: "30100",
    email: "kovar@instalaterske-potreby.example",
    phone: "+420 377 100 304",
    vat: true,
  },
  {
    key: "stroje",
    name: "Půjčovna techniky Stavmach s.r.o.",
    icoBase: 2851663,
    roles: ["supplier"],
    city: "Plzeň",
    street: "Lobezská 18",
    zip: "32600",
    email: "pujcovna@stavmach.example",
    phone: "+420 377 100 305",
    vat: true,
  },
  {
    key: "strechy",
    name: "Střechy Hájek s.r.o.",
    icoBase: 2735514,
    roles: ["supplier", "subcontractor"],
    city: "Rokycany",
    street: "Strašická 7",
    zip: "33701",
    email: "hajek@strechy-hajek.example",
    phone: "+420 371 100 306",
    vat: true,
  },
  {
    key: "okna",
    name: "Okna a dveře Optimal s.r.o.",
    icoBase: 2490871,
    roles: ["supplier"],
    city: "Klatovy",
    street: "Plánická 4",
    zip: "33901",
    email: "optimal@okna-optimal.example",
    phone: "+420 376 100 307",
    vat: true,
  },
  {
    key: "sadrokarton",
    name: "Sádrokarton Profi s.r.o.",
    icoBase: 2917305,
    roles: ["supplier"],
    city: "Plzeň",
    street: "Domažlická 210",
    zip: "31200",
    email: "info@sadrokarton-profi.example",
    phone: "+420 377 100 308",
    vat: true,
  },
  {
    key: "barvy",
    name: "Barvy a laky Duha",
    icoBase: 6604127,
    roles: ["supplier"],
    city: "Plzeň",
    street: "Jiráskovo náměstí 3",
    zip: "30100",
    email: "duha@barvy-duha.example",
    phone: "+420 377 100 309",
    vat: true,
  },
  {
    key: "lesenari",
    name: "Lešení Nováček s.r.o.",
    icoBase: 2863392,
    roles: ["supplier", "subcontractor"],
    city: "Nýřany",
    street: "Průmyslová 4",
    zip: "33008",
    email: "lesenari@lesenari-novacek.example",
    phone: "+420 377 100 310",
    vat: true,
  },
  {
    key: "doprava",
    name: "Autodoprava Mareš",
    icoBase: 6120934,
    roles: ["supplier"],
    city: "Stod",
    street: "Nádražní 21",
    zip: "33301",
    email: "doprava@maresdoprava.example",
    phone: "+420 377 100 311",
  },
  {
    key: "geodezie",
    name: "Geodézie Plzeň s.r.o.",
    icoBase: 2548196,
    roles: ["subcontractor"],
    city: "Plzeň",
    street: "Sady Pětatřicátníků 8",
    zip: "30100",
    email: "mereni@geodezie-plzen.example",
    phone: "+420 377 100 312",
    vat: true,
  },
  {
    key: "truhlar",
    name: "Truhlářství Beneš",
    icoBase: 7011586,
    roles: ["subcontractor"],
    city: "Dobřany",
    street: "Nádražní 5",
    zip: "33441",
    email: "benes@truhlarstvi-benes.example",
    phone: "+420 604 100 313",
  },
];

type PersonDef = { name: string; company: string; position: string; email: string; phone: string };

export const PEOPLE: readonly PersonDef[] = [
  {
    name: "Ing. Marcela Kučerová",
    company: "svj-park",
    position: "Předsedkyně výboru",
    email: "kucerova@demo-firma.example",
    phone: "+420 604 200 401",
  },
  {
    name: "Josef Vondráček",
    company: "pekarna",
    position: "Jednatel",
    email: "josef@pekarna-vondracek.example",
    phone: "+420 604 200 402",
  },
  {
    name: "MUDr. Hana Králová",
    company: "ordinace",
    position: "Majitelka ordinace",
    email: "hana@kralova-mudr.example",
    phone: "+420 604 200 403",
  },
  {
    name: "Ing. Daniel Procházka",
    company: "logistik",
    position: "Ředitel rozvoje",
    email: "prochazka@logistikpark.example",
    phone: "+420 604 200 404",
  },
  {
    name: "Ivana Hrubá",
    company: "logistik",
    position: "Technický dozor investora",
    email: "hruba@logistikpark.example",
    phone: "+420 604 200 405",
  },
  {
    name: "Mgr. Zdeněk Bartoš",
    company: "obec",
    position: "Starosta",
    email: "starosta@obec-bukovany.example",
    phone: "+420 604 200 406",
  },
  {
    name: "Karel Rychlík",
    company: "autoservis",
    position: "Jednatel",
    email: "karel@rychlik-auto.example",
    phone: "+420 604 200 407",
  },
  {
    name: "Alena Lipová",
    company: "penzion",
    position: "Provozní",
    email: "alena@penzion-ulipy.example",
    phone: "+420 604 200 408",
  },
  {
    name: "Bc. Roman Štěpán",
    company: "sbd",
    position: "Technik družstva",
    email: "stepan@sbd-zapad.example",
    phone: "+420 604 200 409",
  },
  {
    name: "Petr Havlík",
    company: "havlik",
    position: "Investor",
    email: "petr.havlik@demo-firma.example",
    phone: "+420 604 200 410",
  },
  {
    name: "Jana Pospíšilová",
    company: "pospisil",
    position: "Investorka",
    email: "jana.pospisilova@demo-firma.example",
    phone: "+420 604 200 411",
  },
  {
    name: "Michal Šimek",
    company: "simek",
    position: "Investor",
    email: "michal.simek@demo-firma.example",
    phone: "+420 604 200 412",
  },
  {
    name: "Luboš Kovář",
    company: "instalater",
    position: "Majitel",
    email: "lubos@instalaterske-potreby.example",
    phone: "+420 604 200 413",
  },
  {
    name: "Eva Hrdinová",
    company: "elektro",
    position: "Obchodní zástupkyně",
    email: "eva@elektro-hrdina.example",
    phone: "+420 604 200 414",
  },
  {
    name: "Ondřej Stavmach",
    company: "stroje",
    position: "Vedoucí půjčovny",
    email: "ondrej@stavmach.example",
    phone: "+420 604 200 415",
  },
  {
    name: "Tereza Plzeňková",
    company: "stavebniny",
    position: "Prodej velkoodběr",
    email: "tereza@stavebniny-plzenka.example",
    phone: "+420 604 200 416",
  },
];

export type ContactIds = {
  company: Record<string, string>;
  person: Record<string, string>;
};

export async function seedContacts(kit: Kit, office: Ctx): Promise<ContactIds> {
  const company: Record<string, string> = {};
  const person: Record<string, string> = {};
  for (const c of COMPANIES) {
    const ico = c.icoBase === null ? null : icoFrom(c.icoBase);
    const row = await kit.create(office, "company", {
      name: c.name,
      ...(ico ? { ico } : {}),
      ...(c.vat && ico ? { dic: `CZ${ico}` } : {}),
      roles: c.roles,
      city: c.city,
      street: c.street,
      zip: c.zip,
      email: c.email,
      phone: c.phone,
      ...(c.note ? { note: c.note } : {}),
    });
    company[c.key] = row.id;
  }
  for (const p of PEOPLE) {
    const row = await kit.create(office, "person", {
      name: p.name,
      company: company[p.company],
      position: p.position,
      email: p.email,
      phone: p.phone,
    });
    person[p.name] = row.id;
  }
  return { company, person };
}
