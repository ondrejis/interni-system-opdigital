# ADR 001: Klientské instance — image per klient

- Stav: přijato (2026-10-08, schválil Ondřej Dvořák; audit Q1)
- Kontext: fáze 0 (`docs/AUDIT.md` §11, R1)

## Kontext

Každý klient má vlastní VPS a vlastní databázi (single-tenant). Úpravy klienta dělíme na konfiguraci, vlastní pole a **rozšíření v kódu**
(`clients/<slug>/extensions/`). Next.js kompiluje kód do image, takže rozšíření klienta musí být součástí buildu.
Zadání zároveň chtělo jednu semver image v GHCR. Obojí najednou nejde.

Zvažované možnosti:

- **A. Image per klient.** CI sestaví `ghcr.io/<org>/<repo>-<slug>:vX.Y.Z` z monorepa s build argumentem `CLIENT=<slug>`.
- **B. Jedna image + za běhu načítaná rozšíření** (předkompilovaný JS v připojeném adresáři). Vlastní plugin loader a bezpečnostní model.
- **C. Klientský repozitář mimo monorepo**, závislý na publikovaných balíčcích jádra. Nejčistší izolace, nejvíc režie.

## Rozhodnutí

**A.** Aplikace se staví pro jednoho klienta: `CLIENT=<slug>` (výchozí `demo`) vybere složku v `clients/`, odkud se přes aliasy
`@client/config` a `@client/extensions` (viz `apps/web/next.config.ts`) do aplikace vkompiluje konfigurace a rozšíření.

- Konfigurace se validuje Zodem při startu (`instrumentation.ts`); neplatná konfigurace = proces skončí s výpisem všech chyb.
- Za běhu se klient nemění. Proměnná `CLIENT` v prostředí musí odpovídat tomu, pro koho je image sestavená, jinak aplikace nenastartuje.
- Jádro nesmí obsahovat žádnou podmínku na konkrétního klienta. Hlídá to `tests/guards.test.ts`.
- Rozšíření se k jádru připojují jen přes veřejné události a sloty (`@rebar/core`: `defineExtension`, `EventMap`).

## Důsledky

- Každé vydání jádra znamená N buildů (matice klientů v CI). Pro jednotky klientů je to přijatelné.
- Architektura (aliasy, veřejné háčky, žádné importy ze `clients/` v jádru) zůstává použitelná i pro přechod na **C**, pokud klientů přibude
  nebo bude potřeba předat klientovi vlastní repozitář.
- Verze image: `vX.Y.Z` jádra; změna rozšíření klienta bez změny jádra dostane patch verzi klientského tagu (podrobnosti ve fázi 5).
