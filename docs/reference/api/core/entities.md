# @rebar/core/entities

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/entities` (soubor `packages/core/src/entities/index.ts`). Exportů: 65, z toho s popisem 38.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`aggregateRecords`](#aggregaterecords) | function | Agregace entity. Oprávnění a viditelnost řádků hlídá stejná datová vrstva jako seznam: bez práva ke čtení entity chyba, rozsah „jen moje“ zúží řádky, atributy skryté oprávněním (ceny, marže) pro aktéra neexistují, takže se nedají sečíst ani změnou definice widgetu. |  |
| [`assertEntityAccess`](#assertentityaccess) | function | Ověří, že aktér smí se záznamem pracovat. Neznámý typ záznamu se odmítne (bezpečné výchozí chování), záznam, který aktér nesmí vidět, se tváří jako neexistující. |  |
| [`clearEntityPolicies`](#clearentitypolicies) | function | Pro testy. |  |
| [`countActive`](#countactive) | function | Spočítá nesmazané řádky tabulky (`deleted_at is null`) splňující podmínky; pomocník pro `DeleteBlocker.count`. |  |
| [`createEntityRegistry`](#createentityregistry) | function |  |  |
| [`createRecord`](#createrecord) | function | Založí záznam. Bez zadaných hodnot se doplní výchozí; povinné atributy se kontrolují. |  |
| [`defineEntity`](#defineentity) | function |  |  |
| [`deleteBlockMessage`](#deleteblockmessage) | function | Vrátí českou větu, proč záznam nejde smazat („Firma má 3 zakázky a 2 faktury; nejdřív je přesuňte nebo smažte.“), nebo `null`, když nic nebrání. `label` je název typu záznamu v 1. pádu („Firma“). |  |
| [`deleteRecord`](#deleterecord) | function | Smaže záznam (měkce — jde obnovit). |  |
| [`describeEntity`](#describeentity) | function | Popis entity pro prohlížeč: atributy (včetně vlastních polí), stavy pipeline a to, co aktér smí. |  |
| [`getEntityPolicy`](#getentitypolicy) | function |  |  |
| [`getRecord`](#getrecord) | function | Jeden záznam. Záznam, který aktér nesmí vidět, se tváří jako neexistující. |  |
| [`getRecordActivity`](#getrecordactivity) | function | Vše, co se kolem záznamu děje: časová osa (změny z auditu a komentáře), úkoly a soubory. Smí ji číst ten, kdo záznam vidí. S `def` entity se z auditu vynechají peníze a skryté atributy (viz `visibleAudit`). |  |
| [`indexRecord`](#indexrecord) | function | Zapíše záznam do indexu pro hledání (ve stejné transakci jako změna záznamu). |  |
| [`phaseHooksFor`](#phasehooksfor) | function |  |  |
| [`queryGroups`](#querygroups) | function | Skupiny podle atributu (počet a součty) — záhlaví skupin v tabulce a sloupce kanbanu. |  |
| [`queryRecords`](#queryrecords) | function | Stránka záznamů: řádky, celkový počet, součty za celou filtrovanou sadu a popisky odkazů. |  |
| [`recordOwners`](#recordowners) | function | Zjistí vlastníky záznamu bez ověřování oprávnění — pro politiku přístupu komentářů, úkolů a souborů. |  |
| [`recordTitles`](#recordtitles) | function | Názvy záznamů podle id (např. zakázky u řádků docházky) bez oprávnění a bez závislosti na modulu entity: když entita v registru není (modul vypnutý), vrátí prázdný objekt. Jen pro popisky; data záznamu to nevydá. |  |
| [`registerEntityPolicies`](#registerentitypolicies) | function | Zaregistruje politiky přístupu všech entit (komentáře, úkoly a soubory se řídí oprávněním k záznamu). |  |
| [`registerEntityPolicy`](#registerentitypolicy) | function |  |  |
| [`reindexEntity`](#reindexentity) | function | Znovu zaindexuje všechny záznamy entity (po změně vlastních polí: nový popisek možnosti, skryté nebo smazané pole). Po dávkách, aby se nenačetla celá tabulka najednou. |  |
| [`removeFromIndex`](#removefromindex) | function |  |  |
| [`resolveEntity`](#resolveentity) | function | Přidá vlastní pole z administrace jako další atributy entity. |  |
| [`restoreRecord`](#restorerecord) | function | Obnoví smazaný záznam (vyžaduje právo zápisu v rozsahu „vše“, protože smazaný záznam už vlastníky nepozná). |  |
| [`searchAll`](#searchall) | function | Hledání napříč entitami (Cmd+K) bez ohledu na diakritiku a velikost písmen. Kandidáty vybere trigramový index, potom se každý ověří proti oprávnění a rozsahu aktéra — v nálezech jsou jen záznamy, které smí vidět. |  |
| [`setDeleteBlockers`](#setdeleteblockers) | function | Nahradí zaregistrované blokace (volá se při sestavení zapnutých modulů, tedy i v testech a ve workeru). |  |
| [`setPhaseHooks`](#setphasehooks) | function | Nahradí zaregistrované hooky (volá se při sestavení zapnutých modulů, tedy i v testech a ve workeru). |  |
| [`stageHooksFor`](#stagehooksfor) | function | Hooky záznamu, které reagují na změnu stavu nebo na změnu údajů (ne jen na přechod fáze). |  |
| [`updateRecord`](#updaterecord) | function | Změna atributů záznamu (inline editace). Oprávnění zápisu se ověřuje pro konkrétní záznam. |  |
| [`visibleIds`](#visibleids) | function | Id záznamů, které aktér vidí (s oprávněním a rozsahem, bez smazaných), případně zúžená filtrem. Pro moduly, které z dat jiné entity potřebují jen „kterých se týká“ (fáze viditelných zakázek, vady…); strop chrání paměť. |  |
| [`visibleRecordTitles`](#visiblerecordtitles) | function | Názvy záznamů podle id jen z těch záznamů, které aktér smí vidět (oprávnění i rozsah „jen moje“). Cizí záznam se v popisku neobjeví, takže montér nepozná název zakázky, ke které nepatří. Pro popisky u řádků docházky, skladu, strojů a kalendáře; místo `recordTitles` všude, kde odpověď čte uživatel s omezeným rozsahem. |  |
| [`visibleTo`](#visibleto) | function | Entita zúžená na atributy, které aktér smí vidět (`AttributeDef.permission`). Skryté atributy pak pro aktéra neexistují: nejsou v řádcích, součtech, filtrech ani řazení a nejdou zapsat (neznámý atribut). |  |
| [`AGGREGATABLE_TYPES`](#aggregatable_types) | const |  |  |
| [`AGG_MAX_GROUPS`](#agg_max_groups) | const |  |  |
| [`ATTRIBUTE_TYPES`](#attribute_types) | const | Typy atributů záznamů. Z typu plyne editor v buňce, dostupné filtry, řazení i validace. |  |
| [`GROUPABLE_TYPES`](#groupable_types) | const | Atributy, které se smí seskupovat (pro editor widgetů i kontrolu na serveru). |  |
| [`OPERATORS`](#operators) | const |  |  |
| [`OPERATORS_BY_TYPE`](#operators_by_type) | const | Operátory dostupné pro typ atributu (z toho se staví nabídka ve filtru). |  |
| [`filterGroupSchema`](#filtergroupschema) | const |  |  |
| [`queryInput`](#queryinput) | const |  |  |
| [`AggregateGroup`](#aggregategroup) | type |  |  |
| [`AggregateResult`](#aggregateresult) | type |  |  |
| [`AggregateSpec`](#aggregatespec) | type | Dotaz „spočítej / sečti / zprůměruj … seskupeně“ nad entitou. Základ widgetů vlastních nástěnek (žádné ruční SQL). |  |
| [`AttributeDef`](#attributedef) | type |  |  |
| [`AttributeType`](#attributetype) | type |  |  |
| [`Choice`](#choice) | type |  |  |
| [`Condition`](#condition) | type |  |  |
| [`DeleteBlocker`](#deleteblocker) | type | Blokace smazání záznamu, který má navázané záznamy jiných modulů (firma se zakázkou a fakturou, zakázka s vystavenou fakturou…). Entita o cizích tabulkách nic neví: každý modul dodá `deleteBlockers` pro typy záznamů, na které odkazuje, a `deleteRecord` je před smazáním vyhodnotí. Počítají se jen nesmazané záznamy. |  |
| [`EntityDef`](#entitydef) | type |  |  |
| [`EntityPolicy`](#entitypolicy) | type | Pravidla přístupu k záznamům jednoho typu (zakázka, firma, stroj…). Komentáře, úkoly a soubory se vážou na libovolný záznam, proto se jejich oprávnění odvozují od záznamu, ke kterému patří. Moduly svou politiku registrují (ve fázi 3 ji nahradí registr entit). |  |
| [`EntityRegistry`](#entityregistry) | type |  |  |
| [`FilterGroup`](#filtergroup) | type |  |  |
| [`GroupRow`](#grouprow) | type |  |  |
| [`Labels`](#labels) | type | Popisky odkazovaných záznamů: `labels[atribut][id]`. |  |
| [`Operator`](#operator) | type |  |  |
| [`PhaseTransition`](#phasetransition) | type | Hook přechodu fáze záznamu (zakázka: poptávka → nabídka → … → uzavřeno). Moduly je dodávají přes `phaseHooks` v serverové části; entita (`beforeUpdate`/`afterUpdate`) je pouští při změně fáze. Hook patří modulu, který zná důsledek přechodu (rozpočet zamkne nabídku, realizace otevře deník…), entita o nich nic neví. |  |
| [`PhaseTransitionHook`](#phasetransitionhook) | type |  |  |
| [`QueryInput`](#queryinput) | type |  |  |
| [`RecordRow`](#recordrow) | type | Řádek záznamu: `id`, `updatedAt` (ISO) a hodnoty podle klíče atributu. |  |
| [`ResolvedEntity`](#resolvedentity) | type | Entita se zjištěnými vlastními poli (z administrace) připravená k dotazům. |  |
| [`SearchHit`](#searchhit) | type |  |  |
| [`StageChange`](#stagechange) | type | Změna stavu (pipeline) záznamu; platí i pro přesun uvnitř jedné fáze. `fromStageId` je `null` při založení. |  |
| [`TimelineItem`](#timelineitem) | type |  |  |
| [`UpdateOptions`](#updateoptions) | type |  |  |

### aggregateRecords

function · `packages/core/src/entities/aggregate.ts`

Agregace entity. Oprávnění a viditelnost řádků hlídá stejná datová vrstva jako seznam: bez práva ke čtení entity chyba,
rozsah „jen moje“ zúží řádky, atributy skryté oprávněním (ceny, marže) pro aktéra neexistují, takže se nedají
sečíst ani změnou definice widgetu.

```ts
async function aggregateRecords(ctx: Ctx, registry: EntityRegistry, entity: ResolvedEntity, spec: AggregateSpec): Promise<AggregateResult>
```

### assertEntityAccess

function · `packages/core/src/entities/policy.ts`

Ověří, že aktér smí se záznamem pracovat. Neznámý typ záznamu se odmítne (bezpečné výchozí chování),
záznam, který aktér nesmí vidět, se tváří jako neexistující.

```ts
async function assertEntityAccess(ctx: Ctx, entityType: string, entityId: string, mode: "read" | "write" = "read"): Promise<EntityPolicy>
```

### clearEntityPolicies

function · `packages/core/src/entities/policy.ts`

Pro testy.

```ts
function clearEntityPolicies(): void
```

### countActive

function · `packages/core/src/entities/delete-blockers.ts`

Spočítá nesmazané řádky tabulky (`deleted_at is null`) splňující podmínky; pomocník pro `DeleteBlocker.count`.

```ts
async function countActive(ctx: Ctx, table: PgTable, ...where: (SQL | undefined)[]): Promise<number>
```

### createEntityRegistry

function · `packages/core/src/entities/engine.ts`

_Bez popisu._

```ts
function createEntityRegistry(defs: readonly EntityDef[]): EntityRegistry
```

### createRecord

function · `packages/core/src/entities/engine.ts`

Založí záznam. Bez zadaných hodnot se doplní výchozí; povinné atributy se kontrolují.

```ts
async function createRecord(ctx: Ctx, registry: EntityRegistry, e: ResolvedEntity, values: Record<string, unknown>): Promise<{ row: RecordRow; labels: Labels; }>
```

### defineEntity

function · `packages/core/src/entities/types.ts`

_Bez popisu._

```ts
function defineEntity(def: EntityDef): EntityDef
```

### deleteBlockMessage

function · `packages/core/src/entities/delete-blockers.ts`

Vrátí českou větu, proč záznam nejde smazat („Firma má 3 zakázky a 2 faktury; nejdřív je přesuňte nebo smažte.“),
nebo `null`, když nic nebrání. `label` je název typu záznamu v 1. pádu („Firma“).

```ts
async function deleteBlockMessage(ctx: Ctx, entity: string, id: string, label: string): Promise<string | null>
```

### deleteRecord

function · `packages/core/src/entities/engine.ts`

Smaže záznam (měkce — jde obnovit).

```ts
async function deleteRecord(ctx: Ctx, e: ResolvedEntity, id: string): Promise<void>
```

### describeEntity

function · `packages/core/src/entities/describe.ts`

Popis entity pro prohlížeč: atributy (včetně vlastních polí), stavy pipeline a to, co aktér smí.

```ts
async function describeEntity(ctx: Ctx, db: Executor, e: ResolvedEntity, registry?: EntityRegistry): Promise<EntityDescriptor>
```

### getEntityPolicy

function · `packages/core/src/entities/policy.ts`

_Bez popisu._

```ts
function getEntityPolicy(entityType: string): EntityPolicy | undefined
```

### getRecord

function · `packages/core/src/entities/engine.ts`

Jeden záznam. Záznam, který aktér nesmí vidět, se tváří jako neexistující.

```ts
async function getRecord(ctx: Ctx, registry: EntityRegistry, entity: ResolvedEntity, id: string): Promise<{ row: RecordRow; labels: Labels; }>
```

### getRecordActivity

function · `packages/core/src/entities/activity.ts`

Vše, co se kolem záznamu děje: časová osa (změny z auditu a komentáře), úkoly a soubory.
Smí ji číst ten, kdo záznam vidí. S `def` entity se z auditu vynechají peníze a skryté atributy (viz `visibleAudit`).

```ts
async function getRecordActivity(ctx: Ctx, entityType: string, id: string, def?: Pick<EntityDef, "attributes">): Promise<{ timeline: TimelineItem[]; tasks: { id: string; title: string; dueDate: string | null; priority: "normal" | "low" | "high"; done: boolean; assigneeId: string; }[]; files: { takenAt: string | null; createdAt: string; id: string; fi…
```

### indexRecord

function · `packages/core/src/entities/search.ts`

Zapíše záznam do indexu pro hledání (ve stejné transakci jako změna záznamu).

```ts
async function indexRecord(db: Executor, e: Indexed, raw: Record<string, unknown>): Promise<void>
```

### phaseHooksFor

function · `packages/core/src/entities/phase-hooks.ts`

_Bez popisu._

```ts
function phaseHooksFor(entity: string, t: PhaseTransition): PhaseTransitionHook[]
```

### queryGroups

function · `packages/core/src/entities/engine.ts`

Skupiny podle atributu (počet a součty) — záhlaví skupin v tabulce a sloupce kanbanu.

```ts
async function queryGroups(ctx: Ctx, entity: ResolvedEntity, groupKey: string, raw: QueryInput = {}): Promise<GroupRow[]>
```

### queryRecords

function · `packages/core/src/entities/engine.ts`

Stránka záznamů: řádky, celkový počet, součty za celou filtrovanou sadu a popisky odkazů.

```ts
async function queryRecords(ctx: Ctx, registry: EntityRegistry, entity: ResolvedEntity, raw: QueryInput = {}): Promise<{ rows: RecordRow[]; total: number; totals: Record<string, number>; labels: Labels; }>
```

### recordOwners

function · `packages/core/src/entities/engine.ts`

Zjistí vlastníky záznamu bez ověřování oprávnění — pro politiku přístupu komentářů, úkolů a souborů.

```ts
async function recordOwners(db: Executor, e: ResolvedEntity, id: string): Promise<{ ownerIds: (string | null)[]; } | null>
```

### recordTitles

function · `packages/core/src/entities/engine.ts`

Názvy záznamů podle id (např. zakázky u řádků docházky) bez oprávnění a bez závislosti na modulu entity: když entita
v registru není (modul vypnutý), vrátí prázdný objekt. Jen pro popisky; data záznamu to nevydá.

```ts
async function recordTitles(db: Executor, registry: EntityRegistry, entityKey: string, ids: readonly string[]): Promise<Record<string, string>>
```

### registerEntityPolicies

function · `packages/core/src/entities/engine.ts`

Zaregistruje politiky přístupu všech entit (komentáře, úkoly a soubory se řídí oprávněním k záznamu).

```ts
function registerEntityPolicies(registry: EntityRegistry): void
```

### registerEntityPolicy

function · `packages/core/src/entities/policy.ts`

_Bez popisu._

```ts
function registerEntityPolicy(policy: EntityPolicy): void
```

### reindexEntity

function · `packages/core/src/entities/search.ts`

Znovu zaindexuje všechny záznamy entity (po změně vlastních polí: nový popisek možnosti, skryté nebo smazané pole).
Po dávkách, aby se nenačetla celá tabulka najednou.

```ts
async function reindexEntity(db: Executor, e: Indexed & { columns: Record<string, AnyPgColumn> }): Promise<number>
```

### removeFromIndex

function · `packages/core/src/entities/search.ts`

_Bez popisu._

```ts
async function removeFromIndex(db: Executor, entityType: string, id: string): Promise<void>
```

### resolveEntity

function · `packages/core/src/entities/engine.ts`

Přidá vlastní pole z administrace jako další atributy entity.

```ts
async function resolveEntity(db: Executor, def: EntityDef): Promise<ResolvedEntity>
```

### restoreRecord

function · `packages/core/src/entities/engine.ts`

Obnoví smazaný záznam (vyžaduje právo zápisu v rozsahu „vše“, protože smazaný záznam už vlastníky nepozná).

```ts
async function restoreRecord(ctx: Ctx, e: ResolvedEntity, id: string): Promise<void>
```

### searchAll

function · `packages/core/src/entities/search.ts`

Hledání napříč entitami (Cmd+K) bez ohledu na diakritiku a velikost písmen. Kandidáty vybere trigramový
index, potom se každý ověří proti oprávnění a rozsahu aktéra — v nálezech jsou jen záznamy, které smí vidět.

```ts
async function searchAll(ctx: Ctx, defs: readonly EntityDef[], query: string, limit = 12): Promise<SearchHit[]>
```

### setDeleteBlockers

function · `packages/core/src/entities/delete-blockers.ts`

Nahradí zaregistrované blokace (volá se při sestavení zapnutých modulů, tedy i v testech a ve workeru).

```ts
function setDeleteBlockers(blockers: readonly DeleteBlocker[]): void
```

### setPhaseHooks

function · `packages/core/src/entities/phase-hooks.ts`

Nahradí zaregistrované hooky (volá se při sestavení zapnutých modulů, tedy i v testech a ve workeru).

```ts
function setPhaseHooks(hooks: readonly PhaseTransitionHook[]): void
```

### stageHooksFor

function · `packages/core/src/entities/phase-hooks.ts`

Hooky záznamu, které reagují na změnu stavu nebo na změnu údajů (ne jen na přechod fáze).

```ts
function stageHooksFor(entity: string): PhaseTransitionHook[]
```

### updateRecord

function · `packages/core/src/entities/engine.ts`

Změna atributů záznamu (inline editace). Oprávnění zápisu se ověřuje pro konkrétní záznam.

```ts
async function updateRecord(ctx: Ctx, registry: EntityRegistry, entity: ResolvedEntity, id: string, patch: Record<string, unknown>, opts: UpdateOptions = {}): Promise<{ row: RecordRow; labels: Labels; }>
```

### visibleIds

function · `packages/core/src/entities/engine.ts`

Id záznamů, které aktér vidí (s oprávněním a rozsahem, bez smazaných), případně zúžená filtrem. Pro moduly,
které z dat jiné entity potřebují jen „kterých se týká“ (fáze viditelných zakázek, vady…); strop chrání paměť.

```ts
async function visibleIds(ctx: Ctx, entity: ResolvedEntity, input: QueryInput = {}, max = 5000): Promise<string[]>
```

### visibleRecordTitles

function · `packages/core/src/entities/engine.ts`

Názvy záznamů podle id jen z těch záznamů, které aktér smí vidět (oprávnění i rozsah „jen moje“). Cizí záznam se
v popisku neobjeví, takže montér nepozná název zakázky, ke které nepatří. Pro popisky u řádků docházky, skladu,
strojů a kalendáře; místo `recordTitles` všude, kde odpověď čte uživatel s omezeným rozsahem.

```ts
async function visibleRecordTitles(ctx: Ctx, registry: EntityRegistry, entityKey: string, ids: readonly string[]): Promise<Record<string, string>>
```

### visibleTo

function · `packages/core/src/entities/engine.ts`

Entita zúžená na atributy, které aktér smí vidět (`AttributeDef.permission`). Skryté atributy pak pro aktéra
neexistují: nejsou v řádcích, součtech, filtrech ani řazení a nejdou zapsat (neznámý atribut).

```ts
function visibleTo(ctx: Ctx, e: ResolvedEntity): ResolvedEntity
```

### AGGREGATABLE_TYPES

const · `packages/core/src/entities/aggregate.ts`

_Bez popisu._

```ts
const AGGREGATABLE_TYPES: readonly AttributeType[]
```

### AGG_MAX_GROUPS

const · `packages/core/src/entities/aggregate.ts`

_Bez popisu._

```ts
const AGG_MAX_GROUPS: 100
```

### ATTRIBUTE_TYPES

const · `packages/core/src/entities/types.ts`

Typy atributů záznamů. Z typu plyne editor v buňce, dostupné filtry, řazení i validace.

```ts
const ATTRIBUTE_TYPES: readonly ["text", "longtext", "number", "currency", "date", "status", "select", "multiselect", "user", "record", "checkbox", "url", "phone", "email"]
```

### GROUPABLE_TYPES

const · `packages/core/src/entities/aggregate.ts`

Atributy, které se smí seskupovat (pro editor widgetů i kontrolu na serveru).

```ts
const GROUPABLE_TYPES: readonly AttributeType[]
```

### OPERATORS

const · `packages/core/src/entities/operators.ts`

_Bez popisu._

```ts
const OPERATORS: readonly ["contains", "not_contains", "equals", "not_equals", "starts_with", "eq", "neq", "gt", "gte", "lt", "lte", "between", "before", "after", "in_last_days", "in_next_days", "older_than_days", "in_this_week", "in_this_month", "is", "is…
```

### OPERATORS_BY_TYPE

const · `packages/core/src/entities/operators.ts`

Operátory dostupné pro typ atributu (z toho se staví nabídka ve filtru).

```ts
const OPERATORS_BY_TYPE: Record<AttributeType, Operator[]>
```

### filterGroupSchema

const · `packages/core/src/entities/filters.ts`

_Bez popisu._

```ts
const filterGroupSchema: z.ZodType<FilterGroup>
```

### queryInput

const · `packages/core/src/entities/engine.ts`

_Bez popisu._

```ts
const queryInput: z.ZodObject<{ filters: z.ZodOptional<z.ZodType<FilterGroup, unknown, z.core.$ZodTypeInternals<FilterGroup, unknown>>>; sort: z.ZodOptional<z.ZodArray<z.ZodObject<{ attr: z.ZodString; dir: z.ZodEnum<{ asc: "asc"; desc: "desc"; }>; }, z.core…
```

### AggregateGroup

type · `packages/core/src/entities/aggregate.ts`

_Bez popisu._

```ts
type AggregateGroup = {
  /** Surová hodnota skupiny (id, kód, začátek období `YYYY-MM-DD`); `null` = bez hodnoty. */
  key: string | null;
  label: string;
  color?: string | undefined;
  value: number | null;
  /** Hodnota jako text, když není číslo (nejdřívější / nejpozdější datum). */
  text?: string | undefined;
  count: number;
  /** Rozpad podle `splitBy`: klíč → hodnota. */
  split?: Record<string, number> | undefined;
};
```

### AggregateResult

type · `packages/core/src/entities/aggregate.ts`

_Bez popisu._

```ts
type AggregateResult = {
  groups: AggregateGroup[];
  total: { value: number | null; text?: string | undefined; count: number };
  /** Klíče a popisky druhého seskupení v pořadí podle významu (nejvýše 8 + „Ostatní“). */
  splitKeys?: { key: string; label: string; color?: string | undefined }[] | undefined;
  /** Skupin bylo víc, než se vrací. */
  truncated: boolean;
};
```

### AggregateSpec

type · `packages/core/src/entities/aggregate.ts`

Dotaz „spočítej / sečti / zprůměruj … seskupeně“ nad entitou. Základ widgetů vlastních nástěnek (žádné ruční SQL).

```ts
type AggregateSpec = {
  filters?: FilterGroup | undefined;
  q?: string | undefined;
  fn: AggFn;
  /** Číselný (`sum`, `avg`) nebo číselný / datumový (`min`, `max`) atribut; u `count` se nepoužije. */
  attr?: string | undefined;
  groupBy?: { attr: string; bucket?: Bucket | undefined } | undefined;
  /** Druhé seskupení (skládaný graf): hodnotový atribut; má smysl jen u `count` a `sum`. */
  splitBy?: string | undefined;
  sort?: { by: "value" | "label"; dir: "asc" | "desc" } | undefined;
  limit?: number | undefined;
  /** Omezení na období podle datumového atributu (včetně obou konců). */
  period?: { attr: string; from: string; to: string } | undefined;
  /** Další omezení bez ohledu na filtry widgetu (zakázka, osoba z filtrů nástěnky): atribut = hodnota. */
  equals?: readonly { attr: string; value: string }[] | undefined;
  /** Jen záznamy s těmito id (zakázka vybraná ve filtru nástěnky u entity zakázky). */
  onlyIds?: readonly string[] | undefined;
};
```

### AttributeDef

type · `packages/core/src/entities/types.ts`

_Bez popisu._

```ts
type AttributeDef = {
  key: string;
  label: string;
  type: AttributeType;
  /** Název vlastnosti v Drizzle tabulce (nativní atribut). */
  field?: string;
  /** Hodnota je ve sloupci `custom` (vlastní pole definované v administraci). */
  custom?: boolean;
  /** Možnosti pro `select` a `multiselect`. */
  choices?: readonly Choice[];
  /** Možnosti z číselníku v administraci (klíč číselníku); nahradí `choices` při sestavení entity. */
  lookup?: string;
  /** Cílový typ záznamu pro `record`. */
  record?: { entityType: string };
  /** Pipeline, ze které jsou stavy (`status`). */
  pipeline?: { entityType: string; key: string };
  readonly?: boolean;
  required?: boolean;
  /**
   * Oprávnění ke čtení atributu (např. `zakazky.economics` u cen a marží). Aktér bez něj atribut nevidí
   * ani nenajde: chybí v popisu, v řádcích, součtech, filtrech i řazení a nejde ho zapsat.
   */
  permission?: string;
  /** Nejmenší a největší povolená hodnota (`number`, `currency`; u částky v haléřích). Porušení vrátí uživateli větu. */
  min?: number;
  max?: number;
  /** Jednotka čísla: `percent` = hodnota v procentech, `percent_bp` = v setinách procenta (500 = 5 %). Jen `number`. */
  unit?: "percent" | "percent_bp";
  /** Výchozí hodnota při zakládání záznamu: dialog ji předvyplní a engine ji doplní, když chybí. */
  default?: string | number | boolean;
  /** Prohledává se při textovém hledání v tabulce (výchozí ano u textových typů). */
  searchable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  /** Součet za filtrovanou sadu a za skupiny (jen `number` a `currency`). */
  aggregate?: readonly "sum"[];
  /** Výchozí zobrazení sloupce v tabulce a šířka v pixelech. */
  defaultVisible?: boolean;
  width?: number;
};
```

### AttributeType

type · `packages/core/src/entities/types.ts`

_Bez popisu._

```ts
type AttributeType = (typeof ATTRIBUTE_TYPES)[number];
```

### Choice

type · `packages/core/src/entities/types.ts`

_Bez popisu._

```ts
type Choice = { value: string; label: string; color?: string };
```

### Condition

type · `packages/core/src/entities/operators.ts`

_Bez popisu._

```ts
type Condition = { attr: string; op: Operator; value?: unknown };
```

### DeleteBlocker

type · `packages/core/src/entities/delete-blockers.ts`

Blokace smazání záznamu, který má navázané záznamy jiných modulů (firma se zakázkou a fakturou, zakázka s vystavenou
fakturou…). Entita o cizích tabulkách nic neví: každý modul dodá `deleteBlockers` pro typy záznamů, na které odkazuje,
a `deleteRecord` je před smazáním vyhodnotí. Počítají se jen nesmazané záznamy.

```ts
type DeleteBlocker = {
  /** Stabilní jméno pro logy a testy (`zakazky.company-jobs`). */
  id: string;
  /** Typ mazaného záznamu (`company`, `person`, `job`). */
  entity: string;
  /** Kolik nesmazaných záznamů na mazaný záznam odkazuje. */
  count: (ctx: Ctx, id: string) => Promise<number>;
  /** Jméno navázaných záznamů podle počtu: 1 / 2–4 / 5 a více („zakázka“, „zakázky“, „zakázek“). */
  noun: readonly [one: string, few: string, many: string];
  /**
   * Co s nimi dál, věta za středníkem. Výchozí: „nejdřív je přesuňte nebo smažte“. U dokladů, které smazat nejde
   * (vystavená faktura, zamčená objednávka), blokace vysvětlí, proč smazání nejde.
   */
  fix?: string;
};
```

### EntityDef

type · `packages/core/src/entities/types.ts`

_Bez popisu._

```ts
type EntityDef = {
  /** Klíč entity — shodný s `entity_type` v komentářích, úkolech, souborech a auditu. */
  key: string;
  module: ModuleId;
  label: { one: string; many: string };
  /** Tabulka (Drizzle) s vlastnostmi `id`, `custom`, `createdAt`, `updatedAt`, `deletedAt`. */
  table: PgTable;
  attributes: readonly AttributeDef[];
  /** Atribut, který je název záznamu (v seznamech, detailu, hledání). */
  titleKey: string;
  /** Atribut typu `status`, podle kterého se dělá kanban. */
  statusKey?: string;
  permissions: {
    read: string;
    write: string;
    create?: string;
    delete?: string;
    /** Kdo smí exportovat seznam do souboru (XLSX/CSV celé filtrované sady); bez něj stačí čtení. */
    export?: string;
  };
  /**
   * Záznamy vznikají jen příkazy modulu (doklady, objednávky…); UI nenabízí „Nový“ a engine založení odmítne.
   * Text se ukáže uživateli jako důvod.
   */
  noCreate?: boolean | string;
  /** Záznamy se nemažou (neměnné doklady); UI nenabízí smazání a engine ho odmítne. Text je důvod pro uživatele. */
  noDelete?: boolean | string;
  /** Sloupce s vlastníky pro rozsah „jen moje“. */
  ownerColumns?: readonly AnyPgColumn[];
  /** Vlastní predikát rozsahu „jen moje“ (např. vedoucí nebo člen týmu). Nahrazuje `ownerColumns`. */
  scope?: (ctx: Ctx) => SQL;
  /** Vlastníci jednoho záznamu; `null`, když záznam neexistuje. Výchozí podle `ownerColumns`. */
  owners?: (db: Executor, id: string) => Promise<(string | null)[] | null>;
  /** Hodnoty, které se doplní při vytvoření, aby tvůrce s rozsahem „jen moje“ svůj záznam viděl. */
  ownerDefaults?: (ctx: Ctx) => Record<string, unknown>;
  /** Úprava hodnot těsně před vložením (číslo zakázky, výchozí stav…). Běží v transakci. */
  beforeCreate?: (ctx: Ctx, values: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /**
   * Kontrola a úprava změny těsně před zápisem (v téže transakci). Dostane řádek před změnou a sloupce, které se
   * mění (klíč = sloupec tabulky). Výjimka změnu zamítne (např. přechod fáze zakázky bez splněných podmínek);
// … (zkráceno, celá deklarace je ve zdroji)
```

### EntityPolicy

type · `packages/core/src/entities/policy.ts`

Pravidla přístupu k záznamům jednoho typu (zakázka, firma, stroj…). Komentáře, úkoly a soubory
se vážou na libovolný záznam, proto se jejich oprávnění odvozují od záznamu, ke kterému patří.
Moduly svou politiku registrují (ve fázi 3 ji nahradí registr entit).

```ts
type EntityPolicy = {
  entityType: string;
  /** Oprávnění k čtení záznamu. */
  read: string;
  /** Oprávnění k úpravě záznamu (přidání souboru, změna). */
  write: string;
  /** Vlastníci záznamu pro rozsah `own`; `null`, když záznam neexistuje. */
  owners(db: Executor, id: string): Promise<{ ownerIds: (string | null)[] } | null>;
  /** Odkaz na záznam v aplikaci (pro upozornění). */
  url?: (id: string) => string;
};
```

### EntityRegistry

type · `packages/core/src/entities/engine.ts`

_Bez popisu._

```ts
type EntityRegistry = {
  get(key: string): EntityDef | undefined;
  all(): EntityDef[];
};
```

### FilterGroup

type · `packages/core/src/entities/operators.ts`

_Bez popisu._

```ts
type FilterGroup = { op: "and" | "or"; conditions: (Condition | FilterGroup)[] };
```

### GroupRow

type · `packages/core/src/entities/engine.ts`

_Bez popisu._

```ts
type GroupRow = {
  value: string | boolean | null;
  count: number;
  sums: Record<string, number>;
};
```

### Labels

type · `packages/core/src/entities/types.ts`

Popisky odkazovaných záznamů: `labels[atribut][id]`.

```ts
type Labels = Record<string, Record<string, { label: string; color?: string }>>;
```

### Operator

type · `packages/core/src/entities/operators.ts`

_Bez popisu._

```ts
type Operator = (typeof OPERATORS)[number];
```

### PhaseTransition

type · `packages/core/src/entities/phase-hooks.ts`

Hook přechodu fáze záznamu (zakázka: poptávka → nabídka → … → uzavřeno). Moduly je dodávají přes `phaseHooks`
v serverové části; entita (`beforeUpdate`/`afterUpdate`) je pouští při změně fáze. Hook patří modulu, který
zná důsledek přechodu (rozpočet zamkne nabídku, realizace otevře deník…), entita o nich nic neví.

```ts
type PhaseTransition = { from: string; to: string };
```

### PhaseTransitionHook

type · `packages/core/src/entities/phase-hooks.ts`

_Bez popisu._

```ts
type PhaseTransitionHook = {
  /** Stabilní jméno pro logy a testy (`budget.lock-offer`). */
  id: string;
  /** Typ záznamu (`job`). */
  entity: string;
  /** Cílové fáze, pro které hook platí; `"*"` = všechny. */
  to: readonly string[];
  /** Výchozí fáze, pro které hook platí; bez ní platí pro všechny. */
  from?: readonly string[];
  /** Kontrola před přechodem; vrátí českou větu, proč přechod nejde (prázdné = v pořádku). Běží v transakci. */
  check?: (
    ctx: Ctx,
    row: Record<string, unknown>,
    transition: PhaseTransition,
  ) => Promise<string | null>;
  /** Automatická akce těsně před zápisem nové fáze (v téže transakci). */
  run?: (ctx: Ctx, row: Record<string, unknown>, transition: PhaseTransition) => Promise<void>;
  /** Automatická akce po zápisu nové fáze (v téže transakci), kdy už řádek nese novou fázi. */
  after?: (ctx: Ctx, row: Record<string, unknown>, transition: PhaseTransition) => Promise<void>;
  /**
   * Kontrola při každé změně stavu, i uvnitř jedné fáze (u `check` jde jen o změnu fáze). `row` je řádek sloučený
   * s probíhající změnou. Česká věta = změna nejde. Hook s touto kontrolou uvede `to: ["*"]`.
   */
  checkStage?: (
    ctx: Ctx,
    row: Record<string, unknown>,
    change: StageChange,
  ) => Promise<string | null>;
  /** Po zápisu změny stavu (v téže transakci); při založení záznamu s `fromStageId: null`. */
  afterStage?: (ctx: Ctx, row: Record<string, unknown>, change: StageChange) => Promise<void>;
  /**
   * Po každé změně záznamu, která mění údaje sloužící obchodu (stav, cena, pravděpodobnost, archiv), a po přepočtu
   * souhrnu zakázky. Dostane řádek před a po změně; slouží k přepočtu odvozených údajů (CRM).
   */
  afterChange?: (
    ctx: Ctx,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ) => Promise<void>;
};
```

### QueryInput

type · `packages/core/src/entities/engine.ts`

_Bez popisu._

```ts
type QueryInput = z.input<typeof queryInput>;
```

### RecordRow

type · `packages/core/src/entities/types.ts`

Řádek záznamu: `id`, `updatedAt` (ISO) a hodnoty podle klíče atributu.

```ts
type RecordRow = { id: string; updatedAt: string; [attributeKey: string]: unknown };
```

### ResolvedEntity

type · `packages/core/src/entities/engine.ts`

Entita se zjištěnými vlastními poli (z administrace) připravená k dotazům.

```ts
type ResolvedEntity = {
  def: EntityDef;
  attributes: AttributeDef[];
  byKey: Map<string, AttributeDef>;
  columns: Record<string, AnyPgColumn>;
  customColumn: AnyPgColumn | undefined;
};
```

### SearchHit

type · `packages/core/src/entities/search.ts`

_Bez popisu._

```ts
type SearchHit = {
  entityType: string;
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
  label: string;
};
```

### StageChange

type · `packages/core/src/entities/phase-hooks.ts`

Změna stavu (pipeline) záznamu; platí i pro přesun uvnitř jedné fáze. `fromStageId` je `null` při založení.

```ts
type StageChange = {
  fromStageId: string | null;
  toStageId: string;
  fromPhase: string | null;
  toPhase: string | null;
};
```

### TimelineItem

type · `packages/core/src/entities/activity.ts`

_Bez popisu._

```ts
type TimelineItem =
  | {
      kind: "audit";
      id: string;
      at: string;
      actor: string;
      action: string;
      summary: string | null;
      changes: AuditChange[];
    }
  | {
      kind: "comment";
      id: string;
      at: string;
      actor: string;
      actorId: string;
      body: string;
      edited: boolean;
    };
```

### UpdateOptions

type · `packages/core/src/entities/engine.ts`

_Bez popisu._

```ts
type UpdateOptions = {
  /** Čas poslední úpravy, ze kterého uživatel vycházel; při neshodě se změna odmítne (kolize úprav). */
  expectedUpdatedAt?: string;
};
```
