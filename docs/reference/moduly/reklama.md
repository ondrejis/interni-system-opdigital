# Modul Reklama (reklama)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Reklamní účty Meta, kampaně a denní výkon, příchozí leady z formulářů (přes n8n) a jejich převod na obchody.

- **Identifikátor:** `reklama`, ikona `megaphone`
- **Závisí na:** [`kontakty`](kontakty.md), [`obchody`](obchody.md)
- **Balíček:** `packages/modules/reklama`
- **Vyprávěcí dokumentace:** [docs/moduly/reklama.md](../../moduly/reklama.md)
- **Příkazy:** žádné
- **Entity:** žádné
- **Databáze:** [tabulky a migrace](../databaze/reklama.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Reklama | `/reklama` | `megaphone` | `reklama.read` | Marketing |  |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/reklama` | Reklama | `reklama.read` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `reklama.read` | Vidí reklamní účty, kampaně a výkon |  |
| `reklama.write` | Upravuje reklamu | Přiřazení účtů a kampaní ke klientům a zakázkám |
| `reklama.manage` | Spravuje napojení na Meta | Mapování lead formulářů, ruční synchronizace |
