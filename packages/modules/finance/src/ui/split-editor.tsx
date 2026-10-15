"use client";

import type { SplitRuleInput } from "@rebar/core/contracts";
import { Button, Icon, Input, MoneyInput, SegmentedControl, useCommandQuery } from "@rebar/ui";
import { useEffect, useMemo, useState } from "react";
import type { SplitDefaultResult } from "../contract";
import { useUsers } from "./common";
import { Select, UserSelect } from "./controls";
import {
  blankRule,
  blocking,
  defaultPreviewKind,
  fiftyFifty,
  previewText,
  ruleIssues,
} from "./split-logic";

/*
  SplitEditor (FIN-02–07, FIN-04): pravidla rozdělení zakázky. Řádek = osoba + způsob (procenta / fixně za platbu /
  fixně celkem) + hodnota + na jaké platby platí + platnost od–do. Pod řádky živý náhled vypočtený stejnou logikou jako
  ukládání. `value === null` znamená „výchozí z Nastavení → Finance“ (nové zakázky); editor ho zobrazí a nechá upravit.
*/

const MODE_LABELS = {
  percent: "Procenta",
  fixed_per_payment: "Fixně za platbu",
  fixed_total: "Fixně celkem",
} as const;
const APPLIES_LABELS: Record<string, string> = {
  all: "Všechny platby",
  one_off: "Jednorázové",
  intro: "Úvodní fáze",
  retainer: "Retainer",
  extra: "Navíc",
};

type Props = {
  /** Pravidla; `null` = výchozí z Nastavení (jen při zakládání zakázky). */
  value: SplitRuleInput[] | null;
  onChange: (value: SplitRuleInput[] | null) => void;
  /** Kdo fakturuje (haléře a zbytek bez pravidel dostane on); výchozí první osoba. */
  issuerId?: string;
  /** Povolit návrat k výchozímu rozdělení z Nastavení. */
  allowDefault?: boolean;
  disabled?: boolean;
  /** Druh, pro který se počítá náhled (jinak podle pravidel). */
  previewKind?: "one_off" | "intro" | "retainer" | "extra";
};

/** Editor pravidel rozdělení s živým náhledem. */
export function SplitEditor({
  value,
  onChange,
  issuerId,
  allowDefault = false,
  disabled = false,
  previewKind,
}: Props) {
  const users = useUsers();
  const defaults = useCommandQuery<SplitDefaultResult>(
    "finance.split.default",
    {},
    { enabled: value === null },
  );
  const effective = value ?? defaults.data?.rules ?? [];
  const names = useMemo(() => {
    const out: Record<string, string> = {};
    for (const u of users) out[u.value] = u.firstName;
    for (const [k, p] of Object.entries(defaults.data?.people ?? {})) out[k] ??= p.firstName;
    return out;
  }, [users, defaults.data]);

  const [amount, setAmount] = useState<number | null>(1_000_000);
  const [kind, setKind] = useState<"one_off" | "intro" | "retainer" | "extra" | null>(null);
  const [month, setMonth] = useState("");
  const shownKind = (kind ?? previewKind ?? defaultPreviewKind(effective)) as
    "one_off" | "intro" | "retainer" | "extra";
  const issuer = issuerId ?? effective[0]?.userId ?? users[0]?.value ?? "";

  const issues = useMemo(() => ruleIssues(effective), [effective]);
  const preview = useMemo(
    () =>
      issuer && amount && amount > 0
        ? previewText({
            rules: effective,
            amountMinor: amount,
            kind: shownKind,
            issuerId: issuer,
            month: month || undefined,
            names,
          })
        : null,
    [effective, amount, shownKind, issuer, month, names],
  );

  const [lastBlocking, setLastBlocking] = useState(false);
  useEffect(() => setLastBlocking(blocking(issues)), [issues]);

  const edit = (next: SplitRuleInput[]) => onChange(next);
  const patch = (i: number, p: Partial<SplitRuleInput>) =>
    edit(effective.map((r, idx) => (idx === i ? ({ ...r, ...p } as SplitRuleInput) : r)));

  const firstUser = users[0]?.value ?? "";
  const secondUser = users[1]?.value ?? firstUser;

  return (
    <div className="space-y-3" data-testid="split-editor" aria-invalid={lastBlocking || undefined}>
      {value === null && allowDefault && (
        <p className="text-sm text-muted" data-testid="split-default-note">
          Použije se výchozí rozdělení z Nastavení → Finance. Můžete ho zde upravit jen pro tuto
          zakázku.
        </p>
      )}

      {effective.length === 0 ? (
        <p className="text-sm text-muted">Bez pravidel patří celá platba tomu, kdo fakturoval.</p>
      ) : (
        <ul className="space-y-2" aria-label="Pravidla rozdělení">
          {effective.map((r, i) => (
            <li
              key={i}
              className="grid gap-2 rounded-lg border border-line-soft p-2 sm:grid-cols-[minmax(7rem,1fr)_minmax(8rem,1fr)_minmax(6rem,0.8fr)_minmax(8rem,1fr)_auto]"
              data-testid="split-rule"
            >
              <UserSelect
                aria-label="Osoba"
                value={r.userId}
                disabled={disabled}
                onChange={(userId) => patch(i, { userId })}
              />
              <Select
                aria-label="Způsob"
                value={r.mode}
                disabled={disabled}
                onChange={(e) => {
                  const mode = e.target.value as SplitRuleInput["mode"];
                  const base = {
                    userId: r.userId,
                    appliesTo: r.appliesTo,
                    validFrom: r.validFrom ?? null,
                    validTo: r.validTo ?? null,
                  };
                  edit(
                    effective.map((x, idx) =>
                      idx === i
                        ? mode === "percent"
                          ? { ...base, mode, percent: 50 }
                          : { ...base, mode, fixedMinor: 0 }
                        : x,
                    ),
                  );
                }}
              >
                {Object.entries(MODE_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
              {r.mode === "percent" ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    aria-label="Procento"
                    disabled={disabled}
                    value={r.percent ?? ""}
                    onChange={(e) =>
                      patch(i, { percent: e.target.value === "" ? 0 : Number(e.target.value) })
                    }
                  />
                  <span className="text-muted">%</span>
                </div>
              ) : (
                <MoneyInput
                  key={`${i}-${r.mode}`}
                  aria-label="Částka"
                  value={r.fixedMinor ?? null}
                  onChange={(v) => patch(i, { fixedMinor: v ?? 0 })}
                />
              )}
              <Select
                aria-label="Platí pro"
                value={r.appliesTo}
                disabled={disabled}
                onChange={(e) =>
                  patch(i, { appliesTo: e.target.value as SplitRuleInput["appliesTo"] })
                }
              >
                {Object.entries(APPLIES_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Odebrat pravidlo"
                disabled={disabled}
                onClick={() => edit(effective.filter((_, idx) => idx !== i))}
              >
                <Icon name="x" />
              </Button>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted sm:col-span-5">
                <span>Platí od</span>
                <Input
                  type="month"
                  aria-label="Platí od měsíce"
                  className="w-40"
                  disabled={disabled}
                  value={r.validFrom ?? ""}
                  onChange={(e) => patch(i, { validFrom: e.target.value || null })}
                />
                <span>do</span>
                <Input
                  type="month"
                  aria-label="Platí do měsíce"
                  className="w-40"
                  disabled={disabled}
                  value={r.validTo ?? ""}
                  onChange={(e) => patch(i, { validTo: e.target.value || null })}
                />
                <span className="text-faint">
                  (prázdné = bez omezení; minulost se nepřepočítává)
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => edit([...effective, blankRule(firstUser)])}>
            <Icon name="plus" /> Přidat pravidlo
          </Button>
          {firstUser && secondUser && firstUser !== secondUser && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => edit(fiftyFifty(firstUser, secondUser))}
            >
              Nastavit 50 / 50
            </Button>
          )}
          {allowDefault && value !== null && (
            <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
              Použít výchozí z Nastavení
            </Button>
          )}
        </div>
      )}

      {issues.length > 0 && (
        <ul className="space-y-1 text-sm" role="status" aria-live="polite">
          {issues.map((i, idx) => (
            <li key={idx} className={i.severity === "error" ? "text-danger" : "text-warning"}>
              {i.message}
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg bg-subtle p-3" data-testid="split-preview">
        <div className="mb-2 flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-muted">Ukázková částka</span>
            <MoneyInput
              value={amount}
              onChange={setAmount}
              aria-label="Ukázková částka"
              className="w-32"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Druh platby</span>
            <Select
              aria-label="Druh platby v náhledu"
              className="w-40"
              value={shownKind}
              onChange={(e) => setKind(e.target.value as typeof shownKind)}
            >
              {["one_off", "intro", "retainer", "extra"].map((k) => (
                <option key={k} value={k}>
                  {APPLIES_LABELS[k]}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Za měsíc</span>
            <Input
              type="month"
              aria-label="Měsíc v náhledu"
              className="w-40"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
        </div>
        <p className="text-base" aria-live="polite" data-testid="split-preview-text">
          {preview === null
            ? "Zadejte částku a pravidla."
            : preview.error
              ? preview.error
              : preview.text}
        </p>
      </div>
    </div>
  );
}

/** Přepínač „Použít výchozí / Upravit“ pro slot zakládání zakázky. */
export function SplitModeToggle({
  custom,
  onChange,
}: {
  custom: boolean;
  onChange: (custom: boolean) => void;
}) {
  return (
    <SegmentedControl
      label="Rozdělení plateb"
      value={custom ? "custom" : "default"}
      onChange={(v) => onChange(v === "custom")}
      options={[
        { value: "default", label: "Výchozí z Nastavení" },
        { value: "custom", label: "Vlastní" },
      ]}
    />
  );
}
