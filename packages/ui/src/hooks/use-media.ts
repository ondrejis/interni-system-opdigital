"use client";

import { useEffect, useState } from "react";

/** Zda je obrazovka užší než `md` (768 px). Na serveru a při prvním vykreslení vrací false, pak se opraví. */
export function useIsMobile(query = "(max-width: 767px)") {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const read = () => setMatch(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, [query]);
  return match;
}
