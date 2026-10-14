"use client";

import type { EntityDescriptor, RecordRow } from "@rebar/core/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Button } from "../components/button";
import { Field } from "../components/input";
import { Dialog, DialogContent } from "../components/overlay";
import { Kbd } from "../components/badges";
import { successToast } from "../components/toast";
import { modKey } from "../hooks/use-hotkeys";
import { useEntityApi } from "./context";
import { keys } from "./hooks";
import { FormField } from "./form-field";

type Props = {
  entity: EntityDescriptor;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Předvyplněné hodnoty podle kontextu (např. firma při zakládání zakázky z její stránky). */
  defaults?: Record<string, unknown> | undefined;
  onCreated: (row: RecordRow, opts: { open: boolean }) => void;
};

/** Vytvoření záznamu: jen povinná pole a název, ostatní po rozkliknutí. Cmd/Ctrl+Enter odešle. */
export function CreateDialog({ entity, open, onOpenChange, defaults, onCreated }: Props) {
  const api = useEntityApi();
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initial = useMemo(() => {
    const v: Record<string, unknown> = { ...defaults };
    for (const a of entity.attributes)
      if (a.default !== undefined && !a.readonly && v[a.key] === undefined) v[a.key] = a.default;
    const status = entity.attributes.find((a) => a.key === entity.statusKey);
    if (status?.required && v[status.key] === undefined)
      v[status.key] = status.stages?.find((s) => s.kind === "open")?.id ?? status.stages?.[0]?.id;
    return v;
  }, [defaults, entity]);

  // Formulář se vyprázdní při otevření, a to ještě při vykreslování (ne v efektu): efekt se spustí až po vykreslení,
  // takže by mohl smazat text, který uživatel (nebo test) stihl napsat, a změna `initial` za otevřeného okna
  // (obnovený popis entity) by rozepsaný formulář vynulovala.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValues(initial);
      setMore(false);
      setError(null);
    }
  }

  const writable = entity.attributes.filter((a) => !a.readonly);
  const primary = writable.filter((a) => a.required || a.key === entity.titleKey);
  const extra = writable.filter((a) => !primary.includes(a));
  const shown = more ? [...primary, ...extra] : primary;

  const create = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.create(entity.key, v),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.all(entity.key) });
    },
  });

  // rychlý dvojklik odešle formulář dvakrát dřív, než se stihne překreslit `isPending`: hlídá to příznak
  const sending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function submit(then: "open" | "another" | "close") {
    if (sending.current) return;
    setError(null);
    // pole s rozepsanou neplatnou hodnotou (třeba „abc“ v částce) se neodešle jako prázdné: nejdřív oprava
    if (formRef.current?.querySelector('[aria-invalid="true"]'))
      return setError("Některé pole má neplatnou hodnotu. Opravte zvýrazněná pole.");
    const clean = Object.fromEntries(
      Object.entries(values).filter(
        ([, v]) =>
          v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0),
      ),
    );
    const missing = primary.filter((a) => a.type !== "checkbox" && clean[a.key] === undefined);
    if (missing.length)
      return setError(`Vyplňte: ${missing.map((a) => a.label.toLowerCase()).join(", ")}.`);
    sending.current = true;
    try {
      const res = await create.mutateAsync(clean);
      successToast(`${entity.label.one} vytvořen${entity.label.one.endsWith("a") ? "a" : ""}.`);
      if (then === "another") setValues(initial);
      else onOpenChange(false);
      onCreated(res.row, { open: then === "open" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      sending.current = false;
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Nový záznam: ${entity.label.one.toLowerCase()}`}>
        <form
          ref={formRef}
          className="px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit("open");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit("open");
            }
          }}
        >
          {shown.map((a, i) => (
            <Field
              key={a.key}
              label={`${a.label}${a.required ? " *" : ""}`}
              htmlFor={`new-${a.key}`}
            >
              <FormField
                attr={a}
                id={`new-${a.key}`}
                autoFocus={i === 0}
                value={values[a.key]}
                onChange={(v) => setValues((s) => ({ ...s, [a.key]: v }))}
                lookups={api.lookups}
              />
            </Field>
          ))}
          {extra.length > 0 && (
            <button
              type="button"
              className="mb-3 text-sm text-accent hover:underline"
              onClick={() => setMore((m) => !m)}
            >
              {more ? "Skrýt další pole" : `Další pole (${extra.length})`}
            </button>
          )}
          {error && (
            <p
              role="alert"
              className="mb-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
            <span className="hidden items-center gap-1 text-sm text-faint sm:flex">
              <Kbd>{modKey()}</Kbd>
              <Kbd>Enter</Kbd> vytvoří
            </span>
            <div className="ml-auto flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => void submit("another")}
                disabled={create.isPending}
              >
                Vytvořit a přidat další
              </Button>
              <Button type="submit" variant="primary" loading={create.isPending}>
                Vytvořit
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
