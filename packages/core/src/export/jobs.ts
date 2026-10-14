import type { ZodType } from "zod";
import type { JobDef } from "../jobs/jobs";
import { exportCleanupJob, exportRunJob } from "./runs";
import type { ExportRuntime } from "./runtime";
import { exportScheduleTickJob } from "./schedules";

/** Worker předává službám exportů jedno pole; web exportuje jen přes `startExport`. */
export type ExportJobDeps = { exports?: ExportRuntime | null | undefined };

/** Úlohy exportů: zpracování na pozadí, plánovač (každých 5 minut) a denní úklid souborů. */
function bind<S extends ZodType>(job: JobDef<S, ExportRuntime>): JobDef<S, ExportJobDeps> {
  return {
    ...job,
    handler: async (deps, data, item) => {
      if (!deps.exports) throw new Error("Exporty nejsou ve workeru nastavené.");
      await job.handler(deps.exports, data, item);
    },
  };
}

export const exportJobs: readonly JobDef<ZodType, ExportJobDeps>[] = [
  bind(exportRunJob) as JobDef<ZodType, ExportJobDeps>,
  bind(exportCleanupJob) as JobDef<ZodType, ExportJobDeps>,
  bind(exportScheduleTickJob) as JobDef<ZodType, ExportJobDeps>,
];
