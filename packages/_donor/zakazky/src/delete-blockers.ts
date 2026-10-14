import { eq } from "drizzle-orm";
import { countActive, type DeleteBlocker } from "@rebar/core/entities";
import { job } from "./schema";

/**
 * Co brání smazání firmy a osoby z pohledu Zakázek: firma a osoba s navázanou zakázkou se nesmažou.
 */
export const deleteBlockers: DeleteBlocker[] = [
  {
    id: "zakazky.company-jobs",
    entity: "company",
    noun: ["zakázku", "zakázky", "zakázek"],
    count: (ctx, id) => countActive(ctx, job, eq(job.companyId, id)),
  },
  {
    id: "zakazky.person-jobs",
    entity: "person",
    noun: ["zakázku", "zakázky", "zakázek"],
    count: (ctx, id) => countActive(ctx, job, eq(job.personId, id)),
  },
];
