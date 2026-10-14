import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@rebar/core/db";
import { resolveEntity, visibleIds } from "@rebar/core/entities";
import { defineCommand, defineModuleServer } from "@rebar/core/module-server";
import { scopeOf } from "@rebar/core/rbac";
import { person } from "@rebar/kontakty/schema";
import { job, jobMember } from "./schema";
import type { TerminalSite } from "./terminal-shared";

/** Fáze zakázky, na kterých se na stavbě pracuje. */
const SITE_PHASES = ["execution", "handover"];

/**
 * Zakázky, na kterých řemeslník právě pracuje (realizace a předání): adresa s polohou pro navigaci, kontakt na místě a tým.
 * Jen zakázky, které aktér smí vidět (montér a mistr „jen moje“). Žádné ceny, sazby ani marže.
 */
export const terminalSites = defineCommand({
  name: "zakazky.terminal.sites",
  permission: "zakazky.read",
  input: z.object({}),
  handler: async (ctx, _i, deps) => {
    const def = deps.registry.get("job");
    if (!def || !scopeOf(ctx, "zakazky.read")) return { sites: [] as TerminalSite[] };
    const ids = await visibleIds(ctx, await resolveEntity(ctx.db, def));
    if (!ids.length) return { sites: [] as TerminalSite[] };
    const rows = await ctx.db
      .select({
        id: job.id,
        number: job.number,
        title: job.title,
        phase: job.phase,
        address: job.address,
        lat: job.siteLat,
        lng: job.siteLng,
        startDate: job.startDate,
        endDate: job.endDate,
        managerId: job.managerId,
        personId: job.personId,
      })
      .from(job)
      .where(and(inArray(job.id, ids), inArray(job.phase, SITE_PHASES), isNull(job.deletedAt)))
      .orderBy(asc(job.endDate), asc(job.title))
      .limit(12);
    if (!rows.length) return { sites: [] as TerminalSite[] };

    const jobIds = rows.map((r) => r.id);
    const members = await ctx.db
      .select({ jobId: jobMember.jobId, userId: jobMember.userId, role: jobMember.role })
      .from(jobMember)
      .where(inArray(jobMember.jobId, jobIds));
    const userIds = [
      ...new Set([
        ...rows.flatMap((r) => (r.managerId ? [r.managerId] : [])),
        ...members.map((m) => m.userId),
      ]),
    ];
    // jméno a telefon kolegy; z tabulky zaměstnanců se čte jen telefon (hodinový náklad se nikdy nevybírá)
    const people = userIds.length
      ? await ctx.db
          .select({ id: schema.user.id, name: schema.user.name, phone: schema.employee.phone })
          .from(schema.user)
          .leftJoin(schema.employee, eq(schema.employee.userId, schema.user.id))
          .where(inArray(schema.user.id, userIds))
      : [];
    const byId = new Map(people.map((p) => [p.id, p] as const));
    const personIds = [...new Set(rows.flatMap((r) => (r.personId ? [r.personId] : [])))];
    const contacts = personIds.length
      ? await ctx.db
          .select({
            id: person.id,
            name: person.name,
            phone: person.phone,
            position: person.position,
          })
          .from(person)
          .where(and(inArray(person.id, personIds), isNull(person.deletedAt)))
      : [];
    const contactOf = new Map(contacts.map((c) => [c.id, c] as const));

    const sites: TerminalSite[] = rows.map((r) => {
      const mgr = r.managerId ? byId.get(r.managerId) : undefined;
      const c = r.personId ? contactOf.get(r.personId) : undefined;
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        phase: r.phase,
        address: r.address,
        lat: r.lat === null ? null : Number(r.lat),
        lng: r.lng === null ? null : Number(r.lng),
        startDate: r.startDate,
        endDate: r.endDate,
        contact: c ? { name: c.name, phone: c.phone, position: c.position } : null,
        manager: mgr ? { name: mgr.name, phone: mgr.phone ?? null } : null,
        team: members
          .filter((m) => m.jobId === r.id && m.userId !== ctx.actor.userId)
          .flatMap((m) => {
            const p = byId.get(m.userId);
            return p ? [{ name: p.name, phone: p.phone ?? null, role: m.role }] : [];
          }),
      };
    });
    return { sites };
  },
});

/** Oblast terminálu řemeslníka: data pro dlaždici „Dnes na stavbě“. */
export const area = defineModuleServer({ commands: [terminalSites] });
