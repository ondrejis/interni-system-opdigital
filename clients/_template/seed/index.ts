import { ACCOUNTANT_ROLE, DEFAULT_ROLES, defineSeed } from "@rebar/core/seed";

/**
 * Výchozí data klienta (role, pipeline, číselníky, číselné řady). Při instalaci a aktualizaci se doplní jen to,
 * co chybí — co správce změnil v administraci, se nepřepisuje.
 */
export default defineSeed({
  roles: [...DEFAULT_ROLES, ACCOUNTANT_ROLE],
});
