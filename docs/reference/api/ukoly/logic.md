# @rebar/ukoly/logic

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/ukoly/logic` (soubor `packages/modules/ukoly/src/tasks/logic/index.ts`). Exportů: 15, z toho s popisem 15.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`daysToNextMonday`](#daystonextmonday) | function | Za kolik dní od dneška je nejbližší pondělí po dnešku (pro „Příští týden“ v odložení). |  |
| [`dueState`](api.md#duestate) | function | Stav termínu: hotový/zrušený úkol je `done`, bez data `nodate`, den v minulosti `overdue`, dnes `today` (úkol s časem je po termínu, jakmile čas uplyne), jinak `future`. | v `@rebar/ukoly/api` |
| [`formatDue`](api.md#formatdue) | function | Termín česky: „Dnes 14:30“, „Zítra“, „Pá 9:00“, „12. 10.“ (bez času jen den). | v `@rebar/ukoly/api` |
| [`formatDuration`](api.md#formatduration) | function | Z minut „90“ → „1 h 30 min“. | v `@rebar/ukoly/api` |
| [`isOverdue`](api.md#isoverdue) | function | Je úkol (otevřený) po termínu? | v `@rebar/ukoly/api` |
| [`normalizeTime`](api.md#normalizetime) | function | Čas z databáze („10:00:00“) nebo formuláře → „HH:mm“; prázdné a neplatné je `null`. | v `@rebar/ukoly/api` |
| [`parseQuickTask`](api.md#parsequicktask) | function | Rozebere rychlé zadání. `now` je „teď“ (rozhoduje o „zítra“, „v pátek“, uplynulém času), `types` jsou typy úkolů z Nastavení (výchozí je pět systémových). Nikdy nevyhodí chybu: co nepozná, zůstane v názvu. | v `@rebar/ukoly/api` |
| [`snoozeTarget`](#snoozetarget) | function | Nový termín po odložení o `days` dní od dneška (čas zůstává). |  |
| [`suggestNextDue`](api.md#suggestnextdue) | function | Návrh termínu další aktivity po dokončení: nejbližší pracovní den po pozdějším z dneška a termínu dokončené aktivity, ve stejnou hodinu (bez času zůstane bez času). | v `@rebar/ukoly/api` |
| [`taskEnd`](api.md#taskend) | function | Konec úkolu s časem: začátek + délka (výchozí 30 minut); bez času nic. Vrací `{ date, time }` pražského času. | v `@rebar/ukoly/api` |
| [`DUE_STATE_ORDER`](#due_state_order) | const | Pořadí řazení stavů v seznamu (nejdřív co hoří). |  |
| [`DueState`](api.md#duestate) | type | Stav termínu úkolu vůči „teď“. | v `@rebar/ukoly/api` |
| [`QuickTaskParse`](api.md#quicktaskparse) | type | Výsledek rozboru rychlého zadání. | v `@rebar/ukoly/api` |
| [`QuickTaskToken`](api.md#quicktasktoken) | type | Jedna rozpoznaná část textu (pro náhled „co systém rozpoznal“). | v `@rebar/ukoly/api` |
| [`QuickTaskType`](api.md#quicktasktype) | type | Typ úkolu, jak ho parser potřebuje znát (klíč a název z Nastavení). | v `@rebar/ukoly/api` |

### daysToNextMonday

function · `packages/modules/ukoly/src/tasks/logic/due.ts`

Za kolik dní od dneška je nejbližší pondělí po dnešku (pro „Příští týden“ v odložení).

```ts
function daysToNextMonday(now: Date = new Date()): number
```

### snoozeTarget

function · `packages/modules/ukoly/src/tasks/logic/due.ts`

Nový termín po odložení o `days` dní od dneška (čas zůstává).

```ts
function snoozeTarget(cur: { dueTime?: string | null | undefined }, days: number, now: Date = new Date()): { dueDate: string; dueTime: string | null }
```

### DUE_STATE_ORDER

const · `packages/modules/ukoly/src/tasks/logic/due.ts`

Pořadí řazení stavů v seznamu (nejdřív co hoří).

```ts
const DUE_STATE_ORDER: Record<DueState, number>
```
