"use client";

import {
  Card,
  CardBody,
  CardHeader,
  Field,
  Skeleton,
  Textarea,
  errorToast,
  useCan,
  useCommandMutation,
} from "@rebar/ui";
import { useEffect, useRef, useState } from "react";
import type { ClientContextDto } from "../contract";
import { useClientSummary } from "./hooks";

type FieldKey = keyof ClientContextDto;
const FIELDS: { key: FieldKey; label: string; hint: string; rows: number }[] = [
  { key: "decisionMaker", label: "Kdo rozhoduje", hint: "Jméno, role, co od něj čekat.", rows: 2 },
  {
    key: "howToCommunicate",
    label: "Jak komunikovat",
    hint: "Telefon, e-mail, kdy volat, tykání či vykání.",
    rows: 3,
  },
  {
    key: "history",
    label: "Historie spolupráce",
    hint: "Jak spolupráce začala a co se dělo.",
    rows: 5,
  },
  { key: "notes", label: "Na co si dát pozor", hint: "Citlivá témata, domluvy, rizika.", rows: 3 },
  {
    key: "endReason",
    label: "Proč spolupráce skončila",
    hint: "Vyplňuje se u bývalého klienta.",
    rows: 2,
  },
];
const EMPTY: ClientContextDto = {
  decisionMaker: "",
  howToCommunicate: "",
  history: "",
  notes: "",
  endReason: "",
};

/**
 * Záložka Kontext (KLI-06, R-27): pět textových polí upravovaných přímo na místě. Pole se ukládá po 800 ms od
 * poslední změny a při opuštění pole, po jednom (souběžná úprava jiného pole se nepřepíše).
 */
export function ClientContextTab({ companyId }: { companyId: string }) {
  const can = useCan();
  const q = useClientSummary(companyId);
  const [values, setValues] = useState<ClientContextDto>(EMPTY);
  const saved = useRef<ClientContextDto>(EMPTY);
  const loaded = useRef<string | null>(null);
  const timers = useRef<Partial<Record<FieldKey, ReturnType<typeof setTimeout>>>>({});
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const save = useCommandMutation<Record<string, string>, unknown>("klienti.saveContext", {
    invalidate: [["command", "klienti.summary"]],
  });
  const editable = can("klienti.write");

  useEffect(() => {
    // první načtení karty naplní pole; pozdější obnovy dat nepřepisují to, co uživatel píše
    if (q.data && loaded.current !== companyId) {
      loaded.current = companyId;
      setValues(q.data.context);
      saved.current = q.data.context;
    }
  }, [q.data, companyId]);
  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach((x) => x && clearTimeout(x));
  }, []);

  function flush(key: FieldKey, value: string) {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    delete timers.current[key];
    if (value === saved.current[key]) return;
    setState("saving");
    save.mutate(
      { companyId, [key]: value },
      {
        onSuccess: () => {
          saved.current = { ...saved.current, [key]: value };
          setState("saved");
        },
        onError: (e) => {
          setState("idle");
          errorToast(e.message);
        },
      },
    );
  }
  function change(key: FieldKey, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => flush(key, value), 800);
  }

  if (q.isLoading) return <Skeleton className="h-64" />;
  return (
    <Card aria-label="Kontext klienta" data-testid="client-context">
      <CardHeader
        title="Kontext klienta"
        action={
          <span className="text-sm text-faint" aria-live="polite" data-testid="context-state">
            {!editable
              ? "Jen ke čtení"
              : state === "saving"
                ? "Ukládám…"
                : state === "saved"
                  ? "Uloženo"
                  : ""}
          </span>
        }
      />
      <CardBody>
        <div className="grid gap-x-4 lg:grid-cols-2">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              <Textarea
                value={values[f.key]}
                rows={f.rows}
                disabled={!editable}
                onChange={(e) => change(f.key, e.target.value)}
                onBlur={(e) => flush(f.key, e.target.value)}
                data-testid={`context-${f.key}`}
              />
            </Field>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
