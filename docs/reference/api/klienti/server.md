# @rebar/klienti/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/klienti/server` (soubor `packages/modules/klienti/src/server.ts`). Exportů: 11, z toho s popisem 11.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`addClientServices`](#addclientservices) | function | Přidá služby ke klientovi (sjednocení se stávajícími); nové spustí `client.service_added`. |  |
| [`clientSnap`](#clientsnap) | function | Snímek klienta pro události `client.*` (nikdy celý řádek). |  |
| [`clientSummary`](#clientsummary) | function | `klienti.summary`: souhrn karty (Přehled): příspěvky modulů, finanční souhrn a kontext. |  |
| [`clientTabs`](#clienttabs) | function | `klienti.tabCounts`: počty záložek od modulů a záložky bez dat, které se na kartě skryjí. |  |
| [`emitClientChanges`](#emitclientchanges) | function | Vyšle události podle rozdílu před a po změně (`before` = `null` při založení). Organizace, která není klient (`client_status` null), události nevyvolává; přejmenování a nová služba se hlásí jen klientům (Disk by neměl co dělat). |  |
| [`listClients`](#listclients) | function | `klienti.list`: tabulka klientů se sloupci z příspěvků modulů. |  |
| [`saveContext`](#savecontext) | function | `klienti.saveContext`: uloží předaná pole kontextu (po jednom poli, autosave) a důvod ukončení. |  |
| [`setClientStatus`](#setclientstatus) | function | Nastaví stav klienta podle pravidel KLI-02 / R-17; vrací, zda se stav změnil, a „klient od“. |  |
| [`setServices`](#setservices) | function | `klienti.setServices`: úplný seznam služeb; nové spustí `client.service_added` (rozšíření entity `company`). |  |
| [`clientLifecycle`](#clientlifecycle) | const | Rozšíření entity `company` o pravidla stavů a události klienta (`entities` modulu v `server.ts`). |  |
| [`server`](#server) | const | Serverová část modulu „klienti“: příkazy `klienti.*`, služba `clients` (stav a služby klienta pro Obchody a Zakázky) a rozšíření entity `company` o pravidla stavů a události `client.*` (Disk na ně reaguje). Modul nemá vlastní tabulky ani entity: klient je organizace se `client_status`. |  |

### addClientServices

function · `packages/modules/klienti/src/service.ts`

Přidá služby ke klientovi (sjednocení se stávajícími); nové spustí `client.service_added`.

```ts
async function addClientServices(ctx: Ctx, deps: ModuleDeps, companyId: string, services: ServiceType[]): Promise<void>
```

### clientSnap

function · `packages/modules/klienti/src/lifecycle.ts`

Snímek klienta pro události `client.*` (nikdy celý řádek).

```ts
function clientSnap(r: Row): ClientSnap
```

### clientSummary

function · `packages/modules/klienti/src/data.ts`

`klienti.summary`: souhrn karty (Přehled): příspěvky modulů, finanční souhrn a kontext.

```ts
async function clientSummary(ctx: Ctx, deps: ModuleDeps, companyId: string): Promise<ClientCardSummary>
```

### clientTabs

function · `packages/modules/klienti/src/data.ts`

`klienti.tabCounts`: počty záložek od modulů a záložky bez dat, které se na kartě skryjí.

```ts
async function clientTabs(ctx: Ctx, deps: ModuleDeps, companyId: string): Promise<ClientTabsResult>
```

### emitClientChanges

function · `packages/modules/klienti/src/lifecycle.ts`

Vyšle události podle rozdílu před a po změně (`before` = `null` při založení). Organizace, která není klient
(`client_status` null), události nevyvolává; přejmenování a nová služba se hlásí jen klientům (Disk by neměl co dělat).

```ts
async function emitClientChanges(ctx: Ctx, before: Row | null, after: Row): Promise<void>
```

### listClients

function · `packages/modules/klienti/src/data.ts`

`klienti.list`: tabulka klientů se sloupci z příspěvků modulů.

```ts
async function listClients(ctx: Ctx, deps: ModuleDeps, input: ListInput): Promise<ClientListResult>
```

### saveContext

function · `packages/modules/klienti/src/data.ts`

`klienti.saveContext`: uloží předaná pole kontextu (po jednom poli, autosave) a důvod ukončení.

```ts
async function saveContext(ctx: Ctx, input: SaveContextInput): Promise<ClientContextDto & { savedAt: string }>
```

### setClientStatus

function · `packages/modules/klienti/src/service.ts`

Nastaví stav klienta podle pravidel KLI-02 / R-17; vrací, zda se stav změnil, a „klient od“.

```ts
async function setClientStatus(ctx: Ctx, deps: ModuleDeps, input: SetStatusInput, opts: { strict?: boolean } = {}): Promise<{ changed: boolean; clientSince: string | null }>
```

### setServices

function · `packages/modules/klienti/src/data.ts`

`klienti.setServices`: úplný seznam služeb; nové spustí `client.service_added` (rozšíření entity `company`).

```ts
async function setServices(ctx: Ctx, deps: ModuleDeps, companyId: string, services: ServiceType[]): Promise<{ services: ServiceType[] }>
```

### clientLifecycle

const · `packages/modules/klienti/src/lifecycle.ts`

Rozšíření entity `company` o pravidla stavů a události klienta (`entities` modulu v `server.ts`).

```ts
const clientLifecycle: import("@rebar/core/entities").EntityExtension
```

### server

const · `packages/modules/klienti/src/server.ts`

Serverová část modulu „klienti“: příkazy `klienti.*`, služba `clients` (stav a služby klienta pro Obchody a
Zakázky) a rozšíření entity `company` o pravidla stavů a události `client.*` (Disk na ně reaguje). Modul nemá
vlastní tabulky ani entity: klient je organizace se `client_status`.

```ts
const server: { readonly entities: readonly [import("@rebar/core/entities").EntityExtension]; readonly commands: readonly import("@rebar/core/module-server").CommandDef[]; readonly services: { clients?: ((deps: import("@rebar/core/module-server").Module…
```
