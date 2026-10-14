import type { ModuleUi } from "@rebar/ui";
import { ui as disk } from "@rebar/disk/ui";
import { ui as finance } from "@rebar/finance/ui";
import { ui as hodiny } from "@rebar/hodiny/ui";
import { ui as kalendar } from "@rebar/kalendar/ui";
import { ui as klienti } from "@rebar/klienti/ui";
import { ui as kontakty } from "@rebar/kontakty/ui";
import { ui as muj_prostor } from "@rebar/muj-prostor/ui";
import { ui as obchody } from "@rebar/obchody/ui";
import { ui as prehled } from "@rebar/prehled/ui";
import { ui as reklama } from "@rebar/reklama/ui";
import { ui as sablony_emailu } from "@rebar/sablony-emailu/ui";
import { ui as ukoly } from "@rebar/ukoly/ui";
import { ui as zakazky } from "@rebar/zakazky/ui";

/**
 * Uživatelské rozhraní modulů (záložky na detailu, akce, stránky, sloty). Stejně jako serverová část se zobrazí jen
 * u zapnutých modulů. Přibývá s moduly.
 */
export const MODULE_UI: Record<string, ModuleUi> = {
  kontakty,
  klienti,
  disk,
  zakazky,
  obchody,
  ukoly,
  kalendar,
  hodiny,
  finance,
  reklama,
  "sablony-emailu": sablony_emailu,
  "muj-prostor": muj_prostor,
  prehled,
};
