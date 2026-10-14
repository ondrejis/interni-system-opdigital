import type { Ctx } from "@rebar/core/rbac";
import { icoFrom } from "./ico";
import type { Kit } from "./kit";

type CompanyDef = {
  key: string;
  name: string;
  /** Sedmimístný základ IČO (osmá číslice se dopočítá). */
  icoBase: number;
  city: string;
  street: string;
  zip: string;
  email: string;
  phone: string;
};

/** Ukázkové firmy (všechny vymyšlené; IČO je formálně platné, ale nepatří žádné skutečné firmě). */
export const COMPANIES: readonly CompanyDef[] = [
  {
    key: "stavby",
    name: "Stavby Novák s.r.o.",
    icoBase: 2810344,
    city: "Plzeň",
    street: "Americká 41",
    zip: "30100",
    email: "info@stavby-novak.example",
    phone: "+420 377 100 201",
  },
  {
    key: "pekarna",
    name: "Pekárna Vondráček s.r.o.",
    icoBase: 2915482,
    city: "Rokycany",
    street: "Pekařská 8",
    zip: "33701",
    email: "info@pekarna-vondracek.example",
    phone: "+420 371 100 202",
  },
  {
    key: "ordinace",
    name: "MUDr. Hana Králová s.r.o.",
    icoBase: 482915,
    city: "Plzeň",
    street: "Americká 51",
    zip: "30100",
    email: "ordinace@kralova-mudr.example",
    phone: "+420 377 100 203",
  },
];

type PersonDef = { name: string; company: string; position: string; email: string; phone: string };

export const PEOPLE: readonly PersonDef[] = [
  {
    name: "Ing. Jan Novák",
    company: "stavby",
    position: "Jednatel",
    email: "jan@stavby-novak.example",
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
];

export type ContactIds = {
  company: Record<string, string>;
  person: Record<string, string>;
};

/** Založí ukázkové firmy a osoby přes entity modulu kontakty (stejná cesta jako formulář v aplikaci). */
export async function seedContacts(kit: Kit, ctx: Ctx): Promise<ContactIds> {
  const company: Record<string, string> = {};
  const person: Record<string, string> = {};
  for (const c of COMPANIES) {
    const row = await kit.create(ctx, "company", {
      name: c.name,
      ico: icoFrom(c.icoBase),
      city: c.city,
      street: c.street,
      zip: c.zip,
      email: c.email,
      phone: c.phone,
    });
    company[c.key] = row.id;
  }
  for (const p of PEOPLE) {
    const row = await kit.create(ctx, "person", {
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
