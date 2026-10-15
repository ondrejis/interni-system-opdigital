# @rebar/core/realtime

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/realtime` (soubor `packages/core/src/realtime/index.ts`). Exportů: 11, z toho s popisem 11.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`createRealtimeStream`](#createrealtimestream) | function | Proud SSE pro jednoho prohlížeče: `ready` po připojení, `change` pro každou povolenou změnu, `resync` po obnovení spojení s databází, komentář `: ping` jako tlukot srdce. Zavře se při odpojení klienta (`signal`) nebo po `maxAgeMs`. |  |
| [`getRealtimeHub`](#getrealtimehub) | function | Rozbočovač procesu (jeden na `sql` spojení). Je na `globalThis`, protože Next.js bundluje route handlery zvlášť. |  |
| [`notifyChange`](#notifychange) | function | Pošle signál o změně záznamu. Volat v téže transakci jako změna: PostgreSQL ho doručí až při commitu (zrušená transakce nic nerozešle) a shodné zprávy v jedné transakci sloučí. Zpráva je malá (jen typ, id a akce), nepřekročí limit 8 kB payloadu. |  |
| [`realtimeFor`](#realtimefor) | function | Smí aktér dostat signál o změně? Soukromé záznamy se tomu, kdo nesmí vidět soukromé (`private.read`), neposílají. Jedinou výjimkou je `visibility_changed` na soukromé: záznam byl právě zamčen a partner ho má ještě v seznamu, takže potřebuje signál, aby zmizel (id znal už dřív, nic nového se nedozví). Typy záznamů, k jejichž čtení aktér nemá oprávnění, se také neposílají. Signál nese jen typ a id; data si klient dotáhne přes engine s viditelností. |  |
| [`RealtimeHub`](#realtimehub) | class | Jedno `LISTEN` spojení na proces (ne na prohlížeč): všechna otevřená SSE spojení sdílejí tento rozbočovač. Při výpadku spojení s databází postgres.js spojení obnoví a znovu zavolá `LISTEN`; rozbočovač pak rozešle `resync`, aby klienti zneplatnili všechno (mezitím mohly zaniknout zprávy). |  |
| [`REALTIME_CHANNEL`](#realtime_channel) | const | Kanál PostgreSQL `LISTEN/NOTIFY`, na kterém se šíří změny záznamů do prohlížečů (SSE `/api/realtime`). |  |
| [`HubMessage`](#hubmessage) | type | Odběr zpráv z kanálu: změna záznamu, nebo `resync` (spojení s DB se přerušilo, mohlo se něco zameškat). |  |
| [`NotifyInput`](#notifyinput) | type | Vstup `notifyChange`: změněný záznam, akce a zda je záznam soukromý. |  |
| [`RealtimeChange`](#realtimechange) | type | Zpráva o změně. Nese jen typ a id záznamu, nikdy data: klient si je po signálu dotáhne přes engine, který vynucuje viditelnost (soukromé záznamy partnerovi nevrátí). `p` = soukromý záznam (server ho nepošle tomu, kdo soukromé nesmí vidět), `x` = typ nadřazeného záznamu (komentář, soubor, platba…). |  |
| [`RealtimeEvent`](#realtimeevent) | type | Co se pošle prohlížeči: bez příznaku soukromí (klient ho nepotřebuje a nemá ho znát). |  |
| [`RealtimeStreamOptions`](#realtimestreamoptions) | type | Nastavení proudu SSE pro jednoho prohlížeče (rozbočovač, aktér, odpojení, tlukot srdce). |  |

### createRealtimeStream

function · `packages/core/src/realtime/stream.ts`

Proud SSE pro jednoho prohlížeče: `ready` po připojení, `change` pro každou povolenou změnu, `resync` po obnovení
spojení s databází, komentář `: ping` jako tlukot srdce. Zavře se při odpojení klienta (`signal`) nebo po `maxAgeMs`.

```ts
function createRealtimeStream(o: RealtimeStreamOptions): ReadableStream<Uint8Array>
```

### getRealtimeHub

function · `packages/core/src/realtime/hub.ts`

Rozbočovač procesu (jeden na `sql` spojení). Je na `globalThis`, protože Next.js bundluje route handlery zvlášť.

```ts
function getRealtimeHub(sql: postgres.Sql): RealtimeHub
```

### notifyChange

function · `packages/core/src/realtime/notify.ts`

Pošle signál o změně záznamu. Volat v téže transakci jako změna: PostgreSQL ho doručí až při commitu (zrušená
transakce nic nerozešle) a shodné zprávy v jedné transakci sloučí. Zpráva je malá (jen typ, id a akce), nepřekročí limit
8 kB payloadu.

```ts
async function notifyChange(db: Executor, input: NotifyInput): Promise<void>
```

### realtimeFor

function · `packages/core/src/realtime/filter.ts`

Smí aktér dostat signál o změně? Soukromé záznamy se tomu, kdo nesmí vidět soukromé (`private.read`), neposílají.
Jedinou výjimkou je `visibility_changed` na soukromé: záznam byl právě zamčen a partner ho má ještě v seznamu, takže
potřebuje signál, aby zmizel (id znal už dřív, nic nového se nedozví). Typy záznamů, k jejichž čtení aktér nemá
oprávnění, se také neposílají. Signál nese jen typ a id; data si klient dotáhne přes engine s viditelností.

```ts
function realtimeFor(ctx: Ctx, change: RealtimeChange, readPermission: (entityType: string) => string | null): RealtimeEvent | null
```

### RealtimeHub

class · `packages/core/src/realtime/hub.ts`

Jedno `LISTEN` spojení na proces (ne na prohlížeč): všechna otevřená SSE spojení sdílejí tento rozbočovač. Při
výpadku spojení s databází postgres.js spojení obnoví a znovu zavolá `LISTEN`; rozbočovač pak rozešle `resync`,
aby klienti zneplatnili všechno (mezitím mohly zaniknout zprávy).

```ts
class RealtimeHub {
  constructor(private readonly sql: postgres.Sql);
  subscribe(listener: Listener): () => void;
  get size(): number;
  get ready(): boolean;
  whenReady(timeoutMs = 5000): Promise<boolean>;
  close(): Promise<void>;
}
```

### REALTIME_CHANNEL

const · `packages/core/src/realtime/notify.ts`

Kanál PostgreSQL `LISTEN/NOTIFY`, na kterém se šíří změny záznamů do prohlížečů (SSE `/api/realtime`).

```ts
const REALTIME_CHANNEL: "opsys_change"
```

### HubMessage

type · `packages/core/src/realtime/hub.ts`

Odběr zpráv z kanálu: změna záznamu, nebo `resync` (spojení s DB se přerušilo, mohlo se něco zameškat).

```ts
type HubMessage = { kind: "change"; change: RealtimeChange } | { kind: "resync" };
```

### NotifyInput

type · `packages/core/src/realtime/notify.ts`

Vstup `notifyChange`: změněný záznam, akce a zda je záznam soukromý.

```ts
type NotifyInput = {
  entityType: string;
  entityId: string;
  action: string;
  /** Hodnota, nebo SQL výraz (zjištění z `private_record`). */
  isPrivate: boolean | SQL<boolean>;
  parentType?: string | undefined;
  parentId?: string | undefined;
};
```

### RealtimeChange

type · `packages/core/src/realtime/notify.ts`

Zpráva o změně. Nese jen typ a id záznamu, nikdy data: klient si je po signálu dotáhne přes engine, který
vynucuje viditelnost (soukromé záznamy partnerovi nevrátí). `p` = soukromý záznam (server ho nepošle
tomu, kdo soukromé nesmí vidět), `x` = typ nadřazeného záznamu (komentář, soubor, platba…).

```ts
type RealtimeChange = {
  /** Typ záznamu (klíč entity, nebo typ vedlejšího záznamu). */
  e: string;
  /** Id záznamu. */
  i: string;
  /** Akce (`create`, `update`, `delete`, `restore`, `visibility_changed`, název doménové události…). */
  a: string;
  /** Soukromý záznam. */
  p: boolean;
  /** Typ nadřazeného záznamu z kontextu změny. */
  x?: string;
  /** Id nadřazeného záznamu z kontextu změny. */
  y?: string;
};
```

### RealtimeEvent

type · `packages/core/src/realtime/filter.ts`

Co se pošle prohlížeči: bez příznaku soukromí (klient ho nepotřebuje a nemá ho znát).

```ts
type RealtimeEvent = Omit<RealtimeChange, "p">;
```

### RealtimeStreamOptions

type · `packages/core/src/realtime/stream.ts`

Nastavení proudu SSE pro jednoho prohlížeče (rozbočovač, aktér, odpojení, tlukot srdce).

```ts
type RealtimeStreamOptions = {
  hub: RealtimeHub;
  ctx: Ctx;
  /** Oprávnění ke čtení entity podle klíče (`null` = typ není entita, nebo se nehlídá). */
  readPermission: (entityType: string) => string | null;
  signal?: AbortSignal | undefined;
  /** Jak často se posílá komentář `: ping`, aby spojení nezavřel proxy server (výchozí 20 s). */
  heartbeatMs?: number;
  /** Po této době se spojení zavře a klient se připojí znovu (nové ověření session; výchozí 30 min). */
  maxAgeMs?: number;
};
```
