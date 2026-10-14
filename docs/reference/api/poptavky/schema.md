# @rebar/poptavky/schema

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/poptavky/schema` (soubor `packages/modules/poptavky/src/schema.ts`). Exportů: 7, z toho s popisem 7.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`crmActivity`](#crmactivity) | const | Aktivita: motor prodeje (co a kdy se má s obchodem udělat). Může se vázat na zakázku, firmu i osobu zároveň; vazby jsou měkká uuid bez cizího klíče (jako jinde). Přepočet `job.crm_*` provádí `crmApi.recomputeJobCrm`. Aktivita na celý den (`all_day`) má `due_at` v půlnoci pražského času. |  |
| [`crmActivityType`](#crmactivitytype) | const | Typ aktivity (hovor, schůzka, úkol, termín, e-mail, obhlídka). Konfiguruje se; výchozí sadu zakládá seed. |  |
| [`crmFollower`](#crmfollower) | const | Sledující zakázky: dostávají upozornění na změny a aktivity, i když zakázku nevedou. |  |
| [`crmNote`](#crmnote) | const | Poznámka u zakázky, firmy nebo osoby (polymorfní vazba), volitelně připnutá nahoru. |  |
| [`inquiry`](#inquiry) | const | Poptávka (lead). Firma nemusí existovat (příchozí poptávka z webu má jen volný text); při převodu na zakázku se firma vytvoří nebo vybere. `convertedJobId` je záměrně bez cizího klíče — poptávky nesmí záviset na modulu zakázek. |  |
| [`intakeKey`](#intakekey) | const | Klíč příjmu poptávek (webhook, formulář na webu). Ukládá se jen hash; hodnotu klíče uvidí správce jednou. |  |
| [`intakeLog`](#intakelog) | const | Záznam o každém příchozím požadavku (bez klíče a bez nadbytečných osobních údajů mimo to, co je v poptávce). |  |

### crmActivity

const · `packages/modules/poptavky/src/schema.ts`

Aktivita: motor prodeje (co a kdy se má s obchodem udělat). Může se vázat na zakázku, firmu i osobu zároveň;
vazby jsou měkká uuid bez cizího klíče (jako jinde). Přepočet `job.crm_*` provádí `crmApi.recomputeJobCrm`.
Aktivita na celý den (`all_day`) má `due_at` v půlnoci pražského času.

```ts
const crmActivity: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "crm_activity"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "crm_activity"; dataType: "date"; columnType: "PgTimestamp"…
```

### crmActivityType

const · `packages/modules/poptavky/src/schema.ts`

Typ aktivity (hovor, schůzka, úkol, termín, e-mail, obhlídka). Konfiguruje se; výchozí sadu zakládá seed.

```ts
const crmActivityType: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "crm_activity_type"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "crm_activity_type"; dataType: "date"; columnType: "Pg…
```

### crmFollower

const · `packages/modules/poptavky/src/schema.ts`

Sledující zakázky: dostávají upozornění na změny a aktivity, i když zakázku nevedou.

```ts
const crmFollower: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "crm_follower"; schema: undefined; columns: { jobId: import("drizzle-orm/pg-core").PgColumn<{ name: "job_id"; tableName: "crm_follower"; dataType: "string"; columnType: "PgUUID"; dat…
```

### crmNote

const · `packages/modules/poptavky/src/schema.ts`

Poznámka u zakázky, firmy nebo osoby (polymorfní vazba), volitelně připnutá nahoru.

```ts
const crmNote: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "crm_note"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "crm_note"; dataType: "date"; columnType: "PgTimestamp"; data: …
```

### inquiry

const · `packages/modules/poptavky/src/schema.ts`

Poptávka (lead). Firma nemusí existovat (příchozí poptávka z webu má jen volný text); při převodu na zakázku
se firma vytvoří nebo vybere. `convertedJobId` je záměrně bez cizího klíče — poptávky nesmí záviset na modulu zakázek.

```ts
const inquiry: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "inquiry"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "inquiry"; dataType: "date"; columnType: "PgTimestamp"; data: Da…
```

### intakeKey

const · `packages/modules/poptavky/src/schema.ts`

Klíč příjmu poptávek (webhook, formulář na webu). Ukládá se jen hash; hodnotu klíče uvidí správce jednou.

```ts
const intakeKey: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "inquiry_intake_key"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "inquiry_intake_key"; dataType: "date"; columnType: "…
```

### intakeLog

const · `packages/modules/poptavky/src/schema.ts`

Záznam o každém příchozím požadavku (bez klíče a bez nadbytečných osobních údajů mimo to, co je v poptávce).

```ts
const intakeLog: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "inquiry_intake"; schema: undefined; columns: { id: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "inquiry_intake"; dataType: "string"; columnType: "PgUUID"; data…
```
