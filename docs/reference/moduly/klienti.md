# Modul Klienti (klienti)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Klienti agentury: stav (lead, aktivní, pozastavený, bývalý), služby, kontext a karta klienta složená z příspěvků ostatních modulů.

- **Identifikátor:** `klienti`, ikona `handshake`
- **Závisí na:** [`kontakty`](kontakty.md)
- **Balíček:** `packages/modules/klienti`
- **Vyprávěcí dokumentace:** [docs/moduly/klienti.md](../../moduly/klienti.md)
- **Příkazy:** žádné
- **Entity:** žádné
- **Databáze:** [tabulky a migrace](../databaze/klienti.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Klienti | `/klienti` | `handshake` | `klienti.read` | CRM |  |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/klienti` | Klienti | `klienti.read` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `klienti.read` | Vidí klienty a jejich karty |  |
| `klienti.write` | Upravuje klienty | Stav klienta, služby a kontext |
