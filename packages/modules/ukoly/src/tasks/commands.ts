import { defineCommand } from "@rebar/core/module-server";
import {
  assignTaskInput,
  completeTaskInput,
  countsInput,
  createTaskInput,
  deleteTaskInput,
  deleteTypeInput,
  getTaskInput,
  listTasksInput,
  listTypesInput,
  parseTaskInput,
  publishAndAssignInput,
  quickAddInput,
  reorderTypesInput,
  rescheduleTaskInput,
  saveTypeInput,
  setAttendeesInput,
  setStatusInput,
  tasksForRecordInput,
  updateTaskInput,
} from "../contract";
import { getTask, listTasks, taskCounts, tasksForRecord } from "./queries";
import { deleteTaskType, listTaskTypes, reorderTaskTypes, saveTaskType } from "./types";
import {
  assignTask,
  completeTask,
  createTask,
  deleteTask,
  parseQuick,
  publishAndAssign,
  quickAdd,
  rescheduleTask,
  setAttendees,
  setTaskStatus,
  updateTask,
} from "./write";

/*
  Příkazy úkolů a aktivit (`ukoly.*`). Čtení vyžaduje `ukoly.read`, zápis `ukoly.write`/`create`/`delete`; rozsah
  „jen moje“ (přidělené mně nebo zadané mnou) hlídá entita `task` a datová vrstva. Příkazy poznámek jsou v `src/notes`.
*/

const READ = "ukoly.read";
const WRITE = "ukoly.write";

export const getCommand = defineCommand({
  name: "ukoly.get",
  permission: READ,
  input: getTaskInput,
  handler: (ctx, i, deps) => getTask(ctx, deps, i.id),
});

export const listCommand = defineCommand({
  name: "ukoly.list",
  permission: READ,
  input: listTasksInput,
  handler: (ctx, i, deps) => listTasks(ctx, deps, i),
});

export const forRecordCommand = defineCommand({
  name: "ukoly.forRecord",
  permission: READ,
  input: tasksForRecordInput,
  handler: (ctx, i, deps) => tasksForRecord(ctx, deps, i),
});

export const countsCommand = defineCommand({
  name: "ukoly.counts",
  permission: READ,
  input: countsInput,
  handler: (ctx) => taskCounts(ctx),
});

export const parseCommand = defineCommand({
  name: "ukoly.parse",
  permission: READ,
  input: parseTaskInput,
  handler: (ctx, i, deps) => parseQuick(ctx, deps, i.text),
});

export const createCommand = defineCommand({
  name: "ukoly.create",
  permission: "ukoly.create",
  input: createTaskInput,
  handler: (ctx, i, deps) => createTask(ctx, deps, i),
});

export const quickAddCommand = defineCommand({
  name: "ukoly.quickAdd",
  permission: "ukoly.create",
  input: quickAddInput,
  handler: (ctx, i, deps) => quickAdd(ctx, deps, i),
});

export const updateCommand = defineCommand({
  name: "ukoly.update",
  permission: WRITE,
  input: updateTaskInput,
  handler: (ctx, i, deps) => updateTask(ctx, deps, i),
});

export const setStatusCommand = defineCommand({
  name: "ukoly.setStatus",
  permission: WRITE,
  input: setStatusInput,
  handler: (ctx, i, deps) => setTaskStatus(ctx, deps, i),
});

export const completeCommand = defineCommand({
  name: "ukoly.complete",
  permission: WRITE,
  input: completeTaskInput,
  handler: (ctx, i, deps) => completeTask(ctx, deps, i),
});

export const rescheduleCommand = defineCommand({
  name: "ukoly.reschedule",
  permission: WRITE,
  input: rescheduleTaskInput,
  handler: (ctx, i, deps) => rescheduleTask(ctx, deps, i),
});

export const assignCommand = defineCommand({
  name: "ukoly.assign",
  permission: WRITE,
  input: assignTaskInput,
  handler: (ctx, i, deps) => assignTask(ctx, deps, i),
});

export const publishAndAssignCommand = defineCommand({
  name: "ukoly.publishAndAssign",
  permission: WRITE,
  input: publishAndAssignInput,
  handler: (ctx, i, deps) => publishAndAssign(ctx, deps, i),
});

export const attendeesCommand = defineCommand({
  name: "ukoly.attendees.set",
  permission: WRITE,
  input: setAttendeesInput,
  handler: (ctx, i, deps) => setAttendees(ctx, deps, i),
});

export const deleteCommand = defineCommand({
  name: "ukoly.delete",
  permission: "ukoly.delete",
  input: deleteTaskInput,
  handler: async (ctx, i, deps) => {
    await deleteTask(ctx, deps, i.id);
    return { id: i.id };
  },
});

/* ---------- typy ---------- */

export const typeListCommand = defineCommand({
  name: "ukoly.type.list",
  permission: READ,
  input: listTypesInput,
  handler: (ctx) => listTaskTypes(ctx.db),
});

export const typeSaveCommand = defineCommand({
  name: "ukoly.type.save",
  permission: "ukoly.types",
  input: saveTypeInput,
  handler: (ctx, i) => saveTaskType(ctx, i),
});

export const typeDeleteCommand = defineCommand({
  name: "ukoly.type.delete",
  permission: "ukoly.types",
  input: deleteTypeInput,
  handler: async (ctx, i) => {
    await deleteTaskType(ctx, i.id);
    return { id: i.id };
  },
});

export const typeReorderCommand = defineCommand({
  name: "ukoly.type.reorder",
  permission: "ukoly.types",
  input: reorderTypesInput,
  handler: async (ctx, i) => {
    await reorderTaskTypes(ctx, i.ids);
    return { ok: true as const };
  },
});

/** Všechny příkazy úkolů a aktivit modulu „ukoly“. */
export const taskCommands = [
  getCommand,
  listCommand,
  forRecordCommand,
  countsCommand,
  parseCommand,
  createCommand,
  quickAddCommand,
  updateCommand,
  setStatusCommand,
  completeCommand,
  rescheduleCommand,
  assignCommand,
  publishAndAssignCommand,
  attendeesCommand,
  deleteCommand,
  typeListCommand,
  typeSaveCommand,
  typeDeleteCommand,
  typeReorderCommand,
];
