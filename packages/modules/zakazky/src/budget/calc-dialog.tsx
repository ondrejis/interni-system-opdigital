"use client";

import {
  Button,
  Dialog,
  DialogContent,
  IconButton,
  Input,
  Skeleton,
  useCommandQuery,
} from "@rebar/ui";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { evaluateCalcLines, sumCalcThousandths } from "./formula";
import { qty } from "./ui-format";
import { useCmd } from "./use-cmd";

type Row = { key: number; variable: string; description: string; formula: string };
type CalcData = {
  quantity: string;
  lines: { id: string; variable: string | null; description: string | null; formula: string }[];
};

/**
 * Výkaz výměr položky: řádky s proměnnou, popisem a vzorcem (+ − × ÷, závorky, proměnné z jiných řádků).
 * Množství položky je součet výsledků. Výsledky se počítají hned při psaní, uložení se zablokuje při chybě.
 */
export function CalcDialog({
  itemId,
  title,
  unit,
  readOnly,
  onClose,
}: {
  itemId: string;
  title: string;
  unit: string;
  readOnly: boolean;
  onClose: () => void;
}) {
  const q = useCommandQuery<CalcData>("zakazky.budget.calc.list", { itemId });
  const save = useCmd<Record<string, unknown>>("zakazky.budget.calc.replace");
  const seq = useRef(1);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [focusKey, setFocusKey] = useState<number | null>(null);

  useEffect(() => {
    if (!q.data || rows) return;
    const init: Row[] = q.data.lines.map((l) => ({
      key: seq.current++,
      variable: l.variable ?? "",
      description: l.description ?? "",
      formula: l.formula,
    }));
    setRows(
      init.length ? init : [{ key: seq.current++, variable: "", description: "", formula: "" }],
    );
  }, [q.data, rows]);

  const out = useMemo(
    () =>
      evaluateCalcLines((rows ?? []).map((r) => ({ variable: r.variable, formula: r.formula }))),
    [rows],
  );
  const total = sumCalcThousandths(out.map((o) => o.value)) / 1000;
  const hasError = out.some((o) => o.error);

  const patch = (key: number, p: Partial<Row>) =>
    setRows((rs) => rs?.map((r) => (r.key === key ? { ...r, ...p } : r)) ?? rs);
  const add = () => {
    const key = seq.current++;
    setRows((rs) => [...(rs ?? []), { key, variable: "", description: "", formula: "" }]);
    setFocusKey(key);
  };

  async function submit() {
    if (!rows || hasError) return;
    const lines = rows
      .filter((r) => r.formula.trim() || r.variable.trim() || r.description.trim())
      .map((r) => ({
        variable: r.variable.trim() || null,
        description: r.description.trim() || null,
        formula: r.formula,
      }));
    const res = await save.run({ itemId, lines });
    if (res) onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Výkaz výměr"
        description={title}
        className="top-[10vh] w-[min(46rem,calc(100vw-2rem))]"
      >
        <div className="px-5 py-4">
          {!rows ? (
            <Skeleton className="h-24" />
          ) : (
            <>
              <div className="grid grid-cols-[7rem_1fr_1fr_6rem_2rem] items-center gap-x-2 gap-y-1.5 text-sm">
                <span className="font-medium text-muted">Proměnná</span>
                <span className="font-medium text-muted">Popis</span>
                <span className="font-medium text-muted">Vzorec</span>
                <span className="text-right font-medium text-muted">Výsledek</span>
                <span />
                {rows.map((r, n) => (
                  <RowFields
                    key={r.key}
                    row={r}
                    result={out[n]!}
                    index={n}
                    readOnly={readOnly}
                    autoFocus={focusKey === r.key}
                    onChange={(p) => patch(r.key, p)}
                    onEnter={() => (n === rows.length - 1 ? add() : undefined)}
                    onRemove={() =>
                      setRows((rs) => {
                        const next = (rs ?? []).filter((x) => x.key !== r.key);
                        return next.length
                          ? next
                          : [{ key: seq.current++, variable: "", description: "", formula: "" }];
                      })
                    }
                  />
                ))}
              </div>
              {!readOnly && (
                <Button size="sm" variant="ghost" className="mt-2" onClick={add}>
                  <Plus /> Řádek
                </Button>
              )}
              <p className="mt-3 text-sm text-muted">
                Příklad: proměnná <code className="rounded bg-hover px-1">a</code> = 4,5, další
                řádek
                <code className="ml-1 rounded bg-hover px-1">(a + 3) * 2</code>. Množství položky je
                součet všech výsledků.
              </p>
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-4">
          <div className="text-base">
            Množství položky: <strong className="tabular">{qty(String(total))}</strong> {unit}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              {readOnly ? "Zavřít" : "Zrušit"}
            </Button>
            {!readOnly && (
              <Button
                variant="primary"
                disabled={!rows || hasError}
                loading={save.pending}
                onClick={() => void submit()}
              >
                Uložit
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RowFields({
  row,
  result,
  index,
  readOnly,
  autoFocus,
  onChange,
  onEnter,
  onRemove,
}: {
  row: Row;
  result: { value: number; error: string | null };
  index: number;
  readOnly: boolean;
  autoFocus: boolean;
  onChange: (p: Partial<Row>) => void;
  onEnter: () => void;
  onRemove: () => void;
}) {
  return (
    <>
      <Input
        aria-label={`Proměnná, řádek ${index + 1}`}
        value={row.variable}
        disabled={readOnly}
        autoFocus={autoFocus}
        placeholder="a"
        onChange={(e) => onChange({ variable: e.target.value })}
      />
      <Input
        aria-label={`Popis, řádek ${index + 1}`}
        value={row.description}
        disabled={readOnly}
        placeholder="Např. obvod místnosti"
        onChange={(e) => onChange({ description: e.target.value })}
      />
      <Input
        aria-label={`Vzorec, řádek ${index + 1}`}
        value={row.formula}
        disabled={readOnly}
        aria-invalid={!!result.error}
        placeholder="4,5 * 3"
        onChange={(e) => onChange({ formula: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          }
        }}
      />
      <span
        className={`tabular text-right ${result.error ? "text-danger" : ""}`}
        title={result.error ?? undefined}
      >
        {result.error ? "chyba" : qty(String(result.value))}
      </span>
      {readOnly ? (
        <span />
      ) : (
        <IconButton label={`Odebrat řádek ${index + 1}`} size="sm" onClick={onRemove}>
          <Trash2 />
        </IconButton>
      )}
      {result.error && (
        <p role="alert" className="col-span-5 -mt-0.5 mb-1 text-xs text-danger">
          Řádek {index + 1}: {result.error}
        </p>
      )}
    </>
  );
}
