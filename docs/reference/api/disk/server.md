# @rebar/disk/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/disk/server` (soubor `packages/modules/disk/src/server.ts`). Exportů: 10, z toho s popisem 10.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`folderInfo`](#folderinfo) | function | Stav složky jednoho klienta nebo zakázky; `NotFoundError`, když ho aktér nesmí vidět. |  |
| [`handleDriveCallback`](#handledrivecallback) | function | Zpracování callbacku (vyděleno z `driveIngest`, aby šlo volat přímo v testech). |  |
| [`maintainRequests`](#maintainrequests) | function | Jeden běh údržby; vrací počty změn (pro testy a log). |  |
| [`requestFolder`](#requestfolder) | function | Ruční založení složky („Vytvořit složku“). Složka klienta, nebo zakázky (a před ní složka klienta, když ještě není). Soukromý záznam se bez `force` odmítne (`skipped: "private"`): složka na sdíleném Disku je pro Patrika viditelná a prozradí existenci i název záznamu (R-13); `force` znamená, že uživatel varování potvrdil. Existující nebo právě se zakládající složka se nezakládá znovu (`requestId: null`). |  |
| [`retryFolder`](#retryfolder) | function | „Zkusit znovu“: zopakuje poslední neúspěšný požadavek záznamu (nový požadavek, nové `eventId`, aktuální tělo). Neúspěšné založení se zopakuje jako ruční založení (potvrzení soukromí platí z původního požadavku); neúspěšná úprava existující složky (přejmenování, archivace…) jako stejná úprava. Bez neúspěšného požadavku se chová jako „Vytvořit složku“ bez potvrzení soukromí. |  |
| [`diskEventHandlers`](#diskeventhandlers) | const | Obsluhy událostí modulu; `envOf` dodá služby aplikace z `ModuleDeps`. |  |
| [`driveFolder`](schema.md#drivefolder) | const | Známé složky na Disku: kořen klienta či zakázky a jeho podsložky (služby, Archiv). Jedna složka na entitu a podklíč. | v `@rebar/disk/schema` |
| [`driveIngest`](#driveingest) | const | Příchozí zdroj `drive`: výsledek práce n8n se složkami. |  |
| [`driveRequest`](schema.md#driverequest) | const | Požadavek na složku (log odchozích událostí `drive.*` a jejich výsledku). `id` je zároveň `requestId` v těle webhooku (`data.requestId`) a `eventId` v callbacku z n8n, proto se negeneruje. `pending` a `sent` starší než 10 minut převede úloha `disk.timeout` na `timeout`. | v `@rebar/disk/schema` |
| [`server`](#server) | const | Serverová část modulu „disk“: příkazy (`disk.*`), služba `disk`, příspěvek ke kartě klienta, obsluha událostí `client.*`, `project.created` a `visibility.changed`, příchozí zdroj `drive` (callback z n8n) a úloha `disk.timeout`. |  |

### folderInfo

function · `packages/modules/disk/src/service.ts`

Stav složky jednoho klienta nebo zakázky; `NotFoundError`, když ho aktér nesmí vidět.

```ts
async function folderInfo(ctx: Ctx, env: DiskEnv, type: DriveEntityType, id: string): Promise<DriveFolderInfo>
```

### handleDriveCallback

function · `packages/modules/disk/src/ingest.ts`

Zpracování callbacku (vyděleno z `driveIngest`, aby šlo volat přímo v testech).

```ts
async function handleDriveCallback(ctx: Ctx, body: DriveCallback, deps: ModuleDeps): Promise<{ entity: { type: string; id: string } }>
```

### maintainRequests

function · `packages/modules/disk/src/jobs.ts`

Jeden běh údržby; vrací počty změn (pro testy a log).

```ts
async function maintainRequests(ctx: Ctx, env: Pick<ModuleJobDeps, "registry" | "settings" | "baseURL">, now: Date = new Date()): Promise<{ sent: number; failed: number; timedOut: number; released: number }>
```

### requestFolder

function · `packages/modules/disk/src/service.ts`

Ruční založení složky („Vytvořit složku“). Složka klienta, nebo zakázky (a před ní složka klienta, když ještě není).
Soukromý záznam se bez `force` odmítne (`skipped: "private"`): složka na sdíleném Disku je pro Patrika viditelná
a prozradí existenci i název záznamu (R-13); `force` znamená, že uživatel varování potvrdil. Existující nebo právě
se zakládající složka se nezakládá znovu (`requestId: null`).

```ts
async function requestFolder(ctx: Ctx, env: DiskEnv, input: { entityType: DriveEntityType; id: string; force?: boolean }, attempts = 1): Promise<RequestResult>
```

### retryFolder

function · `packages/modules/disk/src/service.ts`

„Zkusit znovu“: zopakuje poslední neúspěšný požadavek záznamu (nový požadavek, nové `eventId`, aktuální tělo).
Neúspěšné založení se zopakuje jako ruční založení (potvrzení soukromí platí z původního požadavku); neúspěšná
úprava existující složky (přejmenování, archivace…) jako stejná úprava. Bez neúspěšného požadavku se chová jako
„Vytvořit složku“ bez potvrzení soukromí.

```ts
async function retryFolder(ctx: Ctx, env: DiskEnv, input: { entityType: DriveEntityType; id: string }): Promise<RequestResult>
```

### diskEventHandlers

const · `packages/modules/disk/src/handlers.ts`

Obsluhy událostí modulu; `envOf` dodá služby aplikace z `ModuleDeps`.

```ts
const diskEventHandlers: Handlers
```

### driveIngest

const · `packages/modules/disk/src/ingest.ts`

Příchozí zdroj `drive`: výsledek práce n8n se složkami.

```ts
const driveIngest: import("@rebar/core/module-server").IngestDef<import("zod").ZodObject<{ eventId: import("zod").ZodString; status: import("zod").ZodEnum<{ error: "error"; ok: "ok"; }>; folders: import("zod").ZodOptional<import("zod").ZodObject<{ root: impo…
```

### server

const · `packages/modules/disk/src/server.ts`

Serverová část modulu „disk“: příkazy (`disk.*`), služba `disk`, příspěvek ke kartě klienta, obsluha událostí
`client.*`, `project.created` a `visibility.changed`, příchozí zdroj `drive` (callback z n8n) a úloha `disk.timeout`.

```ts
const server: { readonly entities: readonly import("@rebar/core/entities").EntityDef[]; readonly commands: readonly import("@rebar/core/module-server").CommandDef[]; readonly services: { clients?: ((deps: import("@rebar/core/module-server").ModuleDeps) …
```
