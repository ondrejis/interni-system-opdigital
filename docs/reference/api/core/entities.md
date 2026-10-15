# @rebar/core/entities

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/entities` (soubor `packages/core/src/entities/index.ts`). Exportů: 94, z toho s popisem 67.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`aggregateRecords`](#aggregaterecords) | function | Agregace entity. Oprávnění a viditelnost řádků hlídá stejná datová vrstva jako seznam: bez práva ke čtení entity chyba, rozsah „jen moje“ zúží řádky, atributy skryté oprávněním (ceny, marže) pro aktéra neexistují, takže se nedají sečíst ani změnou definice widgetu. |  |
| [`applyEntityExtensions`](#applyentityextensions) | function | Z položek `entities` všech modulů (definice i rozšíření) složí definice: háčky rozšíření se zřetězí za háčky entity v pořadí, v jakém moduly přicházejí. Rozšíření entity, která není v sestavě, se přeskočí. |  |
| [`assertAssignable`](#assertassignable) | function | Ověří, že záznam jde přiřadit danému uživateli (řešitel úkolu, vlastník obchodu…): soukromý záznam smí dostat jen uživatel s oprávněním `private.read`, jinak vyhodí `PrivateAssignmentError` (kód `private_assign`; UI nabídne „Zveřejnit a přiřadit“). Volající, který soukromý záznam sám nevidí, dostane `NotFoundError`. |  |
| [`assertEntityAccess`](#assertentityaccess) | function | Ověří, že aktér smí se záznamem pracovat. Neznámý typ záznamu se odmítne (bezpečné výchozí chování), záznam, který aktér nesmí vidět (cizí v rozsahu „jen moje“, soukromý bez `private.read`), se tváří jako neexistující. Vrací politiku a zámek záznamu (`isPrivate`), aby vedlejší záznamy (komentář, soubor) mohly zapsat audit jako soukromý. |  |
| [`canSeePrivate`](#canseeprivate) | function | Smí aktér vidět soukromé záznamy (zámek)? Jen s oprávněním `private.read`, které má vlastník (role `owner`) a které nejde přidělit jiné roli. Partner nikdy; systémový aktér (úlohy, n8n) ano. |  |
| [`childLinks`](#childlinks) | function | Děti entity `key`: sloupce z `EntityDef.children` (včetně tabulek, které nejsou entity) a sloupce, kterými na ni odkazují jiné entity přes `visibility.parents`. Chybí-li cílová entita (modul není zapnutý), vazba se přeskočí. |  |
| [`clearEntityPolicies`](#clearentitypolicies) | function | Pro testy. |  |
| [`countActive`](#countactive) | function | Spočítá nesmazané řádky tabulky (`deleted_at is null`) splňující podmínky; pomocník pro `DeleteBlocker.count`. |  |
| [`createEntityRegistry`](#createentityregistry) | function |  |  |
| [`createRecord`](#createrecord) | function | Založí záznam. Bez zadaných hodnot se doplní výchozí; povinné atributy se kontrolují. Entita se zámkem: hodnota `isPrivate` (jen se `private.read`) určí, zda je záznam soukromý; tvůrce bez `private.read` zakládá vždy sdílené, dítě soukromého rodiče je soukromé samo. |  |
| [`defineEntity`](#defineentity) | function |  |  |
| [`deleteBlockMessage`](#deleteblockmessage) | function | Vrátí českou větu, proč záznam nejde smazat („Firma má 3 zakázky a 2 faktury; nejdřív je přesuňte nebo smažte.“), nebo `null`, když nic nebrání. `label` je název typu záznamu v 1. pádu („Firma“). |  |
| [`deleteRecord`](#deleterecord) | function | Smaže záznam (měkce, do koše na 30 dní). Smaže se i všechno podřízené (`children`), které záznam má: jedna dávka (`deleted_batch` = id záznamu), takže obnova vrátí celou dávku. |  |
| [`describeEntity`](#describeentity) | function | Popis entity pro prohlížeč: atributy (včetně vlastních polí), stavy pipeline a to, co aktér smí. |  |
| [`extendEntity`](#extendentity) | function | Doplní k entitě jiného modulu háčky (např. `klienti` hlídá změnu `name` a `services` u `company`) bez zásahu do jejího modulu. Použití: `entities: [extendEntity("company", { afterUpdate })]` v `server.ts`. Háček rozšíření běží až po háčku entity samotné; chybí-li cílová entita (modul není zapnutý), rozšíření se tiše přeskočí. |  |
| [`findActiveRegistry`](#findactiveregistry) | function | Registr entit, nebo `undefined`, když ještě není sestavený. |  |
| [`getActiveRegistry`](#getactiveregistry) | function | Registr entit zapnutých modulů; mimo sestavenou aplikaci (a bez `registerEntityPolicies`) vyhodí chybu. |  |
| [`getEntityPolicy`](#getentitypolicy) | function |  |  |
| [`getRecord`](#getrecord) | function | Jeden záznam. Záznam, který aktér nesmí vidět, se tváří jako neexistující. |  |
| [`getRecordActivity`](#getrecordactivity) | function | Vše, co se kolem záznamu děje: časová osa (změny z auditu a komentáře) a soubory. Smí ji číst ten, kdo záznam vidí. S `def` entity se z auditu vynechají peníze a skryté atributy (viz `visibleAudit`). |  |
| [`hasPrivateParent`](#hasprivateparent) | function | Je některý z rodičů záznamu soukromý? `values` jsou hodnoty záznamu pod názvy vlastností tabulky (`jobId`…). Rodiče, kteří nejsou v registru (modul není zapnutý), se přeskočí. |  |
| [`hasVisibility`](#hasvisibility) | function | Entita má zámek (shared/private)? Stačí `visibility` v definici; sloupce hlídá `createEntityRegistry`. |  |
| [`indexRecord`](#indexrecord) | function | Zapíše záznam do indexu pro hledání (ve stejné transakci jako změna záznamu). |  |
| [`isEntityExtension`](#isentityextension) | function | Je položka seznamu `entities` rozšířením (`extendEntity`), ne definicí entity? |  |
| [`isPrivateRecord`](#isprivaterecord) | function | Je záznam právě soukromý? Čte tabulku `private_record`, takže nepotřebuje znát tabulku entity. |  |
| [`notPrivateRecord`](#notprivaterecord) | function | Anti-join na soukromé záznamy pro dotazy napříč entitami (komentáře, soubory, historie), které mají jen dvojici `typ + id` záznamu: vlastník vidí vše (`undefined`), ostatní jen řádky, jejichž záznam není v `private_record`. |  |
| [`parentLinks`](#parentlinks) | function | Rodiče entity z `visibility.parents`, jejichž entita je v registru. |  |
| [`phaseHooksFor`](#phasehooksfor) | function |  |  |
| [`phoneKeysInText`](#phonekeysintext) | function | Klíče telefonů, které se najdou v textu záznamu (`search_document.search_text`): každé číslo dostane klíč z `phoneSearchKeys` (posledních 9 číslic), takže „777 12“ nebo „77712“ najde „+420 777 123 456“, i když je číslo zapsané s mezerami nebo předvolbou. Text bez telefonu vrací prázdné pole. |  |
| [`phoneQueryKey`](#phonequerykey) | function | Klíč pro hledání telefonu z dotazu v paletě, nebo `null`, když dotaz na telefon nevypadá (obsahuje písmena nebo má méně než tři číslice). Předvolba (`+420`, `00420`, `+421`) se ignoruje, takže hledání „+420 777 12“ najde totéž jako „777 12“; číslo delší než devět číslic se zkrátí na posledních devět (jako při indexaci). |  |
| [`privateScope`](#privatescope) | function | Podmínka do `WHERE` pro každý ruční dotaz nad tabulkou se zámkem (widget, metrika, vrstva, „vyžaduje pozornost“, služba): vlastník (`private.read`) vidí vše (`undefined`), ostatní jen záznamy, které nejsou soukromé. Entity z registru ji dostávají samy (`queryRecords`, agregace…), ručně ji potřebuje jen kód, který čte tabulky přímo. |  |
| [`queryGroups`](#querygroups) | function | Skupiny podle atributu (počet a součty) — záhlaví skupin v tabulce a sloupce kanbanu. |  |
| [`queryRecords`](#queryrecords) | function | Stránka záznamů: řádky, celkový počet, součty za celou filtrovanou sadu a popisky odkazů. |  |
| [`recordOwners`](#recordowners) | function | Zjistí vlastníky záznamu bez ověřování oprávnění — pro politiku přístupu komentářů, úkolů a souborů. |  |
| [`recordTitles`](#recordtitles) | function | Názvy záznamů podle id (např. zakázky u řádků docházky) bez oprávnění a bez závislosti na modulu entity: když entita v registru není (modul vypnutý), vrátí prázdný objekt. Jen pro popisky; data záznamu to nevydá. První parametr je kontext aktéra (soukromé záznamy se pak pro toho, kdo je nesmí vidět, ukážou jako „Soukromý záznam“), nebo samotná databáze (úlohy a interní použití, bez maskování). |  |
| [`registerEntityPolicies`](#registerentitypolicies) | function | Zaregistruje politiky přístupu všech entit (komentáře, úkoly a soubory se řídí oprávněním k záznamu). |  |
| [`registerEntityPolicy`](#registerentitypolicy) | function |  |  |
| [`reindexEntity`](#reindexentity) | function | Znovu zaindexuje všechny záznamy entity (po změně vlastních polí: nový popisek možnosti, skryté nebo smazané pole). Po dávkách, aby se nenačetla celá tabulka najednou. |  |
| [`removeFromIndex`](#removefromindex) | function |  |  |
| [`resolveEntity`](#resolveentity) | function | Přidá vlastní pole z administrace jako další atributy entity. |  |
| [`restoreRecord`](#restorerecord) | function | Obnoví smazaný záznam i s podřízenými záznamy, které smazala tatáž dávka. Vyžaduje právo zápisu v rozsahu „vše“ (smazaný záznam už vlastníky nepozná); soukromý záznam obnoví jen ten, kdo ho smí vidět. |  |
| [`searchAll`](#searchall) | function | Hledání napříč entitami (Cmd+K) bez ohledu na diakritiku a velikost písmen; telefon bez ohledu na mezery a předvolbu („777 12“ najde „+420 777 123 456“). Kandidáty vybere trigramový index, potom se každý ověří proti oprávnění, rozsahu a zámku aktéra (`privateScope`), takže v nálezech jsou jen záznamy, které smí vidět. Výsledky jsou seřazené: shoda začátku názvu, pak podobnost; z jednoho typu nejvýše `perType` (skupiny v paletě). |  |
| [`setActiveRegistry`](#setactiveregistry) | function | Zapamatuje registr entit pro funkce, které ho nedostávají jako parametr. |  |
| [`setDeleteBlockers`](#setdeleteblockers) | function | Nahradí zaregistrované blokace (volá se při sestavení zapnutých modulů, tedy i v testech a ve workeru). |  |
| [`setPhaseHooks`](#setphasehooks) | function | Nahradí zaregistrované hooky (volá se při sestavení zapnutých modulů, tedy i v testech a ve workeru). |  |
| [`setVisibility`](#setvisibility) | function | Přepne záznam mezi sdíleným a soukromým (zámek). Smí jen aktér s `private.read` (vlastník). Soukromý záznam zamkne i děti (`children`, `visibility.parents` jiných entit): sdílené děti se stanou soukromými (`inherited`); zveřejnění zveřejní jen děti se zděděným zámkem, děti s vlastním zámkem (`own`) zůstanou soukromé. Dítě soukromého rodiče ani záznam bez rodiče, který musí být soukromý (platba bez zakázky), zveřejnit nejde. Vše v jedné transakci, zapíše se do historie (`visibility_changed`, hodnota po změně) a vyšle událost `visibility.changed`. |  |
| [`stageHooksFor`](#stagehooksfor) | function | Hooky záznamu, které reagují na změnu stavu nebo na změnu údajů (ne jen na přechod fáze). |  |
| [`syncPrivateRecord`](#syncprivaterecord) | function | Udržuje `private_record` (řádek jen u právě soukromých záznamů); volat v téže transakci jako změnu zámku. |  |
| [`updateRecord`](#updaterecord) | function | Změna atributů záznamu (inline editace). Oprávnění zápisu se ověřuje pro konkrétní záznam. |  |
| [`visibilityForInsert`](#visibilityforinsert) | function | Hodnoty `is_private` a `visibility_source` pro nový záznam entity: tvůrce bez `private.read` založí vždy sdílený (pokus o soukromý je chyba), s `private.read` se bere `requested`, jinak `defaultPrivate`; dítě soukromého rodiče (a platba bez zakázky) je soukromé (`inherited`). Pro moduly, které řádky zakládají přímo (`insert`), místo enginu. `values` jsou hodnoty nového řádku pod názvy vlastností tabulky. |  |
| [`visibleIds`](#visibleids) | function | Id záznamů, které aktér vidí (s oprávněním a rozsahem, bez smazaných), případně zúžená filtrem. Pro moduly, které z dat jiné entity potřebují jen „kterých se týká“ (fáze viditelných zakázek, vady…); strop chrání paměť. |  |
| [`visibleRecordTitles`](#visiblerecordtitles) | function | Názvy záznamů podle id jen z těch záznamů, které aktér smí vidět (oprávnění i rozsah „jen moje“). Cizí záznam se v popisku neobjeví, takže montér nepozná název zakázky, ke které nepatří. Pro popisky u řádků docházky, skladu, strojů a kalendáře; místo `recordTitles` všude, kde odpověď čte uživatel s omezeným rozsahem. |  |
| [`visibleTo`](#visibleto) | function | Entita zúžená na atributy, které aktér smí vidět (`AttributeDef.permission`). Skryté atributy pak pro aktéra neexistují: nejsou v řádcích, součtech, filtrech ani řazení a nejdou zapsat (neznámý atribut). |  |
| [`writeSystemFields`](#writesystemfields) | function | Zapíše systémová pole záznamu: sloupce, které nepíše uživatel, ale jiný modul nebo úloha (`drive_folder_id`, `next_activity_at`, `marketing_stage`…). Povolené jsou jen sloupce deklarované v `EntityDef.systemFields`; názvy lze zadat jako vlastnost tabulky (`driveFolderId`) i jako sloupec (`drive_folder_id`). Změna se zapíše do auditu (`actorLabel` = kdo ji způsobil: „n8n“, „Google“, „Systém“…) a záznam se znovu zaindexuje. Volat v transakci (`inTx`). Chybí-li entita v registru (modul není zapnutý), nic se neděje a vrátí `false`; jinak vrací, zda se hodnota změnila. |  |
| [`PrivateAssignmentError`](#privateassignmenterror) | class | Soukromý záznam se nesmí přiřadit uživateli, který soukromé záznamy nevidí (VID-06). Kód `private_assign`. |  |
| [`AGGREGATABLE_TYPES`](#aggregatable_types) | const |  |  |
| [`AGG_MAX_GROUPS`](#agg_max_groups) | const |  |  |
| [`ATTRIBUTE_TYPES`](#attribute_types) | const | Typy atributů záznamů. Z typu plyne editor v buňce, dostupné filtry, řazení i validace. |  |
| [`GROUPABLE_TYPES`](#groupable_types) | const | Atributy, které se smí seskupovat (pro editor widgetů i kontrolu na serveru). |  |
| [`OPERATORS`](#operators) | const |  |  |
| [`OPERATORS_BY_TYPE`](#operators_by_type) | const | Operátory dostupné pro typ atributu (z toho se staví nabídka ve filtru). |  |
| [`PRIVATE_LABEL`](#private_label) | const | Čeho se týká „Soukromý záznam“ v popiscích odkazů, které aktér nesmí vidět. |  |
| [`filterGroupSchema`](#filtergroupschema) | const |  |  |
| [`queryInput`](#queryinput) | const |  |  |
| [`AggregateGroup`](#aggregategroup) | type |  |  |
| [`AggregateResult`](#aggregateresult) | type |  |  |
| [`AggregateSpec`](#aggregatespec) | type | Dotaz „spočítej / sečti / zprůměruj … seskupeně“ nad entitou. Základ widgetů vlastních nástěnek (žádné ruční SQL). |  |
| [`AttributeDef`](#attributedef) | type |  |  |
| [`AttributeType`](#attributetype) | type |  |  |
| [`ChildLink`](#childlink) | type | Dítě záznamu: tabulka, jejíž sloupec `fkName` odkazuje na `id` rodiče. `def` je u dětí, které jsou entity. |  |
| [`Choice`](#choice) | type |  |  |
| [`Condition`](#condition) | type |  |  |
| [`DeleteBlocker`](#deleteblocker) | type | Blokace smazání záznamu, který má navázané záznamy jiných modulů (firma se zakázkou a fakturou, zakázka s vystavenou fakturou…). Entita o cizích tabulkách nic neví: každý modul dodá `deleteBlockers` pro typy záznamů, na které odkazuje, a `deleteRecord` je před smazáním vyhodnotí. Počítají se jen nesmazané záznamy. |  |
| [`EntityDef`](#entitydef) | type |  |  |
| [`EntityExtension`](#entityextension) | type | Rozšíření cizí entity o háčky; vyrábí `extendEntity`, skládá `applyEntityExtensions` (`collectServers`). |  |
| [`EntityHooks`](#entityhooks) | type | Háčky, které modul doplní k cizí entitě (`extendEntity`). Stejné významy jako u `EntityDef`. |  |
| [`EntityLink`](#entitylink) | type | Vazba záznamu na jiný typ záznamu přes sloupec (rodič pro dědění zámku, dítě pro kaskádu koše a obnovy). `column` je název vlastnosti tabulky (camelCase, např. `dealId`). U dítěte, které není entita (`job_phase`, `deal_participant`), je `entityType` jen označení a `table` je jeho tabulka (C1 přes ni kaskáduje zámek a koš). |  |
| [`EntityPolicy`](#entitypolicy) | type | Pravidla přístupu k záznamům jednoho typu (zakázka, firma, stroj…). Komentáře, úkoly a soubory se vážou na libovolný záznam, proto se jejich oprávnění odvozují od záznamu, ke kterému patří. Moduly svou politiku registrují (ve fázi 3 ji nahradí registr entit). |  |
| [`EntityRegistry`](#entityregistry) | type |  |  |
| [`FilterGroup`](#filtergroup) | type |  |  |
| [`GroupRow`](#grouprow) | type |  |  |
| [`Labels`](#labels) | type | Popisky odkazovaných záznamů: `labels[atribut][id]`. |  |
| [`Operator`](#operator) | type |  |  |
| [`ParentLink`](#parentlink) | type | Rodič záznamu: entita a sloupec, kterým na ni záznam odkazuje (z `visibility.parents`). |  |
| [`PhaseTransition`](#phasetransition) | type | Hook přechodu fáze záznamu (zakázka: poptávka → nabídka → … → uzavřeno). Moduly je dodávají přes `phaseHooks` v serverové části; entita (`beforeUpdate`/`afterUpdate`) je pouští při změně fáze. Hook patří modulu, který zná důsledek přechodu (rozpočet zamkne nabídku, realizace otevře deník…), entita o nich nic neví. |  |
| [`PhaseTransitionHook`](#phasetransitionhook) | type |  |  |
| [`QueryInput`](#queryinput) | type |  |  |
| [`QuickFilterDef`](#quickfilterdef) | type | Rychlá předvolba filtru nad seznamem (Moje, Dnes, Po termínu…); zobrazuje C3. |  |
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

### applyEntityExtensions

function · `packages/core/src/entities/extend.ts`

Z položek `entities` všech modulů (definice i rozšíření) složí definice: háčky rozšíření se zřetězí za háčky entity
v pořadí, v jakém moduly přicházejí. Rozšíření entity, která není v sestavě, se přeskočí.

```ts
function applyEntityExtensions(items: readonly (EntityDef | EntityExtension)[]): EntityDef[]
```

### assertAssignable

function · `packages/core/src/entities/visibility.ts`

Ověří, že záznam jde přiřadit danému uživateli (řešitel úkolu, vlastník obchodu…): soukromý záznam smí dostat jen
uživatel s oprávněním `private.read`, jinak vyhodí `PrivateAssignmentError` (kód `private_assign`; UI nabídne
„Zveřejnit a přiřadit“). Volající, který soukromý záznam sám nevidí, dostane `NotFoundError`.

```ts
async function assertAssignable(ctx: Ctx, entityKey: string, id: string, userId: string): Promise<void>
```

### assertEntityAccess

function · `packages/core/src/entities/policy.ts`

Ověří, že aktér smí se záznamem pracovat. Neznámý typ záznamu se odmítne (bezpečné výchozí chování),
záznam, který aktér nesmí vidět (cizí v rozsahu „jen moje“, soukromý bez `private.read`), se tváří jako neexistující.
Vrací politiku a zámek záznamu (`isPrivate`), aby vedlejší záznamy (komentář, soubor) mohly zapsat audit jako soukromý.

```ts
async function assertEntityAccess(ctx: Ctx, entityType: string, entityId: string, mode: "read" | "write" = "read"): Promise<EntityPolicy & { isPrivate: boolean }>
```

### canSeePrivate

function · `packages/core/src/rbac/permissions.ts`

Smí aktér vidět soukromé záznamy (zámek)? Jen s oprávněním `private.read`, které má vlastník (role `owner`) a které
nejde přidělit jiné roli. Partner nikdy; systémový aktér (úlohy, n8n) ano.

```ts
function canSeePrivate(ctx: Ctx): boolean
```

### childLinks

function · `packages/core/src/entities/links.ts`

Děti entity `key`: sloupce z `EntityDef.children` (včetně tabulek, které nejsou entity) a sloupce, kterými na ni
odkazují jiné entity přes `visibility.parents`. Chybí-li cílová entita (modul není zapnutý), vazba se přeskočí.

```ts
function childLinks(registry: LinkRegistry, key: string): ChildLink[]
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

Založí záznam. Bez zadaných hodnot se doplní výchozí; povinné atributy se kontrolují. Entita se zámkem: hodnota
`isPrivate` (jen se `private.read`) určí, zda je záznam soukromý; tvůrce bez `private.read` zakládá vždy sdílené,
dítě soukromého rodiče je soukromé samo.

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

Smaže záznam (měkce, do koše na 30 dní). Smaže se i všechno podřízené (`children`), které záznam má: jedna dávka
(`deleted_batch` = id záznamu), takže obnova vrátí celou dávku.

```ts
async function deleteRecord(ctx: Ctx, e: ResolvedEntity, id: string): Promise<void>
```

### describeEntity

function · `packages/core/src/entities/describe.ts`

Popis entity pro prohlížeč: atributy (včetně vlastních polí), stavy pipeline a to, co aktér smí.

```ts
async function describeEntity(ctx: Ctx, db: Executor, e: ResolvedEntity, registry?: EntityRegistry): Promise<EntityDescriptor>
```

### extendEntity

function · `packages/core/src/entities/extend.ts`

Doplní k entitě jiného modulu háčky (např. `klienti` hlídá změnu `name` a `services` u `company`) bez zásahu do
jejího modulu. Použití: `entities: [extendEntity("company", { afterUpdate })]` v `server.ts`. Háček rozšíření běží
až po háčku entity samotné; chybí-li cílová entita (modul není zapnutý), rozšíření se tiše přeskočí.

```ts
function extendEntity(key: string, hooks: EntityHooks): EntityExtension
```

### findActiveRegistry

function · `packages/core/src/entities/active-registry.ts`

Registr entit, nebo `undefined`, když ještě není sestavený.

```ts
function findActiveRegistry(): EntityRegistry | undefined
```

### getActiveRegistry

function · `packages/core/src/entities/active-registry.ts`

Registr entit zapnutých modulů; mimo sestavenou aplikaci (a bez `registerEntityPolicies`) vyhodí chybu.

```ts
function getActiveRegistry(): EntityRegistry
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

Vše, co se kolem záznamu děje: časová osa (změny z auditu a komentáře) a soubory.
Smí ji číst ten, kdo záznam vidí. S `def` entity se z auditu vynechají peníze a skryté atributy (viz `visibleAudit`).

```ts
async function getRecordActivity(ctx: Ctx, entityType: string, id: string, def?: Pick<EntityDef, "attributes">): Promise<{ timeline: TimelineItem[]; files: { takenAt: string | null; createdAt: string; id: string; fileId: string; name: string; mime: string; size: number; kind: string; width: number | null; height: number | null; hasThumb: boolean; geo…
```

### hasPrivateParent

function · `packages/core/src/entities/visibility.ts`

Je některý z rodičů záznamu soukromý? `values` jsou hodnoty záznamu pod názvy vlastností tabulky (`jobId`…).
Rodiče, kteří nejsou v registru (modul není zapnutý), se přeskočí.

```ts
async function hasPrivateParent(db: Executor, registry: LinkRegistry, def: EntityDef, values: Row): Promise<boolean>
```

### hasVisibility

function · `packages/core/src/entities/links.ts`

Entita má zámek (shared/private)? Stačí `visibility` v definici; sloupce hlídá `createEntityRegistry`.

```ts
function hasVisibility(def: EntityDef): boolean
```

### indexRecord

function · `packages/core/src/entities/search.ts`

Zapíše záznam do indexu pro hledání (ve stejné transakci jako změna záznamu).

```ts
async function indexRecord(db: Executor, e: Indexed, raw: Record<string, unknown>): Promise<void>
```

### isEntityExtension

function · `packages/core/src/entities/extend.ts`

Je položka seznamu `entities` rozšířením (`extendEntity`), ne definicí entity?

```ts
function isEntityExtension(x: EntityDef | EntityExtension): x is EntityExtension
```

### isPrivateRecord

function · `packages/core/src/entities/visibility.ts`

Je záznam právě soukromý? Čte tabulku `private_record`, takže nepotřebuje znát tabulku entity.

```ts
async function isPrivateRecord(db: Executor, entityType: string, id: string): Promise<boolean>
```

### notPrivateRecord

function · `packages/core/src/entities/visibility.ts`

Anti-join na soukromé záznamy pro dotazy napříč entitami (komentáře, soubory, historie), které mají jen dvojici
`typ + id` záznamu: vlastník vidí vše (`undefined`), ostatní jen řádky, jejichž záznam není v `private_record`.

```ts
function notPrivateRecord(ctx: Ctx, entityType: AnyPgColumn | SQL, entityId: AnyPgColumn | SQL): SQL | undefined
```

### parentLinks

function · `packages/core/src/entities/links.ts`

Rodiče entity z `visibility.parents`, jejichž entita je v registru.

```ts
function parentLinks(registry: LinkRegistry, def: EntityDef): ParentLink[]
```

### phaseHooksFor

function · `packages/core/src/entities/phase-hooks.ts`

_Bez popisu._

```ts
function phaseHooksFor(entity: string, t: PhaseTransition): PhaseTransitionHook[]
```

### phoneKeysInText

function · `packages/core/src/entities/phone-index.ts`

Klíče telefonů, které se najdou v textu záznamu (`search_document.search_text`): každé číslo dostane klíč z
`phoneSearchKeys` (posledních 9 číslic), takže „777 12“ nebo „77712“ najde „+420 777 123 456“, i když je číslo zapsané
s mezerami nebo předvolbou. Text bez telefonu vrací prázdné pole.

```ts
function phoneKeysInText(text: string): string[]
```

### phoneQueryKey

function · `packages/core/src/entities/phone-index.ts`

Klíč pro hledání telefonu z dotazu v paletě, nebo `null`, když dotaz na telefon nevypadá (obsahuje písmena nebo má
méně než tři číslice). Předvolba (`+420`, `00420`, `+421`) se ignoruje, takže hledání „+420 777 12“ najde totéž
jako „777 12“; číslo delší než devět číslic se zkrátí na posledních devět (jako při indexaci).

```ts
function phoneQueryKey(query: string): string | null
```

### privateScope

function · `packages/core/src/entities/visibility.ts`

Podmínka do `WHERE` pro každý ruční dotaz nad tabulkou se zámkem (widget, metrika, vrstva, „vyžaduje pozornost“, služba):
vlastník (`private.read`) vidí vše (`undefined`), ostatní jen záznamy, které nejsou soukromé. Entity z registru ji
dostávají samy (`queryRecords`, agregace…), ručně ji potřebuje jen kód, který čte tabulky přímo.

```ts
function privateScope(ctx: Ctx, table: { isPrivate: AnyPgColumn }): SQL | undefined
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
async function recordOwners(db: Executor, e: ResolvedEntity, id: string): Promise<{ ownerIds: (string | null)[]; isPrivate: boolean; } | null>
```

### recordTitles

function · `packages/core/src/entities/engine.ts`

Názvy záznamů podle id (např. zakázky u řádků docházky) bez oprávnění a bez závislosti na modulu entity: když entita
v registru není (modul vypnutý), vrátí prázdný objekt. Jen pro popisky; data záznamu to nevydá. První parametr je
kontext aktéra (soukromé záznamy se pak pro toho, kdo je nesmí vidět, ukážou jako „Soukromý záznam“), nebo samotná
databáze (úlohy a interní použití, bez maskování).

```ts
async function recordTitles(viewer: Executor | Ctx, registry: EntityRegistry, entityKey: string, ids: readonly string[]): Promise<Record<string, string>>
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

Obnoví smazaný záznam i s podřízenými záznamy, které smazala tatáž dávka. Vyžaduje právo zápisu v rozsahu „vše“
(smazaný záznam už vlastníky nepozná); soukromý záznam obnoví jen ten, kdo ho smí vidět.

```ts
async function restoreRecord(ctx: Ctx, e: ResolvedEntity, id: string): Promise<void>
```

### searchAll

function · `packages/core/src/entities/search.ts`

Hledání napříč entitami (Cmd+K) bez ohledu na diakritiku a velikost písmen; telefon bez ohledu na mezery a předvolbu
(„777 12“ najde „+420 777 123 456“). Kandidáty vybere trigramový index, potom se každý ověří proti oprávnění, rozsahu
a zámku aktéra (`privateScope`), takže v nálezech jsou jen záznamy, které smí vidět. Výsledky jsou seřazené: shoda
začátku názvu, pak podobnost; z jednoho typu nejvýše `perType` (skupiny v paletě).

```ts
async function searchAll(ctx: Ctx, defs: readonly EntityDef[], query: string, limit = 12, opts: { perType?: number } = {}): Promise<SearchHit[]>
```

### setActiveRegistry

function · `packages/core/src/entities/active-registry.ts`

Zapamatuje registr entit pro funkce, které ho nedostávají jako parametr.

```ts
function setActiveRegistry(registry: EntityRegistry | undefined): void
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

### setVisibility

function · `packages/core/src/entities/visibility.ts`

Přepne záznam mezi sdíleným a soukromým (zámek). Smí jen aktér s `private.read` (vlastník). Soukromý záznam zamkne
i děti (`children`, `visibility.parents` jiných entit): sdílené děti se stanou soukromými (`inherited`); zveřejnění
zveřejní jen děti se zděděným zámkem, děti s vlastním zámkem (`own`) zůstanou soukromé. Dítě soukromého rodiče ani
záznam bez rodiče, který musí být soukromý (platba bez zakázky), zveřejnit nejde. Vše v jedné transakci, zapíše se
do historie (`visibility_changed`, hodnota po změně) a vyšle událost `visibility.changed`.

```ts
async function setVisibility(ctx: Ctx, registry: LinkRegistry, entityKey: string, id: string, isPrivate: boolean): Promise<{ changed: boolean; cascaded: number }>
```

### stageHooksFor

function · `packages/core/src/entities/phase-hooks.ts`

Hooky záznamu, které reagují na změnu stavu nebo na změnu údajů (ne jen na přechod fáze).

```ts
function stageHooksFor(entity: string): PhaseTransitionHook[]
```

### syncPrivateRecord

function · `packages/core/src/entities/visibility.ts`

Udržuje `private_record` (řádek jen u právě soukromých záznamů); volat v téže transakci jako změnu zámku.

```ts
async function syncPrivateRecord(db: Executor, entityType: string, id: string, isPrivate: boolean): Promise<void>
```

### updateRecord

function · `packages/core/src/entities/engine.ts`

Změna atributů záznamu (inline editace). Oprávnění zápisu se ověřuje pro konkrétní záznam.

```ts
async function updateRecord(ctx: Ctx, registry: EntityRegistry, entity: ResolvedEntity, id: string, patch: Record<string, unknown>, opts: UpdateOptions = {}): Promise<{ row: RecordRow; labels: Labels; }>
```

### visibilityForInsert

function · `packages/core/src/entities/visibility.ts`

Hodnoty `is_private` a `visibility_source` pro nový záznam entity: tvůrce bez `private.read` založí vždy sdílený
(pokus o soukromý je chyba), s `private.read` se bere `requested`, jinak `defaultPrivate`; dítě soukromého rodiče
(a platba bez zakázky) je soukromé (`inherited`). Pro moduly, které řádky zakládají přímo (`insert`), místo enginu.
`values` jsou hodnoty nového řádku pod názvy vlastností tabulky.

```ts
async function visibilityForInsert(ctx: Ctx, registry: LinkRegistry, entityKey: string, values: Row, requested?: boolean): Promise<{ isPrivate: boolean; visibilitySource: Source }>
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

### writeSystemFields

function · `packages/core/src/entities/system-fields.ts`

Zapíše systémová pole záznamu: sloupce, které nepíše uživatel, ale jiný modul nebo úloha (`drive_folder_id`,
`next_activity_at`, `marketing_stage`…). Povolené jsou jen sloupce deklarované v `EntityDef.systemFields`; názvy
lze zadat jako vlastnost tabulky (`driveFolderId`) i jako sloupec (`drive_folder_id`). Změna se zapíše do auditu
(`actorLabel` = kdo ji způsobil: „n8n“, „Google“, „Systém“…) a záznam se znovu zaindexuje. Volat v transakci
(`inTx`). Chybí-li entita v registru (modul není zapnutý), nic se neděje a vrátí `false`; jinak vrací, zda se
hodnota změnila.

```ts
async function writeSystemFields(ctx: Ctx, registry: EntityRegistry, entityKey: string, id: string, patch: Record<string, unknown>, opts: { actorLabel?: string } = {}): Promise<boolean>
```

### PrivateAssignmentError

class · `packages/core/src/entities/visibility.ts`

Soukromý záznam se nesmí přiřadit uživateli, který soukromé záznamy nevidí (VID-06). Kód `private_assign`.

```ts
class PrivateAssignmentError extends Error {
  code;
  constructor(message = "Soukromý záznam nejde přiřadit uživateli, který soukromé záznamy nevidí. Nejdřív ho zveřejněte.");
}
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

### PRIVATE_LABEL

const · `packages/core/src/entities/visibility.ts`

Čeho se týká „Soukromý záznam“ v popiscích odkazů, které aktér nesmí vidět.

```ts
const PRIVATE_LABEL: "Soukromý záznam"
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
  /**
   * Zúžení položek číselníku `lookup` na tuto entitu (štítky: `lookup: "tag"`, `lookupScope: "company"` nabídne jen
   * štítky, jejichž `lookup_item.scopes` obsahují klíč entity nebo jsou prázdné).
   */
  lookupScope?: string;
  /** Cílový typ záznamu pro `record`. */
  record?: { entityType: string };
  /** Pipeline, ze které jsou stavy (`status`). */
  pipeline?: { entityType: string; key: string };
  readonly?: boolean;
  required?: boolean;
  /**
   * Oprávnění ke čtení atributu (např. `finance.read` u cen a plateb). Aktér bez něj atribut nevidí
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
// … (zkráceno, celá deklarace je ve zdroji)
```

### AttributeType

type · `packages/core/src/entities/types.ts`

_Bez popisu._

```ts
type AttributeType = (typeof ATTRIBUTE_TYPES)[number];
```

### ChildLink

type · `packages/core/src/entities/links.ts`

Dítě záznamu: tabulka, jejíž sloupec `fkName` odkazuje na `id` rodiče. `def` je u dětí, které jsou entity.

```ts
type ChildLink = {
  /** Klíč entity dítěte (u dětí bez entity jen označení z `EntityLink.entityType`). */
  entityType: string;
  def: EntityDef | undefined;
  table: PgTable;
  columns: Record<string, AnyPgColumn>;
  fkName: string;
  fk: AnyPgColumn;
};
```

### Choice

type · `packages/core/src/entities/types.ts`

_Bez popisu._

```ts
type Choice = {
  value: string;
  label: string;
  color?: string;
  /** Položka je archivovaná (štítek, číselník): u záznamů, které ji mají, se zobrazí, ale nenabízí se k novému výběru. */
  archived?: boolean;
};
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

### EntityExtension

type · `packages/core/src/entities/extend.ts`

Rozšíření cizí entity o háčky; vyrábí `extendEntity`, skládá `applyEntityExtensions` (`collectServers`).

```ts
type EntityExtension = { extends: string; hooks: EntityHooks };
```

### EntityHooks

type · `packages/core/src/entities/extend.ts`

Háčky, které modul doplní k cizí entitě (`extendEntity`). Stejné významy jako u `EntityDef`.

```ts
type EntityHooks = Pick<
  EntityDef,
  "beforeCreate" | "beforeUpdate" | "afterCreate" | "afterUpdate" | "beforeDelete"
>;
```

### EntityLink

type · `packages/core/src/entities/types.ts`

Vazba záznamu na jiný typ záznamu přes sloupec (rodič pro dědění zámku, dítě pro kaskádu koše a obnovy).
`column` je název vlastnosti tabulky (camelCase, např. `dealId`). U dítěte, které není entita (`job_phase`,
`deal_participant`), je `entityType` jen označení a `table` je jeho tabulka (C1 přes ni kaskáduje zámek a koš).

```ts
type EntityLink = { entityType: string; column: string; table?: PgTable };
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
  /**
   * Vlastníci záznamu pro rozsah `own` a jeho zámek (`isPrivate`, chybí-li, je záznam sdílený); `null`, když záznam
   * neexistuje.
   */
  owners(
    db: Executor,
    id: string,
  ): Promise<{ ownerIds: (string | null)[]; isPrivate?: boolean } | null>;
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

### ParentLink

type · `packages/core/src/entities/links.ts`

Rodič záznamu: entita a sloupec, kterým na ni záznam odkazuje (z `visibility.parents`).

```ts
type ParentLink = {
  entityType: string;
  def: EntityDef;
  fkName: string;
  fk: AnyPgColumn;
};
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

### QuickFilterDef

type · `packages/core/src/entities/types.ts`

Rychlá předvolba filtru nad seznamem (Moje, Dnes, Po termínu…); zobrazuje C3.

```ts
type QuickFilterDef = {
  key: string;
  label: string;
  /** Filtr, nebo funkce, která ho složí pro aktéra (např. „Moje“ = `owner = já`). */
  filter: FilterGroup | ((ctx: Ctx) => FilterGroup);
};
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
  /** Množné číslo názvu typu (nadpis skupiny v paletě). */
  labelMany: string;
  /** Telefon, e-mail a složka na Disku záznamu (akce v paletě bez otevření záznamu: zavolat, napsat, otevřít Disk). */
  phone: string | null;
  email: string | null;
  driveFolderId: string | null;
  /** Soukromý záznam (vidí ho jen ten, kdo smí vidět soukromé). */
  isPrivate: boolean;
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
