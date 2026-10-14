# Modul Šablony e-mailů (sablony-emailu)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Šablony e-mailů s proměnnými z klienta, kontaktu, obchodu a zakázky; otevření připraveného e-mailu v Gmailu nebo kopie do schránky.

- **Identifikátor:** `sablony-emailu`, ikona `mail-template`
- **Závisí na:** [`kontakty`](kontakty.md)
- **Balíček:** `packages/modules/sablony-emailu`
- **Vyprávěcí dokumentace:** [docs/moduly/sablony-emailu.md](../../moduly/sablony-emailu.md)
- **Příkazy:** žádné
- **Entity:** žádné
- **Databáze:** [tabulky a migrace](../databaze/sablony-emailu.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Šablony e-mailů | `/sablony-emailu` | `mail-template` | `sablony-emailu.read` | Marketing |  |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/sablony-emailu` | Šablony e-mailů | `sablony-emailu.read` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `sablony-emailu.read` | Vidí šablony e-mailů |  |
| `sablony-emailu.create` | Zakládá šablony e-mailů |  |
| `sablony-emailu.write` | Upravuje šablony e-mailů |  |
| `sablony-emailu.delete` | Maže šablony e-mailů |  |
