# Kalendář

> Vyprávěcí dokumentace modulu `kalendar`. Přesné seznamy (pole entit, oprávnění, příkazy a jejich vstupy, tabulky, úlohy, trasy) se tu **neopisují**: jsou v referenci, která vzniká z kódu a nezastará. Tady je to, co z kódu vyčíst nejde: jak věci fungují za sebou, proč jsou tak, jak jsou, a kde jsou hrany.

Referenční stránky vzniklé z kódu: [modul](../reference/moduly/kalendar.md), [entity](../reference/entity/kalendar.md), [příkazy](../reference/prikazy/kalendar.md), [databáze](../reference/databaze/kalendar.md).

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

- **Popis z manifestu:** Události s účastníky, opakováním a připomenutím, zdroje (zasedačky, vybavení) s kontrolou kolizí, vrstvy z ostatních modulů, odběr kalendáře v Google, Apple a Outlooku a import cizích kalendářů jako „obsazeno“.
- **Závisí na:** žádném modulu
- **Entity:** [`event`](../reference/entity/kalendar.md#event), [`calendar_resource`](../reference/entity/kalendar.md#calendar_resource)
- **Příkazy:** [11 příkazů](../reference/prikazy/kalendar.md)
- **Úlohy na pozadí:** `kalendar.reminders` (`*/5 * * * *`), `kalendar.sync` (`10 * * * *`)
- **Referenční stránky:** [modul](../reference/moduly/kalendar.md), [entity](../reference/entity/kalendar.md), [příkazy](../reference/prikazy/kalendar.md), [databáze](../reference/databaze/kalendar.md)

**Oprávnění a jejich výchozí přidělení rolím:**

| Oprávnění            | Název                     | Výchozí: owner | Výchozí: office | Výchozí: foreman | Výchozí: worker |
| -------------------- | ------------------------- | -------------- | --------------- | ---------------- | --------------- |
| `kalendar.read`      | Vidí kalendář             | vše            | vše             | vše              | moje            |
| `kalendar.write`     | Upravuje události         | vše            | vše             | moje             |                 |
| `kalendar.resources` | Spravuje zdroje kalendáře | vše            | vše             |                  |                 |

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
