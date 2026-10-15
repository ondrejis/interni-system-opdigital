import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import type { Executor } from "@rebar/core/db";
import { indexRecord } from "@rebar/core/entities";
import { personIndex } from "./indexing";
import { inTx, NotFoundError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { CONTACT_POINT_LABELS, person, personContactPoint } from "./schema";
import { isValidPhone, normalizeEmail, normalizePhoneE164 } from "./normalize";

/*
  Kontaktní údaje osoby (KON-01, KON-02, KON-03): víc e-mailů a telefonů se štítkem a právě jedním hlavním od každého
  druhu. `value_norm` je e-mail malými písmeny nebo telefon v E.164 (shoda nezávislá na mezerách a předvolbě); hlavní
  údaje se promítají i do sloupců `person.primary_email` / `primary_phone` pro seznam a hledání.
*/

/** Druh kontaktního údaje. */
export type PointKind = "email" | "phone";
/** Štítek kontaktního údaje. */
export type PointLabel = (typeof CONTACT_POINT_LABELS)[number];

/** Vstup jednoho údaje při úpravě; bez `id` je nový. */
export type PointInput = {
  id?: string | undefined;
  kind: PointKind;
  value: string;
  label?: PointLabel | null | undefined;
  isPrimary?: boolean | undefined;
};

/** Kontaktní údaj osoby tak, jak se čte. */
export type PointRow = {
  id: string;
  kind: PointKind;
  value: string;
  valueNorm: string;
  label: PointLabel | null;
  isPrimary: boolean;
  position: number;
  /** Telefon odpovídá číslovacímu plánu (u e-mailu vždy `true`). */
  valid: boolean;
};

/** Údaj po normalizaci a sloučení opakování, připravený k zápisu. */
export type PreparedPoint = {
  id?: string | undefined;
  kind: PointKind;
  value: string;
  valueNorm: string;
  label: PointLabel | null;
  isPrimary: boolean;
};

/** Normalizovaná hodnota údaje, nebo `null`, když nemá správný tvar. */
export function normalizePoint(kind: PointKind, value: string): string | null {
  return kind === "email" ? normalizeEmail(value) : normalizePhoneE164(value);
}

/**
 * Připraví údaje k zápisu: ořízne, zkontroluje tvar (chyba = věta pro uživatele), sloučí opakování (stejný druh
 * a stejná normalizovaná hodnota = jeden údaj) a určí hlavní: u každého druhu právě jeden, a to první označený,
 * jinak první v pořadí. Čistá funkce (bez DB), proto jde testovat samostatně.
 */
export function preparePoints(input: readonly PointInput[]): PreparedPoint[] {
  const out: PreparedPoint[] = [];
  const byKey = new Map<string, PreparedPoint>();
  for (const p of input) {
    const value = p.value.trim();
    if (!value) continue;
    const norm = normalizePoint(p.kind, value);
    if (!norm)
      throw new UserError(
        p.kind === "email"
          ? `E-mail „${value}“ nemá správný tvar.`
          : `Telefon „${value}“ nemá správný tvar.`,
      );
    const key = `${p.kind}:${norm}`;
    const seen = byKey.get(key);
    if (seen) {
      seen.isPrimary ||= !!p.isPrimary;
      seen.label ??= p.label ?? null;
      seen.id ??= p.id;
      continue;
    }
    const row: PreparedPoint = {
      ...(p.id ? { id: p.id } : {}),
      kind: p.kind,
      value,
      valueNorm: norm,
      label: p.label ?? null,
      isPrimary: !!p.isPrimary,
    };
    byKey.set(key, row);
    out.push(row);
  }
  for (const kind of ["email", "phone"] as const) {
    const ofKind = out.filter((x) => x.kind === kind);
    if (!ofKind.length) continue;
    const primary = ofKind.find((x) => x.isPrimary) ?? ofKind[0]!;
    for (const x of ofKind) x.isPrimary = x === primary;
  }
  return out;
}

/** Živé kontaktní údaje osob v pořadí (hlavní dřív); `db` může být i transakce. */
export async function listPointsFor(db: Executor, personIds: readonly string[]) {
  if (!personIds.length) return new Map<string, PointRow[]>();
  const rows = await db
    .select()
    .from(personContactPoint)
    .where(
      and(inArray(personContactPoint.personId, [...personIds]), isNull(personContactPoint.deletedAt)),
    )
    .orderBy(
      asc(personContactPoint.kind),
      sql`${personContactPoint.isPrimary} desc`,
      asc(personContactPoint.position),
      asc(personContactPoint.createdAt),
    );
  const map = new Map<string, PointRow[]>();
  for (const r of rows) {
    const list = map.get(r.personId) ?? [];
    list.push({
      id: r.id,
      kind: r.kind,
      value: r.value,
      valueNorm: r.valueNorm,
      label: r.label,
      isPrimary: r.isPrimary,
      position: r.position,
      valid: r.kind === "email" ? true : isValidPhone(r.value),
    });
    map.set(r.personId, list);
  }
  return map;
}

/** Živé kontaktní údaje jedné osoby. */
export async function listPoints(db: Executor, personId: string): Promise<PointRow[]> {
  return (await listPointsFor(db, [personId])).get(personId) ?? [];
}

/** Hlavní e-mail a telefon z údajů osoby (zapsané hodnoty). */
export function primaryOf(points: readonly { kind: PointKind; value: string; isPrimary: boolean }[]) {
  return {
    email: points.find((p) => p.kind === "email" && p.isPrimary)?.value ?? null,
    phone: points.find((p) => p.kind === "phone" && p.isPrimary)?.value ?? null,
  };
}

const describe = (rows: readonly { kind: PointKind; value: string; label: string | null }[], kind: PointKind) =>
  rows
    .filter((r) => r.kind === kind)
    .map((r) => `${r.value}${r.label ? ` (${r.label})` : ""}`)
    .join(", ") || null;

/**
 * Nahradí kontaktní údaje osoby zadaným seznamem (údaje s `id` se upraví, nové se založí, chybějící se smažou měkce),
 * přepíše hlavní e-mail a telefon na osobě, zaindexuje ji a zapíše změnu do historie. Přístup ke čtení a zápisu
 * osoby ověřuje volající (příkaz přes `assertEntityAccess`). Běží v jedné transakci.
 */
export async function setPersonPoints(
  ctx: Ctx,
  personId: string,
  input: readonly PointInput[],
  opts: { audit?: boolean } = {},
): Promise<PointRow[]> {
  const prepared = preparePoints(input);
  return inTx(ctx, async (c) => {
    const [owner] = await c.db
      .select({ id: person.id })
      .from(person)
      .where(and(eq(person.id, personId), isNull(person.deletedAt)))
      .for("update");
    if (!owner) throw new NotFoundError();
    const before = await listPoints(c.db, personId);
    const existing = await c.db
      .select()
      .from(personContactPoint)
      .where(and(eq(personContactPoint.personId, personId), isNull(personContactPoint.deletedAt)));
    const byId = new Map(existing.map((r) => [r.id, r]));
    const byKey = new Map(existing.map((r) => [`${r.kind}:${r.valueNorm}`, r]));

    // každý připravený údaj se přiřadí k existujícímu řádku (podle id, jinak podle shodné hodnoty)
    const used = new Set<string>();
    const plan = prepared.map((p, position) => {
      const hit =
        (p.id && byId.get(p.id) && !used.has(p.id) ? byId.get(p.id) : undefined) ??
        (() => {
          const k = byKey.get(`${p.kind}:${p.valueNorm}`);
          return k && !used.has(k.id) ? k : undefined;
        })();
      if (hit) used.add(hit.id);
      return { p, position, row: hit };
    });

    const now = new Date();
    const gone = existing.filter((r) => !used.has(r.id)).map((r) => r.id);
    if (gone.length)
      await c.db
        .update(personContactPoint)
        .set({ deletedAt: now, updatedBy: c.actor.userId })
        .where(inArray(personContactPoint.id, gone));
    // hlavní se mění až nakonec: nejdřív všem zbylým řádkům sundat příznak (částečný unikát jednoho hlavního)
    if (used.size)
      await c.db
        .update(personContactPoint)
        .set({ isPrimary: false })
        .where(inArray(personContactPoint.id, [...used]));
    for (const { p, position, row } of plan) {
      if (row)
        await c.db
          .update(personContactPoint)
          .set({
            kind: p.kind,
            value: p.value,
            valueNorm: p.valueNorm,
            label: p.label,
            isPrimary: p.isPrimary,
            position,
            updatedBy: c.actor.userId,
          })
          .where(eq(personContactPoint.id, row.id));
      else
        await c.db.insert(personContactPoint).values({
          personId,
          kind: p.kind,
          value: p.value,
          valueNorm: p.valueNorm,
          label: p.label,
          isPrimary: p.isPrimary,
          position,
          createdBy: c.actor.userId,
          updatedBy: c.actor.userId,
        });
    }

    const after = await listPoints(c.db, personId);
    const main = primaryOf(after);
    const [updated] = await c.db
      .update(person)
      .set({ primaryEmail: main.email, primaryPhone: main.phone, updatedBy: c.actor.userId })
      .where(eq(person.id, personId))
      .returning();

    const changes = (["phone", "email"] as const).flatMap((kind) => {
      const o = describe(before, kind);
      const n = describe(after, kind);
      return o === n ? [] : [{ field: kind === "phone" ? "Telefony" : "E-maily", old: o, new: n }];
    });
    if (changes.length && opts.audit !== false)
      await recordAudit(c, {
        action: "update",
        entityType: "person",
        entityId: personId,
        summary: "Změněny kontaktní údaje",
        changes,
      });
    if (updated) await indexRecord(c.db, personIndex, updated as Record<string, unknown>);
    return after;
  });
}

/**
 * Nastaví (nebo smaže) hlavní údaj daného druhu z jedné hodnoty, jak ji zadal uživatel v poli „E-mail“ / „Telefon“
 * v seznamu nebo ve formuláři osoby. Shodná hodnota mezi dalšími údaji se povýší na hlavní, jinak se přepíše hlavní
 * údaj (nebo vznikne nový). Prázdná hodnota hlavní údaj smaže a nejbližší další se stane hlavním. Sloupec osoby
 * se nemění (už ho zapsal engine), vyjma případu, kdy po smazání nastoupil jiný údaj; vrací výslednou zapsanou hodnotu.
 */
export async function setPrimaryPoint(
  c: Ctx,
  personId: string,
  kind: PointKind,
  value: string | null,
): Promise<string | null> {
  const rows = (await listPoints(c.db, personId)).filter((r) => r.kind === kind);
  const text = (value ?? "").trim();
  const now = new Date();
  const primary = rows.find((r) => r.isPrimary);
  if (!text) {
    if (!primary) return null;
    await c.db
      .update(personContactPoint)
      .set({ deletedAt: now, isPrimary: false, updatedBy: c.actor.userId })
      .where(eq(personContactPoint.id, primary.id));
    const next = rows.find((r) => r.id !== primary.id);
    if (!next) return null;
    await c.db
      .update(personContactPoint)
      .set({ isPrimary: true, updatedBy: c.actor.userId })
      .where(eq(personContactPoint.id, next.id));
    return next.value;
  }
  const norm = normalizePoint(kind, text);
  if (!norm)
    throw new UserError(
      kind === "email" ? `E-mail „${text}“ nemá správný tvar.` : `Telefon „${text}“ nemá správný tvar.`,
    );
  const same = rows.find((r) => r.valueNorm === norm);
  if (same?.isPrimary) {
    if (same.value !== text)
      await c.db
        .update(personContactPoint)
        .set({ value: text, updatedBy: c.actor.userId })
        .where(eq(personContactPoint.id, same.id));
    return text;
  }
  if (primary)
    await c.db
      .update(personContactPoint)
      .set({ isPrimary: false })
      .where(eq(personContactPoint.id, primary.id));
  if (same) {
    await c.db
      .update(personContactPoint)
      .set({ isPrimary: true, value: text, updatedBy: c.actor.userId })
      .where(eq(personContactPoint.id, same.id));
    // původní hlavní údaj zůstává jako další
    return text;
  }
  if (primary) {
    // přepsání hlavního údaje: starý se nahradí, ne přidá (uživatel opravil překlep, nepřidal druhý údaj)
    await c.db
      .update(personContactPoint)
      .set({
        value: text,
        valueNorm: norm,
        isPrimary: true,
        updatedBy: c.actor.userId,
      })
      .where(eq(personContactPoint.id, primary.id));
    return text;
  }
  await c.db.insert(personContactPoint).values({
    personId,
    kind,
    value: text,
    valueNorm: norm,
    isPrimary: true,
    position: rows.length,
    createdBy: c.actor.userId,
    updatedBy: c.actor.userId,
  });
  return text;
}
