import { ui as dochazka } from "@rebar/dochazka/ui";
import { ui as fakturace } from "@rebar/fakturace/ui";
import { ui as kalendar } from "@rebar/kalendar/ui";
import { ui as kontakty } from "@rebar/kontakty/ui";
import { ui as poptavky } from "@rebar/poptavky/ui";
import { ui as realizace } from "@rebar/realizace/ui";
import { ui as sklad } from "@rebar/sklad/ui";
import { ui as stroje } from "@rebar/stroje/ui";
import type { ModuleUi } from "@rebar/ui";
import { ui as zakazky } from "@rebar/zakazky/ui";

/**
 * Uživatelské rozhraní modulů (záložky na detailu, akce, stránky). Stejně jako serverová část se zobrazí jen
 * u zapnutých modulů. Přibývá s moduly.
 */
export const MODULE_UI: Record<string, ModuleUi> = {
  kontakty,
  poptavky,
  zakazky,
  realizace,
  fakturace,
  dochazka,
  sklad,
  stroje,
  kalendar,
};
