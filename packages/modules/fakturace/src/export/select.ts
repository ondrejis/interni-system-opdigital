import type { Condition, EntityDef, FilterGroup } from "@rebar/core/entities";
import { resolveEntity, visibleIds } from "@rebar/core/entities";
import { PermissionError, scopeOf, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import type { PeriodBasis } from "./common";

/** Nejvíc dokladů v jednom exportu (PDF a ISDOC se tvoří jedno po druhém, požadavek nemá trvat minuty). */
export const PACKAGE_MAX_DOCS = 500;

/** Stavy vydaných faktur, které jdou do exportů (vystavené, ne koncept). */
export const ISSUED_STATES = ["issued", "partial", "paid", "credited"];
/** Přijaté faktury: schválené a uhrazené. */
export const RECEIVED_STATES = ["approved", "paid"];

export type DocEntities = { invoice: EntityDef; received: EntityDef };

/** Podmínka období: podle data vystavení, nebo podle DUZP (kde DUZP chybí, rozhoduje datum vystavení). */
function periodCondition(basis: PeriodBasis, from: string, to: string): Condition | FilterGroup {
  const issue: Condition = { attr: "issueDate", op: "between", value: [from, to] };
  if (basis === "issue") return issue;
  return {
    op: "or",
    conditions: [
      { attr: "taxableDate", op: "between", value: [from, to] },
      { op: "and", conditions: [{ attr: "taxableDate", op: "empty" }, issue] },
    ],
  };
}

export type SelectOptions = {
  from: string;
  to: string;
  basis?: PeriodBasis;
  /** Vybrat vydané faktury (výchozí ano). */
  issued?: boolean;
  /** Vybrat přijaté faktury (výchozí ano). */
  received?: boolean;
  /** Vynechat zálohové faktury (nejsou daňové doklady). */
  withoutProforma?: boolean;
};

/**
 * Id dokladů, které aktér smí vyexportovat: vyžaduje `fakturace.export`, vydané a přijaté se vybírají jen v rozsahu,
 * který aktér smí číst („jen moje“ se respektuje). Přijaté faktury vidí jen s právem číst fakturaci. Strop
 * `PACKAGE_MAX_DOCS` na každý druh; po jeho překročení srozumitelná chyba (nic se nenačte).
 */
export async function selectDocumentIds(
  ctx: Ctx,
  entities: DocEntities,
  opts: SelectOptions,
): Promise<{ invIds: string[]; recIds: string[] }> {
  if (!scopeOf(ctx, "fakturace.export")) throw new PermissionError();
  if (opts.to < opts.from) throw new UserError("Konec období je před začátkem.");
  const basis = opts.basis ?? "issue";
  const period = periodCondition(basis, opts.from, opts.to);
  const invIds =
    opts.issued === false
      ? []
      : await visibleIds(
          ctx,
          await resolveEntity(ctx.db, entities.invoice),
          {
            filters: {
              op: "and",
              conditions: [
                period,
                { attr: "state", op: "is_any_of", value: ISSUED_STATES },
                ...(opts.withoutProforma
                  ? [{ attr: "kind", op: "is_none_of", value: ["proforma"] } as Condition]
                  : []),
              ],
            },
          },
          PACKAGE_MAX_DOCS + 1,
        );
  const recIds =
    opts.received !== false && scopeOf(ctx, "fakturace.read")
      ? await visibleIds(
          ctx,
          await resolveEntity(ctx.db, entities.received),
          {
            filters: {
              op: "and",
              conditions: [period, { attr: "state", op: "is_any_of", value: RECEIVED_STATES }],
            },
          },
          PACKAGE_MAX_DOCS + 1,
        )
      : [];
  if (invIds.length + recIds.length === 0)
    throw new UserError(
      "V tomto období nejsou žádné vystavené faktury ani schválené přijaté faktury.",
    );
  if (invIds.length > PACKAGE_MAX_DOCS || recIds.length > PACKAGE_MAX_DOCS)
    throw new UserError(
      `V období je víc než ${PACKAGE_MAX_DOCS} dokladů. Zvolte kratší období (např. jeden měsíc).`,
    );
  return { invIds, recIds };
}
