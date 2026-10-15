import { defineSeed } from "@rebar/core/seed";
import { ROLES } from "./roles";

/**
 * Výchozí data klienta OPSYS pro `pnpm db:seed` (produkce i vývoj, idempotentní). Role a štítky jsou tady, ostatní
 * výchozí data zakládají samy moduly (manifest `seed` a `ensure`), aby je mělo každé nasazení bez ohledu na klienta:
 *  - obchody: pipeline „Obchody“ (Nová poptávka 10 %/1 d, Kontaktováno 20 %/5 d, Schůzka / konzultace 40 %/7 d,
 *    Nabídka odeslaná 60 %/7 d, Vyjednávání 80 %/10 d) a číselník důvodů prohry,
 *  - ukoly: typy aktivit Úkol, Hovor, Schůzka, E-mail, Termín,
 *  - zakazky: číselná řada `Z-{YYYY}-{NNN}` a šablony Web, Marketing – úvodní fáze (2 × 7 000 Kč, první fakturuje
 *    vlastník, druhou druhý partner), Marketing – retainer a Systémy (jen když je tabulka šablon prázdná),
 *  - finance: výchozí rozdělení nových zakázek 50/50 se odvodí z aktivních uživatelů rolí owner a partner,
 *    základ salda je „zaplacené“; nic se neukládá, dokud to vlastník nezmění v Nastavení → Finance,
 *  - disk: strom složek klienta a typů zakázek je výchozí z kódu (Nastavení → Google Disk ho jen přepisuje),
 *  - muj-prostor a ostatní moduly: výchozí pohledy (`views`),
 *  - přehled: výchozí nástěnky rolí `owner` a `partner` z `../dashboards.ts` (core je zakládá z `config.dashboards`).
 * Při instalaci a aktualizaci se doplní jen to, co chybí: co správce změnil v administraci, se nepřepisuje.
 * Klíče oprávnění mimo katalog zapnutých modulů se ignorují. První uživatel (owner) vzniká z `OWNER_*`; Patrika zve
 * Ondřej v aplikaci, seed pozvánku nezakládá. Vývojová data a vývojové účty: `pnpm dev:seed` (`seed/dev/`).
 *
 * Štítky: spec jmenuje jediný, „Meta“ (štítek leadů z Meta Ads). Doplní se jen do nově založeného číselníku štítků.
 */
export default defineSeed({
  roles: ROLES,
  lookups: [{ key: "tag", name: "Štítky", items: [{ value: "meta", label: "Meta", color: "blue" }] }],
});
