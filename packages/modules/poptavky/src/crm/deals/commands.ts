import { z } from "zod";
import { getLookup } from "@rebar/core/config-data";
import { assertEntityAccess } from "@rebar/core/entities";
import { defineCommand } from "@rebar/core/module-server";
import { UserError } from "@rebar/core/rbac";
import { LOST_REASON_LOOKUP } from "@rebar/zakazky/server";
import { stageHistory } from "../history";
import {
  fieldRulesSetting,
  readFieldRules,
  ruleableAttributes,
  stageNames,
  validateFieldRules,
  fieldRuleSchema,
} from "../field-rules";
import { getPipeline } from "@rebar/core/config-data";
import { archiveDeal, loseDeal, reopenDeal, unarchiveDeal, winDeal } from "./transitions";

const dealId = z.object({ jobId: z.uuid() });
const iso = (d: Date | null) => d?.toISOString() ?? null;

/* Příkazy `crm.*` patří modulu CRM (id `poptavky`). Všechny přechody jdou přes `updateRecord` zakázky, takže platí
   oprávnění k zápisu zakázky, rozsah „jen moje“ i hooky přechodů (viz `transitions.ts`). */

export const winCommand = defineCommand({
  name: "crm.deal.win",
  permission: "zakazky.write",
  input: dealId,
  handler: (ctx, i, deps) => winDeal(ctx, i.jobId, deps),
});

export const loseCommand = defineCommand({
  name: "crm.deal.lose",
  permission: "zakazky.write",
  input: z.object({
    jobId: z.uuid(),
    reasonKey: z.string().trim().min(1, "Vyberte důvod prohry.").max(60),
    note: z.string().trim().max(2000).optional(),
  }),
  handler: (ctx, i, deps) => loseDeal(ctx, i.jobId, { reasonKey: i.reasonKey, note: i.note }, deps),
});

export const reopenCommand = defineCommand({
  name: "crm.deal.reopen",
  permission: "zakazky.write",
  input: dealId,
  handler: (ctx, i, deps) => reopenDeal(ctx, i.jobId, deps),
});

export const archiveCommand = defineCommand({
  name: "crm.deal.archive",
  permission: "zakazky.write",
  input: dealId,
  handler: async (ctx, i) => {
    const r = await archiveDeal(ctx, i.jobId);
    return { jobId: r.jobId, archivedAt: r.archivedAt.toISOString() };
  },
});

export const unarchiveCommand = defineCommand({
  name: "crm.deal.unarchive",
  permission: "zakazky.write",
  input: dealId,
  handler: (ctx, i) => unarchiveDeal(ctx, i.jobId),
});

/** Historie stavů zakázky (pás fází: dny ve stavu) a číselník důvodů prohry pro dialog prohry. */
export const historyCommand = defineCommand({
  name: "crm.deal.history",
  permission: "zakazky.read",
  input: dealId,
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, "job", i.jobId, "read");
    const rows = await stageHistory(ctx, i.jobId);
    return rows.map((r) => ({
      id: r.id,
      stageId: r.stageId,
      stageName: r.stageName,
      stageColor: r.stageColor,
      phase: r.phase,
      enteredAt: r.enteredAt.toISOString(),
      leftAt: iso(r.leftAt),
      changedBy: r.changedBy,
      days: r.days,
      stageDeleted: r.stageDeleted,
    }));
  },
});

export const lostReasonsCommand = defineCommand({
  name: "crm.deal.lostReasons",
  permission: "zakazky.read",
  input: z.object({}),
  handler: async (ctx) =>
    (await getLookup(ctx.db, LOST_REASON_LOOKUP)).map((r) => ({ value: r.value, label: r.label })),
});

/* ---------- pravidla kvality polí (povinné od stavu) ---------- */

/** Pravidla s popisky a katalog polí, na která jde pravidlo navázat (pro správu v nastavení). */
export const fieldRulesCommand = defineCommand({
  name: "crm.fieldRules.get",
  permission: "zakazky.read",
  input: z.object({}),
  handler: async (ctx) => {
    const rules = await readFieldRules(ctx.db);
    const attrs = await ruleableAttributes(ctx.db);
    const names = await stageNames(
      ctx.db,
      rules.map((r) => r.fromStageId),
    );
    const pipeline = await getPipeline(ctx.db, "job", "default");
    return {
      rules: rules.map((r) => ({
        ...r,
        attrLabel: attrs.find((a) => a.key === r.attr)?.label ?? r.attr,
        stageName: names.get(r.fromStageId) ?? null,
      })),
      attributes: attrs,
      stages: (pipeline?.stages ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        phase: s.phase,
        position: s.position,
      })),
    };
  },
});

export const setFieldRulesCommand = defineCommand({
  name: "crm.fieldRules.set",
  permission: "settings.manage",
  input: z.object({ rules: z.array(fieldRuleSchema).max(100) }),
  handler: async (ctx, i, deps) => {
    const problems = await validateFieldRules(ctx.db, i.rules);
    if (problems.length) throw new UserError(problems[0]!);
    await deps.settings.set(ctx, fieldRulesSetting, { rules: i.rules });
    return { rules: i.rules };
  },
});

export const crmCommands = [
  winCommand,
  loseCommand,
  reopenCommand,
  archiveCommand,
  unarchiveCommand,
  historyCommand,
  lostReasonsCommand,
  fieldRulesCommand,
  setFieldRulesCommand,
];
