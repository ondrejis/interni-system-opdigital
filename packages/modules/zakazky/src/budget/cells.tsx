"use client";

import { Popover, PopoverAnchor, PopoverContent } from "@rebar/ui";
import { Handshake, HardHat, Package, Shapes, Truck, type LucideIcon } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { ITEM_KINDS } from "./math";

export const KIND_ICON: Record<string, LucideIcon> = {
  labour: HardHat,
  material: Package,
  subcontract: Handshake,
  machines: Truck,
  other: Shapes,
};

export function KindIcon({ kind, className }: { kind: string; className?: string }) {
  const C = KIND_ICON[kind] ?? Shapes;
  return <C className={className ?? "size-4"} strokeWidth={1.5} aria-hidden />;
}

export type CellMove = "next" | "prev" | "down";

/**
 * Textový editor v buňce tabulky: Enter ukládá a jde dolů, Tab ukládá a jde dál, Esc ruší, ztráta fokusu ukládá.
 * `onCommit` vrací chybovou větu (zůstane editace s bublinou) nebo `null` (hotovo).
 */
export function CellInput({
  initial,
  seed,
  align = "left",
  inputMode,
  list,
  label,
  onCommit,
  onCancel,
}: {
  initial: string;
  seed?: string | undefined;
  align?: "left" | "right";
  inputMode?: "decimal" | "text";
  list?: string;
  label: string;
  onCommit: (text: string, move?: CellMove) => string | null | Promise<string | null>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(seed ?? initial);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function commit(move?: CellMove) {
    if (done.current || inFlight.current) return;
    if (text.trim() === initial.trim()) {
      done.current = true;
      // beze změny: jen se posune
      await onCommit(initial, move);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    const err = await onCommit(text, move);
    inFlight.current = false;
    setBusy(false);
    if (err) setError(err);
    else done.current = true;
  }

  return (
    <div className="relative size-full">
      <input
        autoFocus
        value={text}
        {...(inputMode ? { inputMode } : {})}
        {...(list ? { list } : {})}
        aria-label={label}
        aria-invalid={!!error}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        onFocus={(e) =>
          seed
            ? e.currentTarget.setSelectionRange(seed.length, seed.length)
            : e.currentTarget.select()
        }
        readOnly={busy}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (busy) return e.preventDefault();
          if (e.key === "Enter") {
            e.preventDefault();
            void commit("down");
          } else if (e.key === "Escape") {
            done.current = true;
            onCancel();
          } else if (e.key === "Tab") {
            e.preventDefault();
            void commit(e.shiftKey ? "prev" : "next");
          }
        }}
        onBlur={() => {
          if (done.current) return;
          if (text.trim() === initial.trim()) {
            done.current = true;
            onCancel();
          } else void commit();
        }}
        className={`size-full rounded-none bg-bg px-2 text-base outline-2 -outline-offset-2 ${
          align === "right" ? "text-right tabular" : ""
        } ${error ? "outline-danger" : "outline-accent"}`}
      />
      {error && (
        <div
          role="alert"
          className="absolute left-0 top-full z-30 mt-0.5 whitespace-nowrap rounded-md bg-danger px-2 py-1 text-xs text-white shadow-float"
        >
          {error}
        </div>
      )}
    </div>
  );
}

/** Výběr druhu položky: seznam s ikonami v popoveru pod buňkou. */
export function KindPicker({
  value,
  onPick,
  onClose,
  children,
}: {
  value: string;
  onPick: (kind: string) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Popover open onOpenChange={(o) => !o && onClose()}>
      <PopoverAnchor asChild>
        <div className="size-full">{children}</div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-48 p-1"
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <ul role="listbox" aria-label="Druh položky">
          {ITEM_KINDS.map((k) => (
            <li key={k.key}>
              <button
                type="button"
                role="option"
                aria-selected={k.key === value}
                autoFocus={k.key === value}
                onClick={() => onPick(k.key)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-base hover:bg-hover focus-visible:bg-hover focus-visible:outline-none aria-selected:font-medium"
              >
                <KindIcon kind={k.key} className="size-4 text-muted" />
                {k.label}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
