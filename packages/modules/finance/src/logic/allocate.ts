/*
  Rozdělení jedné platby podle pravidel zakázky (FIN-02–07, FIN-13, R-11). Čisté funkce, bez DB.

  Algoritmus (00-spec „Jak se platba rozdělí“ + 12-datový model, upřesněno v C/FIN-06):
  1. Vyberou se pravidla platná k měsíci platby: retainer → `periodMonth`, jinak měsíc data vystavení, jinak dnešek
     (`options.today`, vždy se předává zvenku — funkce nečte hodiny). Existují-li platná pravidla s `appliesTo` rovným
     druhu platby, použijí se JEN ta (konkrétní má přednost před „vše“ jako celá skupina); jinak pravidla `all`.
  2. Bez pravidel patří celá platba fakturujícímu.
  3. Nejdřív fixní částky v pořadí `position`: `fixed_per_payment` celou hodnotou, `fixed_total` jen zbytkem, který ještě
     nebyl alokován dřívějšími platbami (`options.fixedTotalConsumed`, viz `allocateJob`). Fixní částka nikdy nepřesáhne
     zbytek platby (při oříznutí vznikne varování `fixed_capped`).
  4. Zbytek platby se rozdělí podle procent (procenta jsou ze ZBYTKU po fixních částkách); každý podíl se zaokrouhlí
     DOLŮ na haléř.
  5. Co zbude (haléře po zaokrouhlení i nepokrytá procenta, když dávají méně než 100 %), dostane fakturující.
  6. Součet procent > 100 % je CHYBA (`percent_over_100`, výjimka) — rozhodnutí R-11 (platí 13/C: zbytek fakturujícímu,
     nikoli normalizace z 12). Součet < 100 % je jen varování `percent_under_100`.
  7. Ruční přepis: `allocationMode = manual` → vrátí se uložené alokace (součet musí sedět na částku).
*/
import { addMonths, assertDate, assertMonth, monthInRange, monthOf } from "./dates";
import {
  PERCENT_SCALE,
  assertNonNegativeMinor,
  assertPositiveMinor,
  percentOfMinor,
  percentToUnits,
} from "./money";
import {
  FinanceLogicError,
  type Allocation,
  type AppliesTo,
  type PaymentForAllocation,
  type PaymentKind,
  type RuleKind,
  type SplitMode,
  type SplitRule,
  type ValidationIssue,
} from "./types";

const MODES: readonly SplitMode[] = ["percent", "fixed_per_payment", "fixed_total"];
const APPLIES: readonly AppliesTo[] = ["all", "one_off", "intro", "retainer", "extra"];
const RULE_KINDS: readonly RuleKind[] = ["one_off", "intro", "retainer", "extra"];
const FULL = 100 * PERCENT_SCALE;

/** Druh platby v 4. pádě pro české hlášky („procenta pro retainer“). */
const KIND_ACCUSATIVE: Record<RuleKind, string> = {
  one_off: "jednorázové platby",
  intro: "úvodní fázi",
  retainer: "retainer",
  extra: "platby navíc",
};

interface NormRule {
  key: string;
  source: SplitRule;
  userId: string;
  mode: SplitMode;
  /** Procenta v jednotkách 1/10 000 % (jen `percent`). */
  units: number;
  fixedMinor: number;
  appliesTo: AppliesTo;
  from: string | null;
  to: string | null;
  position: number;
  index: number;
}

/** Nastavení výpočtu rozdělení. */
export interface AllocateOptions {
  /** Dnešní datum `YYYY-MM-DD`; použije se jen když platba nemá `periodMonth` (retainer) ani `issuedOn`. */
  today?: string;
  /** Kolik z pravidla `fixed_total` už vyčerpaly dřívější platby (klíč = `rule.id`, jinak `#<index>`), v haléřích. */
  fixedTotalConsumed?: Readonly<Record<string, number>>;
}

/** Výsledek rozdělení platby. */
export interface AllocationResult {
  /** `rules` = podle pravidel, `issuer_only` = zakázka nemá pravidla (vše fakturujícímu), `manual` = ruční přepis. */
  mode: "rules" | "issuer_only" | "manual";
  /** Podíly (součet vždy přesně = částka platby); kdo má v pravidlech 0 Kč, je tu s nulou. */
  allocations: Allocation[];
  /** Klíče pravidel, která se pro platbu použila. */
  appliedRuleIds: string[];
  /** Kolik z jednotlivých `fixed_total` pravidel tahle platba spotřebovala (klíč jako v `fixedTotalConsumed`). */
  fixedTotalUsed: Record<string, number>;
  /** Neblokující upozornění (podíly jsou přesto spočtené). */
  warnings: ValidationIssue[];
}

function ruleKey(rule: SplitRule, index: number): string {
  return rule.id && rule.id.length > 0 ? rule.id : `#${index}`;
}

/** Zkontroluje jedno pravidlo a vrátí nálezy (chyby). */
function checkRule(rule: SplitRule, index: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const at = `Pravidlo ${index + 1}`;
  const err = (code: ValidationIssue["code"], message: string) =>
    issues.push({ severity: "error", code, message: `${at}: ${message}` });
  if (typeof rule.userId !== "string" || rule.userId.length === 0) {
    err("invalid_user", "chybí osoba.");
  }
  if (!MODES.includes(rule.mode)) err("invalid_fixed", "neznámý způsob rozdělení.");
  if (!APPLIES.includes(rule.appliesTo)) err("invalid_fixed", "neznámý druh platby.");
  if (rule.mode === "percent") {
    if (rule.percent === null || rule.percent === undefined || rule.percent === "") {
      err("invalid_percent", "chybí procento.");
    } else {
      try {
        const u = percentToUnits(rule.percent);
        if (u <= 0 || u > FULL)
          err("invalid_percent", "procento musí být větší než 0 a nejvýše 100.");
      } catch (e) {
        err("invalid_percent", e instanceof Error ? e.message : "neplatné procento.");
      }
    }
  } else if (rule.mode === "fixed_per_payment" || rule.mode === "fixed_total") {
    const f = rule.fixedMinor;
    if (typeof f !== "number" || !Number.isSafeInteger(f) || f < 0) {
      err("invalid_fixed", "fixní částka musí být nezáporné celé číslo haléřů.");
    }
  }
  for (const [label, value] of [
    ["platnost od", rule.validFromMonth],
    ["platnost do", rule.validToMonth],
  ] as const) {
    if (value !== null && value !== undefined && value !== "") {
      try {
        assertMonth(value);
      } catch {
        err("invalid_month", `${label} musí být měsíc ve tvaru RRRR-MM.`);
      }
    }
  }
  if (rule.validFromMonth && rule.validToMonth && rule.validFromMonth > rule.validToMonth) {
    err("invalid_validity", "platnost „od“ nesmí být později než „do“.");
  }
  return issues;
}

function normalizeRules(rules: readonly SplitRule[]): NormRule[] {
  const issues = rules.flatMap((r, i) => checkRule(r, i));
  if (issues.length > 0) {
    throw new FinanceLogicError(issues[0]!.code, issues[0]!.message, issues);
  }
  return rules
    .map<NormRule>((r, index) => ({
      key: ruleKey(r, index),
      source: r,
      userId: r.userId,
      mode: r.mode,
      units: r.mode === "percent" ? percentToUnits(r.percent as number | string) : 0,
      fixedMinor: r.mode === "percent" ? 0 : (r.fixedMinor as number),
      appliesTo: r.appliesTo,
      from: r.validFromMonth || null,
      to: r.validToMonth || null,
      position: r.position ?? Number.MAX_SAFE_INTEGER,
      index,
    }))
    .sort((a, b) => a.position - b.position || a.index - b.index);
}

/** Pravidla platná pro druh platby v měsíci: konkrétní `appliesTo` má přednost před `all` (celá skupina). */
function effective(rules: readonly NormRule[], kind: PaymentKind, month: string): NormRule[] {
  const valid = rules.filter((r) => monthInRange(month, r.from, r.to));
  const specific = valid.filter((r) => r.appliesTo === kind);
  return specific.length > 0 ? specific : valid.filter((r) => r.appliesTo === "all");
}

/**
 * Pravidla, která platí pro daný druh platby a měsíc (konkrétní `appliesTo` má přednost před „vše“). Pro UI
 * (zvýraznění použitých řádků) a pro diagnostiku.
 */
export function effectiveSplitRules(
  rules: readonly SplitRule[],
  kind: PaymentKind,
  month: string,
): SplitRule[] {
  assertMonth(month);
  return effective(normalizeRules(rules), kind, month).map((r) => r.source);
}

/**
 * Zvaliduje sadu pravidel zakázky (FIN-07, R-11). Chyby: neplatná pole, součet procent > 100 % pro některý druh platby
 * a měsíc. Varování: součet procent < 100 % (zbytek půjde fakturujícímu). Součet se kontroluje pro každý druh platby
 * a pro každý úsek platnosti pravidel zvlášť (např. retainer do 12/2026 a od 01/2027).
 */
export function validateSplitRules(rules: readonly SplitRule[]): ValidationIssue[] {
  const fieldIssues = rules.flatMap((r, i) => checkRule(r, i));
  if (fieldIssues.length > 0) return fieldIssues;
  const norm = normalizeRules(rules);
  // Body, kde se množina platných pravidel může změnit: počátek, každé „od“ a měsíc po každém „do“.
  const checkpoints = new Set<string>(["0000-01"]);
  for (const r of norm) {
    if (r.from) checkpoints.add(r.from);
    if (r.to) checkpoints.add(addMonths(r.to, 1));
  }
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const kind of RULE_KINDS) {
    for (const month of [...checkpoints].sort()) {
      const eff = effective(norm, kind, month);
      const pct = eff.filter((r) => r.mode === "percent");
      if (pct.length === 0) continue;
      const sum = pct.reduce((s, r) => s + r.units, 0);
      if (sum === FULL) continue;
      const code = sum > FULL ? "percent_over_100" : "percent_under_100";
      const signature = `${code}|${kind}|${sum}|${eff.map((r) => r.key).join(",")}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      const shown = sum / PERCENT_SCALE;
      const when = month === "0000-01" ? "" : ` od ${month.slice(5)}/${month.slice(0, 4)}`;
      issues.push(
        sum > FULL
          ? {
              severity: "error",
              code,
              kind,
              percentSum: shown,
              ...(month === "0000-01" ? {} : { fromMonth: month }),
              message: `Procenta pro ${KIND_ACCUSATIVE[kind]}${when} dávají ${formatPercent(shown)} %, nesmí přesáhnout 100 %.`,
            }
          : {
              severity: "warning",
              code,
              kind,
              percentSum: shown,
              ...(month === "0000-01" ? {} : { fromMonth: month }),
              message: `Procenta pro ${KIND_ACCUSATIVE[kind]}${when} dávají ${formatPercent(shown)} %, zbytek dostane ten, kdo fakturuje.`,
            },
      );
    }
  }
  return issues;
}

/** Jsou mezi nálezy chyby (blokují uložení)? */
export function hasErrors(issues: readonly ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

function formatPercent(value: number): string {
  return String(value).replace(".", ",");
}

/** Měsíc, ke kterému se platbě hledají pravidla: retainer `periodMonth`, jinak měsíc vystavení, jinak dnešek. */
export function ruleMonthFor(
  payment: Pick<PaymentForAllocation, "kind" | "periodMonth" | "issuedOn">,
  today?: string,
): string {
  if (payment.kind === "retainer" && payment.periodMonth) return assertMonth(payment.periodMonth);
  if (payment.issuedOn) return monthOf(assertDate(payment.issuedOn));
  if (payment.periodMonth) return assertMonth(payment.periodMonth);
  if (today) return monthOf(assertDate(today));
  throw new FinanceLogicError(
    "invalid_date",
    "Pro výběr pravidel chybí datum (období, datum vystavení ani dnešek).",
  );
}

/**
 * Ověří ruční rozdělení platby: jedinečné osoby, nezáporné celé částky, součet přesně = částka platby (jinak
 * `allocation_sum_mismatch`). Vrátí výsledek v režimu `manual` (štítek „Rozděleno ručně“).
 */
export function manualAllocation(
  amountMinor: number,
  entries: readonly Allocation[],
): AllocationResult {
  assertPositiveMinor(amountMinor, "Částka platby");
  const seen = new Set<string>();
  let sum = 0;
  for (const e of entries) {
    if (typeof e.userId !== "string" || e.userId.length === 0) {
      throw new FinanceLogicError("invalid_user", "Ruční rozdělení: chybí osoba.");
    }
    if (seen.has(e.userId)) {
      throw new FinanceLogicError(
        "allocation_duplicate_user",
        "Ruční rozdělení: stejná osoba je uvedena víckrát.",
      );
    }
    seen.add(e.userId);
    assertNonNegativeMinor(e.amountMinor, "Podíl");
    sum += e.amountMinor;
  }
  if (sum !== amountMinor) {
    throw new FinanceLogicError(
      "allocation_sum_mismatch",
      "Součet podílů se musí rovnat částce platby.",
    );
  }
  return {
    mode: "manual",
    allocations: entries.map((e) => ({ userId: e.userId, amountMinor: e.amountMinor })),
    appliedRuleIds: [],
    fixedTotalUsed: {},
    warnings: [],
  };
}

/**
 * Rozdělí jednu platbu mezi lidi podle pravidel zakázky (viz hlavička souboru). Deterministické; součet podílů je
 * vždy přesně částka platby. Vyhazuje `FinanceLogicError` při neplatném vstupu (částka ≤ 0, chybná pravidla, součet
 * procent > 100 %, ruční alokace se špatným součtem).
 */
export function allocate(
  payment: PaymentForAllocation,
  rules: readonly SplitRule[],
  options: AllocateOptions = {},
): AllocationResult {
  assertPositiveMinor(payment.amountMinor, "Částka platby");
  if (typeof payment.issuerId !== "string" || payment.issuerId.length === 0) {
    throw new FinanceLogicError("invalid_user", "Platba nemá fakturujícího.");
  }
  if (payment.allocationMode === "manual") {
    return manualAllocation(payment.amountMinor, payment.manualAllocations ?? []);
  }

  const norm = normalizeRules(rules);
  const month = ruleMonthFor(payment, options.today);
  const eff = effective(norm, payment.kind, month);
  const total = payment.amountMinor;

  if (eff.length === 0) {
    return {
      mode: "issuer_only",
      allocations: [{ userId: payment.issuerId, amountMinor: total }],
      appliedRuleIds: [],
      fixedTotalUsed: {},
      warnings: [],
    };
  }

  const warnings: ValidationIssue[] = [];
  const shares = new Map<string, number>();
  for (const r of eff) if (!shares.has(r.userId)) shares.set(r.userId, 0);
  if (!shares.has(payment.issuerId)) shares.set(payment.issuerId, 0);
  const add = (userId: string, amount: number) =>
    shares.set(userId, (shares.get(userId) ?? 0) + amount);

  // 1) fixní částky
  let remaining = total;
  const fixedTotalUsed: Record<string, number> = {};
  for (const r of eff) {
    if (r.mode === "percent") continue;
    let want = r.fixedMinor;
    if (r.mode === "fixed_total") {
      const consumed = options.fixedTotalConsumed?.[r.key] ?? 0;
      want = Math.max(0, r.fixedMinor - Math.max(0, consumed));
    }
    const give = Math.min(want, remaining);
    if (give < want && r.mode === "fixed_per_payment") {
      warnings.push({
        severity: "warning",
        code: "fixed_capped",
        message: "Fixní částka je vyšší než zbytek platby, byla zkrácena.",
      });
    }
    remaining -= give;
    add(r.userId, give);
    if (r.mode === "fixed_total") fixedTotalUsed[r.key] = give;
  }

  // 2) procenta ze zbytku po fixních částkách
  const percentRules = eff.filter((r) => r.mode === "percent");
  const percentSum = percentRules.reduce((s, r) => s + r.units, 0);
  if (percentSum > FULL) {
    const message = `Procenta dávají ${formatPercent(percentSum / PERCENT_SCALE)} %, nesmí přesáhnout 100 %.`;
    throw new FinanceLogicError("percent_over_100", message, [
      {
        severity: "error",
        code: "percent_over_100",
        message,
        percentSum: percentSum / PERCENT_SCALE,
      },
    ]);
  }
  if (percentRules.length > 0 && percentSum < FULL) {
    warnings.push({
      severity: "warning",
      code: "percent_under_100",
      message: `Procenta dávají ${formatPercent(percentSum / PERCENT_SCALE)} %, zbytek dostane ten, kdo fakturuje.`,
      percentSum: percentSum / PERCENT_SCALE,
    });
  }
  const base = remaining;
  for (const r of percentRules) {
    const part = percentOfMinor(base, r.units);
    remaining -= part;
    add(r.userId, part);
  }

  // 3) haléře po zaokrouhlení a nepokrytá procenta → fakturující
  add(payment.issuerId, remaining);

  return {
    mode: "rules",
    allocations: [...shares].map(([userId, amountMinor]) => ({ userId, amountMinor })),
    appliedRuleIds: eff.map((r) => r.key),
    fixedTotalUsed,
    warnings,
  };
}

/** Platba pro dávkový přepočet zakázky (`allocateJob`): jako `PaymentForAllocation`, ale s povinným `id`. */
export type JobPayment = PaymentForAllocation & { id: string };

function sortKey(p: JobPayment): [string, string, string] {
  const date = p.issuedOn ?? (p.periodMonth ? `${p.periodMonth}-01` : "9999-12-31");
  return [date, p.createdAt ?? "", p.id];
}

/**
 * Přepočítá rozdělení všech plateb jedné zakázky v pořadí (datum vystavení → pořadí vytvoření → id), takže `fixed_total`
 * se odečítá postupně z plateb (FIN-06). Zrušené platby se přeskočí (ve výsledku nejsou a nespotřebovávají nic), ručně
 * rozdělené platby vrací beze změny a `fixed_total` nespotřebovávají. Volej při změně částky, fakturujícího,
 * pravidel nebo data kterékoli platby zakázky (FIN-13); u plateb ve stavu `paid` se přepočet nejdřív potvrzuje
 * (`recalcNeedsConfirmation`).
 */
export function allocateJob(
  payments: readonly JobPayment[],
  rules: readonly SplitRule[],
  options: Pick<AllocateOptions, "today"> = {},
): Map<string, AllocationResult> {
  const ordered = payments
    .filter((p) => p.status !== "canceled")
    .map((p) => ({ p, k: sortKey(p) }))
    .sort((a, b) => {
      for (let i = 0; i < 3; i++) {
        const x = a.k[i]!;
        const y = b.k[i]!;
        if (x !== y) return x < y ? -1 : 1;
      }
      return 0;
    });
  const consumed: Record<string, number> = {};
  const out = new Map<string, AllocationResult>();
  for (const { p } of ordered) {
    const result = allocate(p, rules, { ...options, fixedTotalConsumed: consumed });
    if (result.mode !== "manual") {
      for (const [key, used] of Object.entries(result.fixedTotalUsed)) {
        consumed[key] = (consumed[key] ?? 0) + used;
      }
    }
    out.set(p.id, result);
  }
  return out;
}

/** Vyžaduje změna rozdělení potvrzení (SPOL-15, FIN-13)? Ano u platby ve stavu Zaplacená. */
export function recalcNeedsConfirmation(status: PaymentForAllocation["status"]): boolean {
  return status === "paid";
}

/** Liší se dvě rozdělení (jiné osoby nebo částky; pořadí nehraje roli, chybějící osoba = 0)? */
export function allocationsDiffer(a: readonly Allocation[], b: readonly Allocation[]): boolean {
  const ma = toRecord(a);
  const mb = toRecord(b);
  for (const id of new Set([...Object.keys(ma), ...Object.keys(mb)])) {
    if ((ma[id] ?? 0) !== (mb[id] ?? 0)) return true;
  }
  return false;
}

/** Převede seznam podílů na záznam `userId → haléře` (součet podílů téže osoby). */
export function toRecord(allocations: readonly Allocation[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of allocations) out[a.userId] = (out[a.userId] ?? 0) + a.amountMinor;
  return out;
}
