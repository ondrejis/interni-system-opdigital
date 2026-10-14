import type { ModuleUi } from "@rebar/ui";

/**
 * Složí UI oblastí CRM do jednoho `ModuleUi`. Mapy podle klíče entity se spojují (pole se
 * zřetězí; u hlaviček a hlaviček sloupců platí první oblast, která je dodá; karta kanbanu se skládá pole po poli),
 * stránky se přidají za sebe.
 */
export function mergeModuleUi(...parts: ModuleUi[]): ModuleUi {
  const out: Record<string, unknown> = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      if (value === undefined) continue;
      const current = out[key];
      if (current === undefined) {
        out[key] = Array.isArray(value) ? [...value] : { ...(value as object) };
      } else if (Array.isArray(value)) {
        out[key] = [...(current as unknown[]), ...value];
      } else {
        const merged = { ...(current as Record<string, unknown>) };
        for (const [entity, item] of Object.entries(value as Record<string, unknown>)) {
          const existing = merged[entity];
          merged[entity] =
            Array.isArray(item) && Array.isArray(existing)
              ? [...existing, ...item]
              : key === "kanbanCard" && existing
                ? { ...(item as object), ...(existing as object) } // karta: pole po poli, první oblast má přednost
                : (existing ?? item);
        }
        out[key] = merged;
      }
    }
  }
  return out as ModuleUi;
}
