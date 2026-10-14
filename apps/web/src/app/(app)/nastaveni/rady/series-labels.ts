/** Srozumitelné názvy číselných řad podle klíče; neznámá řada se ukáže pod svým klíčem. */
export const SERIES_LABELS: Record<string, string> = {
  "zakazky.cislo": "Zakázky",
};

export const seriesLabel = (key: string) => SERIES_LABELS[key] ?? key;
