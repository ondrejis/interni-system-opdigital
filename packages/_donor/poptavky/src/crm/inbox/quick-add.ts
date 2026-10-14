import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getPipeline } from "@rebar/core/config-data";
import { schema, type Executor } from "@rebar/core/db";
import { createRecord, resolveEntity } from "@rebar/core/entities";
import { defineCommand } from "@rebar/core/module-server";
import { inTx, UserError } from "@rebar/core/rbac";
import { company, person } from "@rebar/kontakty/schema";
import { createFirstActivity, firstActivityInput } from "../deals/first-activity";
import { newCompanyData, resolveQualifyContacts } from "../deals/qualify";

/** Vlastní pole zakázky „Typ zakázky“ (číselník založí `ensureJobTypeField`); klient ho smí smazat nebo přejmenovat. */
export const JOB_TYPE_FIELD = "job_type";

/** Kontakt v rychlém zadání: vybraná osoba, nebo údaje nové osoby. */
const contact = z.object({
  personId: z.uuid().optional(),
  name: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || undefined)
    .pipe(z.email("Neplatný e-mail.").optional()),
});

/** Firma v rychlém zadání: vybraná, nebo údaje nové (název nebo IČO, doplnění z ARES, typ). */
const firm = z.object({
  companyId: z.uuid().optional(),
  name: z.string().trim().max(200).optional(),
  ico: z.string().trim().max(20).optional(),
  data: newCompanyData.optional(),
});

export const quickAddInput = z.object({
  contact: contact.default({}),
  company: firm.default({}),
  /** Co s nalezenými duplicitami: zeptat se (chyba s návodem), použít nalezené, založit nové. */
  duplicates: z.enum(["ask", "use", "create"]).default("ask"),
  title: z.string().trim().max(200).optional(),
  address: z.string().trim().max(300).optional(),
  siteCity: z.string().trim().max(120).optional(),
  jobType: z.string().trim().max(60).optional(),
  valueMinor: z.number().int().min(0).max(1_000_000_000_000).optional(),
  source: z.string().trim().max(40).optional(),
  sourceChannel: z.string().trim().max(160).optional(),
  campaign: z.string().trim().max(120).optional(),
  ownerId: z.uuid().optional(),
  expectedCloseDate: z.iso.date().optional(),
  /** Stav nástěnky, kam zakázka patří (jinak první stav fáze Poptávka). */
  stageId: z.uuid().optional(),
  description: z.string().trim().max(5000).optional(),
  /** První aktivita („Zavolat zítra 9:00“). Bez ní jde zakázku uložit jen se `skipFirstActivity`. */
  firstActivity: firstActivityInput.optional(),
  skipFirstActivity: z.boolean().default(false),
});
/** Vstup rychlého zadání před průchodem schématem. */
export type QuickAddInput = z.input<typeof quickAddInput>;

/** Co rychlé zadání založilo (zakázka, firma, osoba, první aktivita). */
export type QuickAddResult = {
  jobId: string;
  companyId: string;
  personId: string | null;
  firstActivityId: string | null;
  createdCompany: boolean;
  createdPerson: boolean;
};

/**
 * Rychlé zadání poptávky: jedním příkazem a v jedné transakci založí (nebo vybere) firmu a osobu s kontrolou duplicit
 * (IČO, e-mail, telefon), zakázku ve zvoleném stavu fáze Poptávka a první aktivitu. Selže-li cokoli (duplicita, chybějící
 * oprávnění ke kontaktům, stav mimo obchodní fáze, aktivita), nevznikne nic. První aktivita je povinná, ledaže volající
 * výslovně potvrdí `skipFirstActivity` (UI „Uložit bez aktivity“).
 */
export const quickAddCommand = defineCommand({
  name: "crm.deal.quickAdd",
  permission: "zakazky.write",
  input: quickAddInput,
  handler: async (ctx, input, deps): Promise<QuickAddResult> => {
    if (!input.firstActivity && !input.skipFirstActivity)
      throw new UserError("Naplánujte první aktivitu, nebo potvrďte uložení bez ní.");
    const jobDef = deps.registry.get("job");
    if (!jobDef) throw new UserError("Modul Zakázky není zapnutý.");
    const jobE = await resolveEntity(ctx.db, jobDef);

    return inTx(ctx, async (c) => {
      // vybraná osoba dodá jméno, e-mail, telefon i firmu; vybraná firma dodá název
      let pre: {
        name: string;
        email: string | null;
        phone: string | null;
        companyId: string | null;
      } | null = null;
      if (input.contact.personId) {
        const [p] = await c.db
          .select({
            name: person.name,
            email: person.email,
            phone: person.phone,
            companyId: person.companyId,
          })
          .from(person)
          .where(and(eq(person.id, input.contact.personId), isNull(person.deletedAt)));
        if (!p) throw new UserError("Vybraná osoba už neexistuje.");
        pre = p;
      }
      const companyId = input.company.companyId ?? pre?.companyId ?? undefined;
      const contactName = pre?.name ?? input.contact.name ?? "";
      const contactEmail = pre?.email ?? input.contact.email ?? null;
      const contactPhone = pre?.phone ?? input.contact.phone ?? null;
      const companyName = input.company.data?.name ?? input.company.name ?? "";
      if (!companyId && !companyName && !contactName.trim())
        throw new UserError("Vyplňte firmu, nebo alespoň jméno kontaktu.");

      const resolved = await resolveQualifyContacts(
        c,
        deps.registry,
        {
          company: companyId ?? null,
          person: input.contact.personId ?? null,
          contactName,
          contactEmail,
          contactPhone,
          companyName,
        },
        {
          ...(companyId ? { companyId } : {}),
          ...(input.contact.personId ? { personId: input.contact.personId } : {}),
          ico: input.company.ico,
          duplicates: input.duplicates,
          companyData: input.company.data,
        },
      );

      if (input.stageId) {
        const pipeline = await getPipeline(c.db, "job", "default");
        const st = pipeline?.stages.find((s) => s.id === input.stageId);
        if (!st || st.kind !== "open" || !["inquiry", "offer"].includes(String(st.phase)))
          throw new UserError("Zakázku jde založit jen v obchodním stavu (poptávka nebo nabídka).");
      }
      const [co] = await c.db
        .select({ name: company.name })
        .from(company)
        .where(eq(company.id, resolved.companyId));
      const jobTypeKey = `custom.${JOB_TYPE_FIELD}`;
      const title =
        input.title ||
        [co?.name, input.address || input.siteCity].filter(Boolean).join(" – ") ||
        "Nová zakázka";
      const job = await createRecord(c, deps.registry, jobE, {
        title,
        company: resolved.companyId,
        ...(resolved.personId ? { person: resolved.personId } : {}),
        value: input.valueMinor ?? 0,
        manager: input.ownerId ?? c.actor.userId,
        ...(input.address ? { address: input.address } : {}),
        ...(input.siteCity ? { siteCity: input.siteCity } : {}),
        ...(input.expectedCloseDate ? { expectedCloseDate: input.expectedCloseDate } : {}),
        ...(input.description ? { description: input.description } : {}),
        ...(input.source ? { crmSource: input.source } : {}),
        ...(input.sourceChannel ? { crmSourceChannel: input.sourceChannel } : {}),
        ...(input.campaign ? { crmCampaign: input.campaign } : {}),
        ...(input.stageId ? { stage: input.stageId } : {}),
        ...(input.jobType && jobE.byKey.has(jobTypeKey) ? { [jobTypeKey]: input.jobType } : {}),
      });

      const activity = input.firstActivity
        ? await createFirstActivity(
            c,
            { jobId: job.row.id, companyId: resolved.companyId, personId: resolved.personId },
            {
              ...input.firstActivity,
              assigneeId: input.firstActivity.assigneeId ?? input.ownerId ?? c.actor.userId!,
            },
          )
        : null;
      return {
        jobId: job.row.id,
        companyId: resolved.companyId,
        personId: resolved.personId,
        firstActivityId: activity?.id ?? null,
        createdCompany: resolved.createdCompany,
        createdPerson: resolved.createdPerson,
      };
    });
  },
});

/** Idempotentně založí vlastní pole zakázky „Typ zakázky“; smazané nebo přejmenované pole správce nevrací. */
export async function ensureJobTypeField(db: Executor) {
  const existing = await db
    .select({ id: schema.customFieldDef.id })
    .from(schema.customFieldDef)
    .where(
      and(
        eq(schema.customFieldDef.entityType, "job"),
        eq(schema.customFieldDef.key, JOB_TYPE_FIELD),
      ),
    )
    .limit(1);
  if (existing.length) return;
  const count = (
    await db
      .select({ id: schema.customFieldDef.id })
      .from(schema.customFieldDef)
      .where(
        and(eq(schema.customFieldDef.entityType, "job"), isNull(schema.customFieldDef.deletedAt)),
      )
  ).length;
  await db.insert(schema.customFieldDef).values({
    entityType: "job",
    key: JOB_TYPE_FIELD,
    label: "Typ zakázky",
    type: "select",
    options: {
      choices: [
        { value: "newbuild", label: "Novostavba", color: "blue" },
        { value: "reconstruction", label: "Rekonstrukce", color: "orange" },
        { value: "roof", label: "Střecha", color: "red" },
        { value: "facade", label: "Fasáda a zateplení", color: "teal" },
        { value: "interior", label: "Interiér", color: "purple" },
        { value: "other", label: "Jiné", color: "gray" },
      ],
    },
    showInTable: true,
    position: count,
  });
}
