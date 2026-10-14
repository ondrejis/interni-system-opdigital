import type { ModuleManifest } from "@rebar/core";
import { manifest as dochazka } from "@rebar/dochazka";
import { manifest as fakturace } from "@rebar/fakturace";
import { manifest as kalendar } from "@rebar/kalendar";
import { manifest as kontakty } from "@rebar/kontakty";
import { manifest as poptavky } from "@rebar/poptavky";
import { manifest as realizace } from "@rebar/realizace";
import { manifest as sklad } from "@rebar/sklad";
import { manifest as stroje } from "@rebar/stroje";
import { manifest as zakazky } from "@rebar/zakazky";

/** Všechny moduly dostupné v tomto sestavení. Které z nich běží, rozhoduje konfigurace klienta. */
export const ALL_MODULES: readonly ModuleManifest[] = [
  kontakty,
  zakazky,
  poptavky,
  realizace,
  fakturace,
  dochazka,
  sklad,
  stroje,
  kalendar,
];
