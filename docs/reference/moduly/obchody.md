# Modul Obchody (obchody)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Obchodní příležitosti: pipeline s pravděpodobnostmi, board se součty, výhra (založení zakázek) a prohra s důvodem.

- **Identifikátor:** `obchody`, ikona `target`
- **Závisí na:** [`kontakty`](kontakty.md), [`zakazky`](zakazky.md)
- **Balíček:** `packages/modules/obchody`
- **Vyprávěcí dokumentace:** [docs/moduly/obchody.md](../../moduly/obchody.md)
- **Příkazy:** žádné
- **Entity:** žádné
- **Databáze:** [tabulky a migrace](../databaze/obchody.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Obchody | `/obchody` | `target` | `obchody.read` | CRM |  |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/obchody` | Obchody | `obchody.read` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `obchody.read` | Vidí obchody |  |
| `obchody.create` | Zakládá obchody |  |
| `obchody.write` | Upravuje obchody | Přesun mezi fázemi, výhra, prohra, znovuotevření |
| `obchody.delete` | Maže obchody | Do koše; obnovit smí každý své |
| `obchody.export` | Exportuje obchody |  |
| `obchody.pipelines` | Spravuje pipeline obchodů | Fáze, pravděpodobnosti a lhůty |
