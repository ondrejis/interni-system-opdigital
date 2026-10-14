// Čisté části stavebního deníku (typy a výpočty bez databáze a bez Reactu); používá server i prohlížeč.

export type DiaryWeather = {
  /** Kód WMO (Open-Meteo); u ručního zápisu `null`. */
  code: number | null;
  /** Česky: „Déšť“, „Polojasno“… */
  label: string;
  tempMin: number | null;
  tempMax: number | null;
  precipMm: number | null;
  windKmh: number | null;
  /** Odkud počasí je: služba, nebo ručně doplněné. */
  source: "open-meteo" | "manual";
  fetchedAt?: string;
};

export type DiaryWorker = {
  userId: string | null;
  name: string;
  /** Odpracované hodiny (z docházky, nebo ručně). */
  hours: number | null;
  source: "attendance" | "manual";
};

export type DiaryMaterial = {
  /** Stabilní id řádku (náklad se k němu váže přes `costRef`). */
  id: string;
  name: string;
  /** Množství jako desetinný řetězec (ADR 003). */
  qty: string;
  unit: string;
  supplier: string | null;
  /** Cena za jednotku bez DPH v haléřích. Vidí a zapisuje ji jen ten, kdo smí ekonomiku. */
  unitPriceMinor: number | null;
  source: "manual" | "sklad";
  /** Id nákladu zakázky, který tento řádek vytvořil. */
  costRef: string | null;
};

export type DiaryMachine = {
  name: string;
  hours: number | null;
  note: string | null;
  source: "manual" | "stroje";
};

export type DiaryIncident = {
  id: string;
  kind: "incident" | "defect";
  text: string;
  /** Vada zakázky založená z tohoto zápisu. */
  defectId: string | null;
};

const trimNum = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

/** Množství jako desetinný řetězec → tisíciny (celá čísla, ať nevzniká chyba floatu). */
export function qtyThousandths(qty: string): number {
  const n = Number(String(qty).trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : 0;
}

/** Částka řádku materiálu v haléřích = množství × cena za jednotku (0, když cena chybí). */
export function materialAmountMinor(m: Pick<DiaryMaterial, "qty" | "unitPriceMinor">): number {
  if (!m.unitPriceMinor || m.unitPriceMinor <= 0) return 0;
  return Math.round((qtyThousandths(m.qty) * m.unitPriceMinor) / 1000);
}

const hoursText = (h: number | null) => (h === null ? "" : ` (${trimNum(h)} h)`);

export const summarizeWorkers = (ws: readonly DiaryWorker[]) =>
  ws.map((w) => `${w.name}${hoursText(w.hours)}`).join(", ");

export const summarizeMachines = (ms: readonly DiaryMachine[]) =>
  ms.map((m) => `${m.name}${hoursText(m.hours)}${m.note ? ` — ${m.note}` : ""}`).join("; ");

export const summarizeMaterials = (ms: readonly DiaryMaterial[]) =>
  ms
    .map(
      (m) =>
        `${m.name} (${m.qty.replace(".", ",")} ${m.unit})${m.supplier ? ` — ${m.supplier}` : ""}`,
    )
    .join(", ");

export function weatherSummary(w: Pick<DiaryWeather, "label" | "tempMin" | "tempMax"> | null) {
  if (!w) return "";
  const c = (n: number) => String(n).replace(".", ",");
  const t =
    w.tempMin !== null && w.tempMax !== null
      ? w.tempMin === w.tempMax
        ? `${c(w.tempMax)} °C`
        : `${c(w.tempMin)} až ${c(w.tempMax)} °C`
      : "";
  return [w.label, t].filter(Boolean).join(", ");
}

/** Cena za jednotku je citlivý údaj: bez oprávnění k ekonomice ji server nevrací. */
export function stripMaterialPrices(rows: readonly DiaryMaterial[]): DiaryMaterial[] {
  return rows.map((m) => ({ ...m, unitPriceMinor: null, costRef: null }));
}

/**
 * Sloučí řádky materiálu z formuláře s uloženými. Kdo ceny nezapisuje, nesmí je ani přepsat ani smazat:
 * u řádku, který už existuje, zůstane uložená cena a odkaz na náklad; nový řádek je bez ceny.
 */
export function mergeMaterialRows(
  incoming: readonly DiaryMaterial[],
  previous: readonly DiaryMaterial[],
  canPrice: boolean,
): DiaryMaterial[] {
  if (canPrice) return incoming.map((m) => ({ ...m }));
  const byId = new Map(previous.map((p) => [p.id, p]));
  return incoming.map((m) => {
    const old = byId.get(m.id);
    return { ...m, unitPriceMinor: old?.unitPriceMinor ?? null, costRef: old?.costRef ?? null };
  });
}

/** Dny pro pás nad deníkem: `count` dnů končících `end` (včetně), od nejstaršího. */
export function dayStrip(end: string, count: number): string[] {
  const [y, m, d] = end.split("-").map(Number) as [number, number, number];
  const base = Date.UTC(y, m - 1, d);
  return Array.from({ length: count }, (_, i) =>
    new Date(base - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
}

export const WEEKDAYS_SHORT = ["ne", "po", "út", "st", "čt", "pá", "so"] as const;
export const weekdayShort = (iso: string) =>
  WEEKDAYS_SHORT[new Date(`${iso}T12:00:00Z`).getUTCDay()]!;
