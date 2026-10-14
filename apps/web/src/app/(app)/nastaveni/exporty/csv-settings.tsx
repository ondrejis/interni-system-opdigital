"use client";

import { Button, FormSection, Skeleton, successToast } from "@rebar/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getExportSettingsAction, saveExportSettingsAction } from "@/server/export-actions";
import { unwrap } from "../_shared/action-query";
import { LoadError } from "./exports-ui";

type Delimiter = ";" | ",";
type Choice = "default" | Delimiter;

const NAME: Record<Delimiter, string> = { ";": "středník", ",": "čárka" };

/** Nastavení exportů: oddělovač hodnot v souborech CSV (výchozí hodnota je v konfiguraci klienta). */
export function ExportSettings() {
  const q = useQuery({
    queryKey: ["exports", "settings"],
    queryFn: () => unwrap(getExportSettingsAction({})),
    staleTime: 0,
  });
  if (q.isLoading) return <Skeleton className="h-48" />;
  if (q.isError || !q.data)
    return (
      <LoadError
        title="Nastavení se nepodařilo načíst"
        message={q.error?.message}
        onRetry={() => void q.refetch()}
      />
    );
  return (
    <Form
      key={q.data.csvDelimiter ?? "default"}
      saved={q.data.csvDelimiter}
      configDefault={q.data.configDefault}
    />
  );
}

function Form({ saved, configDefault }: { saved: Delimiter | null; configDefault: Delimiter }) {
  const qc = useQueryClient();
  const [choice, setChoice] = useState<Choice>(saved ?? "default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = choice !== (saved ?? "default");
  const effective = choice === "default" ? configDefault : choice;

  const options: { value: Choice; label: string; hint: string }[] = [
    {
      value: "default",
      label: `Výchozí (${NAME[configDefault]})`,
      hint: "Hodnota z nastavení systému pro vašeho klienta.",
    },
    {
      value: ";",
      label: "Středník",
      hint: "Pro českou verzi Excelu: soubor se otevře rovnou ve sloupcích.",
    },
    { value: ",", label: "Čárka", hint: "Pro anglickou verzi Excelu a import do jiných systémů." },
  ];

  return (
    <FormSection
      title="Soubory CSV"
      description="Oddělovač hodnot, který se použije ve všech exportech do CSV (i v plánovaných)."
      footer={
        <>
          {error && (
            <p role="alert" className="mr-auto text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            variant="primary"
            loading={busy}
            disabled={!dirty}
            onClick={async () => {
              setBusy(true);
              setError(null);
              const r = await saveExportSettingsAction({
                csvDelimiter: choice === "default" ? null : choice,
              });
              setBusy(false);
              if (!r.ok) return setError(r.error);
              successToast("Nastavení exportů uloženo.");
              await qc.invalidateQueries({ queryKey: ["exports", "settings"] });
            }}
          >
            Uložit
          </Button>
        </>
      }
    >
      <div role="radiogroup" aria-label="Oddělovač CSV" className="space-y-1">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-8 cursor-pointer items-start gap-2 rounded-md px-1 py-1 hover:bg-hover pointer-coarse:min-h-11"
          >
            <input
              type="radio"
              name="csv-delimiter"
              value={o.value}
              checked={choice === o.value}
              onChange={() => setChoice(o.value)}
              className="mt-1 size-4 shrink-0 cursor-pointer accent-[var(--accent)]"
            />
            <span>
              <span className="font-medium">{o.label}</span>
              <span className="block text-sm text-faint">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted">
        Teď se používá: <strong className="font-medium text-fg">{NAME[effective]}</strong>.
      </p>
    </FormSection>
  );
}
