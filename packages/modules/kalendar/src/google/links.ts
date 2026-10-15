import { eq } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { visibleRecordTitles } from "@rebar/core/entities";
import { inTx, NotFoundError, scopeOf, type Ctx } from "@rebar/core/rbac";
import type { LinkSuggestion, SuggestLinksResult } from "../contract";
import { calendarEvent } from "../schema";
import { withToken } from "./accounts";
import type { KalEnv } from "./env";
import { googleClient } from "./env";
import { sqlContactLookup, type ContactLookup } from "./foreign";
import { TASK_PROP } from "./mapping";
import { enqueuePush, loadEvent, type EventWithCalendar } from "./push";

/*
  Vazby události na obchod, organizaci a kontakt (KAL-07, KAL-08): návrh podle shody e-mailu účastníka s kontaktem,
  uložení vazby a „povýšení“ na úkol: událost z Googlu navázaná na obchod se stane schůzkou v modulu úkolů, takže je
  v historii obchodu a počítá se jako jeho další aktivita.
*/

/** Načte událost a ověří, že na ni divák smí (vlastní, nebo s rozsahem „vše“). Cizí soukromá je pro něj „neexistuje“. */
export async function accessibleEvent(
  ctx: Ctx,
  eventId: string,
  mode: "read" | "write",
): Promise<EventWithCalendar> {
  const e = await loadEvent(ctx, eventId);
  if (!e) throw new NotFoundError();
  const own = e.account.userId === ctx.actor.userId;
  if (!own) {
    const scope = scopeOf(ctx, mode === "write" ? "kalendar.write" : "kalendar.read");
    if (scope !== "all") throw new NotFoundError();
    if (e.event.isGooglePrivate) throw new NotFoundError();
  }
  return e;
}

/** Návrhy vazeb: kontakt (a jeho organizace, otevřené obchody) podle e-mailů účastníků. */
export async function suggestLinks(
  ctx: Ctx,
  env: Pick<KalEnv, "registry">,
  eventId: string,
  contacts: ContactLookup = sqlContactLookup,
): Promise<SuggestLinksResult> {
  const e = await accessibleEvent(ctx, eventId, "read");
  const own = new Set([e.account.googleEmail.toLowerCase()]);
  const emails = e.event.attendees
    .filter((a) => !a.self && !own.has(a.email.toLowerCase()))
    .map((a) => a.email);
  const found = await contacts.findByEmails(ctx, emails);
  if (!found.length) return { suggestions: [] };
  const deals = await contacts.openDeals(ctx, {
    personIds: [...new Set(found.map((f) => f.personId))],
    companyIds: [...new Set(found.map((f) => f.companyId).filter((v): v is string => !!v))],
  });
  const visible = await visibleRecordTitles(
    ctx,
    env.registry,
    "deal",
    deals.map((d) => d.id),
  );
  const seen = new Set<string>();
  const suggestions: LinkSuggestion[] = [];
  for (const f of found) {
    if (seen.has(f.personId)) continue;
    seen.add(f.personId);
    suggestions.push({
      ...f,
      deals: deals
        .filter(
          (d) =>
            (d.personId === f.personId || (f.companyId && d.companyId === f.companyId)) &&
            visible[d.id] !== undefined,
        )
        .slice(0, 5)
        .map((d) => ({ id: d.id, title: visible[d.id]! })),
    });
  }
  return { suggestions };
}

type LinkPatch = {
  dealId?: string | null | undefined;
  companyId?: string | null | undefined;
  personId?: string | null | undefined;
};

/** Uloží vazby události. U vazby na obchod (bez úkolu) událost povýší na schůzku v modulu úkolů. */
export async function linkEvent(
  ctx: Ctx,
  env: KalEnv,
  eventId: string,
  patch: LinkPatch,
): Promise<string> {
  const e = await accessibleEvent(ctx, eventId, "write");
  const kinds = [
    ["deal", "dealId"],
    ["company", "companyId"],
    ["person", "personId"],
  ] as const;
  for (const [entity, key] of kinds) {
    const id = patch[key];
    if (id && (await visibleRecordTitles(ctx, env.registry, entity, [id]))[id] === undefined)
      throw new NotFoundError();
  }
  const set: Record<string, string | null> = {};
  for (const [, key] of kinds) if (patch[key] !== undefined) set[key] = patch[key] ?? null;
  await inTx(ctx, async (c) => {
    await c.db
      .update(calendarEvent)
      .set({ ...set, linkedBy: ctx.actor.userId })
      .where(eq(calendarEvent.id, e.event.id));
    await recordAudit(c, {
      action: "update",
      entityType: "calendar_event",
      entityId: e.event.id,
      entityTitle: e.event.title ?? "(bez názvu)",
      isPrivate: e.event.isGooglePrivate,
      summary: "Vazba události na klienta, obchod nebo kontakt",
      context: Object.fromEntries(Object.entries(set).filter(([, v]) => v)),
    });
  });

  const dealId = patch.dealId;
  const tasks = env.services?.optional("tasks");
  if (dealId && tasks && !e.event.taskId && !e.event.isGooglePrivate) {
    // schůzka z Googlu navázaná na obchod = úkol typu Schůzka (historie obchodu, další aktivita)
    const attendeeEmails = e.event.attendees
      .filter((a) => !a.self && a.email.toLowerCase() !== e.account.googleEmail.toLowerCase())
      .map((a) => a.email);
    const { taskId } = await tasks.createMeeting(ctx, {
      title: e.event.title ?? "Schůzka",
      startsAt: e.event.startsAt.toISOString(),
      endsAt: e.event.endsAt.toISOString(),
      allDay: e.event.allDay,
      place: e.event.place,
      attendeeEmails,
      assigneeId: e.account.userId,
      dealId,
      ...((patch.companyId ?? e.event.companyId)
        ? { companyId: (patch.companyId ?? e.event.companyId)! }
        : {}),
      ...((patch.personId ?? e.event.personId)
        ? { personId: (patch.personId ?? e.event.personId)! }
        : {}),
    });
    await ctx.db
      .update(calendarEvent)
      .set({ taskId, source: "opsys" })
      .where(eq(calendarEvent.id, e.event.id));
    try {
      const client = await googleClient(ctx.db, env);
      await withToken(ctx, env, client, e.account, (t) =>
        client.patchEvent(
          t,
          e.calendar.googleId,
          e.event.googleId,
          { extendedProperties: { private: { [TASK_PROP]: taskId, opsysSource: "opsys" } } },
          { sendUpdates: "none" },
        ),
      );
    } catch {
      // značku do Googlu doplní příští zápis úkolu; vazba na úkol je už uložená
    }
    await enqueuePush(ctx.db, taskId);
  }
  return e.event.id;
}
