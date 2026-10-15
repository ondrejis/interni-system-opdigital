import { z } from "zod";
import { ARES_FIELDS } from "./ares/types";

/*
  Kontrakt příkazů modulu „kontakty“ (M1): zod vstupy příkazů a typy výstupů. Handlery jsou v `commands.ts`, veřejné
  funkce pro jiné moduly v `api.ts`. Tenhle soubor je bez databáze a bez serveru, dostane se i do prohlížeče
  (UI z něj bere typy).
*/

export { ARES_FIELDS } from "./ares/types";
import type { AresChange, AresCompany, AresField } from "./ares/types";
import type { PersonDuplicate } from "./duplicates";
export type { AresChange, AresCompany, AresField };
import type { CompanyHit, PersonHit } from "./search";
export type { CompanyHit, PersonHit };
/** Výsledek `kontakty.search`. */
export type SearchResult = { companies: CompanyHit[]; persons: PersonHit[] };
export type { CompanyDuplicate, CompanyDuplicateCheck, PersonDuplicate } from "./duplicates";
export type { CompanyContact, PersonCompanies } from "./persons";
export type { PointKind, PointLabel, PointRow } from "./points";

const id = z.uuid();
const text = (max: number) => z.string().trim().max(max);

/** Druh kontaktního údaje a jeho štítek. */
export const pointKindSchema = z.enum(["email", "phone"]);
export const pointLabelSchema = z.enum(["work", "mobile", "private"]);

/** Jeden kontaktní údaj osoby při úpravě (`id` mají jen už uložené). */
export const pointInputSchema = z.object({
  id: id.optional(),
  kind: pointKindSchema,
  value: text(200),
  label: pointLabelSchema.nullish(),
  isPrimary: z.boolean().optional(),
});

/** `kontakty.search`: hledání organizací a osob pro výběr (jméno, IČO, e-mail, část telefonu). */
export const searchInput = z.object({
  q: text(100).optional(),
  limit: z.number().int().min(1).max(25).optional(),
  kinds: z
    .array(z.enum(["company", "person"]))
    .max(2)
    .optional(),
});

/**
 * `kontakty.ares`: doplnění z ARES podle IČO. Bez `apply` je to náhled (co se změní); s `apply: true` a `companyId`
 * se zapíšou vybraná pole (`fields`; bez nich všechna předvybraná) a čas synchronizace. `companyId` bez `ico` použije
 * IČO organizace (tlačítko „Aktualizovat z ARES“).
 */
export const aresInput = z
  .object({
    ico: text(20).optional(),
    companyId: id.optional(),
    apply: z.boolean().optional(),
    fields: z.array(z.enum(ARES_FIELDS)).max(ARES_FIELDS.length).optional(),
  })
  .refine((v) => v.ico || v.companyId, { message: "Vyplňte IČO." })
  .refine((v) => !v.apply || v.companyId, { message: "Zápis z ARES vyžaduje organizaci." });

/** `kontakty.ares.test`: ověření dostupnosti ARES v Nastavení → Integrace (bez vstupu). */
export const aresTestInput = z.object({});

/** `kontakty.company.checkDuplicates`: stejné IČO, podobný název, stejná doména webu. */
export const companyCheckInput = z.object({
  name: text(200).optional(),
  ico: text(20).optional(),
  web: text(300).optional(),
  excludeId: id.optional(),
});

/** `kontakty.person.checkDuplicates`: osoby se stejným e-mailem nebo telefonem (E.164). */
export const personCheckInput = z.object({
  emails: z.array(text(200)).max(20).optional(),
  phones: z.array(text(60)).max(20).optional(),
  excludeId: id.optional(),
});

/**
 * `kontakty.person.quickCreate`: rychlé založení kontaktu (z organizace, obchodu, zakázky, palety). Při shodě
 * e-mailu nebo telefonu s existující osobou nic nezaloží a vrátí shody; `force: true` založí i přesto.
 */
export const personQuickCreateInput = z.object({
  firstName: text(100).optional(),
  lastName: text(100).min(1, "Vyplňte příjmení."),
  companyId: id.optional(),
  position: text(150).optional(),
  linkedin: text(300).optional(),
  isDecisionMaker: z.boolean().optional(),
  points: z.array(pointInputSchema).max(20).optional(),
  force: z.boolean().optional(),
});

/** `kontakty.person.points`: kontaktní údaje osoby. */
export const personIdInput = z.object({ personId: id });

/** `kontakty.person.setPoints`: nahradí kontaktní údaje osoby (jeden hlavní od každého druhu). */
export const setPointsInput = z.object({ personId: id, points: z.array(pointInputSchema).max(40) });

/** `kontakty.person.setCompanies`: hlavní organizace osoby a další organizace s rolí. */
export const setCompaniesInput = z.object({
  personId: id,
  primaryCompanyId: id.nullable().optional(),
  others: z
    .array(z.object({ companyId: id, role: text(100).nullish(), position: text(150).nullish() }))
    .max(30),
});

/** `kontakty.company.contacts`: kontakty organizace (hlavní i další). */
export const companyIdInput = z.object({ companyId: id });

/** Sloučení: `sourceId` zanikne, `targetId` (hlavní záznam) zůstane. */
export const mergeInput = z.object({
  entity: z.enum(["company", "person"]),
  sourceId: id,
  targetId: id,
});
/** `kontakty.merge.apply`: totéž se zápisem; nevratné, proto výslovné potvrzení. */
export const mergeApplyInput = mergeInput.extend({
  confirm: z.literal(true, { error: "Sloučení je nevratné, potvrďte ho." }),
});

/** Vstup `kontakty.search`. */
export type SearchInput = z.infer<typeof searchInput>;
/** Vstup `kontakty.ares`. */
export type AresInput = z.infer<typeof aresInput>;
/** Jeden kontaktní údaj osoby při úpravě. */
export type PointInputT = z.infer<typeof pointInputSchema>;
/** Vstup `kontakty.person.quickCreate`. */
export type PersonQuickCreateInput = z.infer<typeof personQuickCreateInput>;
/** Vstup `kontakty.person.setPoints`. */
export type SetPointsInput = z.infer<typeof setPointsInput>;
/** Vstup `kontakty.person.setCompanies`. */
export type SetCompaniesInput = z.infer<typeof setCompaniesInput>;
/** Vstup `kontakty.merge.preview`. */
export type MergeInput = z.infer<typeof mergeInput>;

/** Výsledek `kontakty.ares`: náhled změn, zápis, nebo věta o nedostupnosti. */
export type AresCommandResult =
  | {
      ok: true;
      company: AresCompany;
      cached: boolean;
      stale: boolean;
      fetchedAt: string;
      /** Co ARES změní u organizace (u nové organizace vše doplní). */
      changes: AresChange[];
      /** Organizace s tímto IČO už existuje (jiná než upravovaná): ukládání s tímto IČO nejde (ORG-05). */
      duplicate: { id: string; name: string; visible: boolean } | null;
      /** Zapsaná pole, jen u `apply: true`. */
      applied?: AresField[];
      /** Čas synchronizace zapsaný do organizace, jen u `apply: true`. */
      syncedAt?: string;
    }
  | {
      ok: false;
      reason: "invalid" | "not_found" | "unavailable" | "rate_limited";
      message: string;
    };

/** Výsledek `kontakty.ares.test`. */
export type AresTestResult = {
  ok: boolean;
  /** Doba odpovědi v ms. */
  ms: number;
  /** Odpověď přišla v limitu 2 s (NFR-04). */
  withinBudget: boolean;
  message: string;
  /** Firma, kterou ARES vrátil pro zkušební IČO. */
  sample?: string;
};

/** Výsledek `kontakty.person.quickCreate`. */
export type QuickCreateResult =
  | { created: true; personId: string; name: string }
  | { created: false; duplicates: PersonDuplicate[] };

/** Náhled sloučení: co se přepojí, doplní a před čím je třeba varovat. */
export type MergePreview = {
  entity: "company" | "person";
  source: { id: string; name: string };
  target: { id: string; name: string };
  /** Související záznamy, které se přepojí na hlavní záznam (podle tabulek). */
  moves: { table: string; label: string; count: number }[];
  /** Pole, která se doplní z mizejícího záznamu do hlavního, protože hlavní je nemá. */
  fills: { field: string; label: string; value: string }[];
  /** Co se přidá sjednocením (štítky, kontaktní údaje, služby, další organizace). */
  adds: string[];
  /** Věty, které mají uživatele upozornit (IČO se liší, stavy klienta se liší…). */
  warnings: string[];
};

/** Výsledek `kontakty.merge.apply`. */
export type MergeResult = { moved: number; targetId: string };
