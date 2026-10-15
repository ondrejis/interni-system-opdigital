import { assertEntityAccess } from "@rebar/core/entities";
import { consumeRateLimit } from "@rebar/core/http";
import { defineCommand } from "@rebar/core/module-server";
import type { Ctx } from "@rebar/core/rbac";
import { UserError } from "@rebar/core/rbac";
import { applyAres, previewAres } from "./ares-service";
import { ARES_TIMEOUT_MS, createDbAresCache, getAresClient, lookupAres } from "./ares";
import {
  aresInput,
  aresTestInput,
  companyCheckInput,
  companyIdInput,
  mergeApplyInput,
  mergeInput,
  personCheckInput,
  personIdInput,
  personQuickCreateInput,
  searchInput,
  setCompaniesInput,
  setPointsInput,
  type AresCommandResult,
  type AresTestResult,
  type QuickCreateResult,
} from "./contract";
import { checkCompanyDuplicates, findPersonDuplicates } from "./duplicates";
import { mergeContacts, previewMerge } from "./merge";
import {
  createPerson,
  listCompanyContacts,
  listPersonCompanies,
  setPersonCompanies,
} from "./persons";
import { listPoints, setPersonPoints } from "./points";
import { searchContacts } from "./search";

/** Zkušební IČO pro test ARES v Nastavení → Integrace (Ministerstvo financí, stabilní subjekt). */
const ARES_TEST_ICO = "00006947";

/**
 * Hledání organizací a osob pro výběr (rychlé zadání obchodu, účastníci zakázky, sloučení, šablony e-mailů): podle
 * jména bez diakritiky, IČO, e-mailu a části telefonu bez předvolby.
 */
export const searchCommand = defineCommand({
  name: "kontakty.search",
  permission: "kontakty.read",
  input: searchInput,
  handler: (ctx, i) => searchContacts(ctx, i),
});

/** Doplnění z ARES na žádost: kolik dotazů smí uživatel za minutu (ochrana veřejného API i aplikace). */
const ARES_RATE_LIMIT = { max: 30, windowSec: 60 } as const;

async function limited(ctx: Ctx): Promise<boolean> {
  const key = `ares:${ctx.actor.userId ?? "system"}`;
  return !(await consumeRateLimit(ctx.db, key, ARES_RATE_LIMIT.max, ARES_RATE_LIMIT.windowSec));
}

/**
 * Doplnění organizace z ARES podle IČO (ORG-03, ORG-04). Bez `apply` vrací náhled změn (do 2 s, cache 24 h); s
 * `apply: true` a `companyId` zapíše vybraná pole a čas synchronizace. Nikdy nevyhodí chybu kvůli síti: `ok: false`
 * nese větu pro uživatele a organizaci jde uložit ručně.
 */
export const aresCommand = defineCommand({
  name: "kontakty.ares",
  permission: ["kontakty.ares", "kontakty.write", "obchody.write", "zakazky.write"],
  input: aresInput,
  handler: async (ctx, i, deps): Promise<AresCommandResult> => {
    if (await limited(ctx))
      return {
        ok: false,
        reason: "rate_limited",
        message: "Příliš mnoho dotazů na ARES. Zkuste to za chvíli.",
      };
    if (i.apply) {
      await assertEntityAccess(ctx, "company", i.companyId!, "write");
      return applyAres(ctx, deps.registry, {
        companyId: i.companyId!,
        ico: i.ico,
        fields: i.fields,
      });
    }
    return previewAres(ctx, { ico: i.ico, companyId: i.companyId, fresh: !!i.companyId });
  },
});

/**
 * Test ARES pro Nastavení → Integrace: zkusí stáhnout zkušební subjekt (bez cache) a změří dobu odpovědi proti
 * limitu 2 s (NFR-04). Nic neukládá.
 */
export const aresTestCommand = defineCommand({
  name: "kontakty.ares.test",
  permission: "kontakty.ares",
  input: aresTestInput,
  handler: async (ctx): Promise<AresTestResult> => {
    const started = Date.now();
    const res = await lookupAres(ARES_TEST_ICO, {
      cache: createDbAresCache(ctx.db),
      client: getAresClient(),
      fresh: true,
    });
    const ms = Date.now() - started;
    if (!res.ok) return { ok: false, ms, withinBudget: false, message: res.message };
    return {
      ok: true,
      ms,
      withinBudget: ms <= ARES_TIMEOUT_MS && !res.stale,
      message: res.stale
        ? "ARES neodpovídá, vrácena starší uložená odpověď."
        : ms <= ARES_TIMEOUT_MS
          ? `ARES odpovídá (${ms} ms).`
          : `ARES odpovídá pomalu (${ms} ms).`,
      sample: res.company.name,
    };
  },
});

/** Kontrola duplicit organizace: stejné IČO (nejde uložit), podobný název nebo doména webu („Možná duplicita“). */
export const companyCheckCommand = defineCommand({
  name: "kontakty.company.checkDuplicates",
  permission: "kontakty.read",
  input: companyCheckInput,
  handler: (ctx, i) => checkCompanyDuplicates(ctx, i),
});

/** Kontrola duplicit osoby podle e-mailu a telefonu (E.164, nezávisle na mezerách a předvolbě). */
export const personCheckCommand = defineCommand({
  name: "kontakty.person.checkDuplicates",
  permission: "kontakty.read",
  input: personCheckInput,
  handler: (ctx, i) => findPersonDuplicates(ctx, i),
});

/**
 * Rychlé založení kontaktu (z organizace, obchodu, zakázky, palety): jméno, volitelně organizace, pozice a více
 * e-mailů a telefonů. Při shodě e-mailu nebo telefonu s existující osobou nic nezaloží a vrátí shody; `force: true`
 * založí i přesto (člověk se rozhodl).
 */
export const personQuickCreateCommand = defineCommand({
  name: "kontakty.person.quickCreate",
  permission: "kontakty.create",
  input: personQuickCreateInput,
  handler: async (ctx, i): Promise<QuickCreateResult> => {
    const points = i.points ?? [];
    if (!i.force) {
      const duplicates = await findPersonDuplicates(ctx, {
        emails: points.filter((p) => p.kind === "email").map((p) => p.value),
        phones: points.filter((p) => p.kind === "phone").map((p) => p.value),
      });
      if (duplicates.length) return { created: false, duplicates };
    }
    const made = await createPerson(ctx, {
      firstName: i.firstName,
      lastName: i.lastName,
      companyId: i.companyId ?? null,
      position: i.position,
      linkedin: i.linkedin,
      isDecisionMaker: i.isDecisionMaker,
      points,
    });
    return { created: true, personId: made.id, name: made.name };
  },
});

/** Kontaktní údaje osoby (e-maily a telefony se štítkem a hlavním). */
export const personPointsCommand = defineCommand({
  name: "kontakty.person.points",
  permission: "kontakty.read",
  input: personIdInput,
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, "person", i.personId, "read");
    return listPoints(ctx.db, i.personId);
  },
});

/** Nahradí kontaktní údaje osoby (hlavní jsou právě jeden e-mail a jeden telefon). */
export const setPersonPointsCommand = defineCommand({
  name: "kontakty.person.setPoints",
  permission: "kontakty.write",
  input: setPointsInput,
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, "person", i.personId, "write");
    return setPersonPoints(ctx, i.personId, i.points);
  },
});

/** Organizace osoby: hlavní a další s rolí. */
export const personCompaniesCommand = defineCommand({
  name: "kontakty.person.companies",
  permission: "kontakty.read",
  input: personIdInput,
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, "person", i.personId, "read");
    return listPersonCompanies(ctx, i.personId);
  },
});

/** Nastaví hlavní organizaci osoby a nahradí její další organizace s rolí. */
export const setPersonCompaniesCommand = defineCommand({
  name: "kontakty.person.setCompanies",
  permission: "kontakty.write",
  input: setCompaniesInput,
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, "person", i.personId, "write");
    return setPersonCompanies(ctx, i.personId, {
      ...(i.primaryCompanyId !== undefined ? { primaryCompanyId: i.primaryCompanyId } : {}),
      others: i.others,
    });
  },
});

/** Kontakty organizace (hlavní i další) s hlavním telefonem a e-mailem pro kartu a záložku. */
export const companyContactsCommand = defineCommand({
  name: "kontakty.company.contacts",
  permission: "kontakty.read",
  input: companyIdInput,
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, "company", i.companyId, "read");
    return listCompanyContacts(ctx, i.companyId);
  },
});

/** Náhled sloučení: co se přepojí a doplní. Nic nemění. */
export const mergePreviewCommand = defineCommand({
  name: "kontakty.merge.preview",
  permission: "kontakty.merge",
  input: mergeInput,
  handler: (ctx, i) => previewMerge(ctx, i.entity, i.sourceId, i.targetId),
});

/**
 * Sloučení duplicity (jen vlastník): `sourceId` zanikne a všechno, co na něj odkazovalo, přejde na `targetId`
 * (hlavní záznam). Nevratné z rozhraní, proto vyžaduje výslovné `confirm: true`.
 */
export const mergeApplyCommand = defineCommand({
  name: "kontakty.merge.apply",
  permission: "kontakty.merge",
  input: mergeApplyInput,
  handler: async (ctx, i) => {
    if (i.sourceId === i.targetId)
      throw new UserError("Vyberte jiný záznam, než který se slučuje.");
    return mergeContacts(ctx, i.entity, i.sourceId, i.targetId);
  },
});

export const contactCommands = [
  searchCommand,
  aresCommand,
  aresTestCommand,
  companyCheckCommand,
  personCheckCommand,
  personQuickCreateCommand,
  personPointsCommand,
  setPersonPointsCommand,
  personCompaniesCommand,
  setPersonCompaniesCommand,
  companyContactsCommand,
  mergePreviewCommand,
  mergeApplyCommand,
];
