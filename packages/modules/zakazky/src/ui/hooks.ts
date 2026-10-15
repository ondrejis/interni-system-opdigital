"use client";

import type { ServiceType } from "@rebar/core/contracts";
import {
  errorToast,
  successToast,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
  useModuleUi,
} from "@rebar/ui";
import { useMemo } from "react";
import type {
  BoardResult,
  JobDetail,
  PhaseChangeResult,
  PhasePreview,
  CompletePreview,
  TemplateListItem,
  TemplateView,
} from "../contract";
import type { DriveInfo, TaskListResult } from "./types";

/*
  Dotazy a příkazy UI zakázek nad `useCommandQuery`/`useCommandMutation` z `@rebar/ui`. Všechna jména příkazů jsou na
  jednom místě; příkazy cizích modulů (`ukoly.*`, `disk.*`, `finance.*`) se volají jen, když je modul zapnutý.
*/

/** Je modul zapnutý (má UI v registru)? Vypnutý modul se v zakázkách nezobrazuje a jeho příkazy se nevolají. */
export function useModuleEnabled(id: string): boolean {
  return useModuleUi().has(id);
}

/** Detail zakázky: fáze, tým, počty úkolů a plateb, příznaky termínu a rozhodnutí. */
export function useJobDetail(jobId: string) {
  return useCommandQuery<JobDetail, { jobId: string }>("zakazky.detail", { jobId });
}

/** Board zakázek podle stavu, nebo podle fází jednoho typu. */
export function useBoard(
  by: "status" | "phase",
  type: ServiceType | undefined,
  includeClosed: boolean,
) {
  return useCommandQuery<
    BoardResult,
    { by: "status" | "phase"; type?: ServiceType; includeClosed: boolean }
  >("zakazky.board", { by, ...(type ? { type } : {}), includeClosed });
}

/** Šablony zakázek (volitelně jen jeden typ, volitelně i archivované). */
export function useTemplateList(type?: ServiceType, includeArchived = false, enabled = true) {
  return useCommandQuery<TemplateListItem[], { type?: ServiceType; includeArchived: boolean }>(
    "zakazky.template.list",
    { ...(type ? { type } : {}), includeArchived },
    { enabled },
  );
}

/** Jedna šablona i s obsahem (editor). */
export function useTemplate(id: string) {
  return useCommandQuery<TemplateView, { id: string }>("zakazky.template.get", { id });
}

/** Náhled změny fáze: co se dokončí, kolik je otevřených úkolů, co brání. */
export function usePhasePreviewQuery(jobId: string, phaseId: string | null) {
  return useCommandQuery<PhasePreview, { jobId: string; phaseId: string }>(
    "zakazky.phase.preview",
    phaseId ? { jobId, phaseId } : undefined,
    { enabled: !!phaseId },
  );
}

/** Náhled dokončení zakázky (otevřené úkoly, neuhrazené platby, jiná živá zakázka klienta). */
export function useCompletePreview(jobId: string, enabled: boolean) {
  return useCommandQuery<CompletePreview, { jobId: string }>(
    "zakazky.complete.preview",
    { jobId },
    { enabled },
  );
}

/** Úkoly zakázky z modulu Úkoly (jen když je zapnutý). */
export function useJobTasks(jobId: string) {
  const enabled = useModuleEnabled("ukoly");
  return {
    enabled,
    query: useCommandQuery<TaskListResult, Record<string, unknown>>(
      "ukoly.list",
      { jobId, scope: "all", view: "all", limit: 500, sort: "due", dir: "asc" },
      { enabled },
    ),
  };
}

/** Stav složek na Disku pro zakázky (jen když je zapnutý Disk; chyba = tlačítko se prostě neukáže). */
export function useDriveStates(jobIds: readonly string[]): Record<string, DriveInfo> {
  const enabled = useModuleEnabled("disk") && jobIds.length > 0;
  const ids = useMemo(() => [...jobIds].sort(), [jobIds]);
  const q = useCommandQuery<Record<string, DriveInfo>, { entityType: "job"; ids: string[] }>(
    "disk.folderState",
    { entityType: "job", ids },
    { enabled },
  );
  return q.data ?? {};
}

/** Příkaz s toastem při chybě; `success` je text toastu po úspěchu. */
export function useAction<I, O = unknown>(
  name: string,
  opts: {
    success?: string | ((out: O, input: I) => string);
    onSuccess?: (out: O, input: I) => void;
  } = {},
) {
  return useCommandMutation<I, O>(name, {
    onSuccess: (out, input) => {
      if (opts.success)
        successToast(typeof opts.success === "function" ? opts.success(out, input) : opts.success);
      opts.onSuccess?.(out, input);
    },
  });
}

/** Spustí mutaci a chybu ukáže jako toast (pro akce bez vlastního dialogu: přetažení, rychlá změna). */
export function runWithToast<I, O>(
  mutation: {
    mutate: (input: I, o?: { onError?: (e: Error) => void; onSuccess?: (out: O) => void }) => void;
  },
  input: I,
  onSuccess?: (out: O) => void,
) {
  mutation.mutate(input, {
    onError: (e) => errorToast(e.message),
    ...(onSuccess ? { onSuccess } : {}),
  });
}

/** Změna fáze zakázky (`zakazky.setPhase`). */
export function useSetPhase(onDone?: (r: PhaseChangeResult) => void) {
  return useCommandMutation<
    { jobId: string; phaseId?: string; phaseName?: string; completeOpenTasks: boolean },
    PhaseChangeResult
  >("zakazky.setPhase", { ...(onDone ? { onSuccess: onDone } : {}) });
}

/** Dostupnost API pro odkazy na záznamy (`hrefFor`). */
export function useHref() {
  const api = useEntityApi();
  return api.hrefFor;
}
