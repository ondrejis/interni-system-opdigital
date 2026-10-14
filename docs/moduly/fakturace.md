# Fakturace

> Vyprávěcí dokumentace modulu `fakturace`. Přesné seznamy (pole entit, oprávnění, příkazy a jejich vstupy, tabulky, úlohy, trasy) se tu **neopisují**: jsou v referenci, která vzniká z kódu a nezastará. Tady je to, co z kódu vyčíst nejde: jak věci fungují za sebou, proč jsou tak, jak jsou, a kde jsou hrany.

Referenční stránky vzniklé z kódu: [modul](../reference/moduly/fakturace.md), [entity](../reference/entity/fakturace.md), [příkazy](../reference/prikazy/fakturace.md), [databáze](../reference/databaze/fakturace.md).

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

- **Popis z manifestu:** Zálohové, průběžné a konečné faktury z položek zakázky, platby, dobropisy, PDF s QR platbou, odesílání e-mailem s upomínkami, export (XLSX, balík pro účetní), šablony dokladů.
- **Závisí na:** [`zakazky`](zakazky.md), [`kontakty`](kontakty.md)
- **Entity:** [`invoice`](../reference/entity/fakturace.md#invoice), [`received_invoice`](../reference/entity/fakturace.md#received_invoice)
- **Příkazy:** [29 příkazů](../reference/prikazy/fakturace.md)
- **Úlohy na pozadí:** `fakturace.overdue` (`30 5 * * *`), `fakturace.due_soon` (`0 7 * * 1-5`), `fakturace.received.overdue` (`40 5 * * *`), `fakturace.dispatch.sync` (`* * * * *`)
- **Nastavení v administraci:** `fakturace`
- **Referenční stránky:** [modul](../reference/moduly/fakturace.md), [entity](../reference/entity/fakturace.md), [příkazy](../reference/prikazy/fakturace.md), [databáze](../reference/databaze/fakturace.md)

**Oprávnění a jejich výchozí přidělení rolím:**

| Oprávnění          | Název                           | Výchozí: owner | Výchozí: office | Výchozí: foreman | Výchozí: worker |
| ------------------ | ------------------------------- | -------------- | --------------- | ---------------- | --------------- |
| `fakturace.read`   | Vidí faktury                    | vše            | vše             |                  |                 |
| `fakturace.write`  | Vystavuje faktury               | vše            | vše             |                  |                 |
| `fakturace.export` | Exportuje faktury do účetnictví | vše            | vše             |                  |                 |

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

Seznamy faktur (vydané i přijaté) se exportují obecným exportem seznamů (CSV, XLSX, PDF; [EXPORTY](../EXPORTY.md)) s oprávněním `fakturace.export`. Pro účetní je stránka **Fakturace → Export pro účetní**:
**balík dokladů** za období (ZIP s PDF vydaných, skeny přijatých, souhrnem a volitelně ISDOC a podklady DPH; `packages/modules/fakturace/src/export/package.ts#prepareAccountingPackage`),
**ISDOC 6.0.2** jednoho dokladu nebo za období (`packages/modules/fakturace/src/export/isdoc.ts#buildIsdoc`) a **podklady DPH** v CSV nebo XLSX po sazbách s přenesenou daňovou povinností zvlášť (`packages/modules/fakturace/src/export/vat-report.ts`).
Rozsah „jen moje“ se respektuje a každý export se zapisuje do auditu. ISDOC nebyl ověřen proti oficiálnímu XSD (viz OPEN-QUESTIONS E3); zálohové faktury nejsou v podkladech DPH (E4); cizí měna se nepřepočítává (E5).

## Integrace s jinými moduly

<!-- Závislosti, poskytovatelé dat, sloty, události; kdo od modulu data bere a komu je modul dává; co se stane po vypnutí modulu. -->

TODO: doplnit vyprávění

## Hrany a známá omezení

<!-- Co funguje jinak, než by uživatel čekal, co zatím chybí, a odkazy na otevřené otázky. -->

TODO: doplnit vyprávění

## Odkazy na kód a testy

<!-- Hlavní místa v kódu a testy, které chování zajišťují, ve tvaru `cesta/soubor.ts#symbol`. -->

TODO: doplnit vyprávění
