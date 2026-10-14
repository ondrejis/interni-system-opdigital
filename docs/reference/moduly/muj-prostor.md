# Modul Můj prostor (muj-prostor)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Soukromá sekce vlastníka: hosting a údržba webů, domény s expirací, soukromá e-mailová knihovna, opakované faktury (Fakturoid) a přehled soukromých záznamů.

- **Identifikátor:** `muj-prostor`, ikona `vault`
- **Závisí na:** [`kontakty`](kontakty.md)
- **Balíček:** `packages/modules/muj-prostor`
- **Vyprávěcí dokumentace:** [docs/moduly/muj-prostor.md](../../moduly/muj-prostor.md)
- **Příkazy:** žádné
- **Entity:** žádné
- **Databáze:** [tabulky a migrace](../databaze/muj-prostor.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Hosting a údržba | `/muj-prostor/hosting` | `vault` | `muj-prostor.hosting` | Můj prostor |  |
| Domény | `/muj-prostor/domeny` | `globe` | `muj-prostor.domains` | Můj prostor |  |
| E-mailová knihovna | `/muj-prostor/knihovna` | `mail-template` | `muj-prostor.email_library` | Můj prostor |  |
| Opakované faktury | `/muj-prostor/faktury` | `receipt` | `muj-prostor.recurring_invoices` | Můj prostor |  |
| Soukromé | `/muj-prostor/soukrome` | `lock` | `muj-prostor.private_overview` | Můj prostor |  |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/muj-prostor/hosting` | Hosting a údržba | `muj-prostor.hosting` | ano |
| `/muj-prostor/domeny` | Domény | `muj-prostor.domains` | ano |
| `/muj-prostor/knihovna` | E-mailová knihovna | `muj-prostor.email_library` | ano |
| `/muj-prostor/faktury` | Opakované faktury | `muj-prostor.recurring_invoices` | ano |
| `/muj-prostor/soukrome` | Soukromé | `muj-prostor.private_overview` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `muj-prostor.hosting` | Spravuje hosting a údržbu webů |  |
| `muj-prostor.domains` | Spravuje domény |  |
| `muj-prostor.email_library` | Spravuje soukromou e-mailovou knihovnu |  |
| `muj-prostor.recurring_invoices` | Spravuje opakované faktury | Návrhy, schválení a odeslání do Fakturoidu |
| `muj-prostor.private_overview` | Vidí přehled soukromých záznamů |  |
