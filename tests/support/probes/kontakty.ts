import { NONE, P, type Probe } from "./shared";

/** Vstupy příkazů: Kontakty. */
export const kontaktyProbes: Record<string, Probe> = {
  "kontakty.search": P(() => ({ q: "a" }), true),
  "kontakty.duplicates": P(() => ({ email: "probe@example.cz" }), true),
  "kontakty.ares": P(() => ({ ico: "12345678" }), true),
  "kontakty.person.points": P((e) => ({ personId: e.f.ids.contact }), true),
  "kontakty.person.setPoints": P((e) => ({ personId: e.f.ids.contact, points: [] }), true),
  "kontakty.merge.preview": P(() => ({ entity: "company", sourceId: NONE, targetId: NONE }), true),
  "kontakty.merge.run": P(
    () => ({ entity: "company", sourceId: NONE, targetId: NONE, confirm: true }),
    true,
  ),
};
