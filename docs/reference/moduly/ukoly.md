# Modul Úkoly a poznámky (ukoly)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Úkoly (včetně hovorů, schůzek a termínů) s rychlým zadáním, podúkoly a poznámky s formátovaným textem navázané na obchody, klienty, kontakty a zakázky.

- **Identifikátor:** `ukoly`, ikona `check-square`
- **Závisí na:** žádném modulu
- **Balíček:** `packages/modules/ukoly`
- **Vyprávěcí dokumentace:** [docs/moduly/ukoly.md](../../moduly/ukoly.md)
- **Příkazy:** žádné
- **Entity:** žádné
- **Databáze:** [tabulky a migrace](../databaze/ukoly.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Moje úkoly | `/ukoly` | `check-square` | `ukoly.read` | Práce |  |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/ukoly/typy` | Typy úkolů | `ukoly.types` | ano |
| `/ukoly` | Moje úkoly | `ukoly.read` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `ukoly.read` | Vidí úkoly a poznámky | Rozsah „jen moje“ = jen přidělené a vlastní |
| `ukoly.create` | Zakládá úkoly a poznámky |  |
| `ukoly.write` | Upravuje úkoly a poznámky |  |
| `ukoly.delete` | Maže úkoly a poznámky | Do koše; obnovit smí každý své |
| `ukoly.types` | Spravuje typy úkolů |  |
