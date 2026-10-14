import { company, person } from "@rebar/kontakty/schema";
import type { FixtureEnv } from "./env";

/** Kontakty: klient, dodavatel a kontaktní osoba klienta. */
export async function kontaktyPart({ db }: FixtureEnv) {
  const ico = () => String(10_000_000 + Math.floor(Math.random() * 89_000_000));
  const [client] = await db
    .insert(company)
    .values({ name: "Klient s.r.o.", ico: ico() })
    .returning();
  const [supplier] = await db
    .insert(company)
    .values({ name: "Dodavatel a.s.", ico: ico() })
    .returning();
  const [contact] = await db
    .insert(person)
    .values({ name: "Jan Kontakt", companyId: client!.id })
    .returning();
  return { client: client!.id, supplier: supplier!.id, contact: contact!.id };
}
