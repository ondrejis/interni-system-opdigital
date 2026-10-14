import type { RoleDef } from "../rbac/seed";

/**
 * Výchozí role platformy: jen systémová role vlastníka (vidí a smí všechno). Jádro nezná žádný modul, takže další
 * role a jejich oprávnění definuje každý klient ve svém seedu (`clients/<slug>/seed/index.ts`, `defineSeed({ roles })`).
 */
export const DEFAULT_ROLES: readonly RoleDef[] = [
  { key: "owner", name: "Majitel / vedení", description: "Vidí a smí všechno", isSystem: true },
];
