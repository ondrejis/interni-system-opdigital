import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { countActive, type DeleteBlocker } from "@rebar/core/entities";
import { invoice, receivedInvoice } from "./schema";

const ISSUED_FIX =
  "takovou zakázku nejde smazat, vystavenou fakturu jde jen stornovat dobropisem; zakázku uzavřete";
const LOCKED_FIX = "takovou zakázku nejde smazat, uzavřete ji nebo ji označte jako prohranou";

/**
 * Co brání smazání firmy, osoby a zakázky z pohledu Fakturace: vydané i přijaté faktury. Zakázka s vystavenou fakturou
 * nebo se schválenou či uhrazenou přijatou fakturou se nemaže vůbec (uzavírá se), s konceptem faktury až po jeho smazání.
 */
export const deleteBlockers: DeleteBlocker[] = [
  {
    id: "fakturace.company-invoices",
    entity: "company",
    noun: ["fakturu", "faktury", "faktur"],
    count: (ctx, id) => countActive(ctx, invoice, eq(invoice.companyId, id)),
  },
  {
    id: "fakturace.company-received",
    entity: "company",
    noun: ["přijatou fakturu", "přijaté faktury", "přijatých faktur"],
    count: (ctx, id) => countActive(ctx, receivedInvoice, eq(receivedInvoice.supplierId, id)),
  },
  {
    id: "fakturace.person-invoices",
    entity: "person",
    noun: ["fakturu", "faktury", "faktur"],
    count: (ctx, id) => countActive(ctx, invoice, eq(invoice.personId, id)),
  },
  {
    id: "fakturace.job-issued",
    entity: "job",
    noun: ["vystavenou fakturu", "vystavené faktury", "vystavených faktur"],
    fix: ISSUED_FIX,
    count: (ctx, id) =>
      countActive(ctx, invoice, and(eq(invoice.jobId, id), sql`${invoice.state} <> 'draft'`)),
  },
  {
    id: "fakturace.job-received-locked",
    entity: "job",
    noun: [
      "schválenou přijatou fakturu",
      "schválené přijaté faktury",
      "schválených přijatých faktur",
    ],
    fix: LOCKED_FIX,
    count: (ctx, id) =>
      countActive(
        ctx,
        receivedInvoice,
        and(
          eq(receivedInvoice.jobId, id),
          or(
            isNotNull(receivedInvoice.lockedAt),
            sql`${receivedInvoice.state} in ('approved', 'paid')`,
          ),
        ),
      ),
  },
  {
    id: "fakturace.job-drafts",
    entity: "job",
    noun: ["koncept faktury", "koncepty faktur", "konceptů faktur"],
    count: (ctx, id) =>
      countActive(ctx, invoice, and(eq(invoice.jobId, id), sql`${invoice.state} = 'draft'`)),
  },
  {
    id: "fakturace.job-received-open",
    entity: "job",
    noun: ["přijatou fakturu", "přijaté faktury", "přijatých faktur"],
    count: (ctx, id) =>
      countActive(
        ctx,
        receivedInvoice,
        and(
          eq(receivedInvoice.jobId, id),
          sql`${receivedInvoice.lockedAt} is null`,
          sql`${receivedInvoice.state} not in ('approved', 'paid')`,
        ),
      ),
  },
];
