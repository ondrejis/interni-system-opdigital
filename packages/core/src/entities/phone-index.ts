import { phoneSearchKeys } from "../contracts/phone";

/** Posloupnost, která vypadá jako telefon: aspoň 7 číslic s mezerami, tečkami nebo pomlčkami, případně s `+`/`00`. */
const PHONE_LIKE = /(?:\+|\b00)?\d(?:[\s.-]?\d){6,}/g;

/**
 * Klíče telefonů, které se najdou v textu záznamu (`search_document.search_text`): každé číslo dostane klíč z
 * `phoneSearchKeys` (posledních 9 číslic), takže „777 12“ nebo „77712“ najde „+420 777 123 456“, i když je číslo zapsané
 * s mezerami nebo předvolbou. Text bez telefonu vrací prázdné pole.
 */
export function phoneKeysInText(text: string): string[] {
  const keys = new Set<string>();
  for (const m of text.match(PHONE_LIKE) ?? []) for (const k of phoneSearchKeys(m)) keys.add(k);
  return [...keys];
}

/**
 * Klíč pro hledání telefonu z dotazu v paletě, nebo `null`, když dotaz na telefon nevypadá (obsahuje písmena nebo má
 * méně než tři číslice). Předvolba (`+420`, `00420`, `+421`) se ignoruje, takže hledání „+420 777 12“ najde totéž
 * jako „777 12“; číslo delší než devět číslic se zkrátí na posledních devět (jako při indexaci).
 */
export function phoneQueryKey(query: string): string | null {
  const t = query.trim();
  if (!/^[+\d][\d\s.()/-]*$/.test(t)) return null;
  let digits = t.replace(/\D/g, "");
  if (/^(\+|00)/.test(t)) digits = digits.replace(/^(?:00)?(?:420|421)(?=\d)/, "");
  if (digits.length < 3) return null;
  return digits.length > 9 ? digits.slice(-9) : digits;
}
