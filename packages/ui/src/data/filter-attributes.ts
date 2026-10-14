import type {
  AttributeDescriptor,
  AttributeType,
  Condition,
  FilterGroup,
} from "@rebar/core/shared";
import { isCondition } from "./filters";

/**
 * Skupina atributů v nabídce „Filtr“: modul si ji pro entitu definuje výčtem klíčů (`EntityList` prop `filterGroups`).
 * Atribut, který žádná skupina nezmiňuje, spadne do „Vlastní pole“ (je-li vlastní) nebo do „Ostatní“.
 */
export type FilterAttributeGroup = { id: string; label: string; attrs: readonly string[] };

/** Skupina atributů připravená k zobrazení v nabídce „Filtr“ (jen filtrovatelné atributy, v pořadí zobrazení). */
export type FilterSection = { id: string; label: string; attributes: AttributeDescriptor[] };

/** Skupiny podle typu atributu: použijí se, když entita žádné vlastní skupiny nedefinuje. */
const TYPE_SECTIONS: { id: string; label: string; types: readonly AttributeType[] }[] = [
  { id: "text", label: "Text", types: ["text", "longtext", "url", "phone", "email"] },
  { id: "number", label: "Čísla a částky", types: ["number", "currency"] },
  { id: "date", label: "Data", types: ["date"] },
  { id: "choice", label: "Stav a výběr", types: ["status", "select", "multiselect", "checkbox"] },
  { id: "link", label: "Lidé a vazby", types: ["user", "record"] },
];

export const CUSTOM_SECTION_ID = "custom";
export const OTHER_SECTION_ID = "other";

/**
 * Rozdělí filtrovatelné atributy do skupin pro nabídku „Filtr“. S `groups` podle výčtu klíčů (pořadí skupin i atributů
 * ve skupině se zachová), bez nich podle typu. Vlastní pole jsou vždy zvlášť, prázdné skupiny se vynechají.
 */
export function sectionFilterAttributes(
  attributes: readonly AttributeDescriptor[],
  groups?: readonly FilterAttributeGroup[] | undefined,
): FilterSection[] {
  const filterable = attributes.filter((a) => a.filterable);
  const byKey = new Map(filterable.map((a) => [a.key, a]));
  const used = new Set<string>();
  const sections: FilterSection[] = [];

  if (groups?.length) {
    for (const g of groups) {
      const list: AttributeDescriptor[] = [];
      for (const key of g.attrs) {
        const a = byKey.get(key);
        if (a && !used.has(key)) {
          list.push(a);
          used.add(key);
        }
      }
      if (list.length) sections.push({ id: g.id, label: g.label, attributes: list });
    }
  } else {
    for (const t of TYPE_SECTIONS) {
      const list = filterable.filter((a) => !a.custom && t.types.includes(a.type));
      for (const a of list) used.add(a.key);
      if (list.length) sections.push({ id: t.id, label: t.label, attributes: list });
    }
  }

  const rest = filterable.filter((a) => !used.has(a.key));
  const custom = rest.filter((a) => a.custom);
  const other = rest.filter((a) => !a.custom);
  if (other.length) sections.push({ id: OTHER_SECTION_ID, label: "Ostatní", attributes: other });
  if (custom.length)
    sections.push({ id: CUSTOM_SECTION_ID, label: "Vlastní pole", attributes: custom });
  return sections;
}

/** Stejná podmínka (atribut, operátor, hodnota)? Slouží k odlišení výchozích chipů a skrytí už použitých návrhů. */
export function sameCondition(a: Condition, b: Condition): boolean {
  return a.attr === b.attr && a.op === b.op && JSON.stringify(a.value) === JSON.stringify(b.value);
}

/** Podmínky nejvyšší úrovně filtru, které jsou i ve `baseline` (výchozí filtr pohledu): pole pravdivostních hodnot podle pořadí. */
export function markBaseline(
  group: FilterGroup | undefined,
  baseline: FilterGroup | undefined,
): boolean[] {
  const base = (baseline?.conditions ?? []).filter(isCondition);
  return (group?.conditions ?? []).map(
    (c) => isCondition(c) && base.some((b) => sameCondition(b, c)),
  );
}
