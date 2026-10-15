# @rebar/core/events

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/events` (soubor `packages/core/src/events/index.ts`). Exportů: 8, z toho s popisem 8.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`emitDomain`](#emitdomain) | function | Vyšle doménovou událost (D §2.1). Volat v transakci změny (`inTx`), aby handlery a webhooky vznikly atomicky se změnou: (1) zavolá `eventHandlers` zapnutých modulů v pořadí modulů (chyba handleru propadne a vrátí transakci), (2) je-li událost ve `WEBHOOK_EVENTS`, zapíše řádky `webhook_delivery` endpointům, které ji odebírají (soukromé záznamy jen endpointům `include_private`), (3) doplní C3 (`pg_notify` pro realtime). `meta.entity.isPrivate` rozhoduje o webhookách a realtime; `meta.actor` přebije aktéra z `ctx` (n8n, Google, Meta). |  |
| [`setDomainEvents`](#setdomainevents) | function | Zaregistruje obsluhy událostí zapnutých modulů a továrnu na `ModuleDeps` (aplikace a worker při startu, testy podle potřeby). Bez registrace `emitDomain` jen vytvoří událost a nikomu ji nepředá. |  |
| [`WEBHOOK_EVENTS`](contracts.md#webhook_events) | const | Události, které odcházejí i jako webhooky (ostatní jsou jen interní mezi moduly). `drive.*` jen endpointům `drive.*`. | v `@rebar/core/contracts` |
| [`DomainEvent`](contracts.md#domainevent) | type | Událost tak, jak ji dostane `eventHandlers` modulu (a jak se serializuje do webhooku). | v `@rebar/core/contracts` |
| [`DomainEventHandler`](#domaineventhandler) | type | Obsluha doménové události v modulu (`ModuleServer.eventHandlers`); běží v transakci emitenta, chyba ji vrátí. |  |
| [`DomainEventHandlers`](#domaineventhandlers) | type | Obsluhy zapnutých modulů podle názvu události (v pořadí modulů). |  |
| [`DomainEventMap`](contracts.md#domaineventmap) | type | Katalog doménových událostí OPSYS (D §2.2). Klíč je název události, hodnota payload `data`. Přidávat smí jen architekt; události označené ve `WEBHOOK_EVENTS` odcházejí i jako webhooky (podepsané, viz C2). | v `@rebar/core/contracts` |
| [`DomainEventName`](contracts.md#domaineventname) | type | Název doménové události. | v `@rebar/core/contracts` |

### emitDomain

function · `packages/core/src/events/index.ts`

Vyšle doménovou událost (D §2.1). Volat v transakci změny (`inTx`), aby handlery a webhooky vznikly atomicky se
změnou: (1) zavolá `eventHandlers` zapnutých modulů v pořadí modulů (chyba handleru propadne a vrátí transakci),
(2) je-li událost ve `WEBHOOK_EVENTS`, zapíše řádky `webhook_delivery` endpointům, které ji odebírají (soukromé záznamy
jen endpointům `include_private`), (3) doplní C3 (`pg_notify` pro realtime).
`meta.entity.isPrivate` rozhoduje o webhookách a realtime; `meta.actor` přebije aktéra z `ctx` (n8n, Google, Meta).

```ts
async function emitDomain<K extends DomainEventName>(ctx: Ctx, name: K, data: DomainEventMap[K], meta: { entity: DomainEventEntity; previous?: Partial<DomainEventMap[K]>; actor?: DomainActor }): Promise<void>
```

### setDomainEvents

function · `packages/core/src/events/index.ts`

Zaregistruje obsluhy událostí zapnutých modulů a továrnu na `ModuleDeps` (aplikace a worker při startu, testy
podle potřeby). Bez registrace `emitDomain` jen vytvoří událost a nikomu ji nepředá.

```ts
function setDomainEvents(handlers: DomainEventHandlers | undefined, deps: (() => ModuleDeps) | undefined): void
```

### DomainEventHandler

type · `packages/core/src/events/index.ts`

Obsluha doménové události v modulu (`ModuleServer.eventHandlers`); běží v transakci emitenta, chyba ji vrátí.

```ts
type DomainEventHandler<K extends DomainEventName = DomainEventName> = (
  ctx: Ctx,
  event: DomainEvent<K>,
  deps: ModuleDeps,
) => Promise<void>;
```

### DomainEventHandlers

type · `packages/core/src/events/index.ts`

Obsluhy zapnutých modulů podle názvu události (v pořadí modulů).

```ts
type DomainEventHandlers = Partial<Record<DomainEventName, readonly DomainEventHandler[]>>;
```
