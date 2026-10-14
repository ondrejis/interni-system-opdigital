import { and, asc, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import "../zod-locale";
import { recordAudit } from "../audit/audit";
import { schema, type Executor } from "../db/client";
import { inTx } from "../rbac/context";
import { NotFoundError, UserError } from "../rbac/errors";
import { assertCan } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { roundMinor } from "./money";

/** Platné sazby DPH k datu (nejnovější platnost první). `rateBp`: 21 % = 2100. */
export async function listVatRates(db: Executor, at: string) {
  return db
    .select()
    .from(schema.vatRate)
    .where(
      and(
        isNull(schema.vatRate.deletedAt),
        lte(schema.vatRate.validFrom, at),
        or(isNull(schema.vatRate.validTo), gte(schema.vatRate.validTo, at)),
      ),
    )
    .orderBy(desc(schema.vatRate.rateBp));
}

const vatInput = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]+$/, "Kód smí mít jen malá písmena, číslice a podtržítko."),
  label: z.string().trim().min(1, "Vyplňte název sazby."),
  rateBp: z.number().int().min(0).max(10_000),
  validFrom: z.iso.date(),
  validTo: z.iso.date().nullish(),
});

export async function saveVatRate(ctx: Ctx, raw: z.input<typeof vatInput>) {
  assertCan(ctx, "settings.manage");
  const d = vatInput.parse(raw);
  if (d.validTo && d.validTo < d.validFrom)
    throw new UserError("Platnost do musí být po platnosti od.");
  return inTx(ctx, async (c) => {
    // Platnost jedné sazby (kódu) se nesmí překrývat: o dni by nebylo jasné, která platí.
    const same = await c.db
      .select()
      .from(schema.vatRate)
      .where(and(eq(schema.vatRate.code, d.code), isNull(schema.vatRate.deletedAt)));
    const farFuture = "9999-12-31";
    for (const o of same) {
      if (o.validFrom === d.validFrom) continue; // úprava téhož řádku
      if (d.validFrom <= (o.validTo ?? farFuture) && o.validFrom <= (d.validTo ?? farFuture))
        throw new UserError(
          `Platnost se překrývá se sazbou „${o.label}“ (od ${o.validFrom}${o.validTo ? ` do ${o.validTo}` : ""}).`,
        );
    }
    const [row] = await c.db
      .insert(schema.vatRate)
      .values({
        code: d.code,
        label: d.label,
        rateBp: d.rateBp,
        validFrom: d.validFrom,
        validTo: d.validTo ?? null,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      })
      .onConflictDoUpdate({
        target: [schema.vatRate.code, schema.vatRate.validFrom],
        set: {
          label: d.label,
          rateBp: d.rateBp,
          validTo: d.validTo ?? null,
          deletedAt: null,
          updatedBy: c.actor.userId,
        },
      })
      .returning();
    await recordAudit(c, {
      action: "upsert",
      entityType: "vat_rate",
      entityId: row!.id,
      summary: `DPH ${d.label} ${d.rateBp / 100} %`,
      changes: [{ field: "rateBp", old: null, new: d.rateBp }],
    });
    return row!;
  });
}

/** Výše DPH z částky bez DPH v haléřích; zaokrouhluje na haléře (půl od nuly, i u záporných částek — dobropisy). */
export function vatAmountMinor(netMinor: number, rateBp: number): number {
  return roundMinor((netMinor * rateBp) / 10_000);
}

/** Všechny sazby včetně vypršelých a budoucích (správa v administraci); nejnovější platnost první. */
export async function listAllVatRates(db: Executor) {
  return db
    .select()
    .from(schema.vatRate)
    .where(isNull(schema.vatRate.deletedAt))
    .orderBy(desc(schema.vatRate.rateBp), asc(schema.vatRate.code), desc(schema.vatRate.validFrom));
}

/** Smaže (měkce) sazbu. Doklady mají sazbu uloženou u sebe, takže se jich to netýká. Výchozí sazbu smazat nejde. */
export async function deleteVatRate(ctx: Ctx, id: string) {
  assertCan(ctx, "settings.manage");
  await inTx(ctx, async (c) => {
    const [row] = await c.db
      .select()
      .from(schema.vatRate)
      .where(and(eq(schema.vatRate.id, id), isNull(schema.vatRate.deletedAt)));
    if (!row) throw new NotFoundError("Sazba nenalezena.");
    const def = await readDefaultCode(c.db);
    if (def === row.code) {
      const others = await c.db
        .select({ id: schema.vatRate.id })
        .from(schema.vatRate)
        .where(and(eq(schema.vatRate.code, row.code), isNull(schema.vatRate.deletedAt)));
      if (others.length <= 1)
        throw new UserError("Výchozí sazbu smazat nejde. Nejdřív nastavte jinou výchozí.");
    }
    await c.db
      .update(schema.vatRate)
      .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
      .where(eq(schema.vatRate.id, id));
    await recordAudit(c, {
      action: "delete",
      entityType: "vat_rate",
      entityId: id,
      summary: `Sazba DPH ${row.label} smazána`,
    });
  });
}

/** Vrátí smazanou sazbu (zpět po omylu). */
export async function restoreVatRate(ctx: Ctx, id: string) {
  assertCan(ctx, "settings.manage");
  await inTx(ctx, async (c) => {
    const [row] = await c.db.select().from(schema.vatRate).where(eq(schema.vatRate.id, id));
    if (!row || !row.deletedAt) throw new NotFoundError("Sazba nenalezena.");
    await c.db
      .update(schema.vatRate)
      .set({ deletedAt: null, updatedBy: c.actor.userId })
      .where(eq(schema.vatRate.id, id));
    await recordAudit(c, { action: "restore", entityType: "vat_rate", entityId: id });
  });
}

const DEFAULT_KEY = "vat_default";

async function readDefaultCode(db: Executor): Promise<string | null> {
  const [row] = await db.select().from(schema.setting).where(eq(schema.setting.key, DEFAULT_KEY));
  const v = (row?.value as { code?: unknown } | undefined)?.code;
  return typeof v === "string" ? v : null;
}

/** Kód výchozí sazby (nastavené v administraci), nebo `null` = nejvyšší platná sazba. */
export const getDefaultVatCode = readDefaultCode;

/** Nastaví výchozí sazbu nových řádků dokladů. */
export async function setDefaultVatCode(ctx: Ctx, code: string) {
  assertCan(ctx, "settings.manage");
  await inTx(ctx, async (c) => {
    const [exists] = await c.db
      .select({ id: schema.vatRate.id })
      .from(schema.vatRate)
      .where(and(eq(schema.vatRate.code, code), isNull(schema.vatRate.deletedAt)));
    if (!exists) throw new UserError("Taková sazba neexistuje.");
    const before = await readDefaultCode(c.db);
    await c.db
      .insert(schema.setting)
      .values({ key: DEFAULT_KEY, value: { code }, updatedBy: c.actor.userId })
      .onConflictDoUpdate({
        target: schema.setting.key,
        set: { value: { code }, updatedBy: c.actor.userId },
      });
    await recordAudit(c, {
      action: "update",
      entityType: "vat_rate",
      entityId: code,
      summary: "Výchozí sazba DPH",
      changes: [{ field: "default", old: before, new: code }],
    });
  });
}

/** Výchozí sazba k datu: nastavená v administraci (je-li k datu platná), jinak nejvyšší platná, jinak 21 %. */
export async function defaultVatRateBp(db: Executor, at: string): Promise<number> {
  const rates = await listVatRates(db, at);
  const code = await readDefaultCode(db);
  return rates.find((r) => r.code === code)?.rateBp ?? rates[0]?.rateBp ?? 2100;
}

/** Sazby platné k datu pro výběr v dokladech spolu s výchozí. */
export async function vatChoices(db: Executor, at: string) {
  const rates = await listVatRates(db, at);
  const code = await readDefaultCode(db);
  const def = rates.find((r) => r.code === code) ?? rates[0];
  return {
    rates: rates.map((r) => ({ code: r.code, label: r.label, rateBp: r.rateBp })),
    defaultBp: def?.rateBp ?? 2100,
  };
}
