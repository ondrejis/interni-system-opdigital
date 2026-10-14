import { sql } from "drizzle-orm";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

/**
 * Živost pro Docker a reverzní proxy: bez tokenu, bez podrobností (jen „běží a dostane se k databázi“).
 * Podrobný stav je v `/api/health` za tokenem.
 */
export async function GET() {
  try {
    await getServices().db.execute(sql`select 1`);
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
