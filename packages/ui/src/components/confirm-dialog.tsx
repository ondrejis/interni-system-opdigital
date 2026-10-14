"use client";

import { TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "./button";
import { Dialog, DialogContent } from "./overlay";

/**
 * Potvrzení nevratné nebo dopadové akce (smazání, deaktivace, změna role).
 * `onConfirm` může být asynchronní; když vrátí `false`, dialog zůstane otevřený.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Potvrdit",
  cancelLabel = "Zrušit",
  danger,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void | boolean | Promise<void | boolean>;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      if ((await onConfirm()) !== false) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent
        title={title}
        {...(description ? { description } : {})}
        className="top-[18vh] w-[min(28rem,calc(100vw-2rem))]"
      >
        {(children || danger) && (
          <div className="flex gap-3 px-5 pt-4 text-base text-muted">
            {danger && (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger">
                <TriangleAlert className="size-4" aria-hidden />
              </span>
            )}
            <div className="min-w-0 flex-1 self-center">{children}</div>
          </div>
        )}
        <div className="flex justify-end gap-2 px-5 py-4">
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            loading={busy}
            onClick={() => void confirm()}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
