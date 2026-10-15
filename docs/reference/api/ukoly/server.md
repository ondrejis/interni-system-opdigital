# @rebar/ukoly/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/ukoly/server` (soubor `packages/modules/ukoly/src/server.ts`). Exportů: 10, z toho s popisem 9.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`createTasksService`](#createtasksservice) | function | Služba `tasks`: `createFromTemplate`, `overdueJobIds`, `openCounts`, `logDoneActivity`, `createMeeting`, `createPrivateNote`. |  |
| [`entities`](#entities) | const |  |  |
| [`note`](schema.md#note) | const | Poznámka s formátovaným textem (Tiptap JSON v `body_json`, prostý text v `body_text` pro hledání). Má nejvýše jednu vazbu (obchod, organizace, kontakt, zakázka), nebo je samostatná. Viditelnost: dědí od obchodu a zakázky, smí mít vlastní zámek (soukromá organizace a kontakt do poznámek nedědí, R-31). | v `@rebar/ukoly/schema` |
| [`noteEntity`](#noteentity) | const | Poznámka s formátovaným textem. Bez položky v navigaci (R-23): otevírá se z karty, paletou a z Můj prostor → Soukromé. Rozsah „jen moje“: vlastní poznámky. Obsah (`bodyJson`, `bodyText`, `version`) se nezapisuje přes atributy, ale příkazy `ukoly.note.*` (sanitizace a verze pro autosave); atributy jsou název, připnutí, vazby a štítky. |  |
| [`server`](#server) | const | Serverová část modulu „ukoly“: společné entity a příkazy plus oblasti. |  |
| [`task`](schema.md#task) | const | Úkol a aktivita (hovor, schůzka, e-mail, termín jsou typy úkolu). Popis je prostý text, podúkol má jednu úroveň (`parent_id`). Vazby na obchod, organizaci, kontakt, zakázku a její fázi jsou měkké (bez cizího klíče). Viditelnost: dědí od obchodu, zakázky a nadřazeného úkolu a smí mít i vlastní zámek. | v `@rebar/ukoly/schema` |
| [`taskAttendee`](schema.md#taskattendee) | const | Účastník úkolu nebo schůzky: uživatel (`ref` = id), kontakt (`ref` = id), nebo e-mail (`ref` = adresa). | v `@rebar/ukoly/schema` |
| [`taskEntity`](#taskentity) | const | Úkol a aktivita (hovor, schůzka, e-mail, termín jsou typy). Rozsah „jen moje“: přidělený nebo vlastní. Výsledek a dokončení řeší příkaz `complete`; vazby jsou měkké (obchod, organizace, kontakt, zakázka, fáze). |  |
| [`taskType`](schema.md#tasktype) | const | Typ úkolu (Úkol, Hovor, Schůzka, E-mail, Termín…). Systémové typy se nemažou; `is_calendar_event` zobrazí úkol v kalendáři. | v `@rebar/ukoly/schema` |
| [`taskTypeEntity`](#tasktypeentity) | const | Typ úkolu (Úkol, Hovor, Schůzka, E-mail, Termín…); správa v Nastavení přes `ukoly.types`, systémové typy se nemažou. |  |

### createTasksService

function · `packages/modules/ukoly/src/service.ts`

Služba `tasks`: `createFromTemplate`, `overdueJobIds`, `openCounts`, `logDoneActivity`, `createMeeting`,
`createPrivateNote`.

```ts
function createTasksService(deps: ModuleDeps): ServiceMap["tasks"]
```

### entities

const · `packages/modules/ukoly/src/entities.ts`

_Bez popisu._

```ts
const entities: import("@rebar/core/entities").EntityDef[]
```

### noteEntity

const · `packages/modules/ukoly/src/notes/entity.ts`

Poznámka s formátovaným textem. Bez položky v navigaci (R-23): otevírá se z karty, paletou a z Můj prostor → Soukromé.
Rozsah „jen moje“: vlastní poznámky. Obsah (`bodyJson`, `bodyText`, `version`) se nezapisuje přes atributy, ale příkazy
`ukoly.note.*` (sanitizace a verze pro autosave); atributy jsou název, připnutí, vazby a štítky.

```ts
const noteEntity: import("@rebar/core/entities").EntityDef
```

### server

const · `packages/modules/ukoly/src/server.ts`

Serverová část modulu „ukoly“: společné entity a příkazy plus oblasti.

```ts
const server: import("@rebar/core/module-server").ModuleServer
```

### taskEntity

const · `packages/modules/ukoly/src/entities.ts`

Úkol a aktivita (hovor, schůzka, e-mail, termín jsou typy). Rozsah „jen moje“: přidělený nebo vlastní. Výsledek
a dokončení řeší příkaz `complete`; vazby jsou měkké (obchod, organizace, kontakt, zakázka, fáze).

```ts
const taskEntity: import("@rebar/core/entities").EntityDef
```

### taskTypeEntity

const · `packages/modules/ukoly/src/entities.ts`

Typ úkolu (Úkol, Hovor, Schůzka, E-mail, Termín…); správa v Nastavení přes `ukoly.types`, systémové typy se nemažou.

```ts
const taskTypeEntity: import("@rebar/core/entities").EntityDef
```
