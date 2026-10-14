"use client";

import {
  Button,
  Chip,
  Combobox,
  ConfirmDialog,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  FormSection,
  IconButton,
  Input,
  Notice,
  SegmentedControl,
  cn,
  undoToast,
} from "@rebar/ui";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { runAction } from "@/lib/run-action";
import {
  addStageAction,
  deleteStageAction,
  reorderStagesAction,
  restoreStageAction,
  updateStageAction,
} from "@/server/config-actions";
import { ColorPicker, MoveButtons, moved, useRefreshConfig } from "../_shared/config-ui";

type Kind = "open" | "won" | "lost" | "done";
type Stage = {
  id: string;
  name: string;
  color: string;
  kind: Kind;
  phase: string | null;
  /** Pravděpodobnost výhry (0–100 %) a dny do hnití; jen u pipeline s fázemi (zakázky, CRM). */
  probabilityPct: number | null;
  rottingDays: number | null;
  usage: number;
};
export type PipelineView = {
  id: string;
  key: string;
  name: string;
  entityType: string;
  entityLabel: string;
  /** Pevné fáze, do kterých musí stavy patřit (zakázky); jinak prázdné. */
  phases: { key: string; label: string }[];
  stages: Stage[];
};

const KIND_LABEL: Record<Kind, string> = {
  open: "Otevřený",
  won: "Vyhraný",
  lost: "Ztracený",
  done: "Hotový",
};
const KIND_HINT: Record<Kind, string> = {
  open: "Záznam se ještě řeší.",
  won: "Úspěšný konec (např. zakázka získána).",
  lost: "Neúspěšný konec (prohra, zrušení).",
  done: "Dokončeno bez rozhodování o úspěchu.",
};

const plural = (n: number) =>
  n === 1 ? "1 záznam" : n >= 2 && n <= 4 ? `${n} záznamy` : `${n} záznamů`;

function StageDialog({
  pipeline,
  stage,
  onClose,
  onSaved,
}: {
  pipeline: PipelineView;
  stage: Stage | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(stage?.name ?? "");
  const [color, setColor] = useState(stage?.color ?? "gray");
  const [kind, setKind] = useState<Kind>(stage?.kind ?? "open");
  const [phase, setPhase] = useState<string | null>(stage?.phase ?? null);
  const [probability, setProbability] = useState(stage?.probabilityPct?.toString() ?? "");
  const [rotting, setRotting] = useState(stage?.rottingDays?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const hasPhases = pipeline.phases.length > 0;
  const toInt = (v: string) => (v.trim() === "" ? null : Number(v));
  const probabilityPct = toInt(probability);
  const rottingDays = toInt(rotting);
  const numbersOk =
    (probabilityPct === null ||
      (Number.isInteger(probabilityPct) && probabilityPct >= 0 && probabilityPct <= 100)) &&
    (rottingDays === null ||
      (Number.isInteger(rottingDays) && rottingDays >= 1 && rottingDays <= 365));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await runAction(
      stage
        ? updateStageAction({
            id: stage.id,
            name,
            color,
            kind,
            phase,
            probabilityPct,
            rottingDays,
          })
        : addStageAction({
            pipelineId: pipeline.id,
            name,
            color,
            kind,
            phase,
            probabilityPct,
            rottingDays,
          }),
      stage ? "Stav uložen." : "Stav přidán.",
    );
    setBusy(false);
    if (res) {
      onSaved();
      onClose();
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={stage ? "Upravit stav" : "Nový stav"}
        description={pipeline.entityLabel}
      >
        <form onSubmit={submit} className="px-5 py-4">
          <Field label="Název stavu" htmlFor="stage-name">
            <Input
              id="stage-name"
              autoFocus
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder="např. Čeká na materiál"
            />
          </Field>
          <Field label="Barva">
            <ColorPicker value={color} onChange={setColor} />
          </Field>
          <Field label="Druh stavu" hint={KIND_HINT[kind]}>
            <SegmentedControl
              label="Druh stavu"
              value={kind}
              onChange={setKind}
              options={(Object.keys(KIND_LABEL) as Kind[]).map((k) => ({
                value: k,
                label: KIND_LABEL[k],
              }))}
            />
          </Field>
          {hasPhases && (
            <Field
              label="Fáze životního cyklu"
              hint="Přesun zakázky do tohoto stavu ji přesune do zvolené fáze. Každá fáze musí mít aspoň jeden stav."
            >
              <Combobox
                aria-label="Fáze životního cyklu"
                value={phase}
                options={pipeline.phases.map((p) => ({ value: p.key, label: p.label }))}
                onChange={(v) => setPhase((v as string | null) ?? null)}
                placeholder="Vyberte fázi"
              />
            </Field>
          )}
          {hasPhases && (
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field
                label="Pravděpodobnost výhry (%)"
                htmlFor="stage-probability"
                hint="Z ceny a pravděpodobnosti se počítá vážená hodnota. Prázdné = nezadáno."
              >
                <Input
                  id="stage-probability"
                  inputMode="numeric"
                  value={probability}
                  maxLength={3}
                  onChange={(e) => setProbability(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="např. 50"
                />
              </Field>
              <Field
                label="Hnití po (dnech)"
                htmlFor="stage-rotting"
                hint="Počet dnů bez aktivity, po kterých se záznam ve stavu označí jako hnijící."
              >
                <Input
                  id="stage-rotting"
                  inputMode="numeric"
                  value={rotting}
                  maxLength={3}
                  onChange={(e) => setRotting(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="např. 7"
                />
              </Field>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Zrušit
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              disabled={name.trim().length === 0 || (hasPhases && !phase) || !numbersOk}
            >
              {stage ? "Uložit" : "Přidat stav"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Správa stavů pipeline: přidat, přejmenovat, přebarvit, přeřadit, přiřadit fázi, smazat nepoužívaný. */
export function StagesAdmin({ pipelines }: { pipelines: PipelineView[] }) {
  const refresh = useRefreshConfig();
  const [selectedId, setSelectedId] = useState(pipelines[0]?.id);
  const pipeline = pipelines.find((p) => p.id === selectedId) ?? pipelines[0];
  const [order, setOrder] = useState<string[] | null>(null);
  const [editing, setEditing] = useState<{ stage: Stage | null } | null>(null);
  const [removing, setRemoving] = useState<Stage | null>(null);
  const [busy, setBusy] = useState(false);

  // po načtení nových dat ze serveru platí pořadí ze serveru
  useEffect(() => setOrder(null), [pipelines]);

  if (!pipeline)
    return (
      <EmptyState
        title="Žádné pipeline"
        description="Zapnuté moduly zatím nemají žádné stavy ke správě."
      />
    );

  const stages = order
    ? order.map((id) => pipeline.stages.find((s) => s.id === id)).filter((s): s is Stage => !!s)
    : pipeline.stages;

  async function move(from: number, delta: -1 | 1) {
    const ids = moved(
      stages.map((s) => s.id),
      from,
      delta,
    );
    setOrder(ids);
    setBusy(true);
    const ok = await runAction(reorderStagesAction({ pipelineId: pipeline!.id, ids }));
    setBusy(false);
    if (ok) refresh();
    else setOrder(null);
  }

  async function remove(stage: Stage) {
    const ok = await runAction(deleteStageAction({ id: stage.id }));
    if (!ok) return false;
    refresh();
    undoToast(`Stav „${stage.name}“ smazán.`, async () => {
      if (await runAction(restoreStageAction({ id: stage.id }), "Stav obnoven.")) refresh();
    });
    return true;
  }

  const covered = pipeline.phases.map((p) => ({
    ...p,
    stages: stages.filter((s) => s.phase === p.key),
  }));

  return (
    <>
      {pipelines.length > 1 && (
        <SegmentedControl
          label="Pipeline"
          value={pipeline.id}
          onChange={(id) => {
            setSelectedId(id);
            setOrder(null);
          }}
          options={pipelines.map((p) => ({ value: p.id, label: p.entityLabel }))}
        />
      )}

      <FormSection
        title={pipeline.name}
        description={`Stavy pro: ${pipeline.entityLabel.toLowerCase()}. Pořadí odshora dolů je pořadí sloupců na kanbanu.`}
        flush
        footer={
          <Button variant="primary" onClick={() => setEditing({ stage: null })}>
            <Plus /> Přidat stav
          </Button>
        }
      >
        <ul className="divide-y divide-line border-t border-line" data-testid="stage-list">
          {stages.map((s, i) => (
            <li
              key={s.id}
              data-testid="stage-row"
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3"
            >
              <div className="flex min-w-48 flex-1 items-center gap-3">
                <Chip color={s.color} dot>
                  {s.name}
                </Chip>
                <span className="text-sm text-muted">{KIND_LABEL[s.kind]}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {s.phase && (
                  <Chip>
                    Fáze: {pipeline.phases.find((p) => p.key === s.phase)?.label ?? s.phase}
                  </Chip>
                )}
                {s.probabilityPct !== null && <Chip>{s.probabilityPct} %</Chip>}
                {s.rottingDays !== null && <Chip>hnití {s.rottingDays} d</Chip>}
                <span
                  className={cn("text-sm tabular", s.usage ? "text-muted" : "text-faint")}
                  data-testid="stage-usage"
                >
                  {s.usage ? plural(s.usage) : "nepoužito"}
                </span>
              </div>
              <div className="flex gap-1">
                <MoveButtons
                  index={i}
                  count={stages.length}
                  name={s.name}
                  disabled={busy}
                  onMove={(d) => void move(i, d)}
                />
                <IconButton
                  label={`Upravit stav ${s.name}`}
                  variant="ghost"
                  onClick={() => setEditing({ stage: s })}
                >
                  <Pencil />
                </IconButton>
                <IconButton
                  label={`Smazat stav ${s.name}`}
                  variant="ghost"
                  onClick={() => setRemoving(s)}
                >
                  <Trash2 />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      </FormSection>

      {pipeline.phases.length > 0 && (
        <FormSection
          title="Fáze životního cyklu"
          description="Fáze jsou pevné (systém podle nich hlídá přechody, rozpočet a fakturaci). Každá musí mít aspoň jeden stav."
          flush
        >
          <ul className="divide-y divide-line border-t border-line" data-testid="phase-list">
            {covered.map((p) => (
              <li key={p.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                <span className="w-32 shrink-0 font-medium">{p.label}</span>
                <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {p.stages.length ? (
                    p.stages.map((s) => (
                      <Chip key={s.id} color={s.color}>
                        {s.name}
                      </Chip>
                    ))
                  ) : (
                    <Chip color="red">Bez stavu</Chip>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </FormSection>
      )}

      <Notice tone="info" title="Co se změní">
        Změna se hned projeví v seznamech, na kanbanu i ve filtrech. Smazat jde jen stav, který
        žádný záznam nepoužívá; záznamy ve stavu nejdřív přesuňte jinam. Smazání jde vrátit.
      </Notice>

      {editing && (
        <StageDialog
          key={editing.stage?.id ?? "new"}
          pipeline={pipeline}
          stage={editing.stage}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Smazat stav?"
        description={removing?.name ?? ""}
        confirmLabel="Smazat stav"
        danger
        onConfirm={() => (removing ? remove(removing) : undefined)}
      >
        {removing && removing.usage > 0 ? (
          <p>
            Stav používá {plural(removing.usage)}. Smazat ho nejde, dokud je nepřesunete do jiného
            stavu.
          </p>
        ) : (
          <p>Stav nikdo nepoužívá, smazání jde potom vrátit tlačítkem „Zpět“.</p>
        )}
      </ConfirmDialog>
    </>
  );
}
