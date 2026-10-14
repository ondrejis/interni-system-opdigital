"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readRecordParam, withRecordParam } from "./record-url";

/** Značka ve `history.state` u záznamu, který jsme do historie přidali my (zavření se pak umí vrátit zpět). */
const MARK = "__recordDialog";

type State = Record<string, unknown> | null;

/**
 * Otevřený záznam v adrese (`?record=<id>`). Otevření přidá položku do historie, zavření se vrátí (`history.back()`),
 * takže tlačítko Zpět zavře pop-up a filtr i pozice v seznamu zůstanou, protože stránka se nepřekresluje.
 * Odkaz s `?record=` otevře pop-up rovnou (`initial` z adresy ze serveru brání probliknutí). Router aplikace
 * (`history.pushState` je v Next.js propojený s routerem) se nevolá, stránka se nenačítá znovu.
 */
export function useRecordParam(enabled: boolean, initial?: string | null) {
  const [id, setId] = useState<string | null>(enabled ? (initial ?? null) : null);
  const idRef = useRef(id);
  idRef.current = id;

  useEffect(() => {
    if (!enabled) {
      setId(null);
      return;
    }
    const read = () => setId(readRecordParam(window.location.search));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [enabled]);

  /** Otevře záznam; je-li už nějaký otevřený (přepnutí karty), jen vymění id, aby Zpět zavřelo pop-up. */
  const open = useCallback((next: string) => {
    const href = withRecordParam(window.location.pathname + window.location.search, next);
    const state = (window.history.state ?? {}) as State;
    if (idRef.current) {
      // přepnutí: značka zůstane jen u položky, kterou jsme přidali my
      const marked = !!state?.[MARK];
      window.history.replaceState({ ...state, ...(marked ? { [MARK]: next } : {}) }, "", href);
    } else {
      window.history.pushState({ ...state, [MARK]: next }, "", href);
    }
    setId(next);
  }, []);

  /** Zavře pop-up: vrátí historii, pokud jsme položku přidali my, jinak (přímý odkaz) jen odebere parametr. */
  const close = useCallback(() => {
    const state = (window.history.state ?? {}) as State;
    if (state?.[MARK]) {
      window.history.back(); // `popstate` nastaví id na null
      setId(null);
      return;
    }
    const { [MARK]: _drop, ...rest } = state ?? {};
    window.history.replaceState(
      rest,
      "",
      withRecordParam(window.location.pathname + window.location.search, null),
    );
    setId(null);
  }, []);

  return { id, open, close };
}
