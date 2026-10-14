# @rebar/zakazky

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/zakazky` (soubor `packages/modules/zakazky/src/index.ts`). Exportů: 33, z toho s popisem 19.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`allowedNext`](phases.md#allowednext) | function | Fáze, do kterých se z `from` smí přejít (u pozastavení včetně návratu do `pausedFrom`). | v `@rebar/zakazky/phases` |
| [`canTransition`](phases.md#cantransition) | function |  | v `@rebar/zakazky/phases` |
| [`effectivePhase`](#effectivephase) | function | Fáze, podle které se řídí viditelnost (u pozastavené zakázky ta původní). |  |
| [`fromExecution`](#fromexecution) | function |  |  |
| [`fromPreparation`](#frompreparation) | function |  |  |
| [`isPhaseKey`](phases.md#isphasekey) | function |  | v `@rebar/zakazky/phases` |
| [`isPreContract`](phases.md#isprecontract) | function |  | v `@rebar/zakazky/phases` |
| [`isPriceLocked`](phases.md#ispricelocked) | function | Stav záznamu v seznamu: kdy je smluvní cena zamčená. | v `@rebar/zakazky/phases` |
| [`listPriceMinor`](phases.md#listpriceminor) | function | Cena zakázky pro seznam (`job.sum_contract_minor`) a hlavičku: smluvní cena; v poptávce a nabídce bez zadané ceny cena nabídky z rozpočtu (prodej bez DPH), aby seznam neukazoval 0 Kč u nabídky za miliony. Hlavička říká „Cena nabídky“. | v `@rebar/zakazky/phases` |
| [`phaseAtLeast`](#phaseatleast) | function | Je zakázka ve fázi `min` nebo dál (a není prohraná)? |  |
| [`phaseForLegacyStage`](#phaseforlegacystage) | function | Fáze starých stavů před zavedením životního cyklu (stavy „Příprava, Realizace, Předání, Hotovo, Zrušeno“). Stejné mapování dělá migrace `lifecycle_phases` v databázích, které už zakázky mají. Neznámý stav se podle druhu přiřadí k uzavřeno / prohráno, jinak zůstane bez fáze (zakázka v něm drží dosavadní fázi). |  |
| [`primaryActionFor`](phases.md#primaryactionfor) | function | Hlavní akce zakázky ve fázi; u pozastavené zakázky je to návrat do původní fáze. | v `@rebar/zakazky/phases` |
| [`transitionProblem`](phases.md#transitionproblem) | function | Česká věta, proč přechod nejde (prázdné = jde). | v `@rebar/zakazky/phases` |
| [`ACTIVE_PHASES`](phases.md#active_phases) | const | Fáze, ve kterých zakázka běží (do rozsahu „aktivní“, kalendáře, docházky…). | v `@rebar/zakazky/phases` |
| [`CRM_DEAL_STAGES`](#crm_deal_stages) | const | Výchozí obchodní stavy zakázky (CRM, docs/CRM.md): tři ve fázi poptávka, tři ve fázi nabídka. Klient je v administraci přejmenuje, přeřadí a doplní po svém; stávající instance je dostanou funkcí `ensureCrmDefaults` (modul CRM). |  |
| [`HEALTH`](phases.md#health) | const | Semafor zakázky. Pravidlo počítá `computeHealth` v `costs/summary.ts` (oblast costs), tady jsou jen štítky. | v `@rebar/zakazky/phases` |
| [`HEALTH_CHOICES`](phases.md#health_choices) | const |  | v `@rebar/zakazky/phases` |
| [`JOB_STAGES`](#job_stages) | const | Výchozí stavy pipeline zakázek: obchodní stavy CRM, pak jméno shodné s fází. Každý stav patří do jedné fáze. |  |
| [`JOB_TEAM_AUDIENCES`](server.md#job_team_audiences) | const | Skupiny příjemců pro události, které jdou přes `notifyJobTeam` (viz `team.ts`): vedoucí a členové týmu zakázky (bez toho, kdo změnu udělal) a další zainteresovaní, které volající doplní (odpovědný za vadu…). | v `@rebar/zakazky/server` |
| [`MAIN_PHASES`](phases.md#main_phases) | const | Hlavní řada fází v pořadí cyklu (bez prohráno a pozastaveno). | v `@rebar/zakazky/phases` |
| [`PHASES`](phases.md#phases) | const |  | v `@rebar/zakazky/phases` |
| [`PHASE_CHOICES`](phases.md#phase_choices) | const | Možnosti pro atribut typu výběr (`phase`). | v `@rebar/zakazky/phases` |
| [`PHASE_KEYS`](phases.md#phase_keys) | const |  | v `@rebar/zakazky/phases` |
| [`PHASE_LIST`](phases.md#phase_list) | const | Fáze seřazené podle `order` (pro nabídky a pohledy). | v `@rebar/zakazky/phases` |
| [`PRE_CONTRACT_PHASES`](phases.md#pre_contract_phases) | const | Fáze před výhrou: smluvní cena ještě není, rozpočet nese jen cenu nabídky. | v `@rebar/zakazky/phases` |
| [`PRICE_LOCKED_PHASES`](phases.md#price_locked_phases) | const | Od zahájení realizace se původní smluvní cena nemění; roste jen schválenými změnami. | v `@rebar/zakazky/phases` |
| [`ZAKAZKY_NOTIFICATIONS`](#zakazky_notifications) | const |  |  |
| [`manifest`](#manifest) | const |  |  |
| [`HealthKey`](phases.md#healthkey) | type |  | v `@rebar/zakazky/phases` |
| [`JobStageDef`](#jobstagedef) | type | Výchozí stav pipeline zakázek: název, barva, fáze a (u obchodních stavů) pravděpodobnost a dny hnití. |  |
| [`PhaseAction`](phases.md#phaseaction) | type |  | v `@rebar/zakazky/phases` |
| [`PhaseDef`](phases.md#phasedef) | type |  | v `@rebar/zakazky/phases` |
| [`PhaseKey`](phases.md#phasekey) | type |  | v `@rebar/zakazky/phases` |

### effectivePhase

function · `packages/modules/zakazky/src/detail/visibility.ts`

Fáze, podle které se řídí viditelnost (u pozastavené zakázky ta původní).

```ts
function effectivePhase(row: RowLike): Main | "lost"
```

### fromExecution

function · `packages/modules/zakazky/src/detail/visibility.ts`

_Bez popisu._

```ts
function fromExecution(row: RowLike): boolean
```

### fromPreparation

function · `packages/modules/zakazky/src/detail/visibility.ts`

_Bez popisu._

```ts
function fromPreparation(row: RowLike): boolean
```

### phaseAtLeast

function · `packages/modules/zakazky/src/detail/visibility.ts`

Je zakázka ve fázi `min` nebo dál (a není prohraná)?

```ts
function phaseAtLeast(row: RowLike, min: Main): boolean
```

### phaseForLegacyStage

function · `packages/modules/zakazky/src/lifecycle/stages.ts`

Fáze starých stavů před zavedením životního cyklu (stavy „Příprava, Realizace, Předání, Hotovo, Zrušeno“).
Stejné mapování dělá migrace `lifecycle_phases` v databázích, které už zakázky mají. Neznámý stav se podle
druhu přiřadí k uzavřeno / prohráno, jinak zůstane bez fáze (zakázka v něm drží dosavadní fázi).

```ts
function phaseForLegacyStage(name: string, kind: string): PhaseKey | null
```

### CRM_DEAL_STAGES

const · `packages/modules/zakazky/src/lifecycle/stages.ts`

Výchozí obchodní stavy zakázky (CRM, docs/CRM.md): tři ve fázi poptávka, tři ve fázi nabídka. Klient je v administraci
přejmenuje, přeřadí a doplní po svém; stávající instance je dostanou funkcí `ensureCrmDefaults` (modul CRM).

```ts
const CRM_DEAL_STAGES: readonly JobStageDef[]
```

### JOB_STAGES

const · `packages/modules/zakazky/src/lifecycle/stages.ts`

Výchozí stavy pipeline zakázek: obchodní stavy CRM, pak jméno shodné s fází. Každý stav patří do jedné fáze.

```ts
const JOB_STAGES: readonly JobStageDef[]
```

### ZAKAZKY_NOTIFICATIONS

const · `packages/modules/zakazky/src/notifications.ts`

_Bez popisu._

```ts
const ZAKAZKY_NOTIFICATIONS: readonly [import("@rebar/core").NotificationEventDef<"job.team", "number" | "title" | "role", "member">, import("@rebar/core").NotificationEventDef<"approval.request", "number" | "kind" | "document" | "amount", "approvers">, import("@rebar…
```

### manifest

const · `packages/modules/zakazky/src/index.ts`

_Bez popisu._

```ts
const manifest: { readonly id: "zakazky"; readonly name: "Zakázky"; readonly description: "Pipeline zakázek, rozpočet a položky, termíny, tým, dokumenty, ekonomika."; readonly icon: "briefcase"; readonly dependsOn: readonly ["kontakty"]; readonly nav: rea…
```

### JobStageDef

type · `packages/modules/zakazky/src/lifecycle/stages.ts`

Výchozí stav pipeline zakázek: název, barva, fáze a (u obchodních stavů) pravděpodobnost a dny hnití.

```ts
type JobStageDef = {
  name: string;
  color: string;
  phase: PhaseKey;
  kind?: "done" | "lost";
  /** Pravděpodobnost výhry ve stavu v procentech (CRM) a dny bez aktivity do hnití. */
  probabilityPct?: number;
  rottingDays?: number;
};
```
