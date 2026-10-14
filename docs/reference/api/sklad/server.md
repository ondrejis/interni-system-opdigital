# @rebar/sklad/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/sklad/server` (soubor `packages/modules/sklad/src/server.ts`). Exportů: 39, z toho s popisem 19.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`assertDocShape`](#assertdocshape) | function | Kontrola tvaru dokladu před zaúčtováním (bez databáze). |  |
| [`formatQty`](#formatqty) | function | `"12.500"` → `"12,5"` (zobrazení bez zbytečných nul). |  |
| [`fromMilli`](#frommilli) | function | `12500` → `"12.500"` (tvar pro sloupec `numeric(14,3)`). |  |
| [`isOutgoing`](#isoutgoing) | function | Zda doklad dané položky ubírá ze zdrojového umístění. |  |
| [`lineTotalMinor`](#linetotalminor) | function | Hodnota řádku v haléřích. |  |
| [`mergeLines`](#mergelines) | function | Sloučí řádky se stejnou položkou (pořadí podle prvního výskytu). Nulové řádky vynechá. Mimo inventurní rozdíl musí být množství kladné. |  |
| [`postDoc`](#postdoc) | function | Zaúčtuje doklad. Volejte uvnitř transakce (`inTx`). Vrací id, číslo a dotčené položky. |  |
| [`round`](#round) | function | Zaokrouhlí na `d` desetinných míst. |  |
| [`toMilli`](#tomilli) | function | `"12.5"` → `12500`. Víc než tři desetinná místa se zaokrouhlí; nečíselný vstup je chyba. |  |
| [`weightedAverage`](#weightedaverage) | function | Vážený průměr ceny po příjmu: (zásoba × průměr + příjem × cena) / (zásoba + příjem). Záporná nebo nulová zásoba se do průměru nezapočítá (nový průměr je cena příjmu). |  |
| [`StockError`](#stockerror) | class | Čistá logika skladu bez databáze: převody množství, vážený průměr, slučování řádků. Množství se počítá v tisícinách (celá čísla), takže se na něm nikdy nekumuluje chyba desetinných čísel; jednotkové ceny jsou v haléřích se 4 desetinnými místy a každá částka dokladu se zaokrouhlí na haléře. |  |
| [`DOC_PERMISSION`](#doc_permission) | const | Oprávnění potřebné k zaúčtování dokladu daného typu. |  |
| [`DOC_SERIES`](#doc_series) | const |  |  |
| [`DOC_TYPES`](#doc_types) | const |  |  |
| [`DOC_TYPE_INFO`](#doc_type_info) | const |  |  |
| [`ORDER_STATUSES`](#order_statuses) | const |  |  |
| [`UNITS`](#units) | const |  |  |
| [`WAREHOUSE_KINDS`](#warehouse_kinds) | const |  |  |
| [`commands`](#commands) | const |  |  |
| [`entities`](#entities) | const |  |  |
| [`purchaseOrder`](schema.md#purchaseorder) | const | Objednávka u dodavatele. Stav: `draft` → `sent` → `partial` → `received`, nebo `cancelled`. | v `@rebar/sklad/schema` |
| [`purchaseOrderEntity`](#purchaseorderentity) | const |  |  |
| [`purchaseOrderLine`](schema.md#purchaseorderline) | const |  | v `@rebar/sklad/schema` |
| [`server`](#server) | const |  |  |
| [`stockCount`](schema.md#stockcount) | const | Inventura jednoho umístění. Stav: `open` → `closed` (rozdíly se zaúčtují inventurním dokladem). | v `@rebar/sklad/schema` |
| [`stockCountEntity`](#stockcountentity) | const |  |  |
| [`stockCountLine`](schema.md#stockcountline) | const |  | v `@rebar/sklad/schema` |
| [`stockDoc`](schema.md#stockdoc) | const | Skladový doklad (neměnný, vzniká jen zaúčtováním). Směr pohybu podle typu: `receipt` + do `warehouseId` · `issue` − z `warehouseId` na zakázku · `transfer` − z `warehouseId`, + do `targetWarehouseId` · `return` + do `warehouseId` ze zakázky · `adjustment` ± ve `warehouseId` (znaménko u řádku). Zakázka je měkký odkaz. | v `@rebar/sklad/schema` |
| [`stockDocEntity`](#stockdocentity) | const |  |  |
| [`stockDocLine`](schema.md#stockdocline) | const |  | v `@rebar/sklad/schema` |
| [`stockItem`](schema.md#stockitem) | const | Skladová karta. `totalQty` je součet přes všechna umístění a udržuje ho výhradně skladové jádro (`engine.ts`); `avgCost` je vážený průměr nákupní ceny bez DPH v haléřích se 4 desetinnými místy. Odvozené sloupce (`avgCostMinor`, `valueMinor`, `belowMin`) počítá databáze, aby šly filtrovat a sčítat v seznamu. | v `@rebar/sklad/schema` |
| [`stockItemEntity`](#stockitementity) | const |  |  |
| [`stockLevel`](schema.md#stocklevel) | const | Stav jedné položky na jednom umístění. | v `@rebar/sklad/schema` |
| [`warehouse`](schema.md#warehouse) | const | Umístění zásob: sklad, dílna, vozidlo (materiál v dodávce) nebo stavba. Vozidlo a zakázka jsou měkké odkazy. | v `@rebar/sklad/schema` |
| [`warehouseEntity`](#warehouseentity) | const |  |  |
| [`MergedLine`](#mergedline) | type |  |  |
| [`PostDocInput`](#postdocinput) | type | Skladové jádro — jediné místo, které mění stavy zásob (`stock_level`, `stock_item.total_qty`) a průměrné ceny. Volá se uvnitř transakce (`inTx`), takže doklad, pohyb zásob, číslo z řady i audit jsou jedna atomická změna. |  |
| [`RawLine`](#rawline) | type |  |  |
| [`StockDocType`](#stockdoctype) | type |  |  |

### assertDocShape

function · `packages/modules/sklad/src/stock-math.ts`

Kontrola tvaru dokladu před zaúčtováním (bez databáze).

```ts
function assertDocShape(d: { type: StockDocType; warehouseId: string; targetWarehouseId?: string | null; jobId?: string | null; supplierId?: string | null; }): void
```

### formatQty

function · `packages/modules/sklad/src/stock-math.ts`

`"12.500"` → `"12,5"` (zobrazení bez zbytečných nul).

```ts
function formatQty(value: string | number): string
```

### fromMilli

function · `packages/modules/sklad/src/stock-math.ts`

`12500` → `"12.500"` (tvar pro sloupec `numeric(14,3)`).

```ts
function fromMilli(milli: number): string
```

### isOutgoing

function · `packages/modules/sklad/src/stock-math.ts`

Zda doklad dané položky ubírá ze zdrojového umístění.

```ts
function isOutgoing(type: StockDocType, qtyMilli: number): boolean
```

### lineTotalMinor

function · `packages/modules/sklad/src/stock-math.ts`

Hodnota řádku v haléřích.

```ts
function lineTotalMinor(qtyMilli: number, unitCost: number): number
```

### mergeLines

function · `packages/modules/sklad/src/stock-math.ts`

Sloučí řádky se stejnou položkou (pořadí podle prvního výskytu). Nulové řádky vynechá.
Mimo inventurní rozdíl musí být množství kladné.

```ts
function mergeLines(type: StockDocType, lines: readonly RawLine[]): MergedLine[]
```

### postDoc

function · `packages/modules/sklad/src/engine.ts`

Zaúčtuje doklad. Volejte uvnitř transakce (`inTx`). Vrací id, číslo a dotčené položky.

```ts
async function postDoc(c: Ctx, input: PostDocInput): Promise<PostedDoc>
```

### round

function · `packages/modules/sklad/src/stock-math.ts`

Zaokrouhlí na `d` desetinných míst.

```ts
function round(n: number, d = 4): number
```

### toMilli

function · `packages/modules/sklad/src/stock-math.ts`

`"12.5"` → `12500`. Víc než tři desetinná místa se zaokrouhlí; nečíselný vstup je chyba.

```ts
function toMilli(value: string | number): number
```

### weightedAverage

function · `packages/modules/sklad/src/stock-math.ts`

Vážený průměr ceny po příjmu: (zásoba × průměr + příjem × cena) / (zásoba + příjem).
Záporná nebo nulová zásoba se do průměru nezapočítá (nový průměr je cena příjmu).

```ts
function weightedAverage(stockMilli: number, avgCost: number, receivedMilli: number, price: number): number
```

### StockError

class · `packages/modules/sklad/src/stock-math.ts`

Čistá logika skladu bez databáze: převody množství, vážený průměr, slučování řádků.
Množství se počítá v tisícinách (celá čísla), takže se na něm nikdy nekumuluje chyba desetinných čísel;
jednotkové ceny jsou v haléřích se 4 desetinnými místy a každá částka dokladu se zaokrouhlí na haléře.

```ts
class StockError extends Error {

}
```

### DOC_PERMISSION

const · `packages/modules/sklad/src/stock-math.ts`

Oprávnění potřebné k zaúčtování dokladu daného typu.

```ts
const DOC_PERMISSION: Record<StockDocType, string>
```

### DOC_SERIES

const · `packages/modules/sklad/src/stock-math.ts`

_Bez popisu._

```ts
const DOC_SERIES: Record<StockDocType, string>
```

### DOC_TYPES

const · `packages/modules/sklad/src/stock-math.ts`

_Bez popisu._

```ts
const DOC_TYPES: readonly ["receipt", "issue", "transfer", "return", "adjustment"]
```

### DOC_TYPE_INFO

const · `packages/modules/sklad/src/stock-math.ts`

_Bez popisu._

```ts
const DOC_TYPE_INFO: Record< StockDocType, { label: string; short: string; color: string; hint: string } >
```

### ORDER_STATUSES

const · `packages/modules/sklad/src/stock-math.ts`

_Bez popisu._

```ts
const ORDER_STATUSES: readonly [{ readonly value: "draft"; readonly label: "Koncept"; readonly color: "gray"; }, { readonly value: "sent"; readonly label: "Objednáno"; readonly color: "blue"; }, { readonly value: "partial"; readonly label: "Částečně přijato"; r…
```

### UNITS

const · `packages/modules/sklad/src/stock-math.ts`

_Bez popisu._

```ts
const UNITS: string[]
```

### WAREHOUSE_KINDS

const · `packages/modules/sklad/src/stock-math.ts`

_Bez popisu._

```ts
const WAREHOUSE_KINDS: readonly [{ readonly value: "warehouse"; readonly label: "Sklad"; }, { readonly value: "workshop"; readonly label: "Dílna"; }, { readonly value: "vehicle"; readonly label: "Vozidlo"; }, { readonly value: "site"; readonly label: "Stavba"; }]
```

### commands

const · `packages/modules/sklad/src/commands.ts`

_Bez popisu._

```ts
const commands: (import("@rebar/core/module-server").CommandDef<z.ZodObject<{}, z.core.$strip>, { warehouses: { id: string; name: string; kind: string; }[]; items: { levels: { warehouseId: string; qty: string; }[]; id: string; code: string; name: string; …
```

### entities

const · `packages/modules/sklad/src/entities.ts`

_Bez popisu._

```ts
const entities: import("@rebar/core/entities").EntityDef[]
```

### purchaseOrderEntity

const · `packages/modules/sklad/src/entities.ts`

_Bez popisu._

```ts
const purchaseOrderEntity: import("@rebar/core/entities").EntityDef
```

### server

const · `packages/modules/sklad/src/server.ts`

_Bez popisu._

```ts
const server: { readonly entities: import("@rebar/core/entities").EntityDef[]; readonly dashboardMetrics: import("@rebar/core/module-server").DashboardMetricDef[]; readonly commands: readonly [...(import("@rebar/core/module-server").CommandDef<import("z…
```

### stockCountEntity

const · `packages/modules/sklad/src/entities.ts`

_Bez popisu._

```ts
const stockCountEntity: import("@rebar/core/entities").EntityDef
```

### stockDocEntity

const · `packages/modules/sklad/src/entities.ts`

_Bez popisu._

```ts
const stockDocEntity: import("@rebar/core/entities").EntityDef
```

### stockItemEntity

const · `packages/modules/sklad/src/entities.ts`

_Bez popisu._

```ts
const stockItemEntity: import("@rebar/core/entities").EntityDef
```

### warehouseEntity

const · `packages/modules/sklad/src/entities.ts`

_Bez popisu._

```ts
const warehouseEntity: import("@rebar/core/entities").EntityDef
```

### MergedLine

type · `packages/modules/sklad/src/stock-math.ts`

_Bez popisu._

```ts
type MergedLine = { itemId: string; qtyMilli: number; unitPriceMinor: number | null };
```

### PostDocInput

type · `packages/modules/sklad/src/engine.ts`

Skladové jádro — jediné místo, které mění stavy zásob (`stock_level`, `stock_item.total_qty`) a průměrné ceny.
Volá se uvnitř transakce (`inTx`), takže doklad, pohyb zásob, číslo z řady i audit jsou jedna atomická změna.

```ts
type PostDocInput = {
  type: StockDocType;
  date: string;
  warehouseId: string;
  targetWarehouseId?: string | null;
  supplierId?: string | null;
  jobId?: string | null;
  purchaseOrderId?: string | null;
  countId?: string | null;
  supplierDocNo?: string | null;
  note?: string | null;
  /** Množství kladné; jen u inventurního rozdílu se znaménkem. `unitPriceMinor` jen u příjemky (bez DPH). */
  lines: RawLine[];
};
```

### RawLine

type · `packages/modules/sklad/src/stock-math.ts`

_Bez popisu._

```ts
type RawLine = { itemId: string; qty: string | number; unitPriceMinor?: number | null };
```

### StockDocType

type · `packages/modules/sklad/src/stock-math.ts`

_Bez popisu._

```ts
type StockDocType = (typeof DOC_TYPES)[number];
```
