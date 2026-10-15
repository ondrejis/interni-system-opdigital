import { NotImplementedError } from "@rebar/core/contracts";
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

/* M1: stub příkazů (vstupy jsou finální, těla doplní OBC-A). */
const todo = (name: string) => async (): Promise<never> => {
  throw new NotImplementedError(`obchody.${name}`);
};

export const commands = [
  defineCommand({
    name: "obchody.board",
    permission: "obchody.read",
    input: boardInput,
    handler: todo("board"),
  }),
  defineCommand({
    name: "obchody.detail",
    permission: "obchody.read",
    input: detailInput,
    handler: todo("detail"),
  }),
  defineCommand({
    name: "obchody.history",
    permission: "obchody.read",
    input: historyInput,
    handler: todo("history"),
  }),
  defineCommand({
    name: "obchody.winPreview",
    permission: "obchody.read",
    input: winPreviewInput,
    handler: todo("winPreview"),
  }),
  defineCommand({
    name: "obchody.lostReasons",
    permission: "obchody.read",
    input: lostReasonsInput,
    handler: todo("lostReasons"),
  }),
  defineCommand({
    name: "obchody.create",
    permission: "obchody.create",
    input: createInput,
    handler: todo("create"),
  }),
  defineCommand({
    name: "obchody.quickAdd",
    permission: "obchody.create",
    input: quickAddInput,
    handler: todo("quickAdd"),
  }),
  defineCommand({
    name: "obchody.update",
    permission: "obchody.write",
    input: updateInput,
    handler: todo("update"),
  }),
  defineCommand({
    name: "obchody.moveStage",
    permission: "obchody.write",
    input: moveStageInput,
    handler: todo("moveStage"),
  }),
  defineCommand({
    name: "obchody.win",
    permission: "obchody.write",
    input: winInput,
    handler: todo("win"),
  }),
  defineCommand({
    name: "obchody.lose",
    permission: "obchody.write",
    input: loseInput,
    handler: todo("lose"),
  }),
  defineCommand({
    name: "obchody.reopen",
    permission: "obchody.write",
    input: reopenInput,
    handler: todo("reopen"),
  }),
  defineCommand({
    name: "obchody.markOpened",
    permission: "obchody.write",
    input: markOpenedInput,
    handler: todo("markOpened"),
  }),
  defineCommand({
    name: "obchody.archive",
    permission: "obchody.delete",
    input: archiveInput,
    handler: todo("archive"),
  }),
  defineCommand({
    name: "obchody.participants.add",
    permission: "obchody.write",
    input: participantAddInput,
    handler: todo("participants.add"),
  }),
  defineCommand({
    name: "obchody.participants.remove",
    permission: "obchody.write",
    input: participantRemoveInput,
    handler: todo("participants.remove"),
  }),
  defineCommand({
    name: "obchody.pipeline.get",
    permission: "obchody.pipelines",
    input: pipelineGetInput,
    handler: todo("pipeline.get"),
  }),
  defineCommand({
    name: "obchody.pipeline.stage.add",
    permission: "obchody.pipelines",
    input: stageAddInput,
    handler: todo("pipeline.stage.add"),
  }),
  defineCommand({
    name: "obchody.pipeline.stage.update",
    permission: "obchody.pipelines",
    input: stageUpdateInput,
    handler: todo("pipeline.stage.update"),
  }),
  defineCommand({
    name: "obchody.pipeline.stage.delete",
    permission: "obchody.pipelines",
    input: stageDeleteInput,
    handler: todo("pipeline.stage.delete"),
  }),
  defineCommand({
    name: "obchody.pipeline.stage.reorder",
    permission: "obchody.pipelines",
    input: stageReorderInput,
    handler: todo("pipeline.stage.reorder"),
  }),
  defineCommand({
    name: "obchody.pipeline.lostReason.add",
    permission: "obchody.pipelines",
    input: lostReasonAddInput,
    handler: todo("pipeline.lostReason.add"),
  }),
  defineCommand({
    name: "obchody.pipeline.lostReason.update",
    permission: "obchody.pipelines",
    input: lostReasonUpdateInput,
    handler: todo("pipeline.lostReason.update"),
  }),
  defineCommand({
    name: "obchody.pipeline.lostReason.reorder",
    permission: "obchody.pipelines",
    input: lostReasonReorderInput,
    handler: todo("pipeline.lostReason.reorder"),
  }),
];
