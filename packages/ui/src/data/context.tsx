"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { EntityApi } from "./api";

const Ctx = createContext<EntityApi | null>(null);

/** Aplikace dodá implementaci `EntityApi` (server actions); komponenty ji berou z kontextu. */
export function EntityApiProvider({ api, children }: { api: EntityApi; children: ReactNode }) {
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useEntityApi(): EntityApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("Chybí EntityApiProvider.");
  return api;
}
