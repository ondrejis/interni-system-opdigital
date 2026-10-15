"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { PreviewPart } from "../logic";

/** Popisky jazyků šablon (shodné s entitou; UI nemůže importovat serverový kód). */
export const LANGUAGE_LABELS = { cs: "Česky", sk: "Slovensky", en: "Anglicky" } as const;
/** Kód jazyka šablony. */
export type Language = keyof typeof LANGUAGE_LABELS;

/** Hodnota se zpožděním (hledání a živý náhled nevolají server při každém stisku klávesy). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Zkopíruje text do schránky. Použije Clipboard API; v nezabezpečeném kontextu (bez HTTPS) nebo při zamítnutí zkusí
 * skrytý `textarea` a `execCommand`. Vrací, zda se kopírování povedlo.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Vykreslí části náhledu: dosazená hodnota běžně, chybějící červeně („chybí: firma“), neznámá proměnná žlutě. */
export function PreviewParts({
  parts,
  testId,
}: {
  parts: readonly PreviewPart[];
  testId?: string;
}): ReactNode {
  return (
    <span data-testid={testId}>
      {parts.map((p, i) => {
        if (p.kind === "missing")
          return (
            <mark
              key={i}
              data-missing={p.key}
              className="rounded bg-danger-soft px-1 text-danger"
              title="Hodnota chybí: proměnná zůstane prázdná"
            >
              chybí: {p.key}
            </mark>
          );
        if (p.kind === "unknown")
          return (
            <mark
              key={i}
              data-unknown={p.key}
              className="rounded bg-warning-soft px-1 text-warning"
              title="Neznámá proměnná (překlep?)"
            >
              {p.text}
            </mark>
          );
        if (p.kind === "placeholder")
          return (
            <span key={i} className="rounded bg-accent-soft px-1 text-accent">
              {p.text}
            </span>
          );
        return <span key={i}>{p.text}</span>;
      })}
    </span>
  );
}
