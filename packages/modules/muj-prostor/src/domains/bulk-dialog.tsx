"use client";

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  Field,
  Input,
  SegmentedControl,
  Textarea,
  errorToast,
  successToast,
  useCommandMutation,
} from "@rebar/ui";
import { useMemo, useState } from "react";
import { CompanyPicker } from "../shared-ui";
import type { AssignClientResult, BulkAddResult } from "../types";
import { parseDomainList } from "./logic";

type Defaults = {
  companyId: string | null;
  registrar: string;
  payer: "client" | "agency";
};

const REASONS: Record<string, string> = {
  invalid: "není doména",
  duplicate_in_input: "v seznamu víckrát",
  exists: "už je v evidenci",
};

/** Krok 2 hromadného vložení (DOM-04): doplnění klientů u právě vložených domén. */
function AssignStep({ result, onDone }: { result: BulkAddResult; onDone: () => void }) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(result.created.map((c) => c.id)));
  const [client, setClient] = useState<{ id: string | null; label: string | null }>({
    id: null,
    label: null,
  });
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const assign = useCommandMutation<
    { ids: string[]; companyId: string | null },
    AssignClientResult
  >("muj-prostor.domains.assignClient");
  const ids = [...picked].filter((id) => !assigned.has(id));

  return (
    <div className="space-y-3 px-5 py-4" data-testid="bulk-assign-step">
      <p>
        Vloženo <strong data-testid="bulk-created-count">{result.created.length}</strong>{" "}
        {result.created.length === 1 ? "doména" : result.created.length <= 4 ? "domény" : "domén"}.
        {result.skipped.length > 0 && ` Přeskočeno ${result.skipped.length}.`}
      </p>
      {result.skipped.length > 0 && (
        <ul
          className="max-h-24 overflow-auto rounded-md bg-subtle p-2 text-sm text-muted"
          data-testid="bulk-skipped"
        >
          {result.skipped.map((s, i) => (
            <li key={`${s.input}-${i}`}>
              <span className="font-medium text-fg">{s.input}</span>:{" "}
              {REASONS[s.reason] ?? s.reason}
            </li>
          ))}
        </ul>
      )}
      {result.truncated && (
        <p className="text-sm text-warning">
          Seznam byl delší než 500 domén, zbytek vložte zvlášť.
        </p>
      )}
      {result.created.length > 0 && (
        <>
          <p className="text-sm font-medium text-muted">Doplnění klientů</p>
          <p className="text-sm text-muted">
            Zaškrtněte domény jednoho klienta, vyberte ho a přiřaďte. Zbylé můžete doplnit později v
            seznamu (filtr „Bez klienta“).
          </p>
          <ul className="max-h-48 divide-y divide-line-soft overflow-auto rounded-md border border-line">
            {result.created.map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-3 py-1.5">
                <Checkbox
                  aria-label={`Vybrat ${c.domain}`}
                  checked={picked.has(c.id)}
                  disabled={assigned.has(c.id)}
                  onCheckedChange={(v) =>
                    setPicked((p) => {
                      const next = new Set(p);
                      if (v) next.add(c.id);
                      else next.delete(c.id);
                      return next;
                    })
                  }
                />
                <span className="min-w-0 flex-1 truncate">{c.domain}</span>
                {assigned.has(c.id) && <span className="text-sm text-success">přiřazeno</span>}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <CompanyPicker
                value={client.id}
                label={client.label}
                onChange={(id, label) => setClient({ id, label })}
              />
            </div>
            <Button
              variant="primary"
              disabled={!client.id || ids.length === 0}
              loading={assign.isPending}
              data-testid="bulk-assign"
              onClick={() =>
                assign.mutate(
                  { ids, companyId: client.id },
                  {
                    onSuccess: (r) => {
                      successToast(`Klient přiřazen u ${r.updated} domén.`);
                      setAssigned((a) => new Set([...a, ...ids]));
                    },
                    onError: (e) => errorToast(e.message),
                  },
                )
              }
            >
              Přiřadit vybraným ({ids.length})
            </Button>
          </div>
        </>
      )}
      <div className="flex justify-end pt-1">
        <Button variant="primary" onClick={onDone} data-testid="bulk-done">
          Hotovo
        </Button>
      </div>
    </div>
  );
}

/**
 * Hromadné vložení domén (DOM-04): seznam, jedna doména na řádek, s volitelnými hodnotami pro všechny (klient,
 * registrátor, kdo platí). Zápis se před odesláním rozebere (počet platných, neplatné a opakované); po vložení
 * následuje krok doplnění klientů.
 */
export function BulkDomainsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [defaults, setDefaults] = useState<Defaults>({
    companyId: null,
    registrar: "",
    payer: "client",
  });
  const [clientLabel, setClientLabel] = useState<string | null>(null);
  const [result, setResult] = useState<BulkAddResult | null>(null);
  const parsed = useMemo(() => parseDomainList(text), [text]);
  const add = useCommandMutation<
    {
      text: string;
      defaults: { companyId: string | null; registrar: string | null; payer: "client" | "agency" };
    },
    BulkAddResult
  >("muj-prostor.domains.bulkAdd");

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setText("");
      setResult(null);
      setDefaults({ companyId: null, registrar: "", payer: "client" });
      setClientLabel(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title="Hromadně vložit domény"
        description={
          result ? "Domény jsou v evidenci." : "Vložte seznam domén, každou na samostatný řádek."
        }
        className="w-[min(40rem,calc(100vw-2rem))]"
        data-testid="bulk-dialog"
      >
        {result ? (
          <AssignStep result={result} onDone={() => close(false)} />
        ) : (
          <form
            className="space-y-3 px-5 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate(
                {
                  text,
                  defaults: {
                    companyId: defaults.companyId,
                    registrar: defaults.registrar.trim() || null,
                    payer: defaults.payer,
                  },
                },
                { onSuccess: setResult, onError: (err) => errorToast(err.message) },
              );
            }}
          >
            <Field label="Domény">
              <Textarea
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"firma.cz\nhttps://www.druha-firma.cz/\nbarber.eu"}
                data-testid="bulk-text"
                autoFocus
              />
            </Field>
            <p className="text-sm text-muted" data-testid="bulk-preview">
              {parsed.valid.length} k vložení
              {parsed.duplicates.length > 0 && `, ${parsed.duplicates.length} se opakuje`}
              {parsed.invalid.length > 0 && `, ${parsed.invalid.length} není doména`}
              {parsed.invalid.length > 0 && (
                <span className="text-faint"> ({parsed.invalid.slice(0, 3).join(", ")}…)</span>
              )}
              {parsed.truncated && ", vložení je omezené na 500 domén"}
            </p>
            <div className="grid gap-x-3 sm:grid-cols-2">
              <Field label="Klient pro všechny (nepovinné)">
                <CompanyPicker
                  value={defaults.companyId}
                  label={clientLabel}
                  onChange={(id, label) => {
                    setDefaults((d) => ({ ...d, companyId: id }));
                    setClientLabel(label);
                  }}
                />
              </Field>
              <Field label="Registrátor (nepovinné)">
                <Input
                  value={defaults.registrar}
                  onChange={(e) => setDefaults((d) => ({ ...d, registrar: e.target.value }))}
                  placeholder="například Wedos"
                />
              </Field>
            </div>
            <Field label="Kdo platí">
              <SegmentedControl
                label="Kdo platí"
                value={defaults.payer}
                onChange={(payer) => setDefaults((d) => ({ ...d, payer }))}
                options={[
                  { value: "client", label: "Klient" },
                  { value: "agency", label: "Agentura" },
                ]}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button onClick={() => close(false)}>Zrušit</Button>
              <Button
                type="submit"
                variant="primary"
                disabled={parsed.valid.length === 0}
                loading={add.isPending}
                data-testid="bulk-submit"
              >
                Vložit {parsed.valid.length > 0 ? parsed.valid.length : ""}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
