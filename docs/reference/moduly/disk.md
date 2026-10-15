# Modul Google Disk (disk)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Složky klientů a zakázek na sdíleném Google Disku: požadavky na založení přes n8n, stav složek a strom složek v Nastavení.

- **Identifikátor:** `disk`, ikona `google-drive`
- **Závisí na:** žádném modulu
- **Balíček:** `packages/modules/disk`
- **Vyprávěcí dokumentace:** [docs/moduly/disk.md](../../moduly/disk.md)
- **Příkazy:** [8 příkazů](../prikazy/disk.md)
- **Entity:** žádné
- **Databáze:** [tabulky a migrace](../databaze/disk.md)

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `disk.read` | Vidí stav složek na Google Disku |  |
| `disk.write` | Zakládá složky na Disku | Vytvořit složku a zkusit znovu po chybě |
| `disk.manage` | Spravuje strukturu složek | Strom složek klienta a test napojení |

## Rozšíření uživatelského rozhraní

Modul doplňuje obecný detail záznamu (viz [ARCHITECTURE](../../ARCHITECTURE.md)). Podmíněné záložky a karty se ukazují jen u záznamů, pro které funkce `visible` vrátí `true`.

### Akce v hlavičce detailu

| Entita | Akce | Název | Oprávnění | Hlavní | Okno |
| --- | --- | --- | --- | --- | --- |
| `company` | `disk` | Otevřít Disk | `disk.read` |  |  |
| `job` | `disk` | Otevřít Disk | `disk.read` |  |  |

### Karty na přehledu záznamu

| Entita | Karta | Sloupec | Pořadí | Oprávnění | Podmíněná |
| --- | --- | --- | --- | --- | --- |
| `company` | `disk` | side | 89 | `disk.read` |  |
| `job` | `disk` | side | 89 | `disk.read` |  |

## Serverová část

### Úlohy na pozadí

| Úloha | Plán (cron) | Opakování po chybě | Popis |
| --- | --- | --- | --- |
| `disk.timeout` | `* * * * *` | 1 | Každou minutu: stavy požadavků na složky (viz `maintainRequests`). |

Souhrn všech úloh: [udalosti-a-ulohy.md](../udalosti-a-ulohy.md).

### services

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 1. `disk`

### contributions

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 1. `pole (1)`

### eventHandlers

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 11. `pole (1)`, `pole (1)`, `pole (1)`, `pole (1)`, `pole (1)`, `pole (1)`, `pole (1)`, `pole (1)`, `pole (1)`, `pole (1)`, `pole (1)`

### ingests

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| source | externalId | handle |
| --- | --- | --- |
| `drive` | funkce | funkce |

### privatePaths

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| name | run |
| --- | --- |
| `disk.clientCard.summary` | funkce |
| `disk.clientCard.listMetrics` | funkce |
| `disk.service.folderState` | funkce |
| `disk.status` | funkce |

## Nastavení

Nastavení uložená v tabulce `setting` (klíč → JSON), která správce mění v administraci. Tajná pole se ukládají šifrovaně.

### drive.enabled

`drive.enabled`: zapnuté zakládání složek (výchozí ano). Definice: `packages/modules/disk/src/settings.ts`.

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis | Výchozí hodnota v kódu |
| --- | --- | --- | --- | --- | --- | --- |
| `enabled` | ano/ne | ano |  |  |  | `true` |

### drive.structure

`drive.structure`: strom složek z Nastavení → Google Disk. Definice: `packages/modules/disk/src/settings.ts`.

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis | Výchozí hodnota v kódu |
| --- | --- | --- | --- | --- | --- | --- |
| `structure` | objekt | ano |  |  |  | `{"version":1,"clientsRoot":"Klienti","archiveRoot":"Archiv","jobFolderName":"{RR` |
| `structure.version` | konstanta | ano | `1` |  |  |  |
| `structure.clientsRoot` | text | ano |  | délka ≤ 200 |  |  |
| `structure.archiveRoot` | text | ano |  | délka ≤ 200 |  |  |
| `structure.jobFolderName` | text | ano |  | délka ≤ 200 |  |  |
| `structure.client` | pole (libovolné) | ano |  | počet ≤ 150 |  |  |
| `structure.job` | objekt | ano |  |  |  |  |
| `structure.job.web` | pole (libovolné) | ano |  | počet ≤ 150 |  |  |
| `structure.job.marketing` | pole (libovolné) | ano |  | počet ≤ 150 |  |  |
| `structure.job.systemy` | pole (libovolné) | ano |  | počet ≤ 150 |  |  |
