import { hasMoney, stripMoney } from "./money";
import type { ParamValue } from "./types";

/*
  Skládání textu upozornění ze šablony. Zpráva se skládá zvlášť pro každého příjemce: parametr, na který nemá právo,
  se do jeho textu nedostane (ani částka schovaná v jiném parametru).
*/

const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g;
/** Oddělovač těsně před parametrem, který se vynechává i s ním: „: x“, „ · x“, „ — x“, „, x“, „ (x)“. */
const DELIMITER_BEFORE = /(?:: | · | — | – |, | \()$/;

export type RenderValues = Readonly<Record<string, ParamValue>>;

const asText = (v: ParamValue): string | null => {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t ? t : null;
};

/**
 * Titulek: nedostupný nebo chybějící parametr se odstraní; stojí-li hned za oddělovačem (`: `, ` · `, ` — `, `, `,
 * ` (`), odejde s ním („VP-1 Odsávání: {amount}“ → „VP-1 Odsávání“). Citlivé parametry proto patří za oddělovač.
 */
export function renderTitle(
  template: string,
  values: RenderValues,
  forbidden: ReadonlySet<string>,
): string {
  let out = template;
  // zprava doleva, ať se posuny indexů nepletou
  const hits = [...template.matchAll(PLACEHOLDER)].reverse();
  for (const m of hits) {
    const name = m[1]!;
    const value = forbidden.has(name) ? null : asText(values[name]);
    const start = m.index!;
    const end = start + m[0].length;
    if (value !== null) {
      out = out.slice(0, start) + value + out.slice(end);
      continue;
    }
    const cut = DELIMITER_BEFORE.exec(out.slice(0, start));
    const from = cut ? cut.index : start;
    let to = end;
    if (cut && cut[0].endsWith("(") && out[to] === ")") to += 1;
    out = out.slice(0, from) + out.slice(to);
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

/** Podtitulek po řádcích: řádek s chybějícím nebo nedostupným parametrem se vynechá celý. */
export function renderBody(
  template: string | undefined,
  values: RenderValues,
  forbidden: ReadonlySet<string>,
): string | null {
  if (!template) return null;
  const lines: string[] = [];
  for (const line of template.split(/\r?\n/)) {
    let missing = false;
    const text = line.replace(PLACEHOLDER, (_, name: string) => {
      const v = forbidden.has(name) ? null : asText(values[name]);
      if (v === null) missing = true;
      return v ?? "";
    });
    if (!missing && text.trim()) lines.push(text.trim());
  }
  return lines.length ? lines.join("\n") : null;
}

/** Odkaz: hodnoty se zakódují, výsledek musí zůstat cestou v aplikaci. */
export function renderUrl(template: string, values: RenderValues, fallback = "/inbox"): string {
  const url = template.replace(PLACEHOLDER, (_, name: string) =>
    encodeURIComponent(asText(values[name]) ?? ""),
  );
  return url.startsWith("/") && !url.startsWith("//") && !/[\r\n\\]/.test(url) ? url : fallback;
}

/** Pojistka: komu nepatří peníze, ten je v textu nemá, ani když je tam nějaký parametr propašoval. */
export function withoutMoneyUnless(text: string | null, allowed: boolean): string | null {
  if (text === null || allowed || !hasMoney(text)) return text;
  return stripMoney(text);
}

export const MAX_TITLE = 120;
export const MAX_BODY = 240;
export const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
