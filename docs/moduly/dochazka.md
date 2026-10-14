# Docházka

> Vyprávěcí dokumentace modulu `dochazka`. Přesné seznamy (pole entit, oprávnění, příkazy a jejich vstupy, tabulky, úlohy, trasy) se tu **neopisují**: jsou v referenci, která vzniká z kódu a nezastará. Tady je to, co z kódu vyčíst nejde: jak věci fungují za sebou, proč jsou tak, jak jsou, a kde jsou hrany.

Referenční stránky vzniklé z kódu: [modul](../reference/moduly/dochazka.md), [entity](../reference/entity/dochazka.md), [příkazy](../reference/prikazy/dochazka.md), [databáze](../reference/databaze/dochazka.md).

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

- **Popis z manifestu:** Píchačka (příchod, odchod, přestávka), týdenní výkazy hodin na zakázky, schvalování, uzávěrka měsíce, přehledy a připomínka.
- **Závisí na:** žádném modulu
- **Entity:** [`time_entry`](../reference/entity/dochazka.md#time_entry)
- **Příkazy:** [17 příkazů](../reference/prikazy/dochazka.md)
- **Úlohy na pozadí:** `dochazka.reminder` (`30 17 * * 1-5`), `dochazka.missing_clock_in` (`30 8 * * 1-5`), `dochazka.forgot_clock_out` (`*/30 6-21 * * *`)
- **Nastavení v administraci:** `dochazka`
- **Dlaždice terminálu:** `dochazka.clock`
- **Referenční stránky:** [modul](../reference/moduly/dochazka.md), [entity](../reference/entity/dochazka.md), [příkazy](../reference/prikazy/dochazka.md), [databáze](../reference/databaze/dochazka.md)

**Oprávnění a jejich výchozí přidělení rolím:**

| Oprávnění              | Název                  | Výchozí: owner | Výchozí: office | Výchozí: foreman | Výchozí: worker |
| ---------------------- | ---------------------- | -------------- | --------------- | ---------------- | --------------- |
| `dochazka.own`         | Zapisuje svou docházku | vše            | vše             | vše              | vše             |
| `dochazka.read`        | Vidí docházku          | vše            | vše             | moje             |                 |
| `dochazka.approve`     | Schvaluje docházku     | vše            | vše             | moje             |                 |
| `dochazka.close_month` | Uzavírá měsíc          | vše            |                 |                  |                 |

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

## Odkazy na kód a testy

<!-- Hlavní místa v kódu a testy, které chování zajišťují, ve tvaru `cesta/soubor.ts#symbol`. -->

TODO: doplnit vyprávění
