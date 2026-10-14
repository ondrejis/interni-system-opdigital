"use client";

import {
  BigButton,
  ButtonLink,
  JobPicker,
  TOUCH_FIELD,
  TerminalCard,
  TerminalEmpty,
  TouchChoice,
  TouchField,
  TouchSelect,
  localToday,
  reportOutcome,
  useActiveJobs,
  useCommandQuery,
  useJobChoice,
  useModuleUi,
  useTerminalQueue,
  type TerminalWidgetProps,
} from "@rebar/ui";
import { Wrench } from "lucide-react";
import { useState } from "react";

type Asset = { id: string; name: string; kind: string; plate: string | null; meter: string };
type Options = { assets: Asset[] };

/** Stroje v terminálu: zápis dnešního provozu (km nebo motohodiny) a hlášení závady stroje či vozidla. */
export function FleetTerminalWidget({ label, variant, pageHref }: TerminalWidgetProps) {
  if (variant === "card")
    return (
      <TerminalCard title={label} icon="truck" testId="tile-stroje.fleet">
        <p className="mb-3 text-base text-muted">
          Zapište dnešní provoz stroje nebo vozidla, případně nahlaste závadu.
        </p>
        {pageHref && (
          <ButtonLink href={pageHref} variant="primary" className="w-full">
            <Wrench /> Otevřít
          </ButtonLink>
        )}
      </TerminalCard>
    );
  return <FleetForm label={label} />;
}

function FleetForm({ label }: { label: string }) {
  const hasJobs = useModuleUi().has("zakazky");
  const options = useCommandQuery<Options>("stroje.options", {});
  const { jobs, loading } = useActiveJobs(hasJobs);
  const choice = useJobChoice(jobs);
  const { submit } = useTerminalQueue();
  const assets = options.data?.assets ?? [];
  const [assetId, setAssetId] = useState("");
  const [mode, setMode] = useState<"log" | "defect">("log");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [blocking, setBlocking] = useState<"normal" | "blocking">("normal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const asset =
    assets.find((a) => a.id === assetId) ?? (assets.length === 1 ? assets[0] : undefined);
  const unit = asset?.meter === "mth" ? "motohodin" : "km";

  async function send() {
    setError(null);
    if (!asset) return setError("Vyberte stroj nebo vozidlo.");
    setBusy(true);
    try {
      if (mode === "log") {
        const n = Number(amount.replace(",", "."));
        if (!Number.isFinite(n) || n <= 0) return setError(`Zadejte počet ${unit}.`);
        if (!choice.value && !purpose.trim()) return setError("Vyberte zakázku nebo napište účel.");
        const out = await submit({
          command: "stroje.log.save",
          input: {
            assetId: asset.id,
            date: localToday(),
            amount: n,
            jobId: choice.value || null,
            purpose: purpose.trim() || null,
          },
          label: `Provoz: ${asset.name}, ${amount} ${unit}`,
          group: `stroje:${asset.id}`,
        });
        if (reportOutcome(out, "Provoz zapsán.")) {
          setAmount("");
          setPurpose("");
        }
      } else {
        if (title.trim().length < 3) return setError("Popište závadu.");
        const out = await submit({
          command: "stroje.defect.report",
          input: {
            assetId: asset.id,
            title: title.trim(),
            description: description.trim() || null,
            severity: blocking,
          },
          label: `Závada: ${asset.name}, ${title.trim()}`,
          group: `stroje:${asset.id}`,
        });
        if (reportOutcome(out, "Závada nahlášena.")) {
          setTitle("");
          setDescription("");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <TerminalCard title={label} icon="truck" testId="tile-stroje.fleet" bare>
      {options.isLoading ? null : assets.length === 0 ? (
        <TerminalEmpty>Nemáte přístup k žádnému stroji ani vozidlu.</TerminalEmpty>
      ) : (
        <div className="space-y-4">
          <TouchField label="Stroj nebo vozidlo">
            {(id) => (
              <TouchSelect
                id={id}
                value={asset?.id ?? ""}
                onChange={setAssetId}
                placeholder="Vyberte"
                options={assets.map((a) => ({
                  value: a.id,
                  label: a.plate ? `${a.name} (${a.plate})` : a.name,
                }))}
              />
            )}
          </TouchField>
          <TouchChoice
            label="Co chcete zapsat"
            value={mode}
            onChange={setMode}
            options={[
              { value: "log", label: "Provoz" },
              { value: "defect", label: "Závada" },
            ]}
          />
          {mode === "log" ? (
            <>
              <TouchField label={`Dnes najeto / odpracováno (${unit})`}>
                {(id) => (
                  <input
                    id={id}
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className={`${TOUCH_FIELD} h-14`}
                  />
                )}
              </TouchField>
              {hasJobs && (
                <JobPicker
                  jobs={jobs}
                  loading={loading}
                  value={choice.value}
                  onChange={choice.set}
                  optional
                />
              )}
              {!choice.value && (
                <TouchField label="Účel">
                  {(id) => (
                    <input
                      id={id}
                      value={purpose}
                      maxLength={200}
                      onChange={(e) => setPurpose(e.target.value)}
                      className={`${TOUCH_FIELD} h-14`}
                    />
                  )}
                </TouchField>
              )}
            </>
          ) : (
            <>
              <TouchField label="Co je špatně">
                {(id) => (
                  <input
                    id={id}
                    value={title}
                    maxLength={200}
                    onChange={(e) => setTitle(e.target.value)}
                    className={`${TOUCH_FIELD} h-14`}
                  />
                )}
              </TouchField>
              <TouchChoice
                label="Závažnost"
                value={blocking}
                onChange={setBlocking}
                options={[
                  { value: "normal", label: "Jde používat" },
                  { value: "blocking", label: "Nejde používat" },
                ]}
              />
              <TouchField label="Podrobnosti (nepovinné)">
                {(id) => (
                  <textarea
                    id={id}
                    value={description}
                    rows={3}
                    maxLength={2000}
                    onChange={(e) => setDescription(e.target.value)}
                    className={`${TOUCH_FIELD} py-3`}
                  />
                )}
              </TouchField>
            </>
          )}
          {error && (
            <p role="alert" className="text-base text-danger">
              {error}
            </p>
          )}
          <BigButton variant="primary" loading={busy} onClick={() => void send()}>
            {mode === "log" ? "Zapsat provoz" : "Nahlásit závadu"}
          </BigButton>
        </div>
      )}
    </TerminalCard>
  );
}
