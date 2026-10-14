"use client";

import { Chip, IconButton, LABEL_COLORS, cn } from "@rebar/ui";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

/**
 * Po změně konfigurace (stavy, číselníky, pole…) je potřeba, aby se nové nastavení projevilo všude:
 * stránka se načte znovu ze serveru a data tabulek, kanbanu a filtrů v klientské cache se zneplatní.
 */
export function useRefreshConfig() {
  const router = useRouter();
  const qc = useQueryClient();
  return useCallback(() => {
    router.refresh();
    void qc.invalidateQueries({ queryKey: ["entity"] });
  }, [router, qc]);
}

const COLOR_NAMES: Record<string, string> = {
  gray: "Šedá",
  blue: "Modrá",
  green: "Zelená",
  orange: "Oranžová",
  red: "Červená",
  purple: "Fialová",
  pink: "Růžová",
  teal: "Tyrkysová",
  yellow: "Žlutá",
  indigo: "Indigo",
};
export const colorName = (c: string) => COLOR_NAMES[c] ?? c;

/** Výběr barvy štítku z palety systému (barvu nese stav, možnost, kategorie). */
export function ColorPicker({
  value,
  onChange,
  label = "Barva",
}: {
  value: string;
  onChange: (c: string) => void;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {LABEL_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={colorName(c)}
          title={colorName(c)}
          onClick={() => onChange(c)}
          className={cn(
            "inline-flex size-8 cursor-pointer items-center justify-center rounded-md border transition-colors duration-150 pointer-coarse:size-11",
            value === c
              ? "border-accent ring-2 ring-[var(--accent-line)]"
              : "border-line hover:bg-hover",
          )}
        >
          <Chip color={c} dot className="w-5 justify-center" style={{ padding: 0 }} />
        </button>
      ))}
    </div>
  );
}

/** Šipky pro posun položky v seznamu (přístupná náhrada tažení). */
export function MoveButtons({
  index,
  count,
  name,
  onMove,
  disabled,
}: {
  index: number;
  count: number;
  name: string;
  onMove: (delta: -1 | 1) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <IconButton
        label={`Posunout „${name}“ výš`}
        variant="ghost"
        disabled={disabled || index === 0}
        onClick={() => onMove(-1)}
      >
        <ArrowUp />
      </IconButton>
      <IconButton
        label={`Posunout „${name}“ níž`}
        variant="ghost"
        disabled={disabled || index === count - 1}
        onClick={() => onMove(1)}
      >
        <ArrowDown />
      </IconButton>
    </>
  );
}

/** Stabilní klíč z názvu: malá písmena bez diakritiky, číslice a podtržítko. */
export function slugify(s: string, max = 30): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max)
    .replace(/_+$/g, "");
}

/** Přesune položku v poli o `delta` míst (nová kopie). */
export function moved<T>(list: readonly T[], from: number, delta: number): T[] {
  const to = from + delta;
  if (to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}
