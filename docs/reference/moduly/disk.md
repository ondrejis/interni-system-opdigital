# Modul Google Disk (disk)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Složky klientů a zakázek na sdíleném Google Disku: požadavky na založení přes n8n, stav složek a strom složek v Nastavení.

- **Identifikátor:** `disk`, ikona `google-drive`
- **Závisí na:** žádném modulu
- **Balíček:** `packages/modules/disk`
- **Vyprávěcí dokumentace:** [docs/moduly/disk.md](../../moduly/disk.md)
- **Příkazy:** žádné
- **Entity:** žádné
- **Databáze:** [tabulky a migrace](../databaze/disk.md)

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `disk.read` | Vidí stav složek na Google Disku |  |
| `disk.write` | Zakládá složky na Disku | Vytvořit složku a zkusit znovu po chybě |
| `disk.manage` | Spravuje strukturu složek | Strom složek klienta a test napojení |
