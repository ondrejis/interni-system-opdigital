# Modul Hodiny (hodiny)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Zápis odpracovaného času k zakázkám a úkolům: týdenní mřížka, formáty 1,5 a 1:30, souhrny podle zakázky.

- **Identifikátor:** `hodiny`, ikona `clock`
- **Závisí na:** [`zakazky`](zakazky.md)
- **Balíček:** `packages/modules/hodiny`
- **Vyprávěcí dokumentace:** [docs/moduly/hodiny.md](../../moduly/hodiny.md)
- **Příkazy:** žádné
- **Entity:** žádné
- **Databáze:** [tabulky a migrace](../databaze/hodiny.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Hodiny | `/hodiny` | `clock` | `hodiny.read` | Realizace |  |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/hodiny` | Hodiny | `hodiny.read` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `hodiny.read` | Vidí odpracované hodiny | Rozsah „jen moje“ = jen vlastní záznamy |
| `hodiny.write` | Zapisuje a upravuje hodiny |  |
| `hodiny.delete` | Maže záznamy hodin |  |
