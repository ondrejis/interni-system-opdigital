import { eq, getTableColumns, inArray, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { schema } from "@rebar/core/db";
import {
  deleteRecord,
  resolveEntity,
  updateRecord,
  type EntityRegistry,
} from "@rebar/core/entities";
import { canSeePrivate } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import type { LinkSuggestion } from "../contract";
import type { TaskForPush } from "./mapping";

/*
  Přístup k cizím datům bez importu cizího modulu (kalendář nemá `ukoly` ani `kontakty` v `dependsOn`):
  úkoly a typy úkolů přes registr entit (tabulka entity, zápis přes engine), účastníci úkolu, e-maily kontaktů a
  otevřené obchody přes čtecí dotazy chráněné `to_regclass` (modul nemusí být zapnutý). Vše je za rozhraním
  `TaskGateway` / `ContactLookup`, takže testy podstrčí fake a po doplnění služeb do jádra (ZADOSTI) se změní jediný soubor.
*/

/** Stav úkolu, jak ho kalendář čte. */
export type TaskState = {
  id: string;
  assigneeId: string | null;
  status: string;
  /** Úkol je smazaný (v koši) nebo neexistuje. */
  gone: boolean;
  /** Typ úkolu je „v kalendáři“ (schůzka, hovor). */
  isCalendarType: boolean;
  /** Úkol s datem (a časem, nebo celodenní), tedy takový, který se dá zapsat do kalendáře. */
  push: TaskForPush | null;
  isPrivate: boolean;
  /** Vazby úkolu (kopírují se do události, aby šly dohledat z obchodu, klienta a kontaktu). */
  links: { dealId: string | null; companyId: string | null; personId: string | null };
};

/** Změna úkolu z kalendáře (přetažení v Googlu). */
export type TaskTimesPatch = {
  dueDate: string;
  dueTime: string | null;
  durationMin: number | null;
  allDay: boolean;
  place?: string | null;
  title?: string;
};

/** Čtení a zápis úkolů z kalendáře. */
export type TaskGateway = {
  load(ctx: Ctx, taskId: string): Promise<TaskState | null>;
  /** Existují tyto úkoly (nesmazané)? */
  existing(ctx: Ctx, ids: string[]): Promise<Set<string>>;
  applyTimes(ctx: Ctx, taskId: string, patch: TaskTimesPatch): Promise<void>;
  /** Změní pole úkolu podle klíčů atributů (`description`, `sendInvites`…). */
  setFields(ctx: Ctx, taskId: string, patch: Record<string, unknown>): Promise<void>;
  remove(ctx: Ctx, taskId: string): Promise<void>;
};

/** Kontakty podle e-mailu a otevřené obchody. */
export type ContactLookup = {
  findByEmails(ctx: Ctx, emails: string[]): Promise<Omit<LinkSuggestion, "deals">[]>;
  emailOfPerson(ctx: Ctx, personId: string): Promise<string | null>;
  openDeals(
    ctx: Ctx,
    q: { personIds: string[]; companyIds: string[] },
  ): Promise<{ id: string; title: string; personId: string | null; companyId: string | null }[]>;
};

const NIL = "00000000-0000-0000-0000-000000000000";
/** Seznam hodnot pro `in (...)` jako parametry (bez skládání SQL z řetězců). */
const list = (values: readonly string[]) =>
  sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  );

const hhmm = (v: unknown): string | null => (typeof v === "string" && v ? v.slice(0, 5) : null);

const tableExists = async (ctx: Ctx, name: string) => {
  const r = await ctx.db.execute(sql`select to_regclass(${name}) is not null as ok`);
  return (r as unknown as { ok: boolean }[])[0]?.ok === true;
};

/** Výchozí implementace: registr entit + čtecí dotazy. `null`, když modul úkolů není zapnutý. */
export function registryTaskGateway(
  registry: EntityRegistry,
  contacts: ContactLookup,
): TaskGateway | null {
  const def = registry.get("task");
  if (!def) return null;
  const typeDef = registry.get("task_type");
  const cols = getTableColumns(def.table) as Record<string, AnyPgColumn>;
  const get = async (ctx: Ctx, id: string) => {
    const [row] = await ctx.db.select().from(def.table).where(eq(cols.id!, id));
    return row as Record<string, unknown> | undefined;
  };
  const calendarTypes = async (ctx: Ctx): Promise<Set<string>> => {
    if (!typeDef) return new Set(["meeting", "call"]);
    const tc = getTableColumns(typeDef.table) as Record<string, AnyPgColumn>;
    const rows = (await ctx.db
      .select({ key: tc.key!, flag: tc.isCalendarEvent!, del: tc.deletedAt! })
      .from(typeDef.table)) as { key: string; flag: boolean; del: Date | null }[];
    return new Set(rows.filter((r) => r.flag && !r.del).map((r) => r.key));
  };
  return {
    async load(ctx, taskId) {
      const r = await get(ctx, taskId);
      if (!r) return null;
      const typeKey = String(r.typeKey ?? "task");
      const isCalendarType = (await calendarTypes(ctx)).has(typeKey);
      const dueDate = typeof r.dueDate === "string" ? r.dueDate : null;
      const dueTime = hhmm(r.dueTime);
      const allDay = r.allDay === true;
      let attendeeEmails: string[] = [];
      if (r.sendInvites === true) attendeeEmails = await attendeeEmailsOf(ctx, taskId, contacts);
      const push: TaskForPush | null = dueDate
        ? {
            id: taskId,
            title: String(r.title ?? ""),
            typeKey,
            description: (r.description as string | null) ?? null,
            place: (r.place as string | null) ?? null,
            dueDate,
            dueTime: allDay ? null : dueTime,
            durationMin: (r.durationMin as number | null) ?? null,
            allDay,
            isPrivate: r.isPrivate === true,
            sendInvites: r.sendInvites === true,
            attendeeEmails,
          }
        : null;
      return {
        id: taskId,
        assigneeId: (r.assigneeId as string | null) ?? null,
        status: String(r.status ?? "todo"),
        gone: !!r.deletedAt,
        isCalendarType,
        push,
        isPrivate: r.isPrivate === true,
        links: {
          dealId: (r.dealId as string | null) ?? null,
          companyId: (r.companyId as string | null) ?? null,
          personId: (r.personId as string | null) ?? null,
        },
      };
    },
    async existing(ctx, ids) {
      if (!ids.length) return new Set();
      const rows = (await ctx.db
        .select({ id: cols.id!, del: cols.deletedAt! })
        .from(def.table)
        .where(inArray(cols.id!, ids))) as { id: string; del: Date | null }[];
      return new Set(rows.filter((r) => !r.del).map((r) => r.id));
    },
    async applyTimes(ctx, taskId, p) {
      const e = await resolveEntity(ctx.db, def);
      await updateRecord(ctx, registry, e, taskId, {
        dueDate: p.dueDate,
        dueTime: p.dueTime,
        durationMin: p.durationMin,
        allDay: p.allDay,
        ...(p.place !== undefined ? { place: p.place } : {}),
        ...(p.title !== undefined ? { title: p.title } : {}),
      });
    },
    async setFields(ctx, taskId, patch) {
      const e = await resolveEntity(ctx.db, def);
      await updateRecord(ctx, registry, e, taskId, patch);
    },
    async remove(ctx, taskId) {
      const e = await resolveEntity(ctx.db, def);
      await deleteRecord(ctx, e, taskId);
    },
  };
}

/** E-maily účastníků úkolu (uživatelé, kontakty, adresy). */
async function attendeeEmailsOf(
  ctx: Ctx,
  taskId: string,
  contacts: ContactLookup,
): Promise<string[]> {
  if (!(await tableExists(ctx, "task_attendee"))) return [];
  const rows = (await ctx.db.execute(
    sql`select kind, ref from task_attendee where task_id = ${taskId} and deleted_at is null`,
  )) as unknown as { kind: string; ref: string }[];
  const out: string[] = [];
  for (const r of rows) {
    if (r.kind === "email") out.push(r.ref);
    else if (r.kind === "user") {
      const [u] = await ctx.db
        .select({ email: schema.user.email })
        .from(schema.user)
        .where(eq(schema.user.id, r.ref));
      if (u?.email) out.push(u.email);
    } else if (r.kind === "person") {
      const e = await contacts.emailOfPerson(ctx, r.ref);
      if (e) out.push(e);
    }
  }
  return out;
}

/** Výchozí `ContactLookup`: čtecí dotazy do tabulek kontaktů a obchodů, soukromé záznamy jen pro toho, kdo je smí vidět. */
export const sqlContactLookup: ContactLookup = {
  async findByEmails(ctx, emails) {
    const norm = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    if (!norm.length || !(await tableExists(ctx, "person_contact_point"))) return [];
    const priv = canSeePrivate(ctx) ? sql`` : sql`and not p.is_private`;
    const rows = (await ctx.db.execute(sql`
      select pcp.value_norm as email, p.id as "personId",
             btrim(coalesce(p.first_name, '') || ' ' || p.last_name) as "personName",
             c.id as "companyId", c.name as "companyName"
      from person_contact_point pcp
      join person p on p.id = pcp.person_id and p.deleted_at is null ${priv}
      left join company c on c.id = p.primary_company_id and c.deleted_at is null
        ${canSeePrivate(ctx) ? sql`` : sql`and not c.is_private`}
      where pcp.kind = 'email' and pcp.deleted_at is null
        and pcp.value_norm in (${list(norm)})
      order by pcp.is_primary desc
    `)) as unknown as Omit<LinkSuggestion, "deals">[];
    return rows;
  },
  async emailOfPerson(ctx, personId) {
    if (!(await tableExists(ctx, "person_contact_point"))) return null;
    const rows = (await ctx.db.execute(sql`
      select value from person_contact_point
      where person_id = ${personId} and kind = 'email' and deleted_at is null
      order by is_primary desc, position limit 1`)) as unknown as { value: string }[];
    return rows[0]?.value ?? null;
  },
  async openDeals(ctx, q) {
    if ((!q.personIds.length && !q.companyIds.length) || !(await tableExists(ctx, "deal")))
      return [];
    const priv = canSeePrivate(ctx) ? sql`` : sql`and not is_private`;
    const rows = (await ctx.db.execute(sql`
      select id, title, person_id as "personId", company_id as "companyId" from deal
      where deleted_at is null and result = 'open' ${priv}
        and (person_id in (${list(q.personIds.length ? q.personIds : [NIL])})
          or company_id in (${list(q.companyIds.length ? q.companyIds : [NIL])}))
      order by updated_at desc limit 50`)) as unknown as {
      id: string;
      title: string;
      personId: string | null;
      companyId: string | null;
    }[];
    return rows;
  },
};
