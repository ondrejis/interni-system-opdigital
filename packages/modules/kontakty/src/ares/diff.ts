import { ARES_FIELD_LABELS, type AresChange, type AresCompany, type AresField } from "./types";

/** Údaje organizace, které se porovnávají s ARES (`null` = prázdné). */
export type AresTarget = Record<AresField, string | null>;

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t || null;
};

/** Co přináší ARES jako hodnoty polí organizace (`name` i `officialName` z obchodního jména). */
export function aresValues(ares: AresCompany): AresTarget {
  return {
    name: ares.name,
    officialName: ares.name,
    ico: ares.ico,
    dic: ares.dic,
    legalForm: ares.legalForm,
    street: ares.street,
    city: ares.city,
    zip: ares.zip,
  };
}

/**
 * Náhled změn: co ARES doplní nebo přepíše v organizaci (ORG-03). `current = null` je nová organizace (vše se doplní).
 * Stejné hodnoty a údaje, které ARES nemá, se vynechají. Název (`name`) se přepisuje jen tam, kde je prázdný nebo
 * zrcadlí oficiální název; vlastní zkrácený název („Novák Stavby“) se nepřepisuje, jen se nabídne (nezaškrtnutý).
 */
export function buildAresDiff(current: Partial<AresTarget> | null, ares: AresCompany): AresChange[] {
  const incoming = aresValues(ares);
  const now = (f: AresField) => clean(current?.[f]);
  const out: AresChange[] = [];
  for (const field of Object.keys(ARES_FIELD_LABELS) as AresField[]) {
    const to = clean(incoming[field]);
    if (!to) continue;
    const from = now(field);
    if (from === to) continue;
    const kind = from ? "change" : "fill";
    const mirrorsOfficial = field === "name" && from !== null && from === now("officialName");
    out.push({
      field,
      label: ARES_FIELD_LABELS[field],
      current: from,
      incoming: to,
      kind,
      selected: field === "name" ? kind === "fill" || mirrorsOfficial : true,
    });
  }
  return out;
}
