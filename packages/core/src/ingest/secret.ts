import { eq } from "drizzle-orm";
import { recordAudit } from "../audit/audit";
import { schema, type Executor } from "../db/client";
import { inTx } from "../rbac/context";
import { assertCan } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { randomToken, type Cipher } from "../security/crypto";

/*
  Tajemství příchozích požadavků (`/api/ingest/<zdroj>`): jedno sdílené tajemství pro n8n, kterým se podepisuje tělo
  (HMAC-SHA256, viz `webhooks/signature`). Je v nastavení `ingest` zašifrované (`cipher`), v čitelné podobě se
  zobrazí jen při vytvoření nebo výměně. Při výměně zůstane staré tajemství ještě 24 hodin platné, aby se mezi výměnou
  a úpravou n8n neztratily leady; při podezření na únik se starému platnost ukončí hned.
*/

const KEY = "ingest";
const PERMISSION = "settings.integrations";
/** Jak dlouho po výměně platí ještě staré tajemství. */
export const PREVIOUS_SECRET_GRACE_HOURS = 24;

type Stored = { secret?: string | null; previous?: string | null; previousUntil?: string | null };

async function load(db: Executor): Promise<Stored> {
  const [row] = await db.select().from(schema.setting).where(eq(schema.setting.key, KEY));
  return (row?.value as Stored | undefined) ?? {};
}

/** Tajemství, kterými se teď smí podepisovat (aktuální a případně ještě platné předchozí). */
export async function loadIngestSecrets(
  db: Executor,
  cipher: Cipher,
  now = new Date(),
): Promise<string[]> {
  const v = await load(db);
  const out: string[] = [];
  const current = v.secret ? cipher.decrypt(v.secret) : null;
  if (current) out.push(current);
  if (v.previous && v.previousUntil && new Date(v.previousUntil) > now) {
    const previous = cipher.decrypt(v.previous);
    if (previous) out.push(previous);
  }
  return out;
}

/** Stav tajemství pro Nastavení (bez hodnoty). */
export async function getIngestSecretStatus(
  ctx: Ctx,
): Promise<{ configured: boolean; previousValidUntil: string | null }> {
  assertCan(ctx, PERMISSION);
  const v = await load(ctx.db);
  const graceActive = !!v.previous && !!v.previousUntil && new Date(v.previousUntil) > new Date();
  return { configured: !!v.secret, previousValidUntil: graceActive ? v.previousUntil! : null };
}

/**
 * Vygeneruje nové tajemství příchozích požadavků a vrátí ho (zobrazí se jen jednou). `revokeOld` ukončí platnost
 * dosavadního hned, jinak platí ještě 24 hodin.
 */
export async function rotateIngestSecret(
  ctx: Ctx,
  cipher: Cipher,
  { revokeOld = false }: { revokeOld?: boolean } = {},
): Promise<{ secret: string; previousValidUntil: string | null }> {
  assertCan(ctx, PERMISSION);
  const secret = `ingest_${randomToken(32)}`;
  return inTx(ctx, async (c) => {
    const before = await load(c.db);
    const keepPrevious = !revokeOld && !!before.secret;
    const previousValidUntil = keepPrevious
      ? new Date(Date.now() + PREVIOUS_SECRET_GRACE_HOURS * 3_600_000).toISOString()
      : null;
    const value: Stored = {
      secret: cipher.encrypt(secret),
      previous: keepPrevious ? before.secret! : null,
      previousUntil: previousValidUntil,
    };
    await c.db
      .insert(schema.setting)
      .values({ key: KEY, value, updatedBy: c.actor.userId })
      .onConflictDoUpdate({
        target: schema.setting.key,
        set: { value, updatedBy: c.actor.userId },
      });
    await recordAudit(c, {
      action: before.secret ? "update" : "create",
      entityType: "setting",
      entityId: KEY,
      entityTitle: "Příchozí požadavky (ingest)",
      summary: before.secret
        ? revokeOld
          ? "Vyměněno tajemství příchozích požadavků, staré přestalo platit"
          : "Vyměněno tajemství příchozích požadavků (staré platí ještě 24 hodin)"
        : "Vytvořeno tajemství příchozích požadavků",
    });
    return { secret, previousValidUntil };
  });
}
