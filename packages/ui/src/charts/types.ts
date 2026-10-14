/** Jak se hodnota ukazuje: peníze jsou v haléřích, `minutes` v minutách (7:30 h), `hours` v desetinných hodinách. */
export type ChartValueFormat = "number" | "money" | "percent" | "hours" | "minutes";

/** Kategorie na ose (sloupec, den, zakázka). `href` ji dělá klikatelnou, `color` přebarví sloupec u grafu s jednou řadou. */
export type ChartCategory = { key: string; label: string; href?: string; color?: string };

/** Datová řada; `values` jsou po kategoriích, `null` = bez dat (mezera). */
export type ChartSeries = { key: string; label: string; values: (number | null)[] };

export type DonutSliceInput = {
  key: string;
  label: string;
  value: number;
  color?: string;
  href?: string;
};
