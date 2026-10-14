import { and, count, getTableColumns, isNull, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Ctx } from "../rbac/types";

/**
 * Blokace smazání záznamu, který má navázané záznamy jiných modulů (firma se zakázkou a fakturou, zakázka s vystavenou
 * fakturou…). Entita o cizích tabulkách nic neví: každý modul dodá `deleteBlockers` pro typy záznamů, na které odkazuje,
 * a `deleteRecord` je před smazáním vyhodnotí. Počítají se jen nesmazané záznamy.
 */
export type DeleteBlocker = {
  /** Stabilní jméno pro logy a testy (`zakazky.company-jobs`). */
  id: string;
  /** Typ mazaného záznamu (`company`, `person`, `job`). */
  entity: string;
  /** Kolik nesmazaných záznamů na mazaný záznam odkazuje. */
  count: (ctx: Ctx, id: string) => Promise<number>;
  /** Jméno navázaných záznamů podle počtu: 1 / 2–4 / 5 a více („zakázka“, „zakázky“, „zakázek“). */
  noun: readonly [one: string, few: string, many: string];
  /**
   * Co s nimi dál, věta za středníkem. Výchozí: „nejdřív je přesuňte nebo smažte“. U dokladů, které smazat nejde
   * (vystavená faktura, zamčená objednávka), blokace vysvětlí, proč smazání nejde.
   */
  fix?: string;
};

const g = globalThis as { __deleteBlockers?: DeleteBlocker[] }; // globálně: Next bundluje route handlery zvlášť

/** Nahradí zaregistrované blokace (volá se při sestavení zapnutých modulů, tedy i v testech a ve workeru). */
export function setDeleteBlockers(blockers: readonly DeleteBlocker[]) {
  g.__deleteBlockers = [...blockers];
}

export const DEFAULT_DELETE_FIX = "nejdřív je přesuňte nebo smažte";

const plural = (n: number, [one, few, many]: DeleteBlocker["noun"]) =>
  `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;

/** Spojí „3 zakázky“, „2 faktury“ do české výčtové věty („3 zakázky a 2 faktury“, „3 zakázky, 2 faktury a 1 poptávka“). */
const list = (parts: string[]) =>
  parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} a ${parts.at(-1)}`;

/**
 * Vrátí českou větu, proč záznam nejde smazat („Firma má 3 zakázky a 2 faktury; nejdřív je přesuňte nebo smažte.“),
 * nebo `null`, když nic nebrání. `label` je název typu záznamu v 1. pádu („Firma“).
 */
export async function deleteBlockMessage(
  ctx: Ctx,
  entity: string,
  id: string,
  label: string,
): Promise<string | null> {
  const blockers = (g.__deleteBlockers ?? []).filter((b) => b.entity === entity);
  if (!blockers.length) return null;
  const fired: { b: DeleteBlocker; n: number }[] = [];
  for (const b of blockers) {
    const n = await b.count(ctx, id);
    if (n > 0) fired.push({ b, n });
  }
  if (!fired.length) return null;
  const fix = fired.find((f) => f.b.fix)?.b.fix ?? DEFAULT_DELETE_FIX;
  return `${label} má ${list(fired.map((f) => plural(f.n, f.b.noun)))}; ${fix}.`;
}

/** Spočítá nesmazané řádky tabulky (`deleted_at is null`) splňující podmínky; pomocník pro `DeleteBlocker.count`. */
export async function countActive(
  ctx: Ctx,
  table: PgTable,
  ...where: (SQL | undefined)[]
): Promise<number> {
  const deletedAt = (getTableColumns(table) as Record<string, AnyPgColumn>).deletedAt;
  const [r] = await ctx.db
    .select({ n: count() })
    .from(table)
    .where(and(deletedAt ? isNull(deletedAt) : undefined, ...where));
  return Number(r?.n ?? 0);
}
