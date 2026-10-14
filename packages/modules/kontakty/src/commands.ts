import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@rebar/core/audit";
import { getLookup } from "@rebar/core/config-data";
import { assertEntityAccess } from "@rebar/core/entities";
import { consumeRateLimit } from "@rebar/core/http";
import { defineCommand } from "@rebar/core/module-server";
import { inTx, UserError } from "@rebar/core/rbac";
import { POINT_TYPE_LOOKUP } from "./entities";
import { aresLookup, listContactPoints, mergeContacts, previewMerge, searchContacts } from "./api";
import { personContactPoint } from "./schema";

/** Hledání firem a osob pro výběr (rychlé zadání poptávky, účastníci zakázky, sloučení). */
export const searchCommand = defineCommand({
  name: "kontakty.search",
  permission: "kontakty.read",
  input: z.object({
    q: z.string().trim().max(100).optional(),
    limit: z.number().int().min(1).max(25).optional(),
    kinds: z
      .array(z.enum(["company", "person"]))
      .max(2)
      .optional(),
  }),
  handler: (ctx, i) => searchContacts(ctx, i),
});

/**
 * Doplnění firmy z ARES podle IČO. Nikdy nevyhodí chybu kvůli síti: výsledek `ok: false` nese větu pro uživatele.
 * Počet dotazů na uživatele je omezený (ochrana veřejného API i aplikace).
 */
export const aresCommand = defineCommand({
  name: "kontakty.ares",
  permission: ["kontakty.write", "poptavky.write", "zakazky.write"],
  input: z.object({ ico: z.string().trim().min(1, "Vyplňte IČO.").max(20) }),
  handler: async (ctx, i) => {
    const key = `ares:${ctx.actor.userId ?? "system"}`;
    if (!(await consumeRateLimit(ctx.db, key, 30, 60)))
      return {
        ok: false as const,
        reason: "unavailable" as const,
        message: "Příliš mnoho dotazů na ARES. Zkuste to za chvíli.",
      };
    return aresLookup(i.ico);
  },
});

const POINT = z.object({
  kind: z.enum(["email", "phone"]),
  value: z.string().trim().min(1).max(200),
  label: z.string().trim().max(40).nullish(),
});

/** Další e-maily a telefony osoby s typem. */
export const personPointsCommand = defineCommand({
  name: "kontakty.person.points",
  permission: "kontakty.read",
  input: z.object({ personId: z.uuid() }),
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, "person", i.personId, "read");
    return {
      points: await listContactPoints(ctx, i.personId),
      types: (await getLookup(ctx.db, POINT_TYPE_LOOKUP)).map((t) => ({
        value: t.value,
        label: t.label,
      })),
    };
  },
});

/** Nahradí další e-maily a telefony osoby (hlavní údaje se mění v poli osoby). */
export const setPersonPointsCommand = defineCommand({
  name: "kontakty.person.setPoints",
  permission: "kontakty.write",
  input: z.object({ personId: z.uuid(), points: z.array(POINT).max(20) }),
  handler: async (ctx, i) => {
    for (const p of i.points) {
      if (p.kind === "email" && !z.email().safeParse(p.value).success)
        throw new UserError(`E-mail „${p.value}“ nemá správný tvar.`);
      if (p.kind === "phone" && !/^[+\d][\d\s()./-]{5,}$/.test(p.value))
        throw new UserError(`Telefon „${p.value}“ nemá správný tvar.`);
    }
    await assertEntityAccess(ctx, "person", i.personId, "write");
    return inTx(ctx, async (c) => {
      const before = await listContactPoints(c, i.personId);
      await c.db
        .update(personContactPoint)
        .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
        .where(
          and(eq(personContactPoint.personId, i.personId), isNull(personContactPoint.deletedAt)),
        );
      if (i.points.length)
        await c.db.insert(personContactPoint).values(
          i.points.map((p, position) => ({
            personId: i.personId,
            kind: p.kind,
            value: p.value,
            label: p.label || null,
            position,
            createdBy: c.actor.userId,
            updatedBy: c.actor.userId,
          })),
        );
      const fmt = (r: { kind: string; value: string; label?: string | null }[]) =>
        r.map((x) => `${x.value}${x.label ? ` (${x.label})` : ""}`).join(", ") || null;
      if (fmt(before) !== fmt(i.points))
        await recordAudit(c, {
          action: "update",
          entityType: "person",
          entityId: i.personId,
          summary: "Změněny další kontaktní údaje",
          changes: [{ field: "Další kontaktní údaje", old: fmt(before), new: fmt(i.points) }],
        });
      return listContactPoints(c, i.personId);
    });
  },
});

const mergeInput = z.object({
  entity: z.enum(["company", "person"]),
  sourceId: z.uuid(),
  targetId: z.uuid(),
});

/** Náhled sloučení: co se přepojí a doplní. Nic nemění. */
export const mergePreviewCommand = defineCommand({
  name: "kontakty.merge.preview",
  permission: "kontakty.merge",
  input: mergeInput,
  handler: (ctx, i) => previewMerge(ctx, i.entity, i.sourceId, i.targetId),
});

/**
 * Sloučení duplicity: `sourceId` zanikne a všechno, co na něj odkazovalo, přejde na `targetId`. Nevratné z uživatelského
 * rozhraní, proto vyžaduje výslovné `confirm: true`.
 */
export const mergeRunCommand = defineCommand({
  name: "kontakty.merge.run",
  permission: "kontakty.merge",
  input: mergeInput.extend({
    confirm: z.literal(true, { error: "Sloučení je nevratné, potvrďte ho." }),
  }),
  handler: (ctx, i) => mergeContacts(ctx, i.entity, i.sourceId, i.targetId),
});

export const contactCommands = [
  searchCommand,
  aresCommand,
  personPointsCommand,
  setPersonPointsCommand,
  mergePreviewCommand,
  mergeRunCommand,
];
