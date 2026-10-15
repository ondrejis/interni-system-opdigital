# Příkazy modulu Google Disk

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [Google Disk](../moduly/disk.md). Počet příkazů: 8.

### disk.enabled.set

Zapne nebo vypne zakládání složek.

- **Oprávnění:** `disk.manage` (stačí kterékoli)
- **Definice:** `packages/modules/disk/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `enabled` | ano/ne | ano |  |  |  |

### disk.folderState

Stav složky klienta nebo zakázky pro tlačítko „Otevřít Disk“ (DRV-05).

- **Oprávnění:** `disk.read` (stačí kterékoli)
- **Definice:** `packages/modules/disk/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `entityType` | enum | ano | `company`, `job` |  |  |
| `id` | uuid | ano |  |  |  |

### disk.requestFolder

Ruční „Vytvořit složku“; u soukromého záznamu až s potvrzeným varováním (`force`).

- **Oprávnění:** `disk.write` (stačí kterékoli)
- **Definice:** `packages/modules/disk/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `entityType` | enum | ano | `company`, `job` |  |  |
| `id` | uuid | ano |  |  |  |
| `force` | ano/ne | ne |  |  |  |

### disk.retry

„Zkusit znovu“ po chybě nebo po 10 minutách bez odpovědi n8n.

- **Oprávnění:** `disk.write` (stačí kterékoli)
- **Definice:** `packages/modules/disk/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `entityType` | enum | ano | `company`, `job` |  |  |
| `id` | uuid | ano |  |  |  |

### disk.status

Stav napojení na n8n a poslední požadavky (Nastavení → Google Disk).

- **Oprávnění:** `disk.manage` (stačí kterékoli)
- **Definice:** `packages/modules/disk/src/commands.ts`

_Bez vstupních polí._

### disk.structure.get

Strom složek z Nastavení a zda je zakládání zapnuté.

- **Oprávnění:** `disk.manage` (stačí kterékoli)
- **Definice:** `packages/modules/disk/src/commands.ts`

_Bez vstupních polí._

### disk.structure.set

Uloží strom složek; platí jen pro nově zakládané složky (už založené se nemění).

- **Oprávnění:** `disk.manage` (stačí kterékoli)
- **Definice:** `packages/modules/disk/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `structure` | objekt | ano |  |  |  |
| `structure.version` | konstanta | ano | `1` |  |  |
| `structure.clientsRoot` | text | ano |  | délka ≤ 200 |  |
| `structure.archiveRoot` | text | ano |  | délka ≤ 200 |  |
| `structure.jobFolderName` | text | ano |  | délka ≤ 200 |  |
| `structure.client` | pole (libovolné) | ano |  | počet ≤ 150 |  |
| `structure.job` | objekt | ano |  |  |  |
| `structure.job.web` | pole (libovolné) | ano |  | počet ≤ 150 |  |
| `structure.job.marketing` | pole (libovolné) | ano |  | počet ≤ 150 |  |
| `structure.job.systemy` | pole (libovolné) | ano |  | počet ≤ 150 |  |

### disk.test

Test napojení: kontroly nastavení a posledních výsledků (nic nezakládá).

- **Oprávnění:** `disk.manage` (stačí kterékoli)
- **Definice:** `packages/modules/disk/src/commands.ts`

_Bez vstupních polí._
