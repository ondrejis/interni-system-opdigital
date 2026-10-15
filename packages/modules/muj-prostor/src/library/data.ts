import { and, arrayContains, arrayOverlaps, asc, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { getLookup } from "@rebar/core/config-data";
import { NotFoundError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { emailLibraryItem } from "../schema";
import { escapeLike, normalizeSearch, searchTokens, snippet } from "./logic";
import type { LibraryList, LibraryRow } from "./types";

/** Nejvíc položek, které vrátí jedno hledání (knihovna je osobní, tak velká nebude). */
export const LIBRARY_LIMIT = 500;

type Raw = typeof emailLibraryItem.$inferSelect;

/** Podmínka „text bez diakritiky a velikosti písmen obsahuje výraz“ (výraz už je normalizovaný). */
const likeNorm = (col: SQL | unknown, pattern: string) =>
  sql`lower(f_unaccent(coalesce(${col}, ''))) like ${pattern} escape '\\'`;

/** Řádek knihovny pro seznam. */
export function toLibraryRow(r: Pick<Raw, "id" | "title" | "category" | "subject" | "tags" | "bodyText" | "updatedAt">): LibraryRow {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    subject: r.subject,
    tags: r.tags,
    snippet: snippet(r.bodyText),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/**
 * Hledání v knihovně (KNI-01): každé slovo hledaného výrazu musí být (bez diakritiky a velikosti písmen) v názvu,
 * kategorii, předmětu, textu nebo štítku (hodnota i popisek štítku). Filtr kategorie a štítku se přidává k hledání.
 * Počty kategorií a štítků jsou přes celou knihovnu, aby šly filtry přepínat.
 */
export async function listLibrary(
  ctx: Ctx,
  input: { q?: string | undefined; category?: string | undefined; tag?: string | undefined; sort?: "title" | "updated" | undefined },
): Promise<LibraryList> {
  const t = emailLibraryItem;
  const tagItems = await getLookup(ctx.db, "tag", { includeInactive: true });
  const labelOf = new Map(tagItems.map((i) => [i.value, i.label]));

  const tokens = searchTokens(input.q);
  const textMatch = tokens.map((tok) => {
    const pattern = `%${escapeLike(tok)}%`;
    const byLabel = tagItems
      .filter((i) => normalizeSearch(i.label).includes(tok))
      .map((i) => i.value);
    return or(
      likeNorm(t.title, pattern),
      likeNorm(t.category, pattern),
      likeNorm(t.subject, pattern),
      likeNorm(t.bodyText, pattern),
      likeNorm(sql`array_to_string(${t.tags}, ' ')`, pattern),
      byLabel.length ? arrayOverlaps(t.tags, byLabel) : undefined,
    );
  });
  const where = and(
    isNull(t.deletedAt),
    ...textMatch,
    input.category ? sql`lower(${t.category}) = ${input.category.toLowerCase()}` : undefined,
    input.tag ? arrayContains(t.tags, [input.tag]) : undefined,
  );

  const [rows, [count], all] = await Promise.all([
    ctx.db
      .select({
        id: t.id,
        title: t.title,
        category: t.category,
        subject: t.subject,
        tags: t.tags,
        bodyText: t.bodyText,
        updatedAt: t.updatedAt,
      })
      .from(t)
      .where(where)
      .orderBy(
        input.sort === "updated" ? desc(t.updatedAt) : asc(sql`lower(f_unaccent(${t.title}))`),
        asc(t.id),
      )
      .limit(LIBRARY_LIMIT),
    ctx.db.select({ n: sql<number>`count(*)::int` }).from(t).where(where),
    ctx.db.select({ category: t.category, tags: t.tags }).from(t).where(isNull(t.deletedAt)),
  ]);

  const categories = new Map<string, { name: string; count: number }>();
  const tags = new Map<string, number>();
  for (const r of all) {
    const name = r.category?.trim();
    if (name) {
      const key = name.toLowerCase();
      const hit = categories.get(key);
      if (hit) hit.count += 1;
      else categories.set(key, { name, count: 1 });
    }
    for (const v of r.tags) tags.set(v, (tags.get(v) ?? 0) + 1);
  }
  const total = count?.n ?? rows.length;
  return {
    rows: rows.map(toLibraryRow),
    total,
    truncated: total > rows.length,
    categories: [...categories.values()].sort((a, b) => a.name.localeCompare(b.name, "cs")),
    tags: [...tags.entries()]
      .map(([value, n]) => ({ value, label: labelOf.get(value) ?? value, count: n }))
      .sort((a, b) => a.label.localeCompare(b.label, "cs")),
  };
}

/** Nesmazaná položka knihovny podle id; neexistující vyhodí `NotFoundError`. */
export async function loadLibraryItem(ctx: Ctx, id: string): Promise<Raw> {
  const [row] = await ctx.db
    .select()
    .from(emailLibraryItem)
    .where(and(isNull(emailLibraryItem.deletedAt), eq(emailLibraryItem.id, id)));
  if (!row) throw new NotFoundError("Položka knihovny nenalezena.");
  return row;
}
