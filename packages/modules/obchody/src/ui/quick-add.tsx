"use client";

import { useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Combobox,
  DatePicker,
  Dialog,
  DialogContent,
  Field,
  Icon,
  Input,
  MoneyInput,
  useCommandMutation,
  useEntityApi,
} from "@rebar/ui";
import type { CreatedDeal, QuickAddInput } from "../contract";

const SERVICES = [
  { value: "web", label: "Web" },
  { value: "marketing", label: "Marketing" },
  { value: "systemy", label: "Systémy" },
] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fáze, do které obchod rovnou patří (tlačítko „+“ pod sloupcem boardu); jinak první fáze. */
  defaultStageId?: string | undefined;
  /** Po založení (id obchodu): otevře se jeho detail. */
  onCreated?: (dealId: string) => void;
};

/**
 * Rychlé založení obchodu (klávesa C, tlačítko „Nový obchod“): firma, kontakt a obchod v jednom kroku. Firmu i kontakt
 * jde vybrat z existujících, nebo zadat novou (server najde shodu podle IČO, názvu, e-mailu a telefonu a založí je až
 * v téže transakci jako obchod). Firma se tím nestává klientem, až výhrou.
 */
export function QuickAddDealDialog({ open, onOpenChange, defaultStageId, onCreated }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent
          title="Nový obchod"
          description="Vyplňte jen to nutné, zbytek doplníte v detailu."
          className="top-[6vh] w-[min(38rem,calc(100vw-2rem))]"
        >
          <QuickAddForm
            {...(defaultStageId ? { defaultStageId } : {})}
            onClose={() => onOpenChange(false)}
            {...(onCreated ? { onCreated } : {})}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function QuickAddForm({
  defaultStageId,
  onClose,
  onCreated,
}: {
  defaultStageId?: string;
  onClose: () => void;
  onCreated?: (dealId: string) => void;
}) {
  const api = useEntityApi();
  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [ico, setIco] = useState("");
  const [personId, setPersonId] = useState<string | null>(null);
  const [personName, setPersonName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [value, setValue] = useState<number | null>(null);
  const [services, setServices] = useState<string[]>([]);
  const [close, setClose] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const names = useRef<Record<string, string>>({});
  const search = (entity: "company" | "person") => async (q: string) => {
    const found = await api.lookups.records(entity, q);
    for (const o of found) names.current[o.value] = o.label;
    return found;
  };
  const create = useCommandMutation<QuickAddInput, CreatedDeal>("obchody.quickAdd");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const hasCompany = !!companyId || companyName.trim();
    const hasPerson = !!personId || personName.trim();
    if (!title.trim() && !hasCompany && !hasPerson) {
      setError("Vyplňte název obchodu, firmu nebo kontakt.");
      return;
    }
    setError(null);
    const input: QuickAddInput = {
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(companyId
        ? { company: { id: companyId } }
        : companyName.trim()
          ? { company: { name: companyName.trim(), ...(ico.trim() ? { ico: ico.trim() } : {}) } }
          : {}),
      ...(personId
        ? { person: { id: personId } }
        : personName.trim()
          ? {
              person: {
                name: personName.trim(),
                ...(email.trim() ? { email: email.trim() } : {}),
                ...(phone.trim() ? { phone: phone.trim() } : {}),
              },
            }
          : {}),
      valueMinor: value,
      services: services as QuickAddInput["services"],
      expectedCloseDate: close,
      ...(defaultStageId ? { stageId: defaultStageId } : {}),
    };
    create.mutate(input, {
      onSuccess: (r) => {
        onClose();
        onCreated?.(r.dealId);
      },
      onError: (err) => setError(err.message),
    });
  }

  return (
    <form onSubmit={submit} data-testid="quick-add-deal">
      <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4">
        <Field label="Název obchodu" hint="Bez názvu se použije firma nebo kontakt.">
          <Input
            autoFocus
            aria-label="Název obchodu"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <fieldset className="space-y-2 rounded-lg border border-line p-3">
          <legend className="px-1 text-sm font-medium text-muted">Firma</legend>
          <Combobox
            aria-label="Existující firma"
            load={search("company")}
            value={companyId}
            selectedLabels={companyId ? { [companyId]: names.current[companyId] ?? "…" } : {}}
            clearable
            placeholder="Vybrat existující firmu…"
            searchPlaceholder="Hledat firmu…"
            onChange={(v) => {
              setCompanyId(typeof v === "string" ? v : null);
              if (typeof v === "string") setCompanyName("");
            }}
          />
          {!companyId && (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <Input
                aria-label="Název nové firmy"
                placeholder="…nebo název nové firmy"
                value={companyName}
                maxLength={200}
                onChange={(e) => setCompanyName(e.target.value)}
              />
              <Input
                aria-label="IČO nové firmy"
                placeholder="IČO"
                inputMode="numeric"
                value={ico}
                maxLength={20}
                onChange={(e) => setIco(e.target.value)}
              />
            </div>
          )}
        </fieldset>
        <fieldset className="space-y-2 rounded-lg border border-line p-3">
          <legend className="px-1 text-sm font-medium text-muted">Kontakt</legend>
          <Combobox
            aria-label="Existující kontakt"
            load={search("person")}
            value={personId}
            selectedLabels={personId ? { [personId]: names.current[personId] ?? "…" } : {}}
            clearable
            placeholder="Vybrat existující kontakt…"
            searchPlaceholder="Hledat kontakt…"
            onChange={(v) => {
              setPersonId(typeof v === "string" ? v : null);
              if (typeof v === "string") setPersonName("");
            }}
          />
          {!personId && (
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                aria-label="Jméno nového kontaktu"
                placeholder="…nebo jméno"
                value={personName}
                maxLength={200}
                onChange={(e) => setPersonName(e.target.value)}
              />
              <Input
                aria-label="E-mail kontaktu"
                type="email"
                placeholder="E-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                aria-label="Telefon kontaktu"
                type="tel"
                placeholder="Telefon"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          )}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Hodnota (Kč)">
            <MoneyInput
              aria-label="Hodnota obchodu"
              value={value}
              onChange={setValue}
              placeholder="50 000"
            />
          </Field>
          <Field label="Očekávané uzavření">
            <DatePicker value={close} onChange={setClose} />
          </Field>
        </div>
        <div role="group" aria-label="Služby" className="flex flex-wrap gap-x-4 gap-y-1">
          {SERVICES.map((s) => (
            <label key={s.value} className="flex items-center gap-2">
              <Checkbox
                aria-label={s.label}
                checked={services.includes(s.value)}
                onCheckedChange={(c) =>
                  setServices((cur) =>
                    c === true ? [...cur, s.value] : cur.filter((x) => x !== s.value),
                  )
                }
              />
              {s.label}
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger" data-testid="quick-add-error">
            {error}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button type="button" variant="ghost" onClick={onClose}>
          Zrušit
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={create.isPending}
          data-testid="quick-add-submit"
        >
          <Icon name="plus" /> Založit obchod
        </Button>
      </div>
    </form>
  );
}
