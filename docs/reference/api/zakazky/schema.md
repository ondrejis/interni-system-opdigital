# @rebar/zakazky/schema

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/zakazky/schema` (soubor `packages/modules/zakazky/src/schema.ts`). Exportů: 16, z toho s popisem 16.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`BILLING_MODELS`](#billing_models) | const | Způsob fakturace zakázky (`hourly` je jen příznak, R-25). |  |
| [`JOB_MEMBER_ROLES`](#job_member_roles) | const | Role člena týmu zakázky. |  |
| [`JOB_STATUSES`](#job_statuses) | const | Stav zakázky (`JobStatus` v kontraktech). |  |
| [`JOB_TYPES`](#job_types) | const | Typ zakázky = služba, kterou agentura poskytuje. |  |
| [`MARKETING_STAGES`](#marketing_stages) | const | Fáze marketingové zakázky (úvod → rozhodnutí → retainer → konec). |  |
| [`PHASE_ROLES`](#phase_roles) | const | Zvláštní význam fáze: vyhodnocení úvodní fáze marketingu, retainer. |  |
| [`PHASE_STATUSES`](#phase_statuses) | const | Stav fáze zakázky. |  |
| [`job`](#job) | const | Zakázka. `number` se přiděluje z řady `zakazky.cislo` (`Z-{YYYY}-{NNN}`). Viditelnost: kořen s vlastním zámkem (rodiče nemá; soukromý klient do zakázek nedědí, R-31). Odkazy na organizaci, obchod a aktuální fázi jsou měkké (bez cizího klíče). `drive_*` píše jen modul Disk, `marketing_stage` modul Finance přes `setMarketingStage`. |  |
| [`jobMember`](#jobmember) | const | Tým zakázky: vedoucí a členové. Člen zakázku vidí i při oprávnění „jen moje“. |  |
| [`jobParticipant`](#jobparticipant) | const | Další kontakty na zakázce (investor, TDI, projektant…) s rolí na zakázce. |  |
| [`jobPhase`](#jobphase) | const | Fáze zakázky (z šablony typu, upravitelné). Zdědí viditelnost zakázky (bez vlastního zámku). |  |
| [`jobTemplate`](#jobtemplate) | const | Šablona zakázky: fáze, úkoly a platby ve verzovaném JSON (`payload`). Archivuje se, nemaže. |  |
| [`JobTemplatePayload`](#jobtemplatepayload) | type | Obsah šablony zakázky (`job_template.payload`, verze 1). |  |
| [`TemplatePayment`](#templatepayment) | type | Šablona platby: platba založená se zakázkou (např. úvodní fáze 2 × 7 000 Kč). |  |
| [`TemplatePhase`](#templatephase) | type | Šablona fáze zakázky; `role` označuje fázi se zvláštním významem. |  |
| [`TemplateTask`](#templatetask) | type | Šablona úkolu: úkol vzniklý při založení zakázky ze šablony. |  |

### BILLING_MODELS

const · `packages/modules/zakazky/src/schema.ts`

Způsob fakturace zakázky (`hourly` je jen příznak, R-25).

```ts
const BILLING_MODELS: readonly ["one_off", "intro_then_retainer", "retainer", "hourly"]
```

### JOB_MEMBER_ROLES

const · `packages/modules/zakazky/src/schema.ts`

Role člena týmu zakázky.

```ts
const JOB_MEMBER_ROLES: readonly ["lead", "member"]
```

### JOB_STATUSES

const · `packages/modules/zakazky/src/schema.ts`

Stav zakázky (`JobStatus` v kontraktech).

```ts
const JOB_STATUSES: readonly ["planned", "active", "paused", "done", "cancelled"]
```

### JOB_TYPES

const · `packages/modules/zakazky/src/schema.ts`

Typ zakázky = služba, kterou agentura poskytuje.

```ts
const JOB_TYPES: readonly ["web", "marketing", "systemy"]
```

### MARKETING_STAGES

const · `packages/modules/zakazky/src/schema.ts`

Fáze marketingové zakázky (úvod → rozhodnutí → retainer → konec).

```ts
const MARKETING_STAGES: readonly ["intro", "decision", "retainer", "ended"]
```

### PHASE_ROLES

const · `packages/modules/zakazky/src/schema.ts`

Zvláštní význam fáze: vyhodnocení úvodní fáze marketingu, retainer.

```ts
const PHASE_ROLES: readonly ["intro_evaluation", "retainer"]
```

### PHASE_STATUSES

const · `packages/modules/zakazky/src/schema.ts`

Stav fáze zakázky.

```ts
const PHASE_STATUSES: readonly ["not_started", "in_progress", "done", "skipped"]
```

### job

const · `packages/modules/zakazky/src/schema.ts`

Zakázka. `number` se přiděluje z řady `zakazky.cislo` (`Z-{YYYY}-{NNN}`). Viditelnost: kořen s vlastním zámkem
(rodiče nemá; soukromý klient do zakázek nedědí, R-31). Odkazy na organizaci, obchod a aktuální fázi jsou měkké
(bez cizího klíče). `drive_*` píše jen modul Disk, `marketing_stage` modul Finance přes `setMarketingStage`.

```ts
const job: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "job"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "job"; dataType: "date"; columnType: "PgTimestamp"; data: Date; driv…
```

### jobMember

const · `packages/modules/zakazky/src/schema.ts`

Tým zakázky: vedoucí a členové. Člen zakázku vidí i při oprávnění „jen moje“.

```ts
const jobMember: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "job_member"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "job_member"; dataType: "date"; columnType: "PgTimestamp"; da…
```

### jobParticipant

const · `packages/modules/zakazky/src/schema.ts`

Další kontakty na zakázce (investor, TDI, projektant…) s rolí na zakázce.

```ts
const jobParticipant: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "job_participant"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "job_participant"; dataType: "date"; columnType: "PgTime…
```

### jobPhase

const · `packages/modules/zakazky/src/schema.ts`

Fáze zakázky (z šablony typu, upravitelné). Zdědí viditelnost zakázky (bez vlastního zámku).

```ts
const jobPhase: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "job_phase"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "job_phase"; dataType: "date"; columnType: "PgTimestamp"; data…
```

### jobTemplate

const · `packages/modules/zakazky/src/schema.ts`

Šablona zakázky: fáze, úkoly a platby ve verzovaném JSON (`payload`). Archivuje se, nemaže.

```ts
const jobTemplate: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "job_template"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "job_template"; dataType: "date"; columnType: "PgTimestamp"…
```

### JobTemplatePayload

type · `packages/modules/zakazky/src/schema.ts`

Obsah šablony zakázky (`job_template.payload`, verze 1).

```ts
type JobTemplatePayload = {
  v: 1;
  phases: TemplatePhase[];
  tasks: TemplateTask[];
  payments: TemplatePayment[];
};
```

### TemplatePayment

type · `packages/modules/zakazky/src/schema.ts`

Šablona platby: platba založená se zakázkou (např. úvodní fáze 2 × 7 000 Kč).

```ts
type TemplatePayment = {
  description: string;
  kind: "one_off" | "intro" | "retainer" | "extra";
  amountMinor: number;
  issuer: { rule: "owner" | "other" | "user"; userId?: string };
  dueOffsetDays: number | null;
};
```

### TemplatePhase

type · `packages/modules/zakazky/src/schema.ts`

Šablona fáze zakázky; `role` označuje fázi se zvláštním významem.

```ts
type TemplatePhase = {
  name: string;
  role: (typeof PHASE_ROLES)[number] | null;
  offsetDays: number;
  durationDays: number;
};
```

### TemplateTask

type · `packages/modules/zakazky/src/schema.ts`

Šablona úkolu: úkol vzniklý při založení zakázky ze šablony.

```ts
type TemplateTask = {
  phaseIndex: number;
  title: string;
  typeKey: string;
  priority: "none" | "low" | "medium" | "high" | "urgent";
  assignee: { rule: "owner" | "lead" | "user" | "none"; userId?: string };
  dueOffsetDays: number | null;
  estimateMin: number | null;
  description: string | null;
};
```
