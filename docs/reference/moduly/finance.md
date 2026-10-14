# Modul Finance (finance)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Platby zakázek a jejich rozdělení mezi dvě IČO, retainery, vyrovnání mezi partnery (saldo) a přehledy příjmů.

- **Identifikátor:** `finance`, ikona `wallet`
- **Závisí na:** [`zakazky`](zakazky.md)
- **Balíček:** `packages/modules/finance`
- **Vyprávěcí dokumentace:** [docs/moduly/finance.md](../../moduly/finance.md)
- **Příkazy:** žádné
- **Entity:** žádné
- **Databáze:** [tabulky a migrace](../databaze/finance.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Platby a rozdělení | `/finance` | `wallet` | `finance.read` | Finance |  |
| Vyrovnání | `/finance/vyrovnani` | `scale` | `finance.read` | Finance |  |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/finance/vyrovnani` | Vyrovnání | `finance.read` | ano |
| `/finance` | Platby a rozdělení | `finance.read` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `finance.read` | Vidí platby a přehledy financí | Partner vidí jen sdílené zakázky |
| `finance.payments_write` | Zapisuje a upravuje platby | Vystavení, úhrada, storno, retainery |
| `finance.splits_edit` | Upravuje rozdělení plateb | Pravidla rozdělení mezi Ondřeje a Patrika |
| `finance.settlements_write` | Zapisuje vyrovnání | Vzájemné vyrovnání (fakturou, převodem, zápočtem) |
| `finance.export` | Exportuje platby a přehledy |  |
| `finance.settings` | Spravuje nastavení financí | Základ salda a výchozí rozdělení |
