# Proces dokumentace

Jak se dokumentace udržuje přesná, úplná a aktuální. Rozhodnutí a jejich důvody jsou v [ADR 022](adr/022-dokumentace-z-kodu.md), rozcestník ke všem dokumentům je [INDEX](INDEX.md).

## 1. Tři vrstvy a komu patří

| Vrstva               | Kde                                                   | Kdo ji píše                     | Jak se hlídá přesnost                                                                                                      |
| -------------------- | ----------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Reference z kódu** | [docs/reference/](reference/README.md) (kromě `api/`) | nikdo, vzniká z kódu            | `pnpm docs:check` znovu vygeneruje a porovná; rozdíl = chyba v `pnpm check` i v CI                                         |
| **API z TSDoc**      | [docs/reference/api/](reference/api/README.md)        | autor kódu (JSDoc nad exportem) | totéž, navíc pravidlo ESLintu a `pnpm docs:coverage` (ratchet popisů)                                                      |
| **Vyprávění modulů** | [docs/moduly/](INDEX.md#moduly-vyprávěcí-dokumentace) | autor změny funkce              | test odkazů na kód (`cesta/soubor.ts#symbol`) a odkazů mezi dokumenty; věcnou správnost hlídá recenze a týdenní audit (§6) |

Co jde zjistit z kódu (pole entit, oprávnění, příkazy a jejich vstupy, tabulky, úlohy, proměnné prostředí, trasy), se **nikdy nepíše ručně**: ruční opis zastará a pak lže.
Ruční text popisuje jen to, co z kódu vyčíst nejde: jak věci fungují za sebou, proč jsou tak, jak jsou, výpočty a pravidla s příklady, hrany a omezení.

## 2. Definice „hotovo“ pro změnu funkce

Změna funkce (nové pole, příkaz, oprávnění, pravidlo, úloha, trasa, nastavení) je hotová, až když:

1. kód i testy jsou hotové a `pnpm check` je zelený;
2. **reference je přegenerovaná**: `pnpm docs:generate` a změněné soubory v `docs/reference/`, `docs/INDEX.md` a blocích „Souhrn z kódu“ jsou ve stejném commitu;
3. nové exporty mají **JSDoc s popisem** (věta, k čemu slouží); ESLint nový export bez popisu odmítne;
4. **vyprávění dotčeného modulu je upravené** (`docs/moduly/<modul>.md`): změněné toky, stavy, pravidla, výpočty, omezení; věty, které přestaly platit, jsou opravené nebo smazané;
5. v [CHANGELOG](../CHANGELOG.md) (sekce Unreleased) je řádek o změně;
6. nové architektonické rozhodnutí má ADR (`docs/adr/`) a je v rozcestníku (generuje se samo).

Pokud změna mění chování viditelné klientovi, upraví se i dokumenty pro klienta v `clients/<slug>/`.

## 3. Příkazy

| Příkaz               | Co dělá                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm docs:generate` | přepíše `docs/reference/` (včetně `api/`), `docs/INDEX.md` a bloky „Souhrn z kódu“ v `docs/moduly/*.md` podle kódu                                                           |
| `pnpm docs:check`    | nic nezapisuje; vygeneruje obsah do paměti a porovná ho s commitnutým; při rozdílu selže s návodem                                                                           |
| `pnpm docs:api`      | přegeneruje jen API referenci z TSDoc (`docs/reference/api/`)                                                                                                                |
| `pnpm docs:coverage` | vypíše pokrytí popisy exportovaných funkcí, tříd a typů po balíčcích; `--check` selže na nový export bez popisu, `--prune` smaže vyřešené výjimky, `--list` vypíše chybějící |
| `pnpm docs:status`   | vypíše, které sekce vyprávěcí dokumentace jsou ještě označené `TODO: doplnit vyprávění`; `--strict` selže, dokud nějaké zbývá                                                |
| `pnpm docs:scaffold` | založí chybějící kostry `docs/moduly/<modul>.md` ze šablony (existující nikdy nepřepíše)                                                                                     |
| `pnpm docs:refresh`  | `docs:generate` a `docs:coverage --prune` najednou: spusť po sloučení větví a před commitem                                                                                  |

`pnpm check` obsahuje `pnpm docs:check` a `pnpm docs:coverage --check`; stejné kroky běží v CI v jobu `check`. ESLint (`pnpm lint`) navíc kontroluje popisy exportů průběžně, i v editoru.

### Po sloučení větví a při práci více lidí nebo agentů najednou

Generovaný výstup je funkcí celého kódu, takže po sloučení se **vždy** přegeneruje: `pnpm docs:refresh` a výsledek se commitne. Konflikt v souboru pod `docs/reference/` se neřeší ručně:
vezme se libovolná strana a spustí se `pnpm docs:generate`. Volitelně lze přegenerování zavěsit do git hooku `pre-commit` (`pnpm docs:generate && git add docs`), nebo do kroku před commitem v `pnpm check:fresh`.

## 4. Jak generátor funguje

Skripty jsou v `scripts/docs/` (spouští je `tsx`), výstup je **deterministický**: stabilní řazení, žádná časová razítka, žádné absolutní cesty. Dvě spuštění nad stejným kódem dají stejné soubory.
Generátor nepopisuje, co by v kódu mělo být, ale co v něm skutečně je: načte skutečné manifesty, serverové části, UI a schémata (stejně jako je skládá aplikace) a doplní je popisy z JSDoc ve zdrojích.

| Výstup                           | Zdroj v kódu                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `reference/entity/`              | registr entit modulů (`ModuleServer.entities`), manifesty (pipeline), schéma tabulek                         |
| `reference/opravneni.md`         | manifesty, `CORE_PERMISSIONS`, `DEFAULT_ROLES`, použití oprávnění v entitách, příkazech a navigaci           |
| `reference/moduly/`              | manifesty, serverové části modulů, UI modulů (`ModuleUi`), definice nastavení (`defineSetting`)              |
| `reference/prikazy/`             | registr příkazů (`defineCommand`) a jejich Zod schémata převedená na tabulku polí                            |
| `reference/prostredi.md`         | validační schéma proměnných prostředí, `clientConfigSchema`, `.env.example`, čtení `process.env` ve zdrojích |
| `reference/databaze/`            | Drizzle schéma (sloupce, vazby, indexy), žurnály migrací                                                     |
| `reference/udalosti-a-ulohy.md`  | úlohy jádra a modulů (cron), místa vzniku upozornění, rozhraní `EventMap`, nalezené katalogy                 |
| `reference/trasy.md`             | soubory `page` a `route` v `apps/web/src/app`, manifesty, serverové akce (`"use server"`)                    |
| `reference/exporty-a-importy.md` | oprávnění exportu v entitách, route handlery a příkazy podle názvu                                           |
| `reference/api/`                 | exporty vstupních bodů balíčků (`exports` v `package.json`), JSDoc a deklarace (TypeScript compiler API)     |
| `INDEX.md`                       | soubory `docs/` a jejich nadpisy                                                                             |

### Co z kódu zjistit nejde

Generátor to nezvládne a musí se to psát ručně do `docs/moduly/`: proč pravidlo existuje, postup krok za krokem z pohledu uživatele, výpočty s příklady, význam stavů,
obsah dat vracených poskytovateli (položky „Vyžaduje pozornost“, dlaždice přehledu jsou funkce závislé na datech), text a příjemce konkrétních upozornění,
omezení a hrany. U zápisu příkazů (`defineCommand`) a polí jejich schémat je popis jen tam, kde ho zdroj má (JSDoc nad příkazem, `.describe()` ve schématu).

## 5. Popisy exportů (JSDoc) a ratchet

Pravidlo `docs/exported-description` (`scripts/docs/eslint-plugin.mjs`) vyžaduje nad každou **exportovanou funkcí, třídou, rozhraním, typem a výčtem** v `packages/core/src`, `packages/modules/*/src` a `packages/ui/src` JSDoc s popisem: jednu až dvě věty, k čemu to slouží (ne opis názvu). Netýká se testů; React komponenty (PascalCase funkce v `.tsx`) a konstanty se počítají do statistiky, ale nevyžadují se.

Starý kód bez popisů je v `docs/jsdoc-baseline.json` (**ratchet**): seznam se smí jen zmenšovat.

- nový export bez popisu je chyba (`pnpm lint`, `pnpm docs:coverage --check`);
- když doplníš popis exportu z baseline, `pnpm docs:coverage --check` selže, dokud výjimku nesmažeš: spusť `pnpm docs:coverage --prune`;
- do baseline se nic nepřidává; export, který se přejmenoval nebo přesunul, se jako nový musí popsat;
- postup čištění: `pnpm docs:coverage --list`, vezmi jeden soubor, doplň popisy, `pnpm docs:coverage --prune`.

## 6. Týdenní audit driftu

Generovaná část se nemůže rozejít s kódem (hlídá ji CI). Ručně psané vyprávění se rozejít může, proto jednou týdně běží audit. Návod pro naplánovaného agenta (spouští se v čerstvém klonu větve `main`):

1. `pnpm install`, `pnpm docs:refresh`. Pokud `git status` ukáže změny v `docs/`, někdo commitl bez regenerace: založ změnu s přegenerovaným výstupem.
2. `pnpm docs:coverage` a `pnpm docs:status`: zapiš do zprávy pokrytí popisy a počet sekcí s `TODO: doplnit vyprávění` po modulech a rozdíl proti minulému týdnu.
3. Pro každý modul zjisti změny kódu za posledních sedm dní: `git log --since="7 days ago" --name-only -- packages/modules/<modul> packages/core apps/web`. U modulů, kde se změnil kód, ale `docs/moduly/<modul>.md` ne, projdi změny (`git diff`) a ověř, že každá věta vyprávění stále platí. Opravuj jen to, co je prokazatelně nepravdivé nebo zastaralé; nové texty piš jen podle kódu a testů.
4. Pro každou větu s odkazem na kód ověř, že odkazovaná funkce stále dělá, co věta tvrdí (test ověřuje jen existenci souboru a symbolu, ne význam).
5. Změny pošli jako jeden pull request „docs: týdenní audit“ s přehledem: co se změnilo, co se opravilo, co zůstává nejisté (otázky pro autora). Nikdy nemaž obsah, který neumíš s kódem porovnat; označ ho a zeptej se.

## 7. Jak rozšířit generátor o nový registr

1. **Zjisti, jestli to už nevidí generátor.** Položky manifestu modulu, hodnoty `ModuleServer`/`collectServers` a části `ModuleUi`, které generátor nezná, se vypíšou **automaticky** v obecné tabulce v referenci modulu (`reference/moduly/<modul>.md`, sekce s poznámkou „zobrazeno obecně“). Exportované konstanty s názvem obsahujícím `EVENT`, `CATALOG`, `METRIC`, `KPI` nebo `NOTIFICATION` (velkými písmeny, pole nebo objekt záznamů) se objeví v `reference/udalosti-a-ulohy.md` v sekci „Další katalogy nalezené v kódu“. Pro většinu nových věcí tedy nic neděláš.
2. **Vlastní sekce.** Když chceš přesnější výpis: přidej `scripts/docs/sections/<téma>.ts` s funkcí, která vrátí `Record<cesta, obsah>`; čti **registr** (běhový objekt nebo definici přes `defineX`), ne natvrdo cesty k souborům. Zapoj ji v `scripts/docs/build.ts`, přidej odkaz do `referenceReadme` a `indexDoc` (`scripts/docs/sections/docs-meta.ts`). Hlavička `generatedHeader()` je povinná.
3. Do generátoru **nepiš věcná tvrzení o chování** (to je ruční vyprávění); jen strukturu a odkazy na dokumenty a ADR.
4. Přidej záznam do tabulky ve §4, spusť `pnpm docs:generate`, zkontroluj výstup očima a commitni. `tests/docs-generator.test.ts` ověří determinismus (dvě generování se shodují).
5. Co čte `tsx` skript, musí jít spustit bez databáze a bez sítě.

## 8. GitHub Pages (zatím vypnuto)

Dokumentace je čitelná přímo na GitHubu (markdown, tabulky, Mermaid). Publikaci jako web (GitHub Pages) lze zapnout, ale **zatím zapnutá není**: vyžaduje výslovné povolení majitele a rozhodnutí v ADR (kdo obsah uvidí; u soukromého repozitáře závisí dostupnost Pages na tarifu GitHubu a obsah dokumentace se zveřejní).
Připravený workflow je v `.github/workflows/docs-pages.yml.disabled` (přípona `.disabled` znamená, že ho GitHub nespouští). Postup zapnutí je v hlavičce souboru.
