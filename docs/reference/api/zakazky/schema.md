# @rebar/zakazky/schema

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/zakazky/schema` (soubor `packages/modules/zakazky/src/schema.ts`). Exportů: 21, z toho s popisem 19.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`approval`](#approval) | const | Žádost o schválení konkrétního dokladu (měkký odkaz na doklad v modulu, který ho vlastní). |  |
| [`approvalRule`](#approvalrule) | const | Pravidlo schvalování: doklad daného typu (`change`, `statement`, `order`, `received_invoice`) od částky `minAmountMinor` schvaluje držitel oprávnění `approverPermission` (nebo konkrétní uživatel). Pod nejnižším limitem se doklad schválí automaticky podle nastavení typu. Vyhodnocuje se nejvyšší odpovídající pravidlo. |  |
| [`budgetCalcLine`](#budgetcalcline) | const | Řádek výkazu výměr u položky: proměnná, popis, vzorec a výsledek; množství položky = součet výsledků. |  |
| [`budgetItem`](#budgetitem) | const | Položka rozpočtu. Má nákladovou i prodejní jednotkovou cenu (marže). `original*` se uloží při zamčení verze a už se nemění, takže je vidět „původní → aktuální“ po schválených změnách. |  |
| [`budgetObject`](#budgetobject) | const | Stavební objekt (SO 01 …). Každá verze má skrytý výchozí objekt „Celá zakázka“ (`isDefault`). |  |
| [`budgetSection`](#budgetsection) | const | Oddíl rozpočtu (Elektro, Zemní práce, ZTI …); může mít nadřazený oddíl, takže jde o strom. |  |
| [`budgetVersion`](#budgetversion) | const | Verze rozpočtu zakázky. `offer` je nabídka zákazníkovi, `realization` pracovní rozpočet realizace. Vyhraná nabídka se zamkne a zkopíruje do realizační verze (původní hodnoty položek se uloží). |  |
| [`costAllocation`](#costallocation) | const | Přiřazení automatického nákladu (docházka, sklad, stroje, přijatá faktura, deník) k oddílu a položce rozpočtu. Samotný náklad zůstává ve svém modulu (poskytovatel nákladů ho vrací živě s `source` a `ref`); tady je jen párování. Náklad bez řádku zde je „nespárovaný“ a ukáže se jako úkol k doplnění. |  |
| [`job`](#job) | const | Zakázka. Číslo se přiděluje z číselné řady `zakazky.cislo` ve stejné transakci jako založení. |  |
| [`jobChange`](#jobchange) | const | Vícepráce (kladná částka) a méněpráce (záporná). Schválená položka je součástí ceny zakázky a nejde měnit. |  |
| [`jobChangeLine`](#jobchangeline) | const | Řádek změny (ZBV): nová položka, změna množství nebo odebrání existující. Schválením se propíše do rozpočtu realizační verze (viz `budget_item`), původní hodnoty položky zůstanou. |  |
| [`jobCost`](#jobcost) | const | Ruční náklad zakázky (nákup bez skladu, subdodávka, kontejner…). Automatické náklady dodávají jiné moduly. |  |
| [`jobMember`](#jobmember) | const | Tým zakázky. Člen týmu zakázku vidí i při oprávnění „jen moje“. |  |
| [`jobOrder`](#joborder) | const | Objednávka dodavateli na zakázku (materiál, subdodávka). Po schválení se zamkne. Skladové objednávky řeší modul Sklad. |  |
| [`jobOrderLine`](#joborderline) | const |  |  |
| [`jobParticipant`](#jobparticipant) | const | Další lidé na zakázce kromě hlavní kontaktní osoby (investor, TDI, projektant…), s rolí na zakázce. |  |
| [`jobShare`](#jobshare) | const | Odkaz pro investora (jen ke čtení). V databázi je jen otisk tokenu; `scope` říká, co investor vidí. |  |
| [`jobStageHistory`](#jobstagehistory) | const | Historie stavů zakázky: jeden řádek na pobyt ve stavu (`left_at` je prázdné u aktuálního). Zapisuje ji změna stavu (`lifecycle/history.ts`); z ní se počítají dny ve stavu (pás fází), konverze a rychlost obchodu. |  |
| [`jobTemplate`](#jobtemplate) | const | Šablona zakázky: kostra rozpočtu, úkoly, složky a role týmu v JSON (tvar určuje `templates` v modulu). |  |
| [`workStatement`](#workstatement) | const | Soupis provedených prací za období (a stavební objekt): podklad pro dílčí fakturu zákazníkovi. |  |
| [`workStatementLine`](#workstatementline) | const |  |  |

### approval

const · `packages/modules/zakazky/src/schema.ts`

Žádost o schválení konkrétního dokladu (měkký odkaz na doklad v modulu, který ho vlastní).

```ts
const approval: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "approval"; schema: undefined; columns: { id: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "approval"; dataType: "string"; columnType: "PgUUID"; data: string; dr…
```

### approvalRule

const · `packages/modules/zakazky/src/schema.ts`

Pravidlo schvalování: doklad daného typu (`change`, `statement`, `order`, `received_invoice`) od částky
`minAmountMinor` schvaluje držitel oprávnění `approverPermission` (nebo konkrétní uživatel). Pod nejnižším limitem
se doklad schválí automaticky podle nastavení typu. Vyhodnocuje se nejvyšší odpovídající pravidlo.

```ts
const approvalRule: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "approval_rule"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "approval_rule"; dataType: "date"; columnType: "PgTimestam…
```

### budgetCalcLine

const · `packages/modules/zakazky/src/schema.ts`

Řádek výkazu výměr u položky: proměnná, popis, vzorec a výsledek; množství položky = součet výsledků.

```ts
const budgetCalcLine: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "budget_calc_line"; schema: undefined; columns: { id: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "budget_calc_line"; dataType: "string"; columnType: "PgUUID"; …
```

### budgetItem

const · `packages/modules/zakazky/src/schema.ts`

Položka rozpočtu. Má nákladovou i prodejní jednotkovou cenu (marže). `original*` se uloží při zamčení verze
a už se nemění, takže je vidět „původní → aktuální“ po schválených změnách.

```ts
const budgetItem: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "budget_item"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "budget_item"; dataType: "date"; columnType: "PgTimestamp"; …
```

### budgetObject

const · `packages/modules/zakazky/src/schema.ts`

Stavební objekt (SO 01 …). Každá verze má skrytý výchozí objekt „Celá zakázka“ (`isDefault`).

```ts
const budgetObject: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "budget_object"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "budget_object"; dataType: "date"; columnType: "PgTimestam…
```

### budgetSection

const · `packages/modules/zakazky/src/schema.ts`

Oddíl rozpočtu (Elektro, Zemní práce, ZTI …); může mít nadřazený oddíl, takže jde o strom.

```ts
const budgetSection: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "budget_section"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "budget_section"; dataType: "date"; columnType: "PgTimest…
```

### budgetVersion

const · `packages/modules/zakazky/src/schema.ts`

Verze rozpočtu zakázky. `offer` je nabídka zákazníkovi, `realization` pracovní rozpočet realizace.
Vyhraná nabídka se zamkne a zkopíruje do realizační verze (původní hodnoty položek se uloží).

```ts
const budgetVersion: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "budget_version"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "budget_version"; dataType: "date"; columnType: "PgTimest…
```

### costAllocation

const · `packages/modules/zakazky/src/schema.ts`

Přiřazení automatického nákladu (docházka, sklad, stroje, přijatá faktura, deník) k oddílu a položce rozpočtu.
Samotný náklad zůstává ve svém modulu (poskytovatel nákladů ho vrací živě s `source` a `ref`); tady je jen
párování. Náklad bez řádku zde je „nespárovaný“ a ukáže se jako úkol k doplnění.

```ts
const costAllocation: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "cost_allocation"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "cost_allocation"; dataType: "date"; columnType: "PgTime…
```

### job

const · `packages/modules/zakazky/src/schema.ts`

Zakázka. Číslo se přiděluje z číselné řady `zakazky.cislo` ve stejné transakci jako založení.

```ts
const job: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "job"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "job"; dataType: "date"; columnType: "PgTimestamp"; data: Date; driv…
```

### jobChange

const · `packages/modules/zakazky/src/schema.ts`

Vícepráce (kladná částka) a méněpráce (záporná). Schválená položka je součástí ceny zakázky a nejde měnit.

```ts
const jobChange: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "job_change"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "job_change"; dataType: "date"; columnType: "PgTimestamp"; da…
```

### jobChangeLine

const · `packages/modules/zakazky/src/schema.ts`

Řádek změny (ZBV): nová položka, změna množství nebo odebrání existující. Schválením se propíše do rozpočtu
realizační verze (viz `budget_item`), původní hodnoty položky zůstanou.

```ts
const jobChangeLine: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "job_change_line"; schema: undefined; columns: { id: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "job_change_line"; dataType: "string"; columnType: "PgUUID"; da…
```

### jobCost

const · `packages/modules/zakazky/src/schema.ts`

Ruční náklad zakázky (nákup bez skladu, subdodávka, kontejner…). Automatické náklady dodávají jiné moduly.

```ts
const jobCost: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "job_cost"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "job_cost"; dataType: "date"; columnType: "PgTimestamp"; data: …
```

### jobMember

const · `packages/modules/zakazky/src/schema.ts`

Tým zakázky. Člen týmu zakázku vidí i při oprávnění „jen moje“.

```ts
const jobMember: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "job_member"; schema: undefined; columns: { jobId: import("drizzle-orm/pg-core").PgColumn<{ name: "job_id"; tableName: "job_member"; dataType: "string"; columnType: "PgUUID"; data: s…
```

### jobOrder

const · `packages/modules/zakazky/src/schema.ts`

Objednávka dodavateli na zakázku (materiál, subdodávka). Po schválení se zamkne. Skladové objednávky řeší modul Sklad.

```ts
const jobOrder: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "job_order"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "job_order"; dataType: "date"; columnType: "PgTimestamp"; data…
```

### jobOrderLine

const · `packages/modules/zakazky/src/schema.ts`

_Bez popisu._

```ts
const jobOrderLine: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "job_order_line"; schema: undefined; columns: { id: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "job_order_line"; dataType: "string"; columnType: "PgUUID"; data…
```

### jobParticipant

const · `packages/modules/zakazky/src/schema.ts`

Další lidé na zakázce kromě hlavní kontaktní osoby (investor, TDI, projektant…), s rolí na zakázce.

```ts
const jobParticipant: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "job_participant"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "job_participant"; dataType: "date"; columnType: "PgTime…
```

### jobShare

const · `packages/modules/zakazky/src/schema.ts`

Odkaz pro investora (jen ke čtení). V databázi je jen otisk tokenu; `scope` říká, co investor vidí.

```ts
const jobShare: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "job_share"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "job_share"; dataType: "date"; columnType: "PgTimestamp"; data…
```

### jobStageHistory

const · `packages/modules/zakazky/src/schema.ts`

Historie stavů zakázky: jeden řádek na pobyt ve stavu (`left_at` je prázdné u aktuálního). Zapisuje ji změna stavu
(`lifecycle/history.ts`); z ní se počítají dny ve stavu (pás fází), konverze a rychlost obchodu.

```ts
const jobStageHistory: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "job_stage_history"; schema: undefined; columns: { id: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "job_stage_history"; dataType: "string"; columnType: "PgUUID"…
```

### jobTemplate

const · `packages/modules/zakazky/src/schema.ts`

Šablona zakázky: kostra rozpočtu, úkoly, složky a role týmu v JSON (tvar určuje `templates` v modulu).

```ts
const jobTemplate: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "job_template"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "job_template"; dataType: "date"; columnType: "PgTimestamp"…
```

### workStatement

const · `packages/modules/zakazky/src/schema.ts`

Soupis provedených prací za období (a stavební objekt): podklad pro dílčí fakturu zákazníkovi.

```ts
const workStatement: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "work_statement"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "work_statement"; dataType: "date"; columnType: "PgTimest…
```

### workStatementLine

const · `packages/modules/zakazky/src/schema.ts`

_Bez popisu._

```ts
const workStatementLine: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "work_statement_line"; schema: undefined; columns: { id: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "work_statement_line"; dataType: "string"; columnType: "PgU…
```
