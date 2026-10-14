"use client";

import { formatNumber, patternWarning, validatePattern } from "@rebar/core/numbering-pattern";
import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  FormSection,
  IconButton,
  Input,
  Notice,
} from "@rebar/ui";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { runAction } from "@/lib/run-action";
import { updateSeriesPatternAction } from "@/server/config-actions";
import { useRefreshConfig } from "../_shared/config-ui";

type Row = {
  key: string;
  label: string;
  module: string;
  pattern: string;
  reset: "yearly" | "never";
  next: string;
  lastValue: number;
};

const RESET_LABEL = { yearly: "Každý rok od jedničky", never: "Průběžně, bez nulování" } as const;

function PatternDialog({
  row,
  onClose,
  onSaved,
}: {
  row: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pattern, setPattern] = useState(row.pattern);
  const [busy, setBusy] = useState(false);
  const bad = validatePattern(pattern);
  const warning = bad ? null : patternWarning(pattern, row.reset);
  const now = new Date();
  // náhled: číslo, které by dostal další doklad při tomto vzoru (pořadí pokračuje, mění se jen podoba)
  const preview = bad ? null : formatNumber(pattern, row.lastValue + 1, now);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await runAction(
      updateSeriesPatternAction({ key: row.key, pattern }),
      "Vzor čísla uložen.",
    );
    setBusy(false);
    if (res) {
      onSaved();
      onClose();
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Vzor čísla: ${row.label}`} description={row.module}>
        <form onSubmit={submit} className="px-5 py-4">
          <Field
            label="Vzor"
            htmlFor="series-pattern"
            error={bad ?? undefined}
            hint="Proměnné: {YYYY} rok, {YY} rok dvouciferně, {MM} měsíc, {NNNN} pořadové číslo (počet N = počet číslic)."
          >
            <Input
              id="series-pattern"
              autoFocus
              value={pattern}
              maxLength={60}
              aria-invalid={!!bad}
              onChange={(e) => setPattern(e.target.value)}
              className="font-mono"
            />
          </Field>
          <div className="mb-3 rounded-lg border border-line bg-subtle px-3 py-2">
            <div className="text-sm text-muted">Další doklad dostane číslo</div>
            <div className="font-mono text-lg" data-testid="series-preview">
              {preview ?? "—"}
            </div>
          </div>
          {warning && (
            <div className="mb-3">
              <Notice tone="warning" title="Pozor na opakování čísel">
                {warning}
              </Notice>
            </div>
          )}
          <p className="mb-3 text-sm text-muted">
            Změna platí až od dalšího dokladu. Už vystavená čísla se nemění a pořadí pokračuje tam,
            kde skončilo.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Zrušit
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              disabled={!!bad || pattern === row.pattern}
            >
              Uložit
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Číselné řady po modulech: aktuální vzor, ukázka dalšího čísla a úprava vzoru. */
export function SeriesAdmin({ series }: { series: Row[] }) {
  const refresh = useRefreshConfig();
  const [editing, setEditing] = useState<Row | null>(null);
  if (series.length === 0)
    return <EmptyState title="Žádné řady" description="Zapnuté moduly zatím žádné řady nemají." />;
  const modules = [...new Set(series.map((s) => s.module))];
  return (
    <>
      <Notice tone="info" title="Jak řady fungují">
        Číslo se přidělí v okamžiku vzniku dokladu a nikdy se neopakuje. Změna vzoru se projeví až u
        dalšího dokladu; dřívější doklady zůstávají s původním číslem.
      </Notice>
      {modules.map((m) => (
        <FormSection key={m} title={m} flush>
          <ul className="divide-y divide-line border-t border-line" data-testid="series-list">
            {series
              .filter((s) => s.module === m)
              .map((s) => (
                <li
                  key={s.key}
                  data-testid="series-row"
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
                >
                  <div className="min-w-44 flex-1">
                    <div className="font-medium">{s.label}</div>
                    <div className="font-mono text-sm text-muted">{s.pattern}</div>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted">Další číslo: </span>
                    <span className="font-mono">{s.next}</span>
                  </div>
                  <Chip>{RESET_LABEL[s.reset]}</Chip>
                  <IconButton
                    label={`Upravit vzor řady ${s.label}`}
                    variant="ghost"
                    onClick={() => setEditing(s)}
                  >
                    <Pencil />
                  </IconButton>
                </li>
              ))}
          </ul>
        </FormSection>
      ))}
      {editing && (
        <PatternDialog
          key={editing.key}
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </>
  );
}
