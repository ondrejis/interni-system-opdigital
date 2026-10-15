"use client";

import {
  Button,
  Checkbox,
  Combobox,
  Dialog,
  DialogContent,
  Field,
  Input,
  successToast,
  useCommandMutation,
  useEntityApi,
  useNav,
} from "@rebar/ui";
import { useState } from "react";
import type { CompanyHit, PersonQuickCreateInput, QuickCreateResult } from "../contract";
import type { PersonDuplicate } from "../duplicates";
import { PointsEditor, type PointDraft } from "./points-card";

/** Výběr organizace s hledáním na serveru (jméno, IČO, město). */
export function CompanyPicker({
  value,
  label,
  onChange,
  ...rest
}: {
  value: string | null;
  label?: string | undefined;
  onChange: (id: string | null) => void;
  "aria-label"?: string;
}) {
  const api = useEntityApi();
  const load = async (q: string) => {
    const r = await api.command<unknown, { companies: CompanyHit[] }>("kontakty.search", {
      q,
      kinds: ["company"],
      limit: 10,
    });
    return r.companies.map((c) => ({
      value: c.id,
      label: c.name,
      hint: [c.ico, c.city].filter(Boolean).join(" · "),
    }));
  };
  return (
    <Combobox
      aria-label={rest["aria-label"] ?? "Organizace"}
      load={load}
      value={value}
      selectedLabels={value && label ? { [value]: label } : {}}
      onChange={(v) => onChange((v as string | null) ?? null)}
      placeholder="Vybrat organizaci…"
      searchPlaceholder="Název, IČO nebo město…"
      clearable
    />
  );
}

/**
 * Formulář rychlého založení kontaktu (KON-05): jméno, organizace, pozice, víc e-mailů a telefonů, LinkedIn.
 * Při shodě e-mailu nebo telefonu s existující osobou ukáže „Možná duplicita“ a nechá vybrat: použít existující,
 * nebo založit přesto (KON-03).
 */
export function QuickContactForm({
  companyId,
  companyLabel,
  onCreated,
  onCancel,
}: {
  companyId?: string | undefined;
  companyLabel?: string | undefined;
  /** Osoba založená, nebo vybraná jako existující (`existing: true`). */
  onCreated: (p: { personId: string; name: string; existing: boolean }) => void;
  onCancel?: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState<string | null>(companyId ?? null);
  const [position, setPosition] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [decision, setDecision] = useState(false);
  const [points, setPoints] = useState<PointDraft[]>([
    { kind: "phone", value: "", label: null, isPrimary: true },
    { kind: "email", value: "", label: null, isPrimary: true },
  ]);
  const [dups, setDups] = useState<PersonDuplicate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useCommandMutation<PersonQuickCreateInput, QuickCreateResult>(
    "kontakty.person.quickCreate",
    {
      onSuccess: (r) => {
        if (r.created) {
          successToast("Kontakt je založený.");
          onCreated({ personId: r.personId, name: r.name, existing: false });
        } else setDups(r.duplicates);
      },
    },
  );
  const submit = (force: boolean) => {
    setError(null);
    if (!lastName.trim()) return setError("Vyplňte příjmení.");
    create.mutate({
      ...(firstName.trim() ? { firstName: firstName.trim() } : {}),
      lastName: lastName.trim(),
      ...(company ? { companyId: company } : {}),
      ...(position.trim() ? { position: position.trim() } : {}),
      ...(linkedin.trim() ? { linkedin: linkedin.trim() } : {}),
      isDecisionMaker: decision,
      points: points
        .filter((p) => p.value.trim())
        .map(({ kind, value, label, isPrimary }) => ({ kind, value, label, isPrimary })),
      ...(force ? { force: true } : {}),
    });
  };

  return (
    <form
      className="space-y-3 px-5 py-4"
      data-testid="quick-contact"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Jméno" htmlFor="qc-first">
          <Input
            id="qc-first"
            autoFocus
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </Field>
        <Field label="Příjmení *" htmlFor="qc-last">
          <Input id="qc-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
      </div>
      <Field label="Organizace">
        <CompanyPicker value={company} label={companyLabel} onChange={setCompany} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pozice" htmlFor="qc-pos">
          <Input id="qc-pos" value={position} onChange={(e) => setPosition(e.target.value)} />
        </Field>
        <Field label="LinkedIn" htmlFor="qc-li">
          <Input id="qc-li" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={decision} onCheckedChange={(v) => setDecision(v === true)} />
        Rozhoduje (rozhodovatel v organizaci)
      </label>
      <PointsEditor value={points} onChange={setPoints} />
      {dups && dups.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-warning p-3 text-sm"
          data-testid="person-duplicates"
        >
          <p className="mb-1.5 font-medium">
            Možná duplicita: tento telefon nebo e-mail už někdo má.
          </p>
          <ul className="space-y-1">
            {dups.map((d) => (
              <li
                key={`${d.personId}-${d.match}`}
                className="flex items-center justify-between gap-2"
              >
                <span>
                  <strong>{d.name}</strong>
                  {d.companyName ? ` · ${d.companyName}` : ""} ·{" "}
                  {d.match === "email" ? "e-mail" : "telefon"} {d.value}
                </span>
                <Button
                  size="sm"
                  onClick={() => onCreated({ personId: d.personId, name: d.name, existing: true })}
                >
                  Použít tento
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              variant="primary"
              loading={create.isPending}
              onClick={() => submit(true)}
            >
              Založit přesto
            </Button>
          </div>
        </div>
      )}
      {(error || create.error) && (
        <p role="alert" className="text-sm text-danger">
          {error ?? create.error?.message}
        </p>
      )}
      <div className="flex justify-end gap-2 border-t border-line pt-3">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Zrušit
          </Button>
        )}
        <Button type="submit" variant="primary" loading={create.isPending && !dups}>
          Založit kontakt
        </Button>
      </div>
    </form>
  );
}

/**
 * Okno rychlého založení kontaktu pro obchody, zakázky a organizace (`@rebar/kontakty/ui`): po založení (nebo
 * výběru existujícího) zavolá `onCreated` a okno zavře; propojení s obchodem či zakázkou dělá volající.
 */
export function QuickContactDialog({
  open,
  onOpenChange,
  companyId,
  companyLabel,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string | undefined;
  companyLabel?: string | undefined;
  onCreated?: (p: { personId: string; name: string; existing: boolean }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Nový kontakt" className="w-[min(40rem,calc(100vw-2rem))]">
        <QuickContactForm
          companyId={companyId}
          companyLabel={companyLabel}
          onCancel={() => onOpenChange(false)}
          onCreated={(p) => {
            onOpenChange(false);
            onCreated?.(p);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Stránka `/kontakty/osoby/novy` (paleta, odkazy): formulář a přechod na detail založeného kontaktu. */
export function NewContactPage({ query }: { query: Record<string, string> }) {
  const nav = useNav();
  return (
    <div className="mx-auto w-full max-w-2xl p-4">
      <QuickContactForm
        companyId={query.firma}
        onCreated={(p) => nav.push(`/kontakty/osoby/${p.personId}`)}
        onCancel={() => nav.push("/kontakty/osoby")}
      />
    </div>
  );
}
