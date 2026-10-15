import { defineCommand } from "@rebar/core/module-server";
import {
  boardInput,
  clientSetFormerInput,
  completeInput,
  completePreviewInput,
  createFromTemplateInput,
  createInput,
  detailInput,
  participantAddInput,
  participantRemoveInput,
  phaseCompleteInput,
  phasePreviewInput,
  phasesEditInput,
  prefillInput,
  setPhaseInput,
  setStatusInput,
  teamAddInput,
  teamRemoveInput,
} from "../contract";
import { createJobImpl } from "./create";
import { boardImpl, jobDetailImpl, prefillImpl } from "./detail";
import {
  completePhaseImpl,
  editPhasesImpl,
  previewPhaseChangeImpl,
  setCurrentPhaseImpl,
} from "./phases";
import { completeJobImpl, previewCompleteImpl, setClientFormerImpl, setStatusImpl } from "./status";
import { addMemberImpl, addParticipantImpl, removeMemberImpl, removeParticipantImpl } from "./team";

const READ = "zakazky.read";
const WRITE = "zakazky.write";

/**
 * Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write`
 * (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`.
 */
export const commands = [
  defineCommand({
    name: "zakazky.detail",
    permission: READ,
    input: detailInput,
    handler: (ctx, i, deps) => jobDetailImpl(ctx, deps, i.jobId),
  }),
  defineCommand({
    name: "zakazky.board",
    permission: READ,
    input: boardInput,
    handler: (ctx, i, deps) => boardImpl(ctx, deps, i),
  }),
  defineCommand({
    name: "zakazky.prefillFromDeal",
    permission: READ,
    input: prefillInput,
    handler: (ctx, i) => prefillImpl(ctx, i),
  }),
  defineCommand({
    name: "zakazky.phase.preview",
    permission: READ,
    input: phasePreviewInput,
    handler: (ctx, i, deps) => previewPhaseChangeImpl(ctx, deps, i),
  }),
  defineCommand({
    name: "zakazky.complete.preview",
    permission: READ,
    input: completePreviewInput,
    handler: (ctx, i, deps) => previewCompleteImpl(ctx, deps, i.jobId),
  }),
  defineCommand({
    name: "zakazky.create",
    permission: "zakazky.create",
    input: createInput,
    handler: (ctx, i, deps) => createJobImpl(ctx, deps, i),
  }),
  defineCommand({
    name: "zakazky.createFromTemplate",
    permission: "zakazky.create",
    input: createFromTemplateInput,
    handler: (ctx, i, deps) => createJobImpl(ctx, deps, i),
  }),
  defineCommand({
    name: "zakazky.setPhase",
    permission: WRITE,
    input: setPhaseInput,
    handler: (ctx, i, deps) => setCurrentPhaseImpl(ctx, deps, i),
  }),
  defineCommand({
    name: "zakazky.phase.complete",
    permission: WRITE,
    input: phaseCompleteInput,
    handler: (ctx, i, deps) => completePhaseImpl(ctx, deps, i),
  }),
  defineCommand({
    name: "zakazky.phases.edit",
    permission: WRITE,
    input: phasesEditInput,
    handler: (ctx, i) => editPhasesImpl(ctx, i),
  }),
  defineCommand({
    name: "zakazky.setStatus",
    permission: WRITE,
    input: setStatusInput,
    handler: (ctx, i, deps) => setStatusImpl(ctx, deps, i),
  }),
  defineCommand({
    name: "zakazky.complete",
    permission: WRITE,
    input: completeInput,
    handler: (ctx, i, deps) => completeJobImpl(ctx, deps, i),
  }),
  defineCommand({
    name: "zakazky.client.setFormer",
    permission: WRITE,
    input: clientSetFormerInput,
    handler: (ctx, i, deps) => setClientFormerImpl(ctx, deps, i),
  }),
  defineCommand({
    name: "zakazky.team.add",
    permission: WRITE,
    input: teamAddInput,
    handler: (ctx, i) => addMemberImpl(ctx, i),
  }),
  defineCommand({
    name: "zakazky.team.remove",
    permission: WRITE,
    input: teamRemoveInput,
    handler: (ctx, i) => removeMemberImpl(ctx, i),
  }),
  defineCommand({
    name: "zakazky.participants.add",
    permission: WRITE,
    input: participantAddInput,
    handler: (ctx, i) => addParticipantImpl(ctx, i),
  }),
  defineCommand({
    name: "zakazky.participants.remove",
    permission: WRITE,
    input: participantRemoveInput,
    handler: (ctx, i) => removeParticipantImpl(ctx, i),
  }),
];
