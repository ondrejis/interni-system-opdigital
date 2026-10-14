/** Adresa otevřeného záznamu v pop-upu (`?record=<id>`): čisté funkce bez prohlížeče, aby šly testovat. */

export const RECORD_PARAM = "record";
/** Parametry záložky detailu, které patří k otevřenému záznamu (při zavření nebo přepnutí záznamu se mažou). */
const TAB_PARAMS = ["tab", "sub"] as const;

/** Id záznamu z `?record=` (`null`, když chybí nebo je prázdné). */
export function readRecordParam(search: string): string | null {
  const v = new URLSearchParams(search).get(RECORD_PARAM)?.trim();
  return v ? v : null;
}

/**
 * Adresa s nastaveným nebo odebraným `record`. Záložka detailu (`tab`, `sub`) se zahodí, když se mění záznam
 * nebo se zavírá; ostatní parametry (`pohled`, filtry…) zůstanou. `keepTab` zachová záložku (otevření přímým odkazem).
 */
export function withRecordParam(
  href: string,
  id: string | null,
  opts: { keepTab?: boolean } = {},
): string {
  const url = new URL(href, "http://local");
  if (id) url.searchParams.set(RECORD_PARAM, id);
  else url.searchParams.delete(RECORD_PARAM);
  if (!opts.keepTab) for (const p of TAB_PARAMS) url.searchParams.delete(p);
  return url.pathname + url.search + url.hash;
}
