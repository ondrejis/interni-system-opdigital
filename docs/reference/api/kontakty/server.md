# @rebar/kontakty/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/kontakty/server` (soubor `packages/modules/kontakty/src/server.ts`). Exportů: 11, z toho s popisem 6.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`COMPANY_TYPE_LOOKUP`](#company_type_lookup) | const | Číselníky kontaktů (správa v Nastavení → Číselníky; výchozí položky jsou v manifestu modulu). |  |
| [`PERSON_ROLE_LOOKUP`](#person_role_lookup) | const |  |  |
| [`POINT_TYPE_LOOKUP`](#point_type_lookup) | const |  |  |
| [`TAG_LOOKUP`](#tag_lookup) | const |  |  |
| [`company`](schema.md#company) | const | Firma: klient, dodavatel nebo subdodavatel. IČO je mezi živými záznamy unikátní. | v `@rebar/kontakty/schema` |
| [`companyEntity`](#companyentity) | const | Firmy: klienti, dodavatelé a subdodavatelé v jedné evidenci. |  |
| [`entities`](#entities) | const |  |  |
| [`person`](schema.md#person) | const | Kontaktní osoba, volitelně u firmy. | v `@rebar/kontakty/schema` |
| [`personContactPoint`](schema.md#personcontactpoint) | const | Další e-maily a telefony osoby s typem (práce, mobil, domů…). Hlavní e-mail a telefon zůstávají ve sloupcích osoby (`person.email`, `person.phone`) kvůli hledání a kontrole duplicit; tady jsou jen doplňující údaje. | v `@rebar/kontakty/schema` |
| [`personEntity`](#personentity) | const | Kontaktní osoby, volitelně u firmy. |  |
| [`server`](#server) | const |  |  |

### COMPANY_TYPE_LOOKUP

const · `packages/modules/kontakty/src/entities.ts`

Číselníky kontaktů (správa v Nastavení → Číselníky; výchozí položky jsou v manifestu modulu).

```ts
const COMPANY_TYPE_LOOKUP: "company.type"
```

### PERSON_ROLE_LOOKUP

const · `packages/modules/kontakty/src/entities.ts`

_Bez popisu._

```ts
const PERSON_ROLE_LOOKUP: "person.role"
```

### POINT_TYPE_LOOKUP

const · `packages/modules/kontakty/src/entities.ts`

_Bez popisu._

```ts
const POINT_TYPE_LOOKUP: "contact.point_type"
```

### TAG_LOOKUP

const · `packages/modules/kontakty/src/entities.ts`

_Bez popisu._

```ts
const TAG_LOOKUP: "contact.tag"
```

### companyEntity

const · `packages/modules/kontakty/src/entities.ts`

Firmy: klienti, dodavatelé a subdodavatelé v jedné evidenci.

```ts
const companyEntity: import("@rebar/core/entities").EntityDef
```

### entities

const · `packages/modules/kontakty/src/entities.ts`

_Bez popisu._

```ts
const entities: import("@rebar/core/entities").EntityDef[]
```

### personEntity

const · `packages/modules/kontakty/src/entities.ts`

Kontaktní osoby, volitelně u firmy.

```ts
const personEntity: import("@rebar/core/entities").EntityDef
```

### server

const · `packages/modules/kontakty/src/server.ts`

_Bez popisu._

```ts
const server: { readonly entities: import("@rebar/core/entities").EntityDef[]; readonly deleteBlockers: import("@rebar/core/entities").DeleteBlocker[]; readonly commands: (import("@rebar/core/module-server").CommandDef<import("zod").ZodObject<{ q: impor…
```
