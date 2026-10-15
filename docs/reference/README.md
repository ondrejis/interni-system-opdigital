# Reference generovaná z kódu

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (celý kód repozitáře). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Všechno v této složce vzniká přímo z kódu a **nikdy se neupravuje ručně**. Správnost zaručuje kontrola driftu: `pnpm docs:check` (součást `pnpm check` a CI) znovu vygeneruje obsah a porovná ho s commitnutým. Když se změní kód, spusť `pnpm docs:generate` a výsledek commitni. Proces popisuje [DOCS-PROCES](../DOCS-PROCES.md), rozhodnutí [ADR 022](../adr/022-dokumentace-z-kodu.md).

| Dokument | Co v něm je | Zdroj |
| --- | --- | --- |
| [moduly/](moduly/README.md) | manifest, navigace, nabídka UI, úlohy, nastavení každého z 13 modulů | manifesty, `ModuleServer`, `ModuleUi` |
| [entity/](entity/README.md) | 18 entit: pole, typy, vazby, povinnost, výčty | registr entit |
| [prikazy/](prikazy/README.md) | 204 serverových příkazů: oprávnění a vstupní pole | registr příkazů, Zod schémata |
| [opravneni.md](opravneni.md) | katalog oprávnění a matice výchozích rolí | manifesty, `DEFAULT_ROLES` |
| [prostredi.md](prostredi.md) | proměnné prostředí a konfigurace klienta | validační schémata |
| [databaze/](databaze/README.md) | tabulky, sloupce, vazby, indexy, migrace | Drizzle schéma, žurnály migrací |
| [udalosti-a-ulohy.md](udalosti-a-ulohy.md) | plánované úlohy, druhy upozornění, události rozšíření | registr úloh, zdroje |
| [trasy.md](trasy.md) | stránky, route handlery, serverové akce | `apps/web/src/app` |
| [exporty-a-importy.md](exporty-a-importy.md) | exporty seznamů, PDF, kanály, příjem dat zvenčí | registry a trasy |
| [api/](api/README.md) | API referenční stránky (120 vstupních bodů balíčků) | TSDoc ve zdrojích |

Co se z kódu zjistit nedá (logika zakázky, pravidla výpočtů, postupy práce), popisují ručně psané [moduly](../INDEX.md#moduly-vyprávěcí-dokumentace).
