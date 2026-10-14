# Realizace

> Vyprávěcí dokumentace modulu `realizace`. Přesné seznamy (pole entit, oprávnění, příkazy a jejich vstupy, tabulky, úlohy, trasy) se tu **neopisují**: jsou v referenci, která vzniká z kódu a nezastará. Tady je to, co z kódu vyčíst nejde: jak věci fungují za sebou, proč jsou tak, jak jsou, a kde jsou hrany.

Referenční stránky vzniklé z kódu: [modul](../reference/moduly/realizace.md), [entity](../reference/entity/realizace.md), [příkazy](../reference/prikazy/realizace.md), [databáze](../reference/databaze/realizace.md).

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

- **Popis z manifestu:** Harmonogram v pracovních dnech s Ganttem, stavební deník s předvyplněním, předávací protokol s podpisem a vady.
- **Závisí na:** [`zakazky`](zakazky.md)
- **Entity:** [`defect`](../reference/entity/realizace.md#defect)
- **Příkazy:** [24 příkazů](../reference/prikazy/realizace.md)
- **Úlohy na pozadí:** `realizace.today` (`0 6 * * 1-5`), `realizace.phases` (`10 6 * * 1-5`), `realizace.diary` (`0 16 * * 1-5`)
- **Dlaždice terminálu:** `realizace.diary`, `realizace.report`
- **Referenční stránky:** [modul](../reference/moduly/realizace.md), [entity](../reference/entity/realizace.md), [příkazy](../reference/prikazy/realizace.md), [databáze](../reference/databaze/realizace.md)

**Oprávnění a jejich výchozí přidělení rolím:**

| Oprávnění         | Název              | Výchozí: owner | Výchozí: office | Výchozí: foreman | Výchozí: worker |
| ----------------- | ------------------ | -------------- | --------------- | ---------------- | --------------- |
| `realizace.read`  | Vidí realizaci     | vše            | vše             | moje             | moje            |
| `realizace.write` | Zapisuje realizaci | vše            | vše             | moje             | moje            |

<!-- docs:generated:end -->

## Účel

<!-- Co modul řeší, pro koho, proč existuje a co do něj naopak nepatří. Tři až šest vět. -->

TODO: doplnit vyprávění

## Kdo to používá (role)

<!-- Které výchozí role modul používají, co v něm každá dělá a jaký mají rozsah (vše / moje). Matice oprávnění je v souhrnu výše. -->

TODO: doplnit vyprávění

## Hlavní toky krok za krokem

<!-- Každý tok zvlášť: spouštěč, očíslované kroky z pohledu uživatele i systému (co se zapíše, spočítá, odešle), výsledek a co se stane při chybě. -->

TODO: doplnit vyprávění

## Stavy a přechody

<!-- Stavové automaty (pipeline, fáze, stavy dokladů): z čeho kam se smí, za jakých podmínek, co přechod automaticky udělá. Hodí se tabulka nebo diagram Mermaid. -->

TODO: doplnit vyprávění

## Pravidla a výpočty

<!-- Vzorce, zaokrouhlování, sazby, meze, priority pravidel a příklad s čísly. U každého pravidla odkaz na funkci, která ho provádí. -->

TODO: doplnit vyprávění

## Oprávnění

<!-- Jak se oprávnění projevují v chování: kdo co vidí a smí, co je skryté (například peníze), jak funguje rozsah „jen moje“. Seznam oprávnění je v souhrnu. -->

TODO: doplnit vyprávění

## Nastavení

<!-- Co se nastavuje v administraci a v konfiguraci klienta, co která volba mění a jaké jsou výchozí hodnoty. -->

TODO: doplnit vyprávění

## Události a upozornění

<!-- Kdy a komu přijde upozornění, jaké události modul oznamuje rozšířením klienta, které plánované úlohy běží a co dělají. -->

TODO: doplnit vyprávění

## Exporty

<!-- Co a jak se exportuje (XLSX, CSV, PDF, ISDOC, kalendářový kanál), kdo to smí a co je v souboru. -->

TODO: doplnit vyprávění

## Integrace s jinými moduly

<!-- Závislosti, poskytovatelé dat, sloty, události; kdo od modulu data bere a komu je modul dává; co se stane po vypnutí modulu. -->

TODO: doplnit vyprávění

## Hrany a známá omezení

<!-- Co funguje jinak, než by uživatel čekal, co zatím chybí, a odkazy na otevřené otázky. -->

TODO: doplnit vyprávění

## Karta Harmonogram na Přehledu zakázky

Přehled zakázky ukazuje zmenšený Gantt (`packages/modules/realizace/src/schedule-card.tsx#ScheduleCard`), aby majitel viděl stav harmonogramu bez přepínání do záložky Realizace. Karta je čistě čtecí a modul ji přidává přes `ModuleUi.recordOverview` (`packages/modules/realizace/src/overview-cards.tsx#overviewCards`, id `schedule`, hlavní sloupec, pořadí 30, tedy nad deníkem a vadami).

- **Co ukazuje.** Celkový průběh a termín zakázky, štítek „Podle plánu“ nebo nejdelší zpoždění (z `phaseDelay`, stejný údaj jako v plném harmonogramu), pás s pruhem pro každou fázi (barva podle stavu: hotovo, zpožděno, probíhá, plán; vyplněná část = postup), milníky jako kosočtverce, svislou značku „dnes“ a pod pásem tři nejbližší nehotové fáze nebo milníky (`schedule-compact.ts#nextUp`). Žádné peníze: karta čte jen příkaz `realizace.phases.list`, který ceny nevrací, takže montér a mistr vidí totéž co vedoucí.
- **Rozsah pásu.** Celý plán od první fáze do konce poslední; plán delší než 150 dní se ukáže jako výřez 120 dní od 30 dní před dneškem (`schedule-compact.ts#timelineWindow`). Dnešek se do pásu přidá, jen když je těsně před začátkem nebo po konci plánu s nehotovou prací. Víc než osm fází se vybere podle důležitosti (zpožděné, rozpracované, nejbližší plánované; `pickRows`) a zbytek se shrne do poznámky pod pásem.
- **Kam vede.** Klik na pás i odkaz „Otevřít harmonogram“ otevřou Realizace → Harmonogram (`?tab=realizace&sub=harmonogram`), kde se plánuje a upravuje; karta sama nic nemění. Prázdný harmonogram ukáže „Harmonogram zatím není naplánovaný“ a (jen s právem zápisu na zakázku) tlačítko Naplánovat, které vede na totéž místo, kde je „Přidat první fázi“.
- **Kdy se karta ukazuje.** Stejně jako záložka Harmonogram od fáze Příprava (`fromPreparation`). V obchodní části (poptávka, nabídka, prohráno), tedy i v pop-upu CRM, karta není: harmonogram tam ještě neexistuje a odkaz by vedl na skrytou záložku.
- **Telefon a úzký sloupec.** Karta používá kontejnerové dotazy: v úzkém sloupci a na telefonu se skryjí názvy fází a data u nejbližších (zůstanou pruhy, štítek a seznam pod pásem). Pás je jedno tlačítko vysoké nejméně 44 px, takže se dá trefit prstem.

## Odkazy na kód a testy

<!-- Hlavní místa v kódu a testy, které chování zajišťují, ve tvaru `cesta/soubor.ts#symbol`. -->

TODO: doplnit vyprávění
