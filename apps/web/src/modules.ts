import type { ModuleManifest } from "@rebar/core";
import { manifest as disk } from "@rebar/disk";
import { manifest as finance } from "@rebar/finance";
import { manifest as hodiny } from "@rebar/hodiny";
import { manifest as kalendar } from "@rebar/kalendar";
import { manifest as klienti } from "@rebar/klienti";
import { manifest as kontakty } from "@rebar/kontakty";
import { manifest as muj_prostor } from "@rebar/muj-prostor";
import { manifest as obchody } from "@rebar/obchody";
import { manifest as prehled } from "@rebar/prehled";
import { manifest as reklama } from "@rebar/reklama";
import { manifest as sablony_emailu } from "@rebar/sablony-emailu";
import { manifest as ukoly } from "@rebar/ukoly";
import { manifest as zakazky } from "@rebar/zakazky";

/**
 * Všechny moduly dostupné v tomto sestavení, v pořadí `MODULE_IDS` (závislosti dřív než konzumenti = pořadí migrací).
 * Které z nich běží, rozhoduje konfigurace klienta.
 */
export const ALL_MODULES: readonly ModuleManifest[] = [
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
  sablony_emailu,
  muj_prostor,
  prehled,
];
