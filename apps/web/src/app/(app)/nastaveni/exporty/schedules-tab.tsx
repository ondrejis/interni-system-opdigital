"use client";

import type { ScheduleInfo } from "@rebar/core/export";
import {
  Button,
  Chip,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Notice,
  cn,
  errorToast,
  successToast,
} from "@rebar/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellOff,
  CalendarClock,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  deleteExportScheduleAction,
  listExportEntitiesAction,
  listExportSchedulesAction,
  listExportTemplatesAction,
  setExportScheduleActiveAction,
  unsubscribeExportScheduleAction,
} from "@/server/export-actions";
import { unwrap } from "../_shared/action-query";
import { formatDateTime } from "../_shared/format";
import { SettingsTable, type TableColumn } from "../_shared/settings-table";
import { ListSkeleton, LoadError, TableCard } from "./exports-ui";
import { deliverLabel, describeTiming, formatLabel, recipientsText, runStatus } from "./labels";
import { ScheduleDialog } from "./schedule-dialog";
import { templateKeys } from "./templates-tab";

const scheduleKeys = {
  list: ["exports", "schedules"] as const,
  entities: ["exports", "entities"] as const,
};

type Pending = { kind: "delete" | "unsubscribe"; schedule: ScheduleInfo } | null;

/** Plánované exporty: seznam, nový a upravený plán, zastavení, smazání a odhlášení příjemce (odkaz z e-mailu: `?plan=`). */
export function SchedulesTab({
  canSchedule,
  canManage,
  me,
}: {
  canSchedule: boolean;
  canManage: boolean;
  me: { id: string; name: string };
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const planParam = sp.get("plan");
  const q = useQuery({
    queryKey: scheduleKeys.list,
    queryFn: () => unwrap(listExportSchedulesAction({})),
    staleTime: 0,
  });
  const [editing, setEditing] = useState<ScheduleInfo | "new" | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  // podklady dialogu (typy dat a šablony) se načtou předem, aby se dialog otevřel hned
  const entities = useQuery({
    queryKey: scheduleKeys.entities,
    queryFn: () => unwrap(listExportEntitiesAction({})),
    enabled: canSchedule,
    staleTime: 60_000,
  });
  const templates = useQuery({
    queryKey: templateKeys.list,
    queryFn: () => unwrap(listExportTemplatesAction({})),
    enabled: canSchedule,
    staleTime: 0,
  });

  const highlighted = useMemo(
    () => q.data?.find((s) => s.id === planParam) ?? null,
    [q.data, planParam],
  );
  useEffect(() => {
    if (highlighted)
      document.getElementById(`plan-${highlighted.id}`)?.scrollIntoView({ block: "center" });
  }, [highlighted]);

  const reload = () => void qc.invalidateQueries({ queryKey: scheduleKeys.list });
  const clearPlanParam = () => {
    const next = new URLSearchParams(sp.toString());
    next.delete("plan");
    router.replace(`${path}?${next.toString()}`, { scroll: false });
  };

  if (q.isLoading) return <ListSkeleton label="Načítám plány" />;
  if (q.isError || !q.data)
    return (
      <LoadError
        title="Plány se nepodařilo načíst"
        message={q.error?.message}
        onRetry={() => void q.refetch()}
      />
    );
  const rows = q.data;
  const ready = !!entities.data && !!templates.data;
  const mayEdit = (s: ScheduleInfo) => s.mine || canManage;

  async function toggle(s: ScheduleInfo) {
    const r = await setExportScheduleActiveAction({ id: s.id, active: !s.active });
    if (!r.ok) return errorToast(r.error);
    successToast(s.active ? "Plán zastaven." : "Plán znovu zapnut.");
    reload();
  }

  const columns: TableColumn<ScheduleInfo>[] = [
    {
      key: "name",
      header: "Plán",
      primary: true,
      cell: (s) => (
        <>
          <span className="block truncate">{s.name}</span>
          <span className="block truncate text-sm font-normal text-muted">
            {s.entityLabel} · {formatLabel(s.spec.format)}
            {!s.mine && ` · ${s.ownerName}`}
          </span>
        </>
      ),
    },
    { key: "when", header: "Jak často", cell: (s) => describeTiming(s) },
    {
      key: "next",
      header: "Příští spuštění",
      cell: (s) => <span className="tabular">{s.active ? formatDateTime(s.nextRunAt) : "—"}</span>,
    },
    {
      key: "recipients",
      header: "Příjemci a doručení",
      cell: (s) => (
        <>
          <span className="block truncate" title={s.recipients.map((r) => r.name).join(", ")}>
            {recipientsText(s.recipients.map((r) => r.name))}
          </span>
          <span className="block text-sm text-muted">{deliverLabel(s.deliver)}</span>
        </>
      ),
    },
    {
      key: "last",
      header: "Poslední běh",
      cell: (s) =>
        s.lastRunAt ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="tabular">{formatDateTime(s.lastRunAt)}</span>
            {s.lastStatus && (
              <Chip color={runStatus(s.lastStatus).color}>{runStatus(s.lastStatus).label}</Chip>
            )}
          </span>
        ) : (
          <span className="text-muted">Zatím neběžel</span>
        ),
    },
    {
      key: "state",
      header: "Stav",
      cell: (s) =>
        s.active ? (
          <Chip color="green" dot>
            Zapnuto
          </Chip>
        ) : (
          <Chip dot>Zastaveno</Chip>
        ),
    },
  ];

  const actionsFor = (s: ScheduleInfo) => {
    const edit = mayEdit(s);
    if (!edit && !s.subscribed) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton label={`Akce: ${s.name}`} variant="ghost" size="sm">
            <MoreHorizontal />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {edit && canSchedule && (
            <DropdownMenuItem onSelect={() => setEditing(s)}>
              <Pencil /> Upravit
            </DropdownMenuItem>
          )}
          {edit && (
            <DropdownMenuItem onSelect={() => void toggle(s)}>
              {s.active ? <Pause /> : <Play />} {s.active ? "Zastavit" : "Znovu zapnout"}
            </DropdownMenuItem>
          )}
          {s.subscribed && (
            <DropdownMenuItem onSelect={() => setPending({ kind: "unsubscribe", schedule: s })}>
              <BellOff /> Odhlásit se z tohoto plánu
            </DropdownMenuItem>
          )}
          {edit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem danger onSelect={() => setPending({ kind: "delete", schedule: s })}>
                <Trash2 /> Smazat
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 basis-72 text-base text-muted">
          Plán vytváří export automaticky a posílá ho e-mailem nebo ukládá do Moje exporty.
        </p>
        {canSchedule && (
          <Button variant="primary" disabled={!ready} onClick={() => setEditing("new")}>
            <Plus /> Nový plán
          </Button>
        )}
      </div>
      {canSchedule && (entities.isError || templates.isError) && (
        <Notice tone="error" title="Podklady pro nový plán se nepodařilo načíst">
          Obnovte stránku. Pokud potíž trvá, zkuste to později.
        </Notice>
      )}

      {planParam && !highlighted && (
        <Notice tone="warning" title="Plán z odkazu se nenašel">
          <p>Možná byl smazán, nebo už nejste jeho příjemcem.</p>
          <Button className="mt-2" size="sm" onClick={clearPlanParam}>
            Zavřít upozornění
          </Button>
        </Notice>
      )}
      {highlighted && (
        <Notice tone="info" title={`Plán „${highlighted.name}“`}>
          <p>
            {describeTiming(highlighted)}, {highlighted.entityLabel},{" "}
            {formatLabel(highlighted.spec.format)}.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {highlighted.subscribed && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => setPending({ kind: "unsubscribe", schedule: highlighted })}
              >
                <BellOff /> Odhlásit se z tohoto plánu
              </Button>
            )}
            {canSchedule && mayEdit(highlighted) && (
              <Button size="sm" disabled={!ready} onClick={() => setEditing(highlighted)}>
                <Pencil /> Upravit plán
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={clearPlanParam}>
              Zavřít
            </Button>
          </div>
        </Notice>
      )}

      {rows.length === 0 ? (
        <TableCard>
          <EmptyState
            icon={<CalendarClock />}
            title="Zatím žádné plány"
            description="Plánovaný export se hodí pro pravidelné přehledy, třeba týdenní seznam zakázek pro vedení."
            action={
              canSchedule ? (
                <Button variant="primary" disabled={!ready} onClick={() => setEditing("new")}>
                  <Plus /> Nový plán
                </Button>
              ) : undefined
            }
          />
        </TableCard>
      ) : (
        <TableCard>
          <SettingsTable
            label="Plánované exporty"
            testId="export-schedules"
            columns={columns}
            rows={rows}
            rowKey={(s) => s.id}
            rowId={(s) => `plan-${s.id}`}
            rowClassName={(s) => cn(s.id === planParam && "bg-accent-soft")}
            actions={actionsFor}
          />
        </TableCard>
      )}

      {editing !== null && entities.data && templates.data && (
        <ScheduleDialog
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          entities={entities.data}
          templates={templates.data}
          me={me}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}
      <ConfirmDialog
        open={pending?.kind === "delete"}
        onOpenChange={(o) => !o && setPending(null)}
        title="Smazat plán"
        description={pending?.schedule.name ?? ""}
        confirmLabel="Smazat plán"
        danger
        onConfirm={async () => {
          if (!pending) return;
          const r = await deleteExportScheduleAction({ id: pending.schedule.id });
          if (!r.ok) {
            errorToast(r.error);
            return false;
          }
          successToast("Plán smazán.");
          reload();
        }}
      >
        Export se už nebude vytvářet ani posílat. Dosud vytvořené exporty zůstanou v Moje exporty.
      </ConfirmDialog>
      <ConfirmDialog
        open={pending?.kind === "unsubscribe"}
        onOpenChange={(o) => !o && setPending(null)}
        title="Odhlásit se z plánu"
        description={pending?.schedule.name ?? ""}
        confirmLabel="Odhlásit se"
        onConfirm={async () => {
          if (!pending) return;
          const r = await unsubscribeExportScheduleAction({ id: pending.schedule.id });
          if (!r.ok) {
            errorToast(r.error);
            return false;
          }
          successToast("Z plánu jste se odhlásili.");
          if (planParam) clearPlanParam();
          reload();
        }}
      >
        Přestanete dostávat tento export. Ostatní příjemci ho dostávat dál budou.
      </ConfirmDialog>
    </div>
  );
}
