/** Zakázka v terminálu řemeslníka (tvar odpovědi `zakazky.terminal.sites`; sdílený mezi serverem a UI). */
export type TerminalSite = {
  id: string;
  number: string;
  title: string;
  phase: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  startDate: string | null;
  endDate: string | null;
  /** Kontaktní osoba zákazníka na místě. */
  contact: { name: string; phone: string | null; position: string | null } | null;
  /** Vedoucí zakázky a kolegové z týmu (jméno a telefon, bez jakýchkoli mzdových údajů). */
  manager: { name: string; phone: string | null } | null;
  team: { name: string; phone: string | null; role: string | null }[];
};
