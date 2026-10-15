"use client";

import { formatDate } from "@rebar/core/shared";
import {
  Avatar,
  Button,
  Chip,
  Combobox,
  DatePicker,
  Popover,
  PopoverContent,
  PopoverTrigger,
  PipelineStepper,
  Skeleton,
  Slot,
  cn,
  errorToast,
  successToast,
  useCommandMutation,
  useEntityApi,
  useModuleUi,
  useNav,
  useUpdateAttribute,
  type RecordHeader,
} from "@rebar/ui";
import { CheckCheck, ChevronDown, ListChecks, Pencil, RotateCcw, Users } from "lucide-react";
import { useState } from "react";
import type { JobDetail } from "../contract";
import {
  JOB_STATUSES,
  JOB_STATUS_COLORS,
  JOB_STATUS_LABELS,
  OPEN_STATUSES,
  type CompleteReason,
  type JobStatusCode,
} from "../shared";
import { CompleteDialog, usePhaseFlow } from "./flows";
import { useJobDetail } from "./hooks";
import {
  isClosingStatus,
  nextPhase,
  phaseProgress,
  reasonForStatus,
  stripBlockedReason,
  stripStages,
} from "./logic";
import {
  AvatarStack,
  DueText,
  LoadError,
  PrivateBadge,
  StatusChip,
  TypeChip,
  UserCombobox,
  WarningIcon,
} from "./parts";
import { PhasesEditDialog } from "./phases-edit";
import { RetainerDialog } from "./retainer";
import { TeamEditor } from "./team";

/** Tlačítko ve tvaru štítku stavu: otevře výběr stavu zakázky. */
function StatusPicker({
  status,
  disabled,
  onPick,
}: {
  status: JobStatusCode;
  disabled: boolean;
  onPick: (s: JobStatusCode) => void;
}) {
  return (
    <Combobox
      options={JOB_STATUSES.map((s) => ({ value: s, label: JOB_STATUS_LABELS[s], color: JOB_STATUS_COLORS[s] }))}
      value={status}
      onChange={(v) => v && onPick(v as JobStatusCode)}
      disabled={disabled}
      searchPlaceholder="Najít stav…"
      trigger={
        <button
          type="button"
          disabled={disabled}
          aria-label={`Stav zakázky: ${JOB_STATUS_LABELS[status]}. Změnit`}
          data-testid="job-status-picker"
          className="inline-flex items-center gap-1 rounded-full disabled:cursor-default"
        >
          <Chip color={JOB_STATUS_COLORS[status]} dot>
            {JOB_STATUS_LABELS[status]}
          </Chip>
          {!disabled && <ChevronDown className="size-3 text-faint" aria-hidden />}
        </button>
      }
    />
  );
}

/**
 * Hlavička detailu zakázky (pás pod názvem): kód, typ, stav, varování, zámek, klient, vlastník, tým, termín, sloty
 * jiných modulů (Disk, retainer), pás fází a u marketingu volba po vyhodnocení úvodní fáze. Mobil: vše zůstává dostupné,
 * pás fází se posouvá do stran.
 */
export const JobHeader: RecordHeader = ({ entity, id, row, labels }) => {
  const q = useJobDetail(id);
  if (q.isLoading)
    return (
      <div className="space-y-2" data-testid="job-header">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-10" />
      </div>
    );
  if (q.error || !q.data)
    return (
      <div data-testid="job-header">
        <LoadError message={q.error?.message ?? "Zakázka nenalezena."} onRetry={() => void q.refetch()} />
      </div>
    );
  return (
    <HeaderBody
      jobId={id}
      detail={q.data}
      row={row}
      canWrite={entity.can.write}
      clientLabel={labels.company?.[q.data.job.companyId]?.label ?? q.data.job.companyName}
    />
  );
};

function HeaderBody({
  jobId,
  detail,
  row,
  canWrite,
  clientLabel,
}: {
  jobId: string;
  detail: JobDetail;
  row: Parameters<RecordHeader>[0]["row"];
  canWrite: boolean;
  clientLabel: string | null;
}) {
  const api = useEntityApi();
  const { Link } = useNav();
  const j = detail.job;
  const flow = usePhaseFlow();
  const update = useUpdateAttribute("job");
  const setStatus = useCommandMutation<{ jobId: string; status: JobStatusCode }>("zakazky.setStatus");
  const financeOn = useModuleUi().has("finance");
  const [closing, setClosing] = useState<CompleteReason | null>(null);
  const [retainerOpen, setRetainerOpen] = useState(false);
  const [phasesOpen, setPhasesOpen] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  const live = OPEN_STATUSES.includes(j.status);
  const current = detail.phases.find((p) => p.id === j.currentPhaseId) ?? null;
  const following = nextPhase(detail.phases, j.currentPhaseId);
  const progress = phaseProgress(detail.phases);
  const clientHref = api.hrefFor("company", j.companyId);
  const names = Object.fromEntries([
    ...(j.ownerId && j.ownerName ? [[j.ownerId, j.ownerName]] : []),
    ...detail.members.map((m) => [m.userId, m.name]),
  ]);
  const team = [
    ...(j.ownerId && j.ownerName ? [{ id: j.ownerId, name: j.ownerName }] : []),
    ...detail.members.filter((m) => m.userId !== j.ownerId).map((m) => ({ id: m.userId, name: m.name })),
  ];
  const warningCard = { overdue: detail.overdue, slipping: detail.slipping, dueDate: j.dueDate };

  function pickStatus(s: JobStatusCode) {
    if (s === j.status) return;
    if (s === "done" || s === "cancelled") return setClosing(reasonForStatus(s, j));
    setStatus.mutate(
      { jobId, status: s },
      { onSuccess: () => successToast(`Stav: ${JOB_STATUS_LABELS[s]}.`), onError: (e) => errorToast(e.message) },
    );
  }

  const patch = (attr: string, value: unknown) =>
    update.mutate(
      { id: jobId, attr, value, updatedAt: row.updatedAt },
      { onError: (e) => errorToast(e.message) },
    );

  return (
    <div className="space-y-3" data-testid="job-header" data-status={j.status} data-job={jobId}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span
          className="rounded-md bg-hover px-2 py-0.5 font-mono text-sm font-medium"
          data-testid="job-code"
          title="Kód zakázky"
        >
          {j.number}
        </span>
        <TypeChip type={j.type} />
        <StatusPicker status={j.status} disabled={!canWrite || update.isPending} onPick={pickStatus} />
        <WarningIcon card={warningCard} />
        {j.isPrivate && <PrivateBadge />}
        {j.marketingStage && j.type === "marketing" && (
          <Chip color="orange" data-testid="job-marketing-stage">
            {j.marketingStage === "intro"
              ? "Úvodní fáze"
              : j.marketingStage === "decision"
                ? "Čeká na rozhodnutí"
                : j.marketingStage === "retainer"
                  ? "Retainer"
                  : "Ukončeno"}
          </Chip>
        )}
        <span className="text-sm text-muted">
          Klient:{" "}
          {clientHref ? (
            <Link href={clientHref} className="font-medium text-fg hover:underline" data-testid="job-client">
              {clientLabel ?? "Klient"}
            </Link>
          ) : (
            <span className="font-medium text-fg">{clientLabel ?? "Klient"}</span>
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <div className="flex items-center gap-1.5" data-testid="job-owner">
          <span className="text-muted">Vlastník</span>
          {canWrite ? (
            <UserCombobox
              value={j.ownerId}
              labels={names}
              onChange={(v) => v && patch("owner", v)}
              aria-label="Vlastník zakázky"
              trigger={
                <button
                  type="button"
                  aria-label={`Vlastník zakázky: ${j.ownerName ?? "nikdo"}. Změnit`}
                  className="inline-flex min-h-7 items-center gap-1.5 rounded-md px-1.5 hover:bg-hover"
                >
                  {j.ownerName ? <Avatar name={j.ownerName} size={20} /> : null}
                  <span className="font-medium">{j.ownerName ?? "Nikdo"}</span>
                </button>
              }
            />
          ) : (
            <span className="inline-flex items-center gap-1.5 font-medium">
              {j.ownerName && <Avatar name={j.ownerName} size={20} />}
              {j.ownerName ?? "Nikdo"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5" data-testid="job-members">
          <span className="text-muted">Tým</span>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Tým zakázky: ${team.map((t) => t.name).join(", ") || "nikdo"}. ${canWrite ? "Upravit" : "Zobrazit"}`}
                className="inline-flex min-h-7 items-center gap-1.5 rounded-md px-1.5 hover:bg-hover"
              >
                <AvatarStack people={team} />
                {canWrite && <Users className="size-3.5 text-faint" aria-hidden />}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(26rem,calc(100vw-2rem))] p-3" align="start">
              <p className="mb-2 text-sm font-semibold">Tým zakázky</p>
              <TeamEditor jobId={jobId} members={detail.members} canEdit={canWrite} />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-1.5" data-testid="job-due">
          <span className="text-muted">Termín</span>
          {canWrite ? (
            <DatePicker
              value={j.dueDate}
              onChange={(v) => patch("dueDate", v)}
              open={dueOpen}
              onOpenChange={setDueOpen}
              placeholder="Bez termínu"
              trigger={
                <button
                  type="button"
                  aria-label={`Termín zakázky: ${j.dueDate ? formatDate(j.dueDate) : "bez termínu"}. Změnit`}
                  className="inline-flex min-h-7 items-center rounded-md px-1.5 hover:bg-hover"
                >
                  <DueText due={j.dueDate} live={live} />
                </button>
              }
            />
          ) : (
            <DueText due={j.dueDate} live={live} />
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2" data-testid="job-header-slots">
          <Slot name="job.header.extra" jobId={jobId} row={row} />
        </div>
      </div>

      {detail.phases.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1 basis-full md:basis-0" data-testid="job-phase-strip">
            <PipelineStepper
              label={`Fáze zakázky (${progress.done}/${progress.total} hotovo)`}
              stages={stripStages(detail.phases)}
              currentId={j.currentPhaseId}
              disabled={!canWrite || !live || flow.busy}
              onSelect={(phaseId) => void flow.request(jobId, { phaseId })}
              disabledReason={(phaseId) => {
                const p = detail.phases.find((x) => x.id === phaseId);
                return p ? stripBlockedReason(j, p) : null;
              }}
            />
          </div>
          {canWrite && live && (
            <div className="flex shrink-0 items-center gap-1.5">
              {current && (
                <Button
                  size="sm"
                  disabled={flow.busy}
                  onClick={() => void flow.completeCurrent(jobId, current)}
                  data-testid="phase-complete"
                  title={
                    following
                      ? `Dokončí fázi „${current.name}“ a posune zakázku do fáze „${following.name}“`
                      : `Dokončí poslední fázi „${current.name}“`
                  }
                >
                  <CheckCheck /> Dokončit fázi
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setPhasesOpen(true)} aria-label="Upravit fáze zakázky">
                <Pencil /> Fáze
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted" data-testid="job-no-phases">
          <ListChecks className="size-4" aria-hidden /> Zakázka nemá žádné fáze.
          {canWrite && live && (
            <Button size="sm" variant="ghost" onClick={() => setPhasesOpen(true)}>
              Přidat fáze
            </Button>
          )}
        </p>
      )}

      {detail.decisionPending && live && (
        <div
          role="group"
          aria-label="Rozhodnutí po úvodní fázi"
          data-testid="job-decision"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-accent-soft p-3"
        >
          <div className="min-w-0 flex-1 basis-60">
            <p className="font-medium">Úvodní fáze je vyhodnocená. Jak dál?</p>
            <p className="text-sm text-muted">
              Pokračujte na měsíční retainer, nebo zakázku ukončete.
              {!financeOn && " Retainer vyžaduje modul Finance."}
            </p>
          </div>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                disabled={!financeOn}
                onClick={() => setRetainerOpen(true)}
                data-testid="decision-continue"
              >
                Pokračovat na retainer
              </Button>
              <Button onClick={() => setClosing("retainer_ended")} data-testid="decision-end">
                Ukončit
              </Button>
            </div>
          )}
        </div>
      )}

      {isClosingStatus(j.status) && (
        <div
          className={cn(
            "flex flex-wrap items-center gap-3 rounded-lg p-3",
            j.status === "cancelled" ? "bg-danger-soft" : "bg-success-soft",
          )}
          data-testid="job-closed"
        >
          <StatusChip status={j.status} />
          <span className="min-w-0 flex-1 text-sm">
            {j.status === "cancelled" ? "Zakázka byla zrušena" : "Zakázka je dokončená"}
            {j.completedAt ? ` ${formatDate(j.completedAt)}` : ""}.
          </span>
          {canWrite && (
            <Button
              size="sm"
              onClick={() =>
                setStatus.mutate(
                  { jobId, status: "active" },
                  { onSuccess: () => successToast("Zakázka je znovu aktivní."), onError: (e) => errorToast(e.message) },
                )
              }
            >
              <RotateCcw /> Znovu otevřít
            </Button>
          )}
        </div>
      )}

      {flow.dialog}
      {closing && (
        <CompleteDialog jobId={jobId} reason={closing} open onOpenChange={(o) => !o && setClosing(null)} />
      )}
      <RetainerDialog
        jobId={jobId}
        ownerId={j.ownerId}
        labels={names}
        open={retainerOpen}
        onOpenChange={setRetainerOpen}
      />
      {phasesOpen && (
        <PhasesEditDialog jobId={jobId} phases={detail.phases} open onOpenChange={setPhasesOpen} />
      )}
    </div>
  );
};
