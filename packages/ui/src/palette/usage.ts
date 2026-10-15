import type { Usage } from "./logic";

const KEY = "opsys.palette.usage";

/** Počty použití příkazů z tohoto prohlížeče (jen pohodlí; bez uložení se nabídka řídí výchozím pořadím). */
export function readUsage(): Usage {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Usage;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Zapíše použití příkazu (drží se nejvýše 60 příkazů, nejméně používané odpadnou). */
export function bumpUsage(id: string): void {
  try {
    const u = readUsage();
    u[id] = (u[id] ?? 0) + 1;
    const top = Object.entries(u)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(top)));
  } catch {
    /* bez uložení */
  }
}
