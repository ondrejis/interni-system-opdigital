import { defineSeed } from "@rebar/core/seed";
import { ROLES } from "./roles";

/**
 * Výchozí data klienta OPSYS (role; pipeline, typy úkolů, šablony zakázek a pravidla rozdělení doplňují moduly
 * a SEED v S2). Při instalaci a aktualizaci se doplní jen to, co chybí: co správce změnil v administraci, se nepřepisuje.
 * Klíče oprávnění mimo katalog zapnutých modulů se ignorují.
 */
export default defineSeed({ roles: ROLES });
