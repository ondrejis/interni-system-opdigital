import type { EventRule } from "./config";
import { BUILTIN_PARAMS, type AnyEventDef } from "./types";

/** Skupina příjemců čitelně: „Ten, komu je úkol přidělen“, „Všichni s oprávněním …“. */
export function describeRecipient(def: AnyEventDef, token: string): string {
  if (token.startsWith("perm:")) return `Všichni s oprávněním ${token.slice(5)}`;
  if (token.startsWith("role:")) return `Role ${token.slice(5)}`;
  return def.audiences[token] ?? token;
}

/** Zkontroluje úpravu události (konfigurace klienta i Nastavení): příjemci a parametry v textu musí existovat. */
export function validateRule(def: AnyEventDef, rule: EventRule): string[] {
  const problems: string[] = [];
  for (const r of rule.recipients ?? [])
    if (!/^(perm:|role:)/.test(r) && !(r in def.audiences))
      problems.push(
        `Příjemce „${r}“ u události „${def.key}“ neexistuje (dostupné: ${Object.keys(def.audiences).join(", ") || "žádné"}; dále perm:<oprávnění> a role:<klíč>).`,
      );
  const known = new Set<string>([...Object.keys(def.params), ...BUILTIN_PARAMS]);
  for (const [where, text] of [
    ["titulek", rule.title],
    ["podtitulek", rule.body],
  ] as const)
    for (const m of (text ?? "").matchAll(/\{([a-zA-Z0-9]+)\}/g))
      if (!known.has(m[1]!))
        problems.push(
          `Text „${where}“ u události „${def.key}“ používá neznámý parametr {${m[1]}} (dostupné: ${[...known].join(", ")}).`,
        );
  if ((rule.title ?? "").includes("{") && /\{[^a-zA-Z]/.test(rule.title ?? ""))
    problems.push(`Titulek události „${def.key}“ obsahuje neplatný parametr.`);
  return problems;
}
