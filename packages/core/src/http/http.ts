import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { newId } from "../db/ids";
import type { Executor } from "../db/client";

/** Porovnání tajemství v konstantním čase (bez úniku informace o shodě po znacích). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Ochrana proti CSRF u mutací mimo server actions: požadavek musí přijít z naší adresy (hlavička `Origin`,
 * případně `Referer`). Požadavky bez obou hlaviček (např. z příkazové řádky) se odmítnou.
 */
export function isSameOrigin(headers: Headers, appUrl: string): boolean {
  const allowed = new URL(appUrl).origin;
  const origin = headers.get("origin");
  if (origin) return origin === allowed;
  const referer = headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === allowed;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Omezení počtu požadavků (pevné okno, počítadlo v DB sdílené všemi procesy). Vrací `true`, když je
 * požadavek povolen. Klíč začíná předponou oblasti, např. `upload:<uživatel>`.
 */
export async function consumeRateLimit(
  db: Executor,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const rows = await db.execute<{ count: number }>(sql`
    insert into rate_limit (id, key, count, last_request) values (${newId()}, ${`app:${key}`}, 1, ${now})
    on conflict (key) do update set
      count = case when rate_limit.last_request <= ${windowStart} then 1 else rate_limit.count + 1 end,
      last_request = case when rate_limit.last_request <= ${windowStart} then ${now} else rate_limit.last_request end
    returning count`);
  return (rows[0]?.count ?? 1) <= limit;
}
