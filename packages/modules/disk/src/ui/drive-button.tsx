"use client";

import {
  Button,
  ConfirmDialog,
  Icon,
  Notice,
  errorToast,
  successToast,
  useCan,
  useCommandMutation,
  useCommandQuery,
} from "@rebar/ui";
import { useEffect, useState } from "react";
import { driveButtonModel } from "../state";
import type { DriveEntityType, DriveFolderInfo } from "../types";

type RequestResult = { requestId: string | null; skipped?: "private" | "disabled" };

/** Přenos stavu tlačítka z dotazu, ať ho může použít karta i tlačítko. */
export function useDriveFolder(entityType: DriveEntityType, id: string) {
  const q = useCommandQuery<DriveFolderInfo>("disk.folderState", { entityType, id });
  const { refetch } = q;
  const pending = q.data?.state === "pending";
  // zakládá se: dotaz se opakuje, dokud n8n neodpoví (nebo nevyprší lhůta)
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => void refetch(), 3000);
    return () => clearInterval(t);
  }, [pending, refetch]);
  return q;
}

/** Varování před ručním založením složky soukromého záznamu (R-13). */
export const PRIVATE_WARNING =
  "Záznam je soukromý, ale složka na sdíleném Google Disku bude pro Patrika viditelná včetně názvu klienta či zakázky. Opravdu ji vytvořit?";

/**
 * Tlačítko „Otevřít Disk“ (DRV-05). Stavy: „Otevřít Disk“ (složka existuje, odkaz se otevře v nové kartě),
 * „Vytváří se…“ (čeká se na n8n), „Zkusit znovu“ (chyba nebo 10 minut bez odpovědi), „Vytvořit složku“ (záznam
 * složku nemá; u soukromého záznamu až po potvrzení varování). Bez oprávnění `disk.read` se nezobrazí.
 */
export function DriveButton({
  entityType,
  id,
  size = "md",
}: {
  entityType: DriveEntityType;
  id: string;
  size?: "sm" | "md";
}) {
  const can = useCan();
  const q = useDriveFolder(entityType, id);
  const [confirm, setConfirm] = useState(false);
  const request = useCommandMutation<
    { entityType: DriveEntityType; id: string; force?: boolean },
    RequestResult
  >("disk.requestFolder", {
    onSuccess: (r) => {
      if (r.skipped === "disabled")
        errorToast("Zakládání složek je vypnuté v Nastavení → Google Disk.");
      else successToast("Složka se vytváří. Za chvíli se objeví tlačítko Otevřít Disk.");
    },
  });
  const retry = useCommandMutation<{ entityType: DriveEntityType; id: string }, RequestResult>(
    "disk.retry",
    { onSuccess: () => successToast("Požadavek byl odeslán znovu.") },
  );

  if (!can("disk.read")) return null;
  if (!q.data)
    return (
      <Button
        size={size}
        disabled
        loading={q.isLoading}
        data-testid="drive-button"
        data-kind="loading"
      >
        Disk
      </Button>
    );
  const model = driveButtonModel(q.data, can("disk.write"));
  const busy = request.isPending || retry.isPending;

  return (
    <>
      <Button
        size={size}
        variant={model.kind === "retry" ? "danger" : "secondary"}
        loading={model.kind === "wait" || busy}
        disabled={model.disabled}
        data-testid="drive-button"
        data-kind={model.kind}
        onClick={() => {
          if (model.kind === "open" && model.href) window.open(model.href, "_blank", "noopener");
          else if (model.kind === "retry") retry.mutate({ entityType, id });
          else if (model.kind === "create") {
            if (model.needsPrivateWarning) setConfirm(true);
            else request.mutate({ entityType, id });
          }
        }}
        title={model.kind === "retry" ? (q.data.issue?.message ?? undefined) : undefined}
      >
        {model.kind !== "wait" && (
          <Icon
            name={
              model.kind === "retry"
                ? "rotate-ccw"
                : model.kind === "create"
                  ? "plus"
                  : "google-drive"
            }
          />
        )}
        {model.label}
      </Button>
      {model.showIssue && q.data.issue && can("disk.write") && (
        <Button
          size={size}
          variant="ghost"
          data-testid="drive-issue-retry"
          loading={retry.isPending}
          title={q.data.issue.message}
          onClick={() => retry.mutate({ entityType, id })}
        >
          <Icon name="alert-triangle" /> Zkusit znovu
        </Button>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Vytvořit složku soukromého záznamu?"
        confirmLabel="Vytvořit složku"
        danger
        onConfirm={async () => {
          await request.mutateAsync({ entityType, id, force: true });
        }}
      >
        {PRIVATE_WARNING}
      </ConfirmDialog>
    </>
  );
}

/** Karta „Složka na Disku“ na Přehledu klienta a zakázky: stav, tlačítko a případná chyba. */
export function DriveCard({ entityType, id }: { entityType: DriveEntityType; id: string }) {
  const q = useDriveFolder(entityType, id);
  const info = q.data;
  return (
    <div className="space-y-3" data-testid="drive-card">
      <div className="flex flex-wrap items-center gap-3">
        <DriveButton entityType={entityType} id={id} />
        {info?.archived && <span className="text-sm text-muted">Složka je v Archivu.</span>}
      </div>
      {info?.issue && (
        <Notice
          tone="warning"
          title={
            info.state === "ready"
              ? "Poslední úprava složky se nepovedla"
              : "Složku se nepodařilo vytvořit"
          }
        >
          {info.issue.message}
        </Notice>
      )}
      {info?.state === "none" && info.isPrivate && (
        <Notice tone="info">Soukromý záznam: složka se sama nezakládá.</Notice>
      )}
    </div>
  );
}
