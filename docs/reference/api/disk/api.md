# @rebar/disk/api

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/disk/api` (soubor `packages/modules/disk/src/api.ts`). Exportů: 5, z toho s popisem 5.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`clientFolderName`](#clientfoldername) | function | Název složky klienta: název firmy bez lomítek a přebytečných mezer. |  |
| [`defaultStructure`](#defaultstructure) | function | Výchozí struktura složek podle specifikace (D §1.2, DRV-01). Vrací novou kopii. |  |
| [`driveFolderUrl`](#drivefolderurl) | function | Adresa složky na Disku z jejího ID (systém si pamatuje ID, ne cestu). |  |
| [`jobFolderName`](#jobfoldername) | function | Název složky zakázky podle vzoru z Nastavení (výchozí `{RRRR-MM} {Název zakázky}`), např. `2026-10 Nový web`. Proměnné: `{RRRR-MM}`, `{RRRR}`, `{MM}`, `{Název zakázky}`, `{Číslo}`. |  |
| [`validateStructure`](#validatestructure) | function | Co je v celé struktuře špatně (prázdné pole = platná). Zpráva je česky, pro uživatele v editoru. |  |

### clientFolderName

function · `packages/modules/disk/src/naming.ts`

Název složky klienta: název firmy bez lomítek a přebytečných mezer.

```ts
function clientFolderName(clientName: string): string
```

### defaultStructure

function · `packages/modules/disk/src/tree.ts`

Výchozí struktura složek podle specifikace (D §1.2, DRV-01). Vrací novou kopii.

```ts
function defaultStructure(): DriveStructure
```

### driveFolderUrl

function · `packages/modules/disk/src/types.ts`

Adresa složky na Disku z jejího ID (systém si pamatuje ID, ne cestu).

```ts
function driveFolderUrl(folderId: string): string
```

### jobFolderName

function · `packages/modules/disk/src/naming.ts`

Název složky zakázky podle vzoru z Nastavení (výchozí `{RRRR-MM} {Název zakázky}`), např. `2026-10 Nový web`.
Proměnné: `{RRRR-MM}`, `{RRRR}`, `{MM}`, `{Název zakázky}`, `{Číslo}`.

```ts
function jobFolderName(pattern: string, job: JobNameInput, now: Date = new Date()): string
```

### validateStructure

function · `packages/modules/disk/src/tree.ts`

Co je v celé struktuře špatně (prázdné pole = platná). Zpráva je česky, pro uživatele v editoru.

```ts
function validateStructure(s: DriveStructure): string[]
```
