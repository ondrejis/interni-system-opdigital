# Přehled

> Vyprávěcí dokumentace modulu `prehled`. Přesné seznamy (pole entit, oprávnění, příkazy a jejich vstupy, tabulky, úlohy, trasy) se tu **neopisují**: jsou v referenci, která vzniká z kódu a nezastará. Tady je to, co z kódu vyčíst nejde: jak věci fungují za sebou, proč jsou tak, jak jsou, a kde jsou hrany.

Referenční stránky vzniklé z kódu: [modul](../reference/moduly/prehled.md), [databáze](../reference/databaze/prehled.md).

<!--
Jak psát (podrobně v docs/DOCS-PROCES.md):
- Každá věta musí platit pro aktuální kód. Co se mění s kódem a jde to vyčíst z kódu, patří do reference, ne sem.
- Odkazuj na kód ve tvaru `cesta/soubor.ts#symbol` (cesta od kořene repozitáře, symbol je deklarace v souboru).
  Test tests/docs.test.ts ověří, že soubor i symbol existují.
- Sekci, kterou jsi zatím nenapsal, nech s řádkem „TODO: doplnit vyprávění“; pnpm docs:status je vypíše.
- Blok „Souhrn z kódu“ nepiš ručně, doplňuje ho pnpm docs:generate.
-->

## Souhrn z kódu

<!-- docs:generated:start -->

_Tento blok vzniká z kódu (`pnpm docs:generate`); neupravuj ho ručně. Vyprávění píš pod ním._

- **Popis z manifestu:** Úvodní přehled: nástěnky s čísly a seznamy z pohledů, poslední změny a rychlé odkazy.
- **Závisí na:** žádném modulu
- **Entity:** žádné
- **Příkazy:** žádné
- **Referenční stránky:** [modul](../reference/moduly/prehled.md), [databáze](../reference/databaze/prehled.md)

**Oprávnění a jejich výchozí přidělení rolím:**

| Oprávnění      | Název               | Výchozí: owner |
| -------------- | ------------------- | -------------- |
| `prehled.read` | Vidí úvodní přehled | vše            |

<!-- docs:generated:end -->

## Souhrn z kódu

<!-- docs:generated:start -->

_Tento blok vzniká z kódu (`pnpm docs:generate`); neupravuj ho ručně. Vyprávění píš pod ním._

- **Popis z manifestu:** Úvodní přehled: nástěnky s čísly a seznamy z pohledů, poslední změny a rychlé odkazy.
- **Závisí na:** žádném modulu
- **Entity:** žádné
- **Příkazy:** žádné
- **Referenční stránky:** [modul](../reference/moduly/prehled.md), [databáze](../reference/databaze/prehled.md)

**Oprávnění a jejich výchozí přidělení rolím:**

| Oprávnění      | Název               | Výchozí: owner |
| -------------- | ------------------- | -------------- |
| `prehled.read` | Vidí úvodní přehled | vše            |

<!-- docs:generated:end -->

## Účel

Přehled je úvodní stránka OPSYS (`/prehled`, na ni přesměruje i `/`). Každý uživatel má vlastní přehledy poskládané z widgetů a může jich mít víc („Den“, „Finance“) a přepínat mezi nimi. Modul nemá vlastní tabulky ani entity: stojí na platformě nástěnek jádra (`docs/DASHBOARDY.md`) a jen k ní přidává katalog hotových widgetů, výchozí přehledy a dva zdroje dat (Poslední změny, Úkoly na dnes). Čísla a seznamy dodávají ostatní moduly svými metrikami a dlaždicemi; Přehled je jen skládá.

## Kdo to používá (role)

Owner (Ondřej) a Partner (Patrik) mají `prehled.read` a `dashboards.write`, takže si přehledy skládají sami. Každý vidí ve widgetech jen to, na co má oprávnění a co smí vidět: soukromé záznamy Ondřeje Patrik nevidí v žádném widgetu, součtu ani seznamu. Externí spolupracovník bez `prehled.read` Přehled nevidí. Správu výchozích sad rolí a cizích přehledů má `dashboards.manage` (Nastavení → Nástěnky, jen owner).

## Hlavní toky krok za krokem

1. **První otevření.** Při prvním otevření `/prehled` dostane uživatel osobní kopie výchozích sad své role (Den a Finance; `packages/core/src/dashboards/service.ts#ensurePersonalBoards`). Platí jednou: i když všechny přehledy smaže, nové se nevytvoří. Samotné výchozí sady zůstávají vzory v Nastavení → Nástěnky a v přepínači se nenabízejí.
2. **Prohlížení.** Přepínač nahoře, filtry období, zakázky a osoby (jdou do adresy `?board=…&obdobi=…`), Obnovit, PDF, PNG a celá obrazovka pro televizi. Mimo režim Upravit se nic nepřetahuje ani nemění.
3. **Upravit.** Tlačítko Upravit zapne přidání widgetu z katalogu, přetahování (myš, dotyk, klávesnice), změnu velikosti, nastavení a odebrání; Uložit hlídá souběžnou změnu. Šířka je ve sloupcích z 12 (tablet 6, telefon 1). Na telefonu jde v režimu Upravit jen měnit pořadí widgetů (MOB-09); přidání, nastavení, odebrání a změna velikosti patří na tablet a počítač.
4. **Přidat widget.** Katalog (`packages/modules/prehled/src/presets.ts#WIDGET_PRESETS`) nabídne hotové widgety MVP i v2 podle toho, které moduly jsou zapnuté a co smí uživatel (`packages/core/src/dashboards/evaluate.ts#availablePresets`); widget zapnutého modulu bez oprávnění se nenabízí. Pod katalogem je „Vlastní widget“ z libovolných dat (číslo, graf, tabulka, seznam, souhrn podle stavu, měřidlo).
5. **Úkoly na dnes.** Seznam mých úkolů s termínem dnes a po termínu (po termínu první, červeně). Odškrtnutí ve widgetu volá příkaz `ukoly.complete` (stejná pravidla jako v seznamu úkolů), položka se hned přeškrtne a widget se načte znovu. V nastavení jde přidat delegované úkoly (zadal jsem je já, řeší je jiný); ty se v tomto widgetu neodškrtávají.
6. **Číslo a Seznam z pohledu.** Widget se naváže na uložený pohled (vlastní nebo sdílený). Číslo spočítá počet, nebo součet vybraného pole; Seznam ukáže prvních N řádků se sloupci a řazením pohledu. Data jdou stejnou datovou vrstvou jako seznamy, takže pohled sdílený Ondřejem ukáže Patrikovi jen sdílené záznamy.
7. **Rychlé odkazy.** Vlastní odkazy (jen adresy uvnitř systému nebo `https://`) a uložené pohledy; pohled, na jehož entitu uživatel nemá oprávnění, se v seznamu neobjeví.
8. **Poslední změny.** Seznam posledních změn záznamů (vše, nebo jen moje) z historie změn. Čte přes `packages/modules/prehled/src/metrics.ts#recentChanges`, tedy přes `queryHistory`, která každý dotaz vede přes `auditReadScope`: Patrik nevidí změny soukromých záznamů (ani bývalých soukromých) a z cizích bezpečnostních událostí nic.

## Stavy a přechody

Nemá. Přehled je buď osobní (autor ho upravuje), nebo sdílený s jiným uživatelem či rolí (upravuje ho jen autor nebo správce), nebo vzor role (jen správce).

## Pravidla a výpočty

- **Výchozí přehledy** (`clients/opsys/dashboards.ts#opsysDashboards`): „Den“ = Úkoly na dnes, Pipeline v Kč, Příjmy tento měsíc (můj podíl), Zakázky ve skluzu, Saldo vyrovnání, Poslední změny; „Finance“ = příjmy, retainery, saldo, nezaplacené platby, příjmy podle osoby; navíc jen pro ownera Hosting a údržba a Expirace domén a hostingů z Můj prostor (Patrik tyto widgety nikdy nedostane a katalog mu je nenabídne).
- **Příjmy tento měsíc** = metrika `finance.income_month` v zobrazení „můj podíl“ (zaplacené platby měsíce). Vystaveno a plánováno nejsou v metrikách financí; viz hrany.
- **Dlaždice modulů** (Pipeline, Moje otevřené obchody, Zakázky ve skluzu, Saldo, Nezaplacené platby, Leady a CPL) jsou vestavěný blok „tiles“ s filtrem `tileIds`; text a odkaz dodává modul.
- **Soukromí:** žádný widget nečte tabulky sám. Entity, pohledy a součty jdou přes datovou vrstvu (`privateScope`), metriky a dlaždice modulů mají vlastní `privatePaths`, Přehled přidává `prehled.metric.*` a `prehled.widget.*` (zkouší stejnou datovou vrstvu nad entitami se soukromými záznamy).
- **Limity:** 24 widgetů na přehled, 25 přehledů na uživatele, 12 odkazů, 50 řádků seznamu z pohledu.

## Oprávnění

`prehled.read` otevře stránku. Každý widget navíc vyžaduje oprávnění svých metrik nebo entit (`packages/core/src/dashboards/evaluate.ts#presetAvailable`); widget, na který aktér nemá oprávnění, se v katalogu nenabízí a v už uloženém přehledu ukáže zámek s větou. Sdílení přehledu data neodemyká.

## Nastavení

V Nastavení → Nástěnky (`dashboards.manage`) jsou vzory rolí, sdílení a výchozí přehledy. Zapnutí je v `clients/opsys/config.ts` (`dashboards.enabled`). Vzory se zakládají při `db:seed` jednou (klíče `owner-den`, `owner-finance`, `partner-den`, `partner-finance`); co správce upraví nebo smaže, se nepřepisuje.

## Události a upozornění

Žádné. Přehled nic nevysílá ani neupozorňuje; číselné odznaky u navigace dodávají moduly.

## Exporty

Každý widget jde stáhnout jako CSV nebo XLSX a celý přehled jako PDF nebo PNG (platforma nástěnek). Export nese jen to, co widget ukazuje, takže soukromá data neprozradí.

## Integrace s jinými moduly

Modul nemá `dependsOn` a žádný jiný modul neimportuje. Widgety se skládají z jejich `dashboardMetrics` a dlaždic (`widgets`), úkoly se čtou příkazem `ukoly.list` přes poskytovatele `packages/modules/prehled/src/my-tasks.ts#createMyTasks`, který aplikace předává prostředí nástěnek (`apps/web/src/server/dashboards.ts#getDashboardEnv`). Vypnutý modul nemá metriky, takže jeho widgety zmizí z katalogu a v uložených přehledech ukážou větu „vypnutý modul“. Reklama (`reklama.*`) a Kalendář (`kalendar.upcoming`, Nadcházející schůzky) dodají vlastní metriky; do té doby se jejich widgety nenabízí.

## Hrany a známá omezení

- Příjmy tento měsíc ukazují zaplacené platby můj podíl; vystaveno a plánováno (R-41) čekají na metriky financí (žádost v `docs/opsys/ZADOSTI.md`).
- Nadcházející schůzky čekají na metriku kalendáře `kalendar.upcoming` (tvar seznam, soukromé schůzky bez názvu pro partnera).
- Výchozí sady se zakládají jen při seedu; existující dev databáze s dřívějšími sadami „Majitel: přehled“ a „Partner: přehled“ je má dál jako vzory, stačí je v Nastavení → Nástěnky smazat.
- Widget Číslo z pohledu nabízí součet jen polí typu číslo a částka, která smí uživatel vidět; pole skrytá oprávněním vrátí větu místo čísla.

## Odkazy na kód a testy

- `packages/modules/prehled/src/presets.ts#WIDGET_PRESETS`, `packages/modules/prehled/src/metrics.ts#recentChanges`, `packages/modules/prehled/src/my-tasks.ts#createMyTasks`, `packages/modules/prehled/src/server.ts#privatePaths`.
- `packages/core/src/dashboards/evaluate.ts#availablePresets`, `packages/core/src/dashboards/service.ts#ensurePersonalBoards`, `clients/opsys/dashboards.ts#opsysDashboards`.
- UI: `packages/ui/src/dashboards/dashboard-view.tsx#DashboardView`, `packages/ui/src/dashboards/widget-catalog-dialog.tsx#WidgetCatalogDialog`, `apps/web/src/app/(app)/prehled/prehled-host.tsx#PrehledHost`.
- Testy: katalog a výchozí přehledy `packages/modules/prehled/src/presets.test.ts`, soukromí, pohledy, úkoly a první otevření `tests/prehled.int.test.ts`, e2e `apps/web/e2e/prehled-widgety.spec.ts`.
