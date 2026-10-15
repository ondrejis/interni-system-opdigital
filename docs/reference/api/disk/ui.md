# @rebar/disk/ui

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/disk/ui` (soubor `packages/modules/disk/src/ui.tsx`). Exportů: 4, z toho s popisem 4.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`DriveButton`](#drivebutton) | function | Tlačítko „Otevřít Disk“ (DRV-05). Stavy: „Otevřít Disk“ (složka existuje, odkaz se otevře v nové kartě), „Vytváří se…“ (čeká se na n8n), „Zkusit znovu“ (chyba nebo 10 minut bez odpovědi), „Vytvořit složku“ (záznam složku nemá; u soukromého záznamu až po potvrzení varování). Bez oprávnění `disk.read` se nezobrazí. |  |
| [`DriveCard`](#drivecard) | function | Karta „Složka na Disku“ na Přehledu klienta a zakázky: stav, tlačítko a případná chyba. |  |
| [`DriveSettings`](#drivesettings) | function | Obsah Nastavení → Google Disk: stav napojení a test, zapnutí, editor stromu složek pro klienta a každý typ zakázky (přidat, přejmenovat, smazat, přeskládat) a výpis posledních požadavků. Na mobilu je strom jen ke čtení. |  |
| [`ui`](#ui) | const | UI modulu „disk“: tlačítko Otevřít Disk v hlavičce a karta složky na Přehledu klienta a zakázky. |  |

### DriveButton

function · `packages/modules/disk/src/ui/drive-button.tsx`

Tlačítko „Otevřít Disk“ (DRV-05). Stavy: „Otevřít Disk“ (složka existuje, odkaz se otevře v nové kartě),
„Vytváří se…“ (čeká se na n8n), „Zkusit znovu“ (chyba nebo 10 minut bez odpovědi), „Vytvořit složku“ (záznam
složku nemá; u soukromého záznamu až po potvrzení varování). Bez oprávnění `disk.read` se nezobrazí.

```ts
function DriveButton({ entityType, id, size = "md", }: { entityType: DriveEntityType; id: string; size?: "sm" | "md"; }): import("react").JSX.Element | null
```

### DriveCard

function · `packages/modules/disk/src/ui/drive-button.tsx`

Karta „Složka na Disku“ na Přehledu klienta a zakázky: stav, tlačítko a případná chyba.

```ts
function DriveCard({ entityType, id }: { entityType: DriveEntityType; id: string }): import("react").JSX.Element
```

### DriveSettings

function · `packages/modules/disk/src/ui/settings.tsx`

Obsah Nastavení → Google Disk: stav napojení a test, zapnutí, editor stromu složek pro klienta a každý typ
zakázky (přidat, přejmenovat, smazat, přeskládat) a výpis posledních požadavků. Na mobilu je strom jen ke čtení.

```ts
function DriveSettings(): import("react").JSX.Element
```

### ui

const · `packages/modules/disk/src/ui.tsx`

UI modulu „disk“: tlačítko Otevřít Disk v hlavičce a karta složky na Přehledu klienta a zakázky.

```ts
const ui: { readonly recordActions: { readonly company: readonly [RecordAction]; readonly job: readonly [RecordAction]; }; readonly recordOverview: { readonly company: readonly [RecordOverviewCard]; readonly job: readonly [RecordOverviewCard]; }; }
```
