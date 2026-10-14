import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { job } from "@rebar/zakazky/schema";
import { OPEN_DEAL_PHASES } from "../logic";

/** Otevřené nearchivované obchody (zakázky ve fázi poptávka nebo nabídka), volitelně jedné fáze a jednoho vlastníka. */
export function openDealWhere(
  opts: { phase?: string | null; managerId?: string | null } = {},
): SQL {
  const phases =
    opts.phase && OPEN_DEAL_PHASES.includes(opts.phase) ? [opts.phase] : [...OPEN_DEAL_PHASES];
  return and(
    inArray(job.phase, phases),
    isNull(job.crmArchivedAt),
    opts.managerId ? eq(job.managerId, opts.managerId) : undefined,
  )!;
}
