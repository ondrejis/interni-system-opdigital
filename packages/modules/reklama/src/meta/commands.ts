import { z } from "zod";
import { defineCommand } from "@rebar/core/module-server";
import {
  accountDetailInput,
  accountSetActiveInput,
  accountSetOwnerInput,
  accountsListInput,
  campaignAssignJobInput,
  campaignDetailInput,
  connectionSaveInput,
  forClientInput,
  forJobInput,
  mappingDeleteInput,
  mappingSaveInput,
  metricsInput,
  recentLeadsInput,
  syncInput,
} from "../contract";
import {
  assignCampaignJob,
  connectionStatus,
  deleteMapping,
  listMappings,
  recentLeads,
  removeConnection,
  saveConnection,
  setAccountActive,
  setAccountOwner,
  saveMapping,
  testConnection,
} from "./admin";
import { accountDetail, campaignDetail, listAccounts, metricsFor, metricsOnly } from "./queries";
import { syncMeta } from "./sync";

const R = "reklama.read";
const W = "reklama.write";
const M = "reklama.manage";
const empty = z.object({});

/** Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`. */
export const commands = [
  defineCommand({
    name: "reklama.accounts.list",
    permission: R,
    input: accountsListInput,
    handler: (ctx, i, deps) => listAccounts(ctx, deps, i),
  }),
  defineCommand({
    name: "reklama.account.detail",
    permission: R,
    input: accountDetailInput,
    handler: (ctx, i) => accountDetail(ctx, i),
  }),
  defineCommand({
    name: "reklama.campaign.detail",
    permission: R,
    input: campaignDetailInput,
    handler: (ctx, i) => campaignDetail(ctx, i),
  }),
  defineCommand({
    name: "reklama.metrics",
    permission: R,
    input: metricsInput,
    handler: (ctx, i) => metricsOnly(ctx, i),
  }),
  defineCommand({
    name: "reklama.forClient",
    permission: R,
    input: forClientInput,
    handler: (ctx, i) => metricsFor(ctx, { scope: { companyId: i.companyId }, period: i.period }),
  }),
  defineCommand({
    name: "reklama.forJob",
    permission: R,
    input: forJobInput,
    handler: (ctx, i) => metricsFor(ctx, { scope: { jobId: i.jobId }, period: i.period }),
  }),
  defineCommand({
    name: "reklama.account.setOwner",
    permission: W,
    input: accountSetOwnerInput,
    handler: async (ctx, i) => void (await setAccountOwner(ctx, i)),
  }),
  defineCommand({
    name: "reklama.account.setActive",
    permission: M,
    input: accountSetActiveInput,
    handler: async (ctx, i) => void (await setAccountActive(ctx, i)),
  }),
  defineCommand({
    name: "reklama.campaign.assignJob",
    permission: W,
    input: campaignAssignJobInput,
    handler: async (ctx, i) => void (await assignCampaignJob(ctx, i)),
  }),
  defineCommand({
    name: "reklama.sync",
    permission: M,
    input: syncInput,
    handler: (ctx, i, deps) => syncMeta(ctx.db as never, deps, { accountId: i.accountId }),
  }),
  defineCommand({
    name: "reklama.mappings.list",
    permission: M,
    input: empty,
    handler: (ctx) => listMappings(ctx),
  }),
  defineCommand({
    name: "reklama.mapping.save",
    permission: M,
    input: mappingSaveInput,
    handler: (ctx, i) => saveMapping(ctx, i),
  }),
  defineCommand({
    name: "reklama.mapping.delete",
    permission: M,
    input: mappingDeleteInput,
    handler: async (ctx, i) => void (await deleteMapping(ctx, i.id)),
  }),
  defineCommand({
    name: "reklama.leads.recent",
    permission: M,
    input: recentLeadsInput,
    handler: (ctx, i) => recentLeads(ctx, i.limit),
  }),
  defineCommand({
    name: "reklama.connection.get",
    permission: M,
    input: empty,
    handler: (ctx, _i, deps) => connectionStatus(ctx, deps),
  }),
  defineCommand({
    name: "reklama.connection.save",
    permission: M,
    input: connectionSaveInput,
    handler: async (ctx, i, deps) => void (await saveConnection(ctx, deps, i.accessToken)),
  }),
  defineCommand({
    name: "reklama.connection.test",
    permission: M,
    input: empty,
    handler: (ctx, _i, deps) => testConnection(ctx, deps),
  }),
  defineCommand({
    name: "reklama.connection.remove",
    permission: M,
    input: empty,
    handler: async (ctx, _i, deps) => void (await removeConnection(ctx, deps)),
  }),
];
