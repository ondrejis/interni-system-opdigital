/** Srozumitelné názvy číselných řad podle klíče; neznámá řada se ukáže pod svým klíčem. */
export const SERIES_LABELS: Record<string, string> = {
  "fakturace.faktura": "Vydané faktury",
  "fakturace.zalohova": "Zálohové faktury",
  "fakturace.dobropis": "Dobropisy",
  "zakazky.cislo": "Zakázky",
  "zakazky.objednavka": "Objednávky",
  "realizace.predani": "Předávací protokoly",
  "sklad.prijemka": "Příjemky",
  "sklad.vydejka": "Výdejky",
  "sklad.prevodka": "Převodky",
  "sklad.vratka": "Vratky",
  "sklad.objednavka": "Objednávky materiálu",
  "sklad.inventura": "Inventury",
  "sklad.inventurni-rozdil": "Inventurní rozdíly",
};

export const seriesLabel = (key: string) => SERIES_LABELS[key] ?? key;
