# @rebar/stroje/schema

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/stroje/schema` (soubor `packages/modules/stroje/src/schema.ts`). Exportů: 7, z toho s popisem 4.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`asset`](#asset) | const | Vozidlo nebo stroj. Měří se v km (auta) nebo motohodinách (stroje); `meterValue` je poslední známý stav. `internalRateMinor` je interní sazba za km nebo motohodinu, kterou se stroj počítá do nákladů zakázky. Zakázka (v knize jízd, tankování, rezervaci) je měkký odkaz bez cizího klíče, aby modul fungoval i bez Zakázek. |  |
| [`assetDefect`](#assetdefect) | const | Závada nahlášená z terénu. Blokující závada stroj odstaví (`asset.status = service`), dokud není vyřešena. |  |
| [`assetFuel`](#assetfuel) | const |  |  |
| [`assetInterval`](#assetinterval) | const | Servisní interval: každých X km/mth nebo Y měsíců (co nastane dřív). |  |
| [`assetLog`](#assetlog) | const | Kniha jízd (km) i provoz strojů (motohodiny) v jedné tabulce. |  |
| [`assetReservation`](#assetreservation) | const |  |  |
| [`assetService`](#assetservice) | const |  |  |

### asset

const · `packages/modules/stroje/src/schema.ts`

Vozidlo nebo stroj. Měří se v km (auta) nebo motohodinách (stroje); `meterValue` je poslední známý stav.
`internalRateMinor` je interní sazba za km nebo motohodinu, kterou se stroj počítá do nákladů zakázky.
Zakázka (v knize jízd, tankování, rezervaci) je měkký odkaz bez cizího klíče, aby modul fungoval i bez Zakázek.

```ts
const asset: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "asset"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "asset"; dataType: "date"; columnType: "PgTimestamp"; data: Date; …
```

### assetDefect

const · `packages/modules/stroje/src/schema.ts`

Závada nahlášená z terénu. Blokující závada stroj odstaví (`asset.status = service`), dokud není vyřešena.

```ts
const assetDefect: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "asset_defect"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "asset_defect"; dataType: "date"; columnType: "PgTimestamp"…
```

### assetFuel

const · `packages/modules/stroje/src/schema.ts`

_Bez popisu._

```ts
const assetFuel: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "asset_fuel"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "asset_fuel"; dataType: "date"; columnType: "PgTimestamp"; da…
```

### assetInterval

const · `packages/modules/stroje/src/schema.ts`

Servisní interval: každých X km/mth nebo Y měsíců (co nastane dřív).

```ts
const assetInterval: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "asset_interval"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "asset_interval"; dataType: "date"; columnType: "PgTimest…
```

### assetLog

const · `packages/modules/stroje/src/schema.ts`

Kniha jízd (km) i provoz strojů (motohodiny) v jedné tabulce.

```ts
const assetLog: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "asset_log"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "asset_log"; dataType: "date"; columnType: "PgTimestamp"; data…
```

### assetReservation

const · `packages/modules/stroje/src/schema.ts`

_Bez popisu._

```ts
const assetReservation: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "asset_reservation"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "asset_reservation"; dataType: "date"; columnType: "Pg…
```

### assetService

const · `packages/modules/stroje/src/schema.ts`

_Bez popisu._

```ts
const assetService: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "asset_service"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "asset_service"; dataType: "date"; columnType: "PgTimestam…
```
