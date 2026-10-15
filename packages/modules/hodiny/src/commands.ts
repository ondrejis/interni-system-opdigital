import { defineCommand, type CommandDef } from "@rebar/core/module-server";
import {
  cellSaveInput,
  deleteInput,
  forTaskInput,
  jobSummaryInput,
  jobsInput,
  parseInput,
  reportInput,
  saveInput,
  weekInput,
  type ParseOutput,
} from "./contract";
import { jobSummary, pickJobs, report, taskView, weekView } from "./data/read";
import { deleteEntry, saveCell, saveEntry } from "./data/write";
import { formatDuration, parseDuration } from "./logic/parse-time";

const READ = "hodiny.read";
const WRITE = "hodiny.write";

/** Příkazy modulu „hodiny“ (název `hodiny.<akce>`; každý potřebuje probe v `tests/support/probes/hodiny.ts`). */
export const commands: readonly CommandDef[] = [
  defineCommand({
    name: "hodiny.parse",
    permission: READ,
    input: parseInput,
    handler: async (_ctx, i): Promise<ParseOutput> => {
      const r = parseDuration(i.text);
      return r.ok
        ? {
            ok: true,
            minutes: r.minutes,
            hm: formatDuration(r.minutes),
            decimal: formatDuration(r.minutes, "decimal"),
          }
        : r;
    },
  }),
  defineCommand({
    name: "hodiny.week",
    permission: READ,
    input: weekInput,
    handler: (ctx, i, deps) => weekView(ctx, deps, i.weekStart),
  }),
  defineCommand({
    name: "hodiny.save",
    permission: WRITE,
    input: saveInput,
    handler: (ctx, i, deps) => saveEntry(ctx, deps, i),
  }),
  defineCommand({
    name: "hodiny.cell.save",
    permission: WRITE,
    input: cellSaveInput,
    handler: (ctx, i, deps) => saveCell(ctx, deps, i),
  }),
  defineCommand({
    name: "hodiny.delete",
    permission: "hodiny.delete",
    input: deleteInput,
    handler: (ctx, i, deps) => deleteEntry(ctx, deps, i.id),
  }),
  defineCommand({
    name: "hodiny.jobs",
    permission: READ,
    input: jobsInput,
    handler: (ctx, i, deps) => pickJobs(ctx, deps, i),
  }),
  defineCommand({
    name: "hodiny.forTask",
    permission: READ,
    input: forTaskInput,
    handler: (ctx, i, deps) => taskView(ctx, deps, i.taskId),
  }),
  defineCommand({
    name: "hodiny.report",
    permission: READ,
    input: reportInput,
    handler: (ctx, i, deps) => report(ctx, deps, i),
  }),
  defineCommand({
    name: "hodiny.job.summary",
    permission: READ,
    input: jobSummaryInput,
    handler: (ctx, i, deps) => jobSummary(ctx, deps, i.jobId),
  }),
];
