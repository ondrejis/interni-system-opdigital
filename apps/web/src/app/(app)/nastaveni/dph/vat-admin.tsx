"use client";

import {
  Button,
  Chip,
  ConfirmDialog,
  DatePicker,
  Dialog,
  DialogContent,
  Field,
  FormSection,
  IconButton,
  Input,
  Notice,
  undoToast,
} from "@rebar/ui";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { runAction } from "@/lib/run-action";
import {
  deleteVatRateAction,
  restoreVatRateAction,
  saveVatRateAction,
  setDefaultVatAction,
} from "@/server/config-actions";
import { slugify, useRefreshConfig } from "../_shared/config-ui";

type Rate = {
  id: string;
  code: string;
  label: string;
  rateBp: number;
  validFrom: string;
  validTo: string | null;
  status: "valid" | "future" | "expired";
};

const pct = (bp: number) => `${(bp / 100).toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} %`;
const czDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
};
const STATUS = {
  valid: { label: "Platná", color: "green" },
  future: { label: "Platí od budoucna", color: "blue" },
  expired: { label: "Vypršela", color: "gray" },
} as const;

/** „12“, „12,5“ nebo „12.5“ → setiny procenta; `null`, když to není sazba 0 až 100 %. */
function parsePercent(text: string): number | null {
  const t = text.replace(/\s|%/g, "").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n >= 0 && n <= 100 ? Math.round(n * 100) : null;
}

function RateDialog({
  rate,
  today,
  onClose,
  onSaved,
}: {
  rate: Rate | null;
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(rate?.label ?? "");
  const [code, setCode] = useState(rate?.code ?? "");
  const [codeTouched, setCodeTouched] = useState(false);
  const [percent, setPercent] = useState(rate ? String(rate.rateBp / 100).replace(".", ",") : "");
  const [from, setFrom] = useState<string | null>(rate?.validFrom ?? today);
  const [to, setTo] = useState<string | null>(rate?.validTo ?? null);
  const [busy, setBusy] = useState(false);
  const bp = parsePercent(percent);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (bp === null || !from) return;
    setBusy(true);
    const res = await runAction(
      saveVatRateAction({
        code: code || slugify(label, 40) || "sazba",
        label,
        rateBp: bp,
        validFrom: from,
        validTo: to,
      }),
      "Sazba uložena.",
    );
    setBusy(false);
    if (res) {
      onSaved();
      onClose();
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={rate ? "Upravit sazbu" : "Nová sazba"} description="Sazby DPH">
        <form onSubmit={submit} className="px-5 py-4">
          <Field label="Název" htmlFor="vat-label">
            <Input
              id="vat-label"
              autoFocus
              value={label}
              maxLength={80}
              placeholder="např. Snížená 12 %"
              onChange={(e) => {
                setLabel(e.target.value);
                if (!rate && !codeTouched) setCode(slugify(e.target.value, 40));
              }}
            />
          </Field>
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Field
              label="Sazba (%)"
              htmlFor="vat-percent"
              error={percent && bp === null ? "Zadejte sazbu 0 až 100 %." : undefined}
            >
              <Input
                id="vat-percent"
                inputMode="decimal"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                placeholder="21"
              />
            </Field>
            <Field
              label="Kód"
              htmlFor="vat-code"
              hint={rate ? "Kód se nemění." : "Stejný kód s jiným datem = změna sazby v čase."}
            >
              <Input
                id="vat-code"
                value={code}
                disabled={!!rate}
                maxLength={40}
                onChange={(e) => {
                  setCodeTouched(true);
                  setCode(e.target.value);
                }}
              />
            </Field>
          </div>
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Field label="Platí od">
              <DatePicker value={from} onChange={setFrom} clearable={false} disabled={!!rate} />
            </Field>
            <Field label="Platí do" hint="Prázdné = bez konce platnosti.">
              <DatePicker value={to} onChange={setTo} placeholder="Bez konce" />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Zrušit
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              disabled={!label.trim() || bp === null || !from}
            >
              Uložit
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Sazby DPH s platností od–do a výchozí sazbou nových řádků. */
export function VatAdmin({
  rates,
  defaultCode,
  explicitDefault,
  today,
}: {
  rates: Rate[];
  defaultCode: string | null;
  explicitDefault: string | null;
  today: string;
}) {
  const refresh = useRefreshConfig();
  const [editing, setEditing] = useState<{ rate: Rate | null } | null>(null);
  const [removing, setRemoving] = useState<Rate | null>(null);

  async function makeDefault(r: Rate) {
    if (await runAction(setDefaultVatAction({ code: r.code }), `Výchozí sazba: ${r.label}.`))
      refresh();
  }

  async function remove(r: Rate) {
    const ok = await runAction(deleteVatRateAction({ id: r.id }));
    if (!ok) return false;
    refresh();
    undoToast(`Sazba „${r.label}“ smazána.`, async () => {
      if (await runAction(restoreVatRateAction({ id: r.id }), "Sazba obnovena.")) refresh();
    });
    return true;
  }

  return (
    <>
      <FormSection
        title="Sazby"
        flush
        footer={
          <Button variant="primary" onClick={() => setEditing({ rate: null })}>
            <Plus /> Nová sazba
          </Button>
        }
      >
        <ul className="divide-y divide-line border-t border-line" data-testid="vat-list">
          {rates.map((r) => {
            const isDefault = r.status === "valid" && r.code === defaultCode;
            return (
              <li
                key={r.id}
                data-testid="vat-row"
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
              >
                <div className="min-w-44 flex-1">
                  <div className="font-medium">
                    {r.label} <span className="tabular text-muted">· {pct(r.rateBp)}</span>
                  </div>
                  <div className="text-sm text-muted">
                    od {czDate(r.validFrom)}
                    {r.validTo ? ` do ${czDate(r.validTo)}` : " bez konce platnosti"}
                    <span className="text-faint"> · kód {r.code}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip color={STATUS[r.status].color}>{STATUS[r.status].label}</Chip>
                  {isDefault && (
                    <Chip color="indigo">
                      <Star className="size-3" aria-hidden /> Výchozí
                    </Chip>
                  )}
                </div>
                <div className="flex gap-1">
                  {r.status === "valid" && !isDefault && (
                    <Button size="sm" variant="secondary" onClick={() => void makeDefault(r)}>
                      Nastavit jako výchozí
                    </Button>
                  )}
                  <IconButton
                    label={`Upravit sazbu ${r.label}`}
                    variant="ghost"
                    onClick={() => setEditing({ rate: r })}
                  >
                    <Pencil />
                  </IconButton>
                  <IconButton
                    label={`Smazat sazbu ${r.label}`}
                    variant="ghost"
                    onClick={() => setRemoving(r)}
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              </li>
            );
          })}
        </ul>
      </FormSection>
      <Notice tone="info" title="Jak sazby fungují">
        {explicitDefault
          ? "Výchozí sazba se předvyplní u nových řádků dokladů."
          : "Výchozí sazba není zvolená, používá se nejvyšší platná."}{" "}
        Při změně sazby (např. od nového roku) přidejte sazbu se stejným kódem a novým datem „platí
        od“ a staré sazbě nastavte „platí do“. Vystavené doklady si sazbu drží, změna se jich
        netýká.
      </Notice>
      {editing && (
        <RateDialog
          key={editing.rate?.id ?? "new"}
          rate={editing.rate}
          today={today}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Smazat sazbu?"
        description={removing?.label ?? ""}
        confirmLabel="Smazat sazbu"
        danger
        onConfirm={() => (removing ? remove(removing) : undefined)}
      >
        <p>
          Sazba se přestane nabízet. Vystavené doklady o ni nepřijdou a smazání jde vrátit tlačítkem
          „Zpět“.
        </p>
      </ConfirmDialog>
    </>
  );
}
