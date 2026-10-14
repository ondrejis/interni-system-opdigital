"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PaletteItem } from "./command-palette";

type Registry = {
  set: (id: string, items: PaletteItem[] | null) => void;
  items: PaletteItem[];
};

const Ctx = createContext<Registry | null>(null);

/** Drží kontextové akce paletky (Cmd+K), které si registrují zobrazené komponenty (např. otevřený záznam). */
export function PaletteActionsProvider({
  children,
}: {
  children: (items: PaletteItem[]) => ReactNode;
}) {
  const [map, setMap] = useState<Record<string, PaletteItem[]>>({});
  const set = useCallback<Registry["set"]>(
    (id, items) =>
      setMap((m) => {
        if (!items) {
          const { [id]: _drop, ...rest } = m;
          return rest;
        }
        return { ...m, [id]: items };
      }),
    [],
  );
  const value = useMemo<Registry>(() => ({ set, items: Object.values(map).flat() }), [set, map]);
  return <Ctx.Provider value={value}>{children(value.items)}</Ctx.Provider>;
}

/** Zaregistruje akce do paletky, dokud je komponenta zobrazená. `items` je potřeba zapamatovat (`useMemo`). */
export function usePaletteActions(items: PaletteItem[] | null) {
  const reg = useContext(Ctx);
  const id = useId();
  const set = reg?.set;
  useEffect(() => {
    set?.(id, items);
    return () => set?.(id, null);
  }, [set, id, items]);
}
