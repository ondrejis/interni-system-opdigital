import { defineCommand } from "@rebar/core/module-server";
import {
  archiveInput,
  boardInput,
  createInput,
  detailInput,
  historyInput,
  loseInput,
  lostReasonAddInput,
  lostReasonReorderInput,
  lostReasonsInput,
  lostReasonUpdateInput,
  markOpenedInput,
  moveStageInput,
  participantAddInput,
  participantRemoveInput,
  pipelineGetInput,
  quickAddInput,
  reopenInput,
  stageAddInput,
  stageDeleteInput,
  stageReorderInput,
  stageUpdateInput,
  updateInput,
  winInput,
  winPreviewInput,
} from "../contract";
import {
  addDealStage,
  addLostReason,
  deleteDealStage,
  getPipelineAdmin,
  reorderDealStages,
  reorderLostReasons,
  updateDealStage,
  updateLostReason,
} from "./pipeline-admin";
import { board, detail, history, lostReasons, winPreview } from "./queries";
import { quickAdd } from "./quick-add";
import {
  addParticipant,
  archiveDeal,
  createDeal,
  loseDeal,
  markDealOpened,
  moveDealStage,
  removeParticipant,
  reopenDeal,
  updateDeal,
  winDeal,
} from "./transitions";

const R = "obchody.read";
const W = "obchody.write";
const PL = "obchody.pipelines";

/** Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. */
export const commands = [
  defineCommand({
    name: "obchody.board",
    permission: R,
    input: boardInput,
    handler: (ctx, i, deps) => board(ctx, deps, i),
  }),
  defineCommand({
    name: "obchody.detail",
    permission: R,
    input: detailInput,
    handler: (ctx, i, deps) => detail(ctx, deps, i.dealId),
  }),
  defineCommand({
    name: "obchody.history",
    permission: R,
    input: historyInput,
    handler: (ctx, i) => history(ctx, i.dealId),
  }),
  defineCommand({
    name: "obchody.winPreview",
    permission: R,
    input: winPreviewInput,
    handler: (ctx, i) => winPreview(ctx, i.dealId),
  }),
  defineCommand({
    name: "obchody.lostReasons",
    permission: R,
    input: lostReasonsInput,
    handler: (ctx, i) => lostReasons(ctx, i),
  }),
  defineCommand({
    name: "obchody.create",
    permission: "obchody.create",
    input: createInput,
    handler: (ctx, i, deps) => createDeal(ctx, deps, i),
  }),
  defineCommand({
    name: "obchody.quickAdd",
    permission: "obchody.create",
    input: quickAddInput,
    handler: (ctx, i, deps) => quickAdd(ctx, deps, i),
  }),
  defineCommand({
    name: "obchody.update",
    permission: W,
    input: updateInput,
    handler: (ctx, i, deps) => updateDeal(ctx, deps, i),
  }),
  defineCommand({
    name: "obchody.moveStage",
    permission: W,
    input: moveStageInput,
    handler: (ctx, i, deps) => moveDealStage(ctx, deps, i),
  }),
  defineCommand({
    name: "obchody.win",
    permission: W,
    input: winInput,
    handler: (ctx, i, deps) => winDeal(ctx, deps, i),
  }),
  defineCommand({
    name: "obchody.lose",
    permission: W,
    input: loseInput,
    handler: (ctx, i, deps) => loseDeal(ctx, deps, i),
  }),
  defineCommand({
    name: "obchody.reopen",
    permission: W,
    input: reopenInput,
    handler: (ctx, i, deps) => reopenDeal(ctx, deps, i),
  }),
  defineCommand({
    name: "obchody.markOpened",
    permission: R,
    input: markOpenedInput,
    handler: (ctx, i) => markDealOpened(ctx, i.dealId),
  }),
  defineCommand({
    name: "obchody.archive",
    permission: "obchody.delete",
    input: archiveInput,
    handler: (ctx, i, deps) => archiveDeal(ctx, deps, i.dealId),
  }),
  defineCommand({
    name: "obchody.participants.add",
    permission: W,
    input: participantAddInput,
    handler: (ctx, i, deps) => addParticipant(ctx, deps, i),
  }),
  defineCommand({
    name: "obchody.participants.remove",
    permission: W,
    input: participantRemoveInput,
    handler: (ctx, i, deps) => removeParticipant(ctx, deps, i),
  }),
  defineCommand({
    name: "obchody.pipeline.get",
    permission: PL,
    input: pipelineGetInput,
    handler: (ctx) => getPipelineAdmin(ctx),
  }),
  defineCommand({
    name: "obchody.pipeline.stage.add",
    permission: PL,
    input: stageAddInput,
    handler: (ctx, i) => addDealStage(ctx, i),
  }),
  defineCommand({
    name: "obchody.pipeline.stage.update",
    permission: PL,
    input: stageUpdateInput,
    handler: (ctx, i) => updateDealStage(ctx, i),
  }),
  defineCommand({
    name: "obchody.pipeline.stage.delete",
    permission: PL,
    input: stageDeleteInput,
    handler: (ctx, i) => deleteDealStage(ctx, i.stageId),
  }),
  defineCommand({
    name: "obchody.pipeline.stage.reorder",
    permission: PL,
    input: stageReorderInput,
    handler: (ctx, i) => reorderDealStages(ctx, i.stageIds),
  }),
  defineCommand({
    name: "obchody.pipeline.lostReason.add",
    permission: PL,
    input: lostReasonAddInput,
    handler: (ctx, i) => addLostReason(ctx, i),
  }),
  defineCommand({
    name: "obchody.pipeline.lostReason.update",
    permission: PL,
    input: lostReasonUpdateInput,
    handler: (ctx, i) => updateLostReason(ctx, i),
  }),
  defineCommand({
    name: "obchody.pipeline.lostReason.reorder",
    permission: PL,
    input: lostReasonReorderInput,
    handler: (ctx, i) => reorderLostReasons(ctx, i.itemIds),
  }),
];
