"use client";

import { useEffect } from "react";
import { Toaster as Sonner, toast } from "sonner";

/** Oznámení vpravo dole. U vratných akcí se používá `undoToast`, potvrzovací dialog jen u nevratných. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      // na telefonu nad spodní navigací (kancelář i terminál), ať oznámení nezakrývá ovládání
      mobileOffset={{ bottom: 88, left: 16, right: 16 }}
      closeButton={false}
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !border !border-line !bg-bg !text-fg !shadow-float !text-base",
        },
      }}
    />
  );
}

export { toast };

export function successToast(message: string) {
  toast.success(message);
}

export function errorToast(message: string) {
  toast.error(message, { duration: 6000 });
}

const UNDO_MS = 10_000;
let lastUndo: { fn: () => void | Promise<void>; until: number; id: string | number } | null = null;

/**
 * Toast s tlačítkem „Vrátit“ (vratná akce; zpětná změna se provede až po kliknutí nebo Cmd/Ctrl+Z, do 10 s,
 * R-24). Platí jen poslední vratná akce.
 */
export function undoToast(message: string, onUndo: () => void | Promise<void>) {
  const id = toast(message, {
    duration: UNDO_MS,
    action: {
      label: "Vrátit",
      onClick: () => {
        lastUndo = null;
        void onUndo();
      },
    },
  });
  lastUndo = { fn: onUndo, until: Date.now() + UNDO_MS, id };
}

/** Provede poslední vratnou akci, pokud je ještě v 10s okně. Vrací, zda se něco vrátilo. */
export function runLastUndo(): boolean {
  const u = lastUndo;
  if (!u || Date.now() > u.until) return false;
  lastUndo = null;
  toast.dismiss(u.id);
  void u.fn();
  return true;
}

/** Cmd/Ctrl+Z vrátí poslední vratnou akci (smazání, hromadná změna); v textovém poli zůstává běžné „zpět“. */
export function useUndoShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "z")
        return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)))
        return;
      if (runLastUndo()) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
