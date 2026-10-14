import { z } from "zod";
import { defineCommand, type ModuleDeps } from "@rebar/core/module-server";
import { NotFoundError, type Ctx } from "@rebar/core/rbac";
import { createNote, deleteNote, pinNote, toNoteDtos, updateNote } from "./notes";
import { getActivityDto, listForDeal, listMine, listUpcoming } from "./queries";
import {
  completeActivity,
  createActivity,
  deleteActivity,
  listActivityTypes,
  reopenActivity,
  snoozeActivity,
  toActivityDtos,
  toTypeDto,
  updateActivity,
  type ActivityRow,
  type CreateActivityInput,
} from "./service";
import { buildTimeline } from "./timeline";
import { ACTIVITY_PRIORITIES, ACTIVITY_RANGES, type CompleteResult } from "./types";

/* Příkazy aktivit a poznámek (`crm.activity.*`, `crm.note.*`, `crm.timeline.get`). Čtení vyžaduje `poptavky.read`, zápis
   `poptavky.write` (rozsah „jen moje“ hlídá datová vrstva: přiřazeno mně nebo vlastník zakázky). */

const id = z.object({ id: z.uuid() });
const isoInstant = z.iso.datetime({ offset: true });

/** Text, který smí chybět; prázdný řetězec se uloží jako „nic“ (`null`), nezadaný zůstane nezadaný (patch). */
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v ? v : null));

const activityFields = {
  /** Typ podle klíče (`call`, `meeting`, `task`, `deadline`, `email`, `site_visit`) nebo podle id. */
  typeKey: z.string().trim().min(1).max(40).optional(),
  typeId: z.uuid().optional(),
  subject: z.string().trim().min(1, "Vyplňte předmět aktivity.").max(200),
  /** Termín jako ISO čas s pásmem; u aktivity na celý den stačí libovolný čas toho dne (uloží se půlnoc pražského času). */
  dueAt: isoInstant.nullish(),
  allDay: z.boolean().optional(),
  durationMin: z.number().int().min(1).max(1440).nullish(),
  priority: z.enum(ACTIVITY_PRIORITIES).optional(),
  location: optText(300),
  note: optText(5000),
  /** Bez hodnoty se aktivita přiřadí tomu, kdo ji zakládá; `null` = nepřiřazeno. */
  assigneeId: z.uuid().nullish(),
  jobId: z.uuid().nullish(),
  companyId: z.uuid().nullish(),
  personId: z.uuid().nullish(),
};

const createInput = z.object({
  ...activityFields,
  /** Založí aktivitu rovnou jako hotovou (zalogovaný hovor). */
  done: z.boolean().optional(),
  outcome: optText(2000),
});

const updateInput = z
  .object({ ...activityFields, outcome: optText(2000) })
  .partial()
  .extend({ id: z.uuid() });

const target = {
  jobId: z.uuid().optional(),
  companyId: z.uuid().optional(),
  personId: z.uuid().optional(),
};
const hasTarget = (v: { jobId?: string; companyId?: string; personId?: string }) =>
  !!(v.jobId || v.companyId || v.personId);
const needTarget = "Zadejte zakázku, firmu nebo osobu.";

const toDate = (v: string | null | undefined): Date | null | undefined =>
  v ? new Date(v) : (v as null | undefined);

function toCreate(i: z.output<typeof createInput>): CreateActivityInput {
  return { ...i, dueAt: toDate(i.dueAt) };
}

const activityOut = async (ctx: Ctx, deps: ModuleDeps, row: ActivityRow) =>
  (await toActivityDtos(ctx, deps.registry, [row]))[0]!;

/* ---------- aktivity ---------- */

export const typesCommand = defineCommand({
  name: "crm.activity.types",
  permission: "poptavky.read",
  input: z.object({}),
  handler: async (ctx) => (await listActivityTypes(ctx.db)).map(toTypeDto),
});

export const getCommand = defineCommand({
  name: "crm.activity.get",
  permission: "poptavky.read",
  input: id,
  handler: async (ctx, i, deps) => {
    const dto = await getActivityDto(ctx, deps.registry, i.id);
    if (!dto) throw new NotFoundError("Aktivita nenalezena.");
    return dto;
  },
});

export const createCommand = defineCommand({
  name: "crm.activity.create",
  permission: "poptavky.write",
  input: createInput,
  handler: async (ctx, i, deps) => activityOut(ctx, deps, await createActivity(ctx, toCreate(i))),
});

export const updateCommand = defineCommand({
  name: "crm.activity.update",
  permission: "poptavky.write",
  input: updateInput,
  handler: async (ctx, { id: activityId, ...patch }, deps) => {
    const row = await updateActivity(ctx, activityId, {
      ...patch,
      dueAt: toDate(patch.dueAt),
    });
    return activityOut(ctx, deps, row);
  },
});

export const completeCommand = defineCommand({
  name: "crm.activity.complete",
  permission: "poptavky.write",
  input: z.object({
    id: z.uuid(),
    /** Výsledek aktivity („Dovolal jsem se, pošle podklady“). */
    outcome: optText(2000),
    /** Další aktivita, kterou lze naplánovat rovnou; bez ní se vrátí jen návrh. */
    next: createInput.nullish(),
  }),
  handler: async (ctx, i, deps): Promise<CompleteResult> => {
    const r = await completeActivity(ctx, i.id, {
      outcome: i.outcome,
      next: i.next ? toCreate(i.next) : null,
    });
    const dtos = await toActivityDtos(ctx, deps.registry, r.next ? [r.row, r.next] : [r.row]);
    return { activity: dtos[0]!, suggestion: r.suggestion, next: dtos[1] ?? null };
  },
});

export const snoozeCommand = defineCommand({
  name: "crm.activity.snooze",
  permission: "poptavky.write",
  input: z
    .object({
      id: z.uuid(),
      /** Nový termín (ISO čas), nebo… */
      dueAt: isoInstant.optional(),
      /** …o kolik dní od dneška (hodina zůstává). */
      days: z.number().int().min(1).max(365).optional(),
    })
    .refine((v) => v.dueAt || v.days, "Zadejte nový termín nebo počet dní."),
  handler: async (ctx, i, deps) => {
    const row = await snoozeActivity(ctx, i.id, {
      dueAt: i.dueAt ? new Date(i.dueAt) : undefined,
      days: i.days,
    });
    return activityOut(ctx, deps, row);
  },
});

export const reopenCommand = defineCommand({
  name: "crm.activity.reopen",
  permission: "poptavky.write",
  input: id,
  handler: async (ctx, i, deps) => activityOut(ctx, deps, await reopenActivity(ctx, i.id)),
});

export const deleteCommand = defineCommand({
  name: "crm.activity.delete",
  permission: "poptavky.write",
  input: id,
  handler: async (ctx, i) => {
    await deleteActivity(ctx, i.id);
    return { id: i.id };
  },
});

export const listForDealCommand = defineCommand({
  name: "crm.activity.listForDeal",
  permission: "poptavky.read",
  input: z.object({
    jobId: z.uuid(),
    include: z.enum(["open", "done", "all"]).optional(),
    limit: z.number().int().min(1).max(500).optional(),
  }),
  handler: (ctx, i, deps) =>
    listForDeal(ctx, deps.registry, i.jobId, {
      ...(i.include ? { include: i.include } : {}),
      ...(i.limit ? { limit: i.limit } : {}),
    }),
});

export const listUpcomingCommand = defineCommand({
  name: "crm.activity.listUpcoming",
  permission: "poptavky.read",
  input: z
    .object({
      ...target,
      aggregate: z.boolean().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    })
    .refine(hasTarget, needTarget),
  handler: (ctx, i, deps) =>
    listUpcoming(
      ctx,
      deps.registry,
      { jobId: i.jobId, companyId: i.companyId, personId: i.personId },
      { aggregate: i.aggregate === true, ...(i.limit ? { limit: i.limit } : {}) },
    ),
});

export const listMineCommand = defineCommand({
  name: "crm.activity.listMine",
  permission: "poptavky.read",
  input: z.object({
    /** `mine` (výchozí) = přiřazené mně, `all` = vše, co smím vidět. */
    scope: z.enum(["mine", "all"]).optional(),
    range: z.enum(ACTIVITY_RANGES).optional(),
    typeKey: z.string().trim().min(1).max(40).optional(),
    limit: z.number().int().min(1).max(500).optional(),
    offset: z.number().int().min(0).max(100_000).optional(),
  }),
  handler: (ctx, i, deps) =>
    listMine(ctx, deps.registry, {
      ...(i.scope ? { scope: i.scope } : {}),
      ...(i.range ? { range: i.range } : {}),
      ...(i.typeKey ? { typeKey: i.typeKey } : {}),
      ...(i.limit ? { limit: i.limit } : {}),
      ...(i.offset ? { offset: i.offset } : {}),
    }),
});

/* ---------- časová osa ---------- */

export const timelineCommand = defineCommand({
  name: "crm.timeline.get",
  permission: "poptavky.read",
  input: z
    .object({
      ...target,
      /** U firmy a osoby sbírá dění ze všech jejích zakázek (a osob firmy). */
      aggregate: z.boolean().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    })
    .refine(hasTarget, needTarget),
  handler: (ctx, i, deps) =>
    buildTimeline(
      ctx,
      deps.registry,
      { jobId: i.jobId, companyId: i.companyId, personId: i.personId },
      { aggregate: i.aggregate === true, ...(i.limit ? { limit: i.limit } : {}) },
    ),
});

/* ---------- poznámky ---------- */

const noteBody = z
  .string()
  .trim()
  .min(1, "Napište poznámku.")
  .max(10_000, "Poznámka je příliš dlouhá.");

export const noteCreateCommand = defineCommand({
  name: "crm.note.create",
  permission: "poptavky.write",
  input: z.object({
    entityType: z.enum(["job", "company", "person"]),
    entityId: z.uuid(),
    body: noteBody,
    pinned: z.boolean().optional(),
  }),
  handler: async (ctx, i) => (await toNoteDtos(ctx, [await createNote(ctx, i)]))[0]!,
});

export const noteUpdateCommand = defineCommand({
  name: "crm.note.update",
  permission: "poptavky.write",
  input: z.object({ id: z.uuid(), body: noteBody }),
  handler: async (ctx, i) => (await toNoteDtos(ctx, [await updateNote(ctx, i.id, i.body)]))[0]!,
});

export const noteDeleteCommand = defineCommand({
  name: "crm.note.delete",
  permission: "poptavky.write",
  input: id,
  handler: async (ctx, i) => {
    await deleteNote(ctx, i.id);
    return { id: i.id };
  },
});

export const notePinCommand = defineCommand({
  name: "crm.note.pin",
  permission: "poptavky.write",
  input: z.object({ id: z.uuid(), pinned: z.boolean() }),
  handler: async (ctx, i) => (await toNoteDtos(ctx, [await pinNote(ctx, i.id, i.pinned)]))[0]!,
});

export const activityCommands = [
  typesCommand,
  getCommand,
  createCommand,
  updateCommand,
  completeCommand,
  snoozeCommand,
  reopenCommand,
  deleteCommand,
  listForDealCommand,
  listUpcomingCommand,
  listMineCommand,
  timelineCommand,
  noteCreateCommand,
  noteUpdateCommand,
  noteDeleteCommand,
  notePinCommand,
];
