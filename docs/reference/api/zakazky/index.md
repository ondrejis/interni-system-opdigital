# @rebar/zakazky

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/zakazky` (soubor `packages/modules/zakazky/src/index.ts`). Exportů: 9, z toho s popisem 6.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`effectivePhase`](#effectivephase) | function | Fáze, podle které se řídí viditelnost (u pozastavené zakázky ta původní). |  |
| [`fromExecution`](#fromexecution) | function |  |  |
| [`fromPreparation`](#frompreparation) | function |  |  |
| [`phaseAtLeast`](#phaseatleast) | function | Je zakázka ve fázi `min` nebo dál (a není prohraná)? |  |
| [`phaseForLegacyStage`](#phaseforlegacystage) | function | Fáze starých stavů před zavedením životního cyklu (stavy „Příprava, Realizace, Předání, Hotovo, Zrušeno“). Stejné mapování dělá migrace `lifecycle_phases` v databázích, které už zakázky mají. Neznámý stav se podle druhu přiřadí k uzavřeno / prohráno, jinak zůstane bez fáze (zakázka v něm drží dosavadní fázi). |  |
| [`CRM_DEAL_STAGES`](#crm_deal_stages) | const | Výchozí obchodní stavy zakázky (CRM, docs/CRM.md): tři ve fázi poptávka, tři ve fázi nabídka. Klient je v administraci přejmenuje, přeřadí a doplní po svém; stávající instance je dostanou funkcí `ensureCrmDefaults` (modul CRM). |  |
| [`JOB_STAGES`](#job_stages) | const | Výchozí stavy pipeline zakázek: obchodní stavy CRM, pak jméno shodné s fází. Každý stav patří do jedné fáze. |  |
| [`manifest`](#manifest) | const |  |  |
| [`JobStageDef`](#jobstagedef) | type | Výchozí stav pipeline zakázek: název, barva, fáze a (u obchodních stavů) pravděpodobnost a dny hnití. |  |

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

### manifest

const · `packages/modules/zakazky/src/index.ts`

_Bez popisu._

```ts
const manifest: { readonly id: "zakazky"; readonly name: "Zakázky"; readonly description: "Zakázky: fáze, termíny, tým, šablony, komentáře a úkoly (kostra, model se přepracovává)."; readonly icon: "briefcase"; readonly dependsOn: readonly ["kontakty"]; re…
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
