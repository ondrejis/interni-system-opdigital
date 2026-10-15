# @rebar/zakazky/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/zakazky/server` (soubor `packages/modules/zakazky/src/server.ts`). Exportů: 9, z toho s popisem 8.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`entities`](#entities) | const |  |  |
| [`job`](schema.md#job) | const | Zakázka. `number` se přiděluje z řady `zakazky.cislo` (`Z-{YYYY}-{NNN}`). Viditelnost: kořen s vlastním zámkem (rodiče nemá; soukromý klient do zakázek nedědí, R-31). Odkazy na organizaci, obchod a aktuální fázi jsou měkké (bez cizího klíče). `drive_*` píše jen modul Disk, `marketing_stage` modul Finance přes `setMarketingStage`. | v `@rebar/zakazky/schema` |
| [`jobEntity`](#jobentity) | const | Zakázka. Rozsah „jen moje“: vlastník nebo člen týmu. Číslo se přiděluje při založení z řady `zakazky.cislo`. `drive_*` píše modul Disk, `marketing_stage` modul Finance (přes `setMarketingStage`), aktuální fázi mění jen příkazy. |  |
| [`jobMember`](schema.md#jobmember) | const | Tým zakázky: vedoucí a členové. Člen zakázku vidí i při oprávnění „jen moje“. | v `@rebar/zakazky/schema` |
| [`jobParticipant`](schema.md#jobparticipant) | const | Další kontakty na zakázce (investor, TDI, projektant…) s rolí na zakázce. | v `@rebar/zakazky/schema` |
| [`jobPhase`](schema.md#jobphase) | const | Fáze zakázky (z šablony typu, upravitelné). Zdědí viditelnost zakázky (bez vlastního zámku). | v `@rebar/zakazky/schema` |
| [`jobTemplate`](schema.md#jobtemplate) | const | Šablona zakázky: fáze, úkoly a platby ve verzovaném JSON (`payload`). Archivuje se, nemaže. | v `@rebar/zakazky/schema` |
| [`jobTemplateEntity`](#jobtemplateentity) | const | Šablona zakázky (fáze, úkoly, platby). Archivuje se, nemaže; správa přes `zakazky.templates`. |  |
| [`server`](#server) | const | Serverová část modulu „zakazky“: entity plus oblasti `core` (zakázky) a `templates` (šablony), obojí ZAK-A. |  |

### entities

const · `packages/modules/zakazky/src/entities.ts`

_Bez popisu._

```ts
const entities: import("@rebar/core/entities").EntityDef[]
```

### jobEntity

const · `packages/modules/zakazky/src/entities.ts`

Zakázka. Rozsah „jen moje“: vlastník nebo člen týmu. Číslo se přiděluje při založení z řady `zakazky.cislo`.
`drive_*` píše modul Disk, `marketing_stage` modul Finance (přes `setMarketingStage`), aktuální fázi mění jen příkazy.

```ts
const jobEntity: import("@rebar/core/entities").EntityDef
```

### jobTemplateEntity

const · `packages/modules/zakazky/src/entities.ts`

Šablona zakázky (fáze, úkoly, platby). Archivuje se, nemaže; správa přes `zakazky.templates`.

```ts
const jobTemplateEntity: import("@rebar/core/entities").EntityDef
```

### server

const · `packages/modules/zakazky/src/server.ts`

Serverová část modulu „zakazky“: entity plus oblasti `core` (zakázky) a `templates` (šablony), obojí ZAK-A.

```ts
const server: import("@rebar/core/module-server").ModuleServer
```
