# @rebar/disk/schema

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/disk/schema` (soubor `packages/modules/disk/src/schema.ts`). Exportů: 4, z toho s popisem 4.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`DRIVE_REQUEST_STATES`](#drive_request_states) | const | Stav požadavku na založení nebo úpravu složky (fronta k n8n). |  |
| [`DRIVE_SUBKEYS`](#drive_subkeys) | const | Podsložka v rámci klienta nebo zakázky: kořen (`''`), složka služby, nebo Archiv. |  |
| [`driveFolder`](#drivefolder) | const | Známé složky na Disku: kořen klienta či zakázky a jeho podsložky (služby, Archiv). Jedna složka na entitu a podklíč. |  |
| [`driveRequest`](#driverequest) | const | Požadavek na složku (log odchozích událostí `drive.*` a jejich výsledku). `id` je zároveň `requestId` v těle webhooku (`data.requestId`) a `eventId` v callbacku z n8n, proto se negeneruje. `pending` a `sent` starší než 10 minut převede úloha `disk.timeout` na `timeout`. |  |

### DRIVE_REQUEST_STATES

const · `packages/modules/disk/src/schema.ts`

Stav požadavku na založení nebo úpravu složky (fronta k n8n).

```ts
const DRIVE_REQUEST_STATES: readonly ["pending", "sent", "done", "error", "timeout"]
```

### DRIVE_SUBKEYS

const · `packages/modules/disk/src/schema.ts`

Podsložka v rámci klienta nebo zakázky: kořen (`''`), složka služby, nebo Archiv.

```ts
const DRIVE_SUBKEYS: readonly ["", "web", "marketing", "systemy", "archive"]
```

### driveFolder

const · `packages/modules/disk/src/schema.ts`

Známé složky na Disku: kořen klienta či zakázky a jeho podsložky (služby, Archiv). Jedna složka na entitu a podklíč.

```ts
const driveFolder: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "drive_folder"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "drive_folder"; dataType: "date"; columnType: "PgTimestamp"…
```

### driveRequest

const · `packages/modules/disk/src/schema.ts`

Požadavek na složku (log odchozích událostí `drive.*` a jejich výsledku). `id` je zároveň `requestId` v těle webhooku
(`data.requestId`) a `eventId` v callbacku z n8n, proto se negeneruje. `pending` a `sent` starší než 10 minut převede
úloha `disk.timeout` na `timeout`.

Požadavky jednoho klienta (`client_id`) odcházejí po jednom: nový požadavek čeká na předchozí otevřený (`blocked_by`),
aby n8n nezakládal tytéž složky dvakrát souběžně (výhra obchodu vytvoří složku klienta i zakázek najednou). Po
dokončení předchozího se čekající požadavek znovu sestaví (už se známými ID složek) a odešle.

```ts
const driveRequest: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "drive_request"; schema: undefined; columns: { id: import("drizzle-orm/pg-core").PgColumn<{ name: "id"; tableName: "drive_request"; dataType: "string"; columnType: "PgUUID"; data: st…
```
