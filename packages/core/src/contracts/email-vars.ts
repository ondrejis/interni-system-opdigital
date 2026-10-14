import type { Ctx } from "../rbac/types";

/** Entity, ze kterých jde napsat e-mail ze šablony. */
export type EmailEntityType = "company" | "person" | "deal" | "job";

/**
 * Proměnné šablon e-mailů, které modul nabízí pro entitu (`{jmeno}`, `{firma}`…). Přispívá kontakty, obchody, zakázky
 * a jádro (`odesilatel`); čte `sablony-emailu` a `muj-prostor` (`ModuleServer.contributions.emailVars`).
 */
export type EmailVarsProvider = {
  entityType: EmailEntityType;
  vars: readonly { key: string; label: string }[];
  /** Hodnoty proměnných pro jeden záznam (jen text; neznámý záznam = prázdný objekt). */
  resolve(ctx: Ctx, id: string): Promise<Record<string, string>>;
};

const VAR = /\{([a-z_]+)\}/g;

/** Dosadí proměnné `{klic}` do textu; neznámá proměnná zůstane v textu beze změny, prázdná hodnota se dosadí jako prázdný text. */
export function renderTemplate(text: string, vars: Partial<Record<string, string>>): string {
  return text.replace(VAR, (m, key: string) => (key in vars ? (vars[key] ?? "") : m));
}

/** Proměnné v textu, které nejsou mezi `known` (překlep: `{castak}`); pro kontrolu při ukládání šablony. */
export function unknownVariables(text: string, known: Iterable<string>): string[] {
  const ok = new Set(known);
  return [...new Set([...text.matchAll(VAR)].map((m) => m[1]!).filter((k) => !ok.has(k)))];
}

/**
 * Předmět a text zprávy z šablony. Hodnoty se dosazují jako text (nikdy HTML); předmět je jednořádkový,
 * konce řádků v textu se sjednotí na `\n`.
 */
export function renderEmailTemplate(
  tpl: { subject: string; body: string },
  vars: Partial<Record<string, string>>,
): { subject: string; body: string } {
  return {
    subject: renderTemplate(tpl.subject, vars)
      .replace(/\s*[\r\n]+\s*/g, " ")
      .trim(),
    body: renderTemplate(tpl.body, vars).replace(/\r\n/g, "\n").trim(),
  };
}
