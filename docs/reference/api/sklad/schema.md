# @rebar/sklad/schema

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/sklad/schema` (soubor `packages/modules/sklad/src/schema.ts`). Exportů: 9, z toho s popisem 6.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`purchaseOrder`](#purchaseorder) | const | Objednávka u dodavatele. Stav: `draft` → `sent` → `partial` → `received`, nebo `cancelled`. |  |
| [`purchaseOrderLine`](#purchaseorderline) | const |  |  |
| [`stockCount`](#stockcount) | const | Inventura jednoho umístění. Stav: `open` → `closed` (rozdíly se zaúčtují inventurním dokladem). |  |
| [`stockCountLine`](#stockcountline) | const |  |  |
| [`stockDoc`](#stockdoc) | const | Skladový doklad (neměnný, vzniká jen zaúčtováním). Směr pohybu podle typu: `receipt` + do `warehouseId` · `issue` − z `warehouseId` na zakázku · `transfer` − z `warehouseId`, + do `targetWarehouseId` · `return` + do `warehouseId` ze zakázky · `adjustment` ± ve `warehouseId` (znaménko u řádku). Zakázka je měkký odkaz. |  |
| [`stockDocLine`](#stockdocline) | const |  |  |
| [`stockItem`](#stockitem) | const | Skladová karta. `totalQty` je součet přes všechna umístění a udržuje ho výhradně skladové jádro (`engine.ts`); `avgCost` je vážený průměr nákupní ceny bez DPH v haléřích se 4 desetinnými místy. Odvozené sloupce (`avgCostMinor`, `valueMinor`, `belowMin`) počítá databáze, aby šly filtrovat a sčítat v seznamu. |  |
| [`stockLevel`](#stocklevel) | const | Stav jedné položky na jednom umístění. |  |
| [`warehouse`](#warehouse) | const | Umístění zásob: sklad, dílna, vozidlo (materiál v dodávce) nebo stavba. Vozidlo a zakázka jsou měkké odkazy. |  |

### purchaseOrder

const · `packages/modules/sklad/src/schema.ts`

Objednávka u dodavatele. Stav: `draft` → `sent` → `partial` → `received`, nebo `cancelled`.

```ts
const purchaseOrder: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "purchase_order"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "purchase_order"; dataType: "date"; columnType: "PgTimest…
```

### purchaseOrderLine

const · `packages/modules/sklad/src/schema.ts`

_Bez popisu._

```ts
const purchaseOrderLine: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "purchase_order_line"; schema: undefined; columns: { id: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "purchase_order_line"; dataType: "string"; columnType: "PgU…
```

### stockCount

const · `packages/modules/sklad/src/schema.ts`

Inventura jednoho umístění. Stav: `open` → `closed` (rozdíly se zaúčtují inventurním dokladem).

```ts
const stockCount: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "stock_count"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "stock_count"; dataType: "date"; columnType: "PgTimestamp"; …
```

### stockCountLine

const · `packages/modules/sklad/src/schema.ts`

_Bez popisu._

```ts
const stockCountLine: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "stock_count_line"; schema: undefined; columns: { id: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "stock_count_line"; dataType: "string"; columnType: "PgUUID"; …
```

### stockDoc

const · `packages/modules/sklad/src/schema.ts`

Skladový doklad (neměnný, vzniká jen zaúčtováním). Směr pohybu podle typu:
`receipt` + do `warehouseId` · `issue` − z `warehouseId` na zakázku · `transfer` − z `warehouseId`, + do `targetWarehouseId` ·
`return` + do `warehouseId` ze zakázky · `adjustment` ± ve `warehouseId` (znaménko u řádku). Zakázka je měkký odkaz.

```ts
const stockDoc: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "stock_doc"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "stock_doc"; dataType: "date"; columnType: "PgTimestamp"; data…
```

### stockDocLine

const · `packages/modules/sklad/src/schema.ts`

_Bez popisu._

```ts
const stockDocLine: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "stock_doc_line"; schema: undefined; columns: { id: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "stock_doc_line"; dataType: "string"; columnType: "PgUUID"; data…
```

### stockItem

const · `packages/modules/sklad/src/schema.ts`

Skladová karta. `totalQty` je součet přes všechna umístění a udržuje ho výhradně skladové jádro (`engine.ts`);
`avgCost` je vážený průměr nákupní ceny bez DPH v haléřích se 4 desetinnými místy. Odvozené sloupce
(`avgCostMinor`, `valueMinor`, `belowMin`) počítá databáze, aby šly filtrovat a sčítat v seznamu.

```ts
const stockItem: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "stock_item"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "stock_item"; dataType: "date"; columnType: "PgTimestamp"; da…
```

### stockLevel

const · `packages/modules/sklad/src/schema.ts`

Stav jedné položky na jednom umístění.

```ts
const stockLevel: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "stock_level"; schema: undefined; columns: { itemId: import("drizzle-orm/pg-core").PgColumn<{ name: "item_id"; tableName: "stock_level"; dataType: "string"; columnType: "PgUUID"; dat…
```

### warehouse

const · `packages/modules/sklad/src/schema.ts`

Umístění zásob: sklad, dílna, vozidlo (materiál v dodávce) nebo stavba. Vozidlo a zakázka jsou měkké odkazy.

```ts
const warehouse: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "warehouse"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "warehouse"; dataType: "date"; columnType: "PgTimestamp"; data…
```
