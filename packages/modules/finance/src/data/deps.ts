import type { ModuleDeps } from "@rebar/core/module-server";

/** Co z `ModuleDeps` potřebují funkce modulu; splňuje je i `ModuleJobDeps` (worker). */
export type FinDeps = Pick<ModuleDeps, "registry" | "settings"> & {
  services?: ModuleDeps["services"] | undefined;
};
