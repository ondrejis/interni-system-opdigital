import { P, type Probe } from "./shared";

const ID = "11111111-1111-4111-8111-111111111111";

/** Vstupy příkazů: Organizace a kontakty (KON). */
export const kontaktyProbes: Record<string, Probe> = {
  "kontakty.search": P(() => ({ q: "novák" }), true),
  "kontakty.ares": P(() => ({ ico: "27082440" }), true),
  "kontakty.ares.test": P(() => ({}), true),
  "kontakty.company.checkDuplicates": P(() => ({ name: "Novák Stavby", ico: "27082440" }), true),
  "kontakty.person.checkDuplicates": P(
    () => ({ emails: ["jan@example.cz"], phones: ["777 123 456"] }),
    true,
  ),
  "kontakty.person.quickCreate": P(() => ({ lastName: "Zkouška", force: true }), true),
  "kontakty.person.points": P(() => ({ personId: ID }), true),
  "kontakty.person.setPoints": P(
    () => ({ personId: ID, points: [{ kind: "email", value: "jan@example.cz" }] }),
    true,
  ),
  "kontakty.person.companies": P(() => ({ personId: ID }), true),
  "kontakty.person.setCompanies": P(() => ({ personId: ID, others: [] }), true),
  "kontakty.company.contacts": P(() => ({ companyId: ID }), true),
  "kontakty.merge.preview": P(() => ({ entity: "company", sourceId: ID, targetId: ID }), true),
  "kontakty.merge.apply": P(
    () => ({ entity: "company", sourceId: ID, targetId: ID, confirm: true }),
    true,
  ),
};
