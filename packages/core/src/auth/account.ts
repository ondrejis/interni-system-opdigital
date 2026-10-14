import { eq } from "drizzle-orm";
import { z } from "zod";
import "../zod-locale";
import { auditChange } from "../audit/audit";
import { schema } from "../db/client";
import { inTx } from "../rbac/context";
import { NotFoundError, PermissionError } from "../rbac/errors";
import type { Ctx } from "../rbac/types";

/** Údaje přihlášeného uživatele pro hlavičku, stránku Můj účet a zabezpečení. Každý vidí jen sebe. */
export async function getAccount(ctx: Ctx) {
  const id = ctx.actor.userId;
  if (!id) throw new PermissionError();
  const [row] = await ctx.db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      roleName: schema.role.name,
      twoFactorEnabled: schema.user.twoFactorEnabled,
      twoFactorRequired: schema.role.require2fa,
      phone: schema.employee.phone,
    })
    .from(schema.user)
    .innerJoin(schema.role, eq(schema.user.roleId, schema.role.id))
    .leftJoin(schema.employee, eq(schema.employee.userId, schema.user.id))
    .where(eq(schema.user.id, id));
  if (!row) throw new NotFoundError();
  return row;
}

/** Telefon: prázdný = bez telefonu; jinak číslice, mezery a `+ - ( ) / .` s 7 až 15 číslicemi. */
const phoneField = z
  .string()
  .trim()
  .max(30, "Telefon je příliš dlouhý.")
  .nullish()
  .transform((v) => (v ? v.replace(/\s+/g, " ") : null))
  .refine(
    (v) => v === null || (/^\+?[0-9 ()/.-]+$/.test(v) && /^\d{7,15}$/.test(v.replace(/\D/g, ""))),
    "Telefon zadejte třeba ve tvaru +420 777 123 456.",
  );

export const profileInput = z.object({
  name: z.string().trim().min(2, "Vyplňte jméno.").max(100, "Jméno je příliš dlouhé."),
  phone: phoneField,
});

/**
 * Úprava vlastního profilu: jméno (`user.name`) a telefon (`employee.phone`). E-mail si uživatel nemění sám, protože je to
 * přihlašovací jméno a cíl odkazů pro obnovu hesla; mění se přes správce uživatelů nebo novou pozvánku.
 * Jméno i telefon se čtou ze stejných tabulek všude jinde (záznamy, aktivita, docházka), takže se změna projeví hned všude.
 */
export async function updateOwnProfile(ctx: Ctx, raw: z.input<typeof profileInput>) {
  const id = ctx.actor.userId;
  if (!id) throw new PermissionError();
  const input = profileInput.parse(raw);
  await inTx(ctx, async (c) => {
    const [before] = await c.db
      .select({ name: schema.user.name, phone: schema.employee.phone })
      .from(schema.user)
      .leftJoin(schema.employee, eq(schema.employee.userId, schema.user.id))
      .where(eq(schema.user.id, id));
    if (!before) throw new NotFoundError();

    if (before.name !== input.name) {
      await c.db
        .update(schema.user)
        .set({ name: input.name, updatedBy: id })
        .where(eq(schema.user.id, id));
      await auditChange(c, {
        entityType: "user",
        entityId: id,
        before: { name: before.name },
        after: { name: input.name },
        summary: "Změna jména v profilu",
      });
    }

    const oldPhone = before.phone ?? null;
    if (oldPhone !== input.phone) {
      // Záznam zaměstnance vzniká jen u toho, kdo telefon zadá; ostatní údaje (úvazek, sazba) zůstávají na správci.
      await c.db
        .insert(schema.employee)
        .values({ userId: id, phone: input.phone, createdBy: id, updatedBy: id })
        .onConflictDoUpdate({
          target: schema.employee.userId,
          set: { phone: input.phone, updatedBy: id },
        });
      await auditChange(c, {
        entityType: "employee",
        entityId: id,
        before: { phone: oldPhone },
        after: { phone: input.phone },
        summary: "Změna telefonu v profilu",
      });
    }
  });
}
