/** Společné pomocníky exportů pro účetní (balík ZIP, ISDOC, podklady DPH). */

export const KIND_LABEL: Record<string, string> = {
  proforma: "zálohová",
  partial: "průběžná",
  final: "vyúčtování",
  credit_note: "dobropis",
  retention: "uvolnění zádržného",
};

export const MODE_LABEL: Record<string, string> = {
  standard: "běžný",
  reverse_charge: "přenesená daňová povinnost",
};

/** Bezpečný název souboru: bez diakritiky a znaků mimo `\w . -`, nejvýš 80 znaků. */
export const safeName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "doklad";

/** Jedinečné názvy souborů v archivu (bez ohledu na velikost písmen); duplicitě se přidá `_2`, `_3`… */
export function uniqueNamer() {
  const used = new Set<string>();
  return (dir: string, base: string, ext: string) => {
    const prefix = dir ? `${dir}/` : "";
    let n = `${prefix}${base}${ext}`;
    for (let k = 2; used.has(n.toLowerCase()); k++) n = `${prefix}${base}_${k}${ext}`;
    used.add(n.toLowerCase());
    return n;
  };
}

/** Podle čeho se doklady vybírají do období: datum vystavení, nebo datum zdanitelného plnění (DUZP). */
export type PeriodBasis = "issue" | "duzp";

/** Zkratka období pro název souboru: `2026-08`, nebo `od_do`. */
export const periodStem = (from: string, to: string) =>
  from.slice(0, 7) === to.slice(0, 7) ? from.slice(0, 7) : `${from}_${to}`;
