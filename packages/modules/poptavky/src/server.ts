import { area as activitiesArea } from "./crm/activities";
import { area as boardArea } from "./crm/board";
import { area as viewsArea } from "./crm/views";
import { area as inboxArea } from "./crm/inbox";
import { area as todayArea } from "./crm/today";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@rebar/core/audit";
import { getLookup, getPipeline } from "@rebar/core/config-data";
import { schema, type Db } from "@rebar/core/db";
import {
  countActive,
  createRecord,
  defineEntity,
  type DeleteBlocker,
  getRecord,
  queryRecords,
  resolveEntity,
  updateRecord,
} from "@rebar/core/entities";
import {
  defineCommand,
  defineModuleServer,
  mergeServers,
  type ModuleDeps,
} from "@rebar/core/module-server";
import { notify } from "@rebar/core/notifications";
import { inTx, NotFoundError, systemCtx, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { formatMinor } from "@rebar/core/shared";
import { crmCommands } from "./crm/deals/commands";
import { stripControlChars } from "./crm/inbox/csv";
import { newCompanyData, resolveQualifyContacts } from "./crm/deals/qualify";
import { createFirstActivity, firstActivityInput } from "./crm/deals/first-activity";
import { crmHooks } from "./crm/hooks";
import { ensureCrmDefaults } from "./crm/seed";
import { INQUIRY_ASSIGNED, INQUIRY_NEW } from "./notifications";
import { dashboardMetrics } from "./metrics";
import { inquiry, intakeKey, intakeLog } from "./schema";

export const INQUIRY_PIPELINE = { entityType: "inquiry", key: "default" } as const;
export const SOURCE_LOOKUP = "inquiry.source";
export const LOST_LOOKUP = "inquiry.lost_reason";

/** Poptávka je přidělená (nebo předaná) jinému obchodníkovi, než který změnu udělal: upozorní se. */
async function notifyAssigned(ctx: Ctx, row: Record<string, unknown>) {
  const ownerId = row.ownerId as string | null;
  if (!ownerId) return;
  await notify(ctx.db, INQUIRY_ASSIGNED, {
    params: {
      title: String(row.title ?? ""),
      contact: [row.contactName, row.companyName].filter(Boolean).join(" · "),
      nextStep: row.nextStep as string | null,
    },
    to: { owner: [ownerId] },
    record: { id: String(row.id) },
    actorId: ctx.actor.userId,
  });
}

/** Poptávka. Vlastník (obchodník) ji vidí i při oprávnění „jen moje“. */
export const inquiryEntity = defineEntity({
  key: "inquiry",
  listPath: "/poptavky",
  module: "poptavky",
  label: { one: "Poptávka", many: "Poptávky" },
  table: inquiry,
  titleKey: "title",
  statusKey: "stage",
  permissions: { read: "poptavky.read", write: "poptavky.write" },
  ownerColumns: [inquiry.ownerId],
  ownerDefaults: (ctx) => ({ owner: ctx.actor.userId }),
  beforeCreate: async (ctx, values) => {
    const out = { ...values };
    if (!out.stage) {
      const pipeline = await getPipeline(ctx.db, INQUIRY_PIPELINE.entityType, INQUIRY_PIPELINE.key);
      const first = pipeline?.stages.find((s) => s.kind === "open") ?? pipeline?.stages[0];
      if (first) out.stage = first.id;
    }
    return out;
  },
  afterCreate: async (ctx, created) => {
    await notifyAssigned(ctx, created);
  },
  afterUpdate: async (ctx, before, after) => {
    if (before.ownerId !== after.ownerId) await notifyAssigned(ctx, after);
    if (before.stageId === after.stageId && before.lostReason === after.lostReason) return;
    const kinds = await stageKinds(ctx, [String(before.stageId), String(after.stageId)]);
    const was = kinds.get(String(before.stageId));
    const now = kinds.get(String(after.stageId));
    if (now === "lost" && !after.lostReason) throw new UserError("Vyplňte důvod prohry.");
    if (was === "won" && now !== "won")
      throw new UserError("Kvalifikovanou poptávku nejde vrátit zpět (už se z ní stala zakázka).");
    if (now === "won" && !after.convertedJobId && was !== "won")
      throw new UserError("Poptávka se kvalifikuje převodem na zakázku (tlačítko Kvalifikovat).");
  },
  attributes: [
    {
      key: "title",
      label: "Název",
      type: "text",
      field: "title",
      required: true,
      width: 280,
      defaultVisible: true,
    },
    {
      key: "stage",
      label: "Stav",
      type: "status",
      field: "stageId",
      pipeline: INQUIRY_PIPELINE,
      required: true,
      width: 160,
      defaultVisible: true,
    },
    {
      key: "company",
      label: "Firma",
      type: "record",
      field: "companyId",
      record: { entityType: "company" },
      width: 220,
      defaultVisible: true,
    },
    { key: "companyName", label: "Firma (text)", type: "text", field: "companyName", width: 200 },
    {
      key: "person",
      label: "Kontaktní osoba",
      type: "record",
      field: "personId",
      record: { entityType: "person" },
      width: 200,
    },
    { key: "contactName", label: "Jméno kontaktu", type: "text", field: "contactName", width: 180 },
    { key: "contactEmail", label: "E-mail", type: "email", field: "contactEmail", width: 200 },
    { key: "contactPhone", label: "Telefon", type: "phone", field: "contactPhone", width: 150 },
    {
      key: "source",
      label: "Zdroj",
      type: "select",
      field: "source",
      lookup: SOURCE_LOOKUP,
      width: 140,
      defaultVisible: true,
    },
    { key: "sourceChannel", label: "Kanál", type: "text", field: "sourceChannel", width: 150 },
    { key: "campaign", label: "Kampaň", type: "text", field: "campaign", width: 170 },
    {
      key: "value",
      label: "Odhad hodnoty",
      min: 0,
      type: "currency",
      field: "expectedValueMinor",
      aggregate: ["sum"],
      width: 150,
      defaultVisible: true,
    },
    {
      key: "owner",
      label: "Obchodník",
      type: "user",
      field: "ownerId",
      width: 160,
      defaultVisible: true,
    },
    { key: "nextStep", label: "Další krok", type: "text", field: "nextStep", width: 240 },
    {
      key: "nextStepAt",
      label: "Termín kroku",
      type: "date",
      field: "nextStepAt",
      width: 130,
      defaultVisible: true,
    },
    {
      key: "lostReason",
      label: "Důvod prohry",
      type: "select",
      field: "lostReason",
      lookup: LOST_LOOKUP,
      width: 160,
    },
    { key: "message", label: "Původní zpráva", type: "longtext", field: "message", width: 320 },
    {
      key: "receivedAt",
      label: "Přijato",
      type: "date",
      field: "createdAt",
      readonly: true,
      width: 130,
    },
    {
      key: "convertedJob",
      label: "Vznikla zakázka",
      type: "record",
      field: "convertedJobId",
      record: { entityType: "job" },
      readonly: true,
      width: 200,
    },
  ],
  search: (r) => ({
    title: String(r.title),
    ...(r.companyName || r.contactName ? { subtitle: String(r.companyName ?? r.contactName) } : {}),
    extra: [r.contactEmail, r.contactPhone].filter(Boolean).join(" "),
  }),
  url: (id) => `/poptavky/${id}`,
});

async function stageKinds(ctx: Ctx, ids: string[]) {
  const rows = await ctx.db
    .select({ id: schema.pipelineStage.id, kind: schema.pipelineStage.kind })
    .from(schema.pipelineStage)
    .where(inArray(schema.pipelineStage.id, ids));
  return new Map(rows.map((r) => [r.id, r.kind]));
}

async function stageOfKind(ctx: Ctx, kind: "won" | "lost" | "open") {
  const pipeline = await getPipeline(ctx.db, INQUIRY_PIPELINE.entityType, INQUIRY_PIPELINE.key);
  const stage = pipeline?.stages.find((s) => s.kind === kind);
  if (!stage)
    throw new UserError(`Pipeline poptávek nemá stav typu „${kind}“. Doplňte ho v nastavení.`);
  return stage.id;
}

/* ---------- převod na zakázku, prohra ---------- */

const idInput = z.object({ id: z.uuid() });

/**
 * Kvalifikace poptávky (příkaz zůstal pod původním jménem `poptavky.convert` kvůli kompatibilitě): jedním krokem
 * určí firmu a kontaktní osobu (vybranou, existující podle IČO, e-mailu a telefonu, nebo novou), založí zakázku
 * (číslo ze série) v prvním stavu fáze poptávka a poptávku označí jako kvalifikovanou (stav typu „vyhráno“). Volitelně
 * přijme data první aktivity. Vše v jedné transakci. Vyžaduje zapnutý modul zakázek.
 *
 * Duplicity: `duplicates` = `ask` (výchozí; shoda v e-mailu nebo telefonu skončí větou, která duplicitu pojmenuje),
 * `use` (použije nalezený záznam), `create` (založí nový). Shoda v IČO použije existující firmu vždy.
 */
export const convertCommand = defineCommand({
  name: "poptavky.convert",
  permission: "poptavky.convert",
  input: z.object({
    id: z.uuid(),
    companyId: z.uuid().optional(),
    personId: z.uuid().optional(),
    title: z.string().trim().min(2).max(200).optional(),
    /** IČO nové firmy (poptávka ho nenese); slouží i ke hledání duplicit. */
    ico: z.string().trim().max(20).optional(),
    duplicates: z.enum(["ask", "use", "create"]).default("ask"),
    /** Údaje nové firmy (např. z ARES); použijí se jen, když firma teprve vzniká. */
    companyData: newCompanyData.optional(),
    /** Datový tvar první aktivity; vytvoření doplňuje oblast Aktivity (`createFirstActivity`). */
    firstActivity: firstActivityInput.optional(),
  }),
  handler: async (ctx, input, deps) => {
    // prohranou poptávku nejde kvalifikovat (hlídá server, ne jen tlačítko v UI)
    const [current] = await ctx.db
      .select({ stageId: inquiry.stageId })
      .from(inquiry)
      .where(eq(inquiry.id, input.id));
    if (
      current?.stageId &&
      (await stageKinds(ctx, [current.stageId])).get(current.stageId) === "lost"
    )
      throw new UserError("Zamítnutou poptávku nejde kvalifikovat.");
    const jobDef = deps.registry.get("job");
    if (!jobDef) throw new UserError("Modul Zakázky není zapnutý, poptávku nejde převést.");
    const inquiryE = await resolveEntity(ctx.db, inquiryEntity);
    const jobE = await resolveEntity(ctx.db, jobDef);

    return inTx(ctx, async (c) => {
      const { row } = await getRecord(c, deps.registry, inquiryE, input.id);
      if (row.convertedJob) throw new UserError("Tato poptávka už je převedená na zakázku.");

      const { companyId, personId } = await resolveQualifyContacts(c, deps.registry, row, {
        companyId: input.companyId,
        personId: input.personId,
        ico: input.ico,
        duplicates: input.duplicates,
        companyData: input.companyData,
      });

      // Zakázka vzniká v prvním stavu fáze „Poptávka“ (nabídka teprve vznikne: u poptávky chybí adresa stavby, kterou
      // přechod do nabídky vyžaduje). Odhad hodnoty se stane původní smluvní cenou, zdroj se přenese.
      const job = await createRecord(c, deps.registry, jobE, {
        title: input.title ?? row.title,
        company: companyId,
        ...(personId ? { person: personId } : {}),
        value: row.value ?? 0,
        manager: (row.owner as string | null) ?? c.actor.userId,
        sourceInquiry: input.id,
        ...(row.message ? { description: row.message } : {}),
        ...(row.source ? { crmSource: row.source } : {}),
        ...(row.sourceChannel ? { crmSourceChannel: row.sourceChannel } : {}),
        ...(row.campaign ? { crmCampaign: row.campaign } : {}),
      });

      const wonStage = await stageOfKind(c, "won");
      await c.db
        .update(inquiry)
        .set({
          convertedJobId: job.row.id,
          stageId: wonStage,
          companyId,
          ...(personId ? { personId } : {}),
          updatedBy: c.actor.userId,
        })
        .where(eq(inquiry.id, input.id));
      await recordAudit(c, {
        action: "update",
        entityType: "inquiry",
        entityId: input.id,
        summary: `Kvalifikováno: vznikla zakázka ${String(job.row.number ?? "")}`.trim(),
        changes: [{ field: "Vznikla zakázka", old: null, new: String(job.row.title) }],
      });
      const activity = input.firstActivity
        ? await createFirstActivity(
            c,
            { jobId: job.row.id, companyId, personId },
            input.firstActivity,
          )
        : null;
      await deps.emit("poptavky.converted", { id: input.id, jobId: job.row.id });
      return { jobId: job.row.id, companyId, personId, firstActivityId: activity?.id ?? null };
    });
  },
});

/** Prohra: stav „prohráno“ a důvod z číselníku. Důvod je povinný (hlídá to i entita). */
export const markLostCommand = defineCommand({
  name: "poptavky.markLost",
  permission: "poptavky.write",
  input: z.object({ id: z.uuid(), reason: z.string().min(1).max(60) }),
  handler: async (ctx, input, deps) => {
    const reasons = await getLookup(ctx.db, LOST_LOOKUP);
    if (!reasons.some((r) => r.value === input.reason))
      throw new UserError("Vyberte důvod prohry ze seznamu.");
    const lost = await stageOfKind(ctx, "lost");
    await updateRecord(ctx, deps.registry, await resolveEntity(ctx.db, inquiryEntity), input.id, {
      stage: lost,
      lostReason: input.reason,
    });
  },
});

/* ---------- příjem poptávek (webhook, formulář) ---------- */

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** Odstraní řídicí znaky (kromě odřádkování a tabulátoru), které do poptávky nepatří. */
const stripControl = (v: string) => stripControlChars(v);
const text = (max: number) => z.string().trim().max(max).transform(stripControl);

export const intakePayload = z.object({
  name: text(200).pipe(z.string().min(1, "Vyplňte jméno.")),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(z.email("Neplatný e-mail.").optional()),
  phone: text(40).optional(),
  company: text(200).optional(),
  message: text(5000).optional(),
  title: text(200).optional(),
  source: z.string().trim().max(40).optional(),
  /** UTM značky z adresy, na které návštěvník formulář vyplnil (kanál = zdroj a médium, kampaň). */
  utm_source: text(80).optional(),
  utm_medium: text(80).optional(),
  utm_campaign: text(120).optional(),
  /** Skrytá past pro roboty: lidský návštěvník ji nevyplní (pole se ve formuláři schová stylem, ne `type=hidden`). */
  _hp: z.string().max(500).optional(),
});

/** Kanál a kampaň z UTM značek poptávky (prázdné hodnoty se vynechají). */
export function utmOf(p: z.output<typeof intakePayload>): {
  sourceChannel?: string;
  campaign?: string;
} {
  const channel = [p.utm_source, p.utm_medium].filter(Boolean).join(" / ");
  return {
    ...(channel ? { sourceChannel: channel.slice(0, 160) } : {}),
    ...(p.utm_campaign ? { campaign: p.utm_campaign } : {}),
  };
}

/** Nejvyšší velikost těla požadavku příjmu poptávek (bajty); větší se odmítne dřív, než se zpracuje. */
export const INTAKE_MAX_BYTES = 32 * 1024;

export class IntakeAuthError extends Error {}

/**
 * Příjem poptávky z webu: ověří klíč (v databázi je jen hash), založí poptávku jako „systém“, upozorní obchodníky
 * a zapíše záznam o příjmu. Selhání se zapisují také (bez klíče).
 */
export async function receiveInquiry(
  db: Db,
  deps: Pick<ModuleDeps, "registry" | "baseURL">,
  key: string,
  payload: unknown,
  ip: string | null,
): Promise<{ id: string; spam?: boolean }> {
  const [row] = await db
    .select()
    .from(intakeKey)
    .where(and(eq(intakeKey.keyHash, sha256(key)), isNull(intakeKey.revokedAt)));
  if (!row) {
    await db.insert(intakeLog).values({ outcome: "invalid_key", ip });
    throw new IntakeAuthError("Neplatný klíč.");
  }
  const parsed = intakePayload.safeParse(payload);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Neplatná data.";
    await db.insert(intakeLog).values({ keyId: row.id, outcome: "invalid", ip, error: message });
    throw new UserError(message);
  }
  const p = parsed.data;
  // past pro roboty: vyplněné skryté pole = spam; tváříme se, že vše proběhlo, ať robot nezkouší dál
  if (p._hp) {
    await db
      .insert(intakeLog)
      .values({ keyId: row.id, outcome: "spam", ip, error: "Vyplněné skryté pole." });
    return { id: crypto.randomUUID(), spam: true };
  }
  const ctx = systemCtx(db);
  const sources = await getLookup(db, SOURCE_LOOKUP);
  const source = sources.some((s) => s.value === p.source) ? p.source : "web";

  // dvojité odeslání formuláře (dvojklik, obnovení stránky): stejný kontakt a text během deseti minut vrátí původní poptávku
  const key2 = p.email ?? p.phone;
  if (key2) {
    const [dupe] = await db
      .select({ id: inquiry.id })
      .from(inquiry)
      .where(
        and(
          isNull(inquiry.deletedAt),
          p.email ? eq(inquiry.contactEmail, p.email) : eq(inquiry.contactPhone, p.phone!),
          p.message ? eq(inquiry.message, p.message) : isNull(inquiry.message),
          gt(inquiry.createdAt, new Date(Date.now() - 10 * 60_000)),
        ),
      )
      .limit(1);
    if (dupe) {
      await db
        .insert(intakeLog)
        .values({ keyId: row.id, outcome: "duplicate", inquiryId: dupe.id, ip });
      return { id: dupe.id };
    }
  }

  const created = await createRecord(ctx, deps.registry, await resolveEntity(db, inquiryEntity), {
    title: p.title || `Poptávka: ${p.company || p.name}`,
    contactName: p.name,
    ...(p.email ? { contactEmail: p.email } : {}),
    ...(p.phone ? { contactPhone: p.phone } : {}),
    ...(p.company ? { companyName: p.company } : {}),
    ...(p.message ? { message: p.message } : {}),
    ...utmOf(p),
    source,
  });

  // záznam o příjmu a upozornění vznikají spolu: lidem, kteří poptávky spravují (role s oprávněním a majitelé)
  await db.transaction(async (tx) => {
    await tx.update(intakeKey).set({ lastUsedAt: new Date() }).where(eq(intakeKey.id, row.id));
    await tx
      .insert(intakeLog)
      .values({ keyId: row.id, outcome: "ok", inquiryId: created.row.id, ip });
    await notify(tx, INQUIRY_NEW, {
      params: {
        title: String(created.row.title),
        contact: [p.name, p.company].filter(Boolean).join(" · "),
        message: p.message?.slice(0, 200),
      },
      record: { id: created.row.id },
    });
  });
  return { id: created.row.id };
}

/* ---------- správa klíčů příjmu ---------- */

export const intakeKeysCommand = defineCommand({
  name: "poptavky.intakeKeys",
  permission: "poptavky.intake",
  input: z.object({}),
  handler: async (ctx) => {
    const keys = await ctx.db
      .select({
        id: intakeKey.id,
        name: intakeKey.name,
        prefix: intakeKey.prefix,
        lastUsedAt: intakeKey.lastUsedAt,
        revokedAt: intakeKey.revokedAt,
        createdAt: intakeKey.createdAt,
      })
      .from(intakeKey)
      .where(isNull(intakeKey.deletedAt))
      .orderBy(desc(intakeKey.createdAt));
    const log = await ctx.db.select().from(intakeLog).orderBy(desc(intakeLog.receivedAt)).limit(50);
    return {
      keys: keys.map((k) => ({
        ...k,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        revokedAt: k.revokedAt?.toISOString() ?? null,
        createdAt: k.createdAt.toISOString(),
      })),
      log: log.map((l) => ({
        id: l.id,
        receivedAt: l.receivedAt.toISOString(),
        outcome: l.outcome,
        inquiryId: l.inquiryId,
        error: l.error,
      })),
    };
  },
});

export const createIntakeKeyCommand = defineCommand({
  name: "poptavky.createIntakeKey",
  permission: "poptavky.intake",
  input: z.object({ name: z.string().trim().min(2, "Pojmenujte klíč.").max(80) }),
  handler: async (ctx, input) => {
    const secret = `pq_${randomBytes(24).toString("base64url")}`;
    return inTx(ctx, async (c) => {
      const [row] = await c.db
        .insert(intakeKey)
        .values({
          name: input.name,
          keyHash: sha256(secret),
          prefix: secret.slice(0, 7),
          createdBy: c.actor.userId,
          updatedBy: c.actor.userId,
        })
        .returning({ id: intakeKey.id });
      await recordAudit(c, {
        action: "create",
        entityType: "inquiry_intake_key",
        entityId: row!.id,
        summary: `Klíč příjmu poptávek: ${input.name}`,
      });
      // celý klíč se ukáže jen teď; uloží se pouze jeho hash
      return { id: row!.id, secret };
    });
  },
});

export const revokeIntakeKeyCommand = defineCommand({
  name: "poptavky.revokeIntakeKey",
  permission: "poptavky.intake",
  input: idInput,
  handler: async (ctx, input) => {
    await inTx(ctx, async (c) => {
      const [row] = await c.db
        .update(intakeKey)
        .set({ revokedAt: new Date(), updatedBy: c.actor.userId })
        .where(and(eq(intakeKey.id, input.id), isNull(intakeKey.revokedAt)))
        .returning({ id: intakeKey.id, name: intakeKey.name });
      if (!row) throw new NotFoundError("Klíč nenalezen nebo už je zrušený.");
      await recordAudit(c, {
        action: "revoke",
        entityType: "inquiry_intake_key",
        entityId: row.id,
        summary: `Klíč příjmu poptávek zrušen: ${row.name}`,
      });
    });
  },
});

/* ---------- přehled ---------- */

async function openStageIds(ctx: Ctx) {
  const pipeline = await getPipeline(ctx.db, INQUIRY_PIPELINE.entityType, INQUIRY_PIPELINE.key);
  return (pipeline?.stages ?? []).filter((s) => s.kind === "open").map((s) => s.id);
}

const canRead = (ctx: Ctx) => ctx.actor.unrestricted || ctx.actor.permissions.has("poptavky.read");

/** Firma nebo osoba s poptávkou se nemaže (poptávka by ztratila zákazníka). */
const deleteBlockers: DeleteBlocker[] = [
  {
    id: "poptavky.company-inquiries",
    entity: "company",
    noun: ["poptávku", "poptávky", "poptávek"],
    count: (ctx, id) => countActive(ctx, inquiry, eq(inquiry.companyId, id)),
  },
  {
    id: "poptavky.person-inquiries",
    entity: "person",
    noun: ["poptávku", "poptávky", "poptávek"],
    count: (ctx, id) => countActive(ctx, inquiry, eq(inquiry.personId, id)),
  },
];

const base = defineModuleServer({
  entities: [inquiryEntity],
  dashboardMetrics,
  deleteBlockers,
  commands: [
    convertCommand,
    markLostCommand,
    intakeKeysCommand,
    createIntakeKeyCommand,
    revokeIntakeKeyCommand,
    ...crmCommands,
  ],
  phaseHooks: crmHooks,
  ensure: [ensureCrmDefaults],
  // „Vyžaduje pozornost“ poptávek (schránka) a obchodů je v oblasti CRM `crm/views/overview.ts` (jedna položka na záznam)
  widgets: [
    async (ctx, deps) => {
      if (!canRead(ctx)) return [];
      const open = await openStageIds(ctx);
      if (!open.length) return [];
      const page = await queryRecords(
        ctx,
        deps.registry,
        await resolveEntity(ctx.db, inquiryEntity),
        {
          filters: { op: "and", conditions: [{ attr: "stage", op: "is_any_of", value: open }] },
          limit: 1,
        },
      );
      return [
        {
          id: "inquiries-open",
          module: "poptavky",
          title: "Otevřené poptávky",
          value: String(page.total),
          hint: page.totals.value
            ? `odhad ${formatMinor(page.totals.value)}`
            : "bez odhadu hodnoty",
          href: "/poptavky",
          order: 20,
        },
      ];
    },
  ],
});

/** Základ modulu a oblasti CRM (docs/CRM.md), každá ve své složce `crm/<oblast>/` se svým vlastníkem. */
export const server = mergeServers(
  base,
  activitiesArea,
  boardArea,
  viewsArea,
  inboxArea,
  todayArea,
);

export * as crmApi from "./crm/api";
export { inquiry, intakeKey, intakeLog };
export { crmActivity, crmActivityType, crmFollower, crmNote } from "./schema";
export const entities = [inquiryEntity];
