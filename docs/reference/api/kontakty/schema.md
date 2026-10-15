# @rebar/kontakty/schema

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/kontakty/schema` (soubor `packages/modules/kontakty/src/schema.ts`). Exportů: 11, z toho s popisem 11.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`CLIENT_STATUSES`](#client_statuses) | const | Stav klienta u organizace (`company.client_status`); `null` = organizace není klient (jen kontakt, dodavatel…). |  |
| [`CONTACT_POINT_KINDS`](#contact_point_kinds) | const | Druh kontaktního údaje osoby. |  |
| [`CONTACT_POINT_LABELS`](#contact_point_labels) | const | Štítek kontaktního údaje: práce, mobil, soukromý. |  |
| [`DRIVE_STATUSES`](#drive_statuses) | const | Stav složky na Google Disku u organizace (zapisuje jen modul Disk). |  |
| [`SERVICE_TYPES`](#service_types) | const | Typy služeb, které agentura klientovi poskytuje (`company.services`). |  |
| [`aresCache`](#arescache) | const | Cache odpovědí ARES podle IČO (24 h, ORG-04); technická tabulka bez soft-delete. |  |
| [`company`](#company) | const | Organizace. Klient je organizace se `client_status` (ne samostatná entita). IČO je mezi živými záznamy unikátní. Viditelnost: kořen s vlastním zámkem (soukromá organizace nedědí do obchodů ani zakázek, R-31). `drive_*` píše jen modul Disk, `last_activity_at` modul Úkoly (oboje přes `writeSystemFields`). |  |
| [`person`](#person) | const | Kontaktní osoba. Jméno se skládá ze `first_name` a `last_name` (`full_name` je generovaný sloupec pro název záznamu, hledání a řazení). E-maily a telefony jsou v `person_contact_point`; hlavní firma je `primary_company_id`, další firmy jsou v `person_company`. |  |
| [`personCompany`](#personcompany) | const | Další organizace osoby (kromě hlavní, ta je v `person.primary_company_id`) s rolí a pozicí v nich. `is_primary` je vždy `false`; hlavní firma se do této tabulky nezapisuje (dotazy čtou obě místa). |  |
| [`personContactPoint`](#personcontactpoint) | const | E-mail nebo telefon osoby se štítkem. `value_norm` je normalizovaná hodnota pro porovnání a hledání (e-mail malými písmeny, telefon v E.164). Duplicity mezi osobami se jen hlásí (KON-03), unikátní je údaj jen u jedné osoby a jen jeden údaj daného druhu je hlavní. |  |
| [`ClientContext`](#clientcontext) | type | Kontext klienta: čtyři pojmenovaná pole upravovaná na místě (R-27). |  |

### CLIENT_STATUSES

const · `packages/modules/kontakty/src/schema.ts`

Stav klienta u organizace (`company.client_status`); `null` = organizace není klient (jen kontakt, dodavatel…).

```ts
const CLIENT_STATUSES: readonly ["lead", "active", "paused", "former"]
```

### CONTACT_POINT_KINDS

const · `packages/modules/kontakty/src/schema.ts`

Druh kontaktního údaje osoby.

```ts
const CONTACT_POINT_KINDS: readonly ["email", "phone"]
```

### CONTACT_POINT_LABELS

const · `packages/modules/kontakty/src/schema.ts`

Štítek kontaktního údaje: práce, mobil, soukromý.

```ts
const CONTACT_POINT_LABELS: readonly ["work", "mobile", "private"]
```

### DRIVE_STATUSES

const · `packages/modules/kontakty/src/schema.ts`

Stav složky na Google Disku u organizace (zapisuje jen modul Disk).

```ts
const DRIVE_STATUSES: readonly ["none", "pending", "ready", "error", "timeout"]
```

### SERVICE_TYPES

const · `packages/modules/kontakty/src/schema.ts`

Typy služeb, které agentura klientovi poskytuje (`company.services`).

```ts
const SERVICE_TYPES: readonly ["web", "marketing", "systemy"]
```

### aresCache

const · `packages/modules/kontakty/src/schema.ts`

Cache odpovědí ARES podle IČO (24 h, ORG-04); technická tabulka bez soft-delete.

```ts
const aresCache: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "ares_cache"; schema: undefined; columns: { ico: import("drizzle-orm/pg-core").PgColumn<{ name: "ico"; tableName: "ares_cache"; dataType: "string"; columnType: "PgText"; data: string…
```

### company

const · `packages/modules/kontakty/src/schema.ts`

Organizace. Klient je organizace se `client_status` (ne samostatná entita). IČO je mezi živými záznamy unikátní.
Viditelnost: kořen s vlastním zámkem (soukromá organizace nedědí do obchodů ani zakázek, R-31).
`drive_*` píše jen modul Disk, `last_activity_at` modul Úkoly (oboje přes `writeSystemFields`).

```ts
const company: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "company"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "company"; dataType: "date"; columnType: "PgTimestamp"; data: Da…
```

### person

const · `packages/modules/kontakty/src/schema.ts`

Kontaktní osoba. Jméno se skládá ze `first_name` a `last_name` (`full_name` je generovaný sloupec pro název záznamu,
hledání a řazení). E-maily a telefony jsou v `person_contact_point`; hlavní firma je `primary_company_id`,
další firmy jsou v `person_company`.

```ts
const person: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "person"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "person"; dataType: "date"; columnType: "PgTimestamp"; data: Date…
```

### personCompany

const · `packages/modules/kontakty/src/schema.ts`

Další organizace osoby (kromě hlavní, ta je v `person.primary_company_id`) s rolí a pozicí v nich. `is_primary` je
vždy `false`; hlavní firma se do této tabulky nezapisuje (dotazy čtou obě místa).

```ts
const personCompany: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "person_company"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "person_company"; dataType: "date"; columnType: "PgTimest…
```

### personContactPoint

const · `packages/modules/kontakty/src/schema.ts`

E-mail nebo telefon osoby se štítkem. `value_norm` je normalizovaná hodnota pro porovnání a hledání (e-mail malými
písmeny, telefon v E.164). Duplicity mezi osobami se jen hlásí (KON-03), unikátní je údaj jen u jedné osoby
a jen jeden údaj daného druhu je hlavní.

```ts
const personContactPoint: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "person_contact_point"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "person_contact_point"; dataType: "date"; columnTyp…
```

### ClientContext

type · `packages/modules/kontakty/src/schema.ts`

Kontext klienta: čtyři pojmenovaná pole upravovaná na místě (R-27).

```ts
type ClientContext = {
  decisionMaker?: string;
  howToCommunicate?: string;
  history?: string;
  notes?: string;
};
```
