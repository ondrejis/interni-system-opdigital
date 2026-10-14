/**
 * Čistá logika schvalování (bez databáze, klientsky bezpečná): typy dokladů, výchozí pravidla a vyhodnocení,
 * kdo smí doklad schválit. Databázová část je v `api.ts`.
 */

/** Typy dokladů, které procházejí schvalováním. */
export const APPROVAL_DOC_TYPES = ["change", "statement", "order", "received_invoice"] as const;
export type ApprovalDocType = (typeof APPROVAL_DOC_TYPES)[number];

export const APPROVAL_DOC_LABEL: Record<ApprovalDocType, string> = {
  change: "Změna",
  statement: "Soupis prací",
  order: "Objednávka",
  received_invoice: "Přijatá faktura",
};

export const APPROVE_PERMISSION = "zakazky.approve";
export const APPROVE_ALL_PERMISSION = "zakazky.approve_all";

/** Limit výchozího pravidla: do 50 000 Kč schvaluje držitel `zakazky.approve`, nad ním jen `zakazky.approve_all`. */
export const DEFAULT_LIMIT_MINOR = 50_000_00;

export type RuleLike = {
  id: string;
  docType: string;
  minAmountMinor: number;
  approverPermission: string | null;
  approverId: string | null;
  active: boolean;
};

/** Výchozí pravidla pro každý typ dokladu (seed při prvním použití). */
export const DEFAULT_RULES: readonly Omit<RuleLike, "id" | "active">[] = APPROVAL_DOC_TYPES.flatMap(
  (docType) => [
    { docType, minAmountMinor: 0, approverPermission: APPROVE_PERMISSION, approverId: null },
    {
      docType,
      minAmountMinor: DEFAULT_LIMIT_MINOR,
      approverPermission: APPROVE_ALL_PERMISSION,
      approverId: null,
    },
  ],
);

/**
 * Pravidlo, které se pro doklad použije: aktivní pravidlo typu s nejvyšším limitem, který nepřevyšuje částku
 * (částka se posuzuje v absolutní hodnotě, méněpráce nesmí obejít schvalování). `null` = pod nejnižším limitem
 * nebo bez pravidla, doklad se schválí hned.
 */
export function pickRule<R extends RuleLike>(
  rules: readonly R[],
  docType: string,
  amountMinor: number,
): R | null {
  const amount = Math.abs(amountMinor);
  let best: R | null = null;
  for (const r of rules) {
    if (!r.active || r.docType !== docType || r.minAmountMinor > amount) continue;
    if (!best || r.minAmountMinor > best.minAmountMinor) best = r;
  }
  return best;
}

/** Oprávnění aktéra: klíč → rozsah. */
export type HeldPermissions = ReadonlyMap<string, "all" | "own">;

export type DecideCheck = {
  rule: Pick<RuleLike, "approverPermission" | "approverId"> | null;
  held: HeldPermissions;
  userId: string | null;
  /** Aktér smí všechno (úlohy na pozadí). */
  unrestricted?: boolean;
  /** Vlastníci zakázky (vedoucí a členové týmu). */
  jobOwnerIds: readonly string[];
};

/**
 * Smí aktér rozhodnout o dokladu podle pravidla? Držitel `zakazky.approve_all` smí vždy (rozsah „jen moje“ jen u
 * svých zakázek); jinak je potřeba oprávnění z pravidla (výchozí `zakazky.approve`) a u rozsahu „jen moje“ musí být
 * aktér v týmu zakázky. Pravidlo s konkrétním schvalovatelem pustí jeho a držitele `approve_all`.
 */
export function mayDecide(c: DecideCheck): boolean {
  if (c.unrestricted) return true;
  const inScope = (key: string) => {
    const scope = c.held.get(key);
    if (!scope) return false;
    return scope === "all" || (!!c.userId && c.jobOwnerIds.includes(c.userId));
  };
  if (inScope(APPROVE_ALL_PERMISSION)) return true;
  if (!c.rule) return inScope(APPROVE_PERMISSION);
  if (c.rule.approverId) return c.rule.approverId === c.userId;
  return inScope(c.rule.approverPermission ?? APPROVE_PERMISSION);
}

/** Smí schvalovat bez limitu (vlastní doklad, vracení do konceptu)? */
export function mayApproveAll(held: HeldPermissions, unrestricted = false): boolean {
  return unrestricted || held.has(APPROVE_ALL_PERMISSION);
}
