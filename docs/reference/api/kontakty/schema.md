# @rebar/kontakty/schema

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/kontakty/schema` (soubor `packages/modules/kontakty/src/schema.ts`). Exportů: 4, z toho s popisem 4.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`COMPANY_ROLES`](#company_roles) | const | Role firmy v systému. Jedna firma může být zároveň klient i dodavatel. |  |
| [`company`](#company) | const | Firma: klient, dodavatel nebo subdodavatel. IČO je mezi živými záznamy unikátní. |  |
| [`person`](#person) | const | Kontaktní osoba, volitelně u firmy. |  |
| [`personContactPoint`](#personcontactpoint) | const | Další e-maily a telefony osoby s typem (práce, mobil, domů…). Hlavní e-mail a telefon zůstávají ve sloupcích osoby (`person.email`, `person.phone`) kvůli hledání a kontrole duplicit; tady jsou jen doplňující údaje. |  |

### COMPANY_ROLES

const · `packages/modules/kontakty/src/schema.ts`

Role firmy v systému. Jedna firma může být zároveň klient i dodavatel.

```ts
const COMPANY_ROLES: readonly ["client", "supplier", "subcontractor"]
```

### company

const · `packages/modules/kontakty/src/schema.ts`

Firma: klient, dodavatel nebo subdodavatel. IČO je mezi živými záznamy unikátní.

```ts
const company: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "company"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "company"; dataType: "date"; columnType: "PgTimestamp"; data: Da…
```

### person

const · `packages/modules/kontakty/src/schema.ts`

Kontaktní osoba, volitelně u firmy.

```ts
const person: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "person"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "person"; dataType: "date"; columnType: "PgTimestamp"; data: Date…
```

### personContactPoint

const · `packages/modules/kontakty/src/schema.ts`

Další e-maily a telefony osoby s typem (práce, mobil, domů…). Hlavní e-mail a telefon zůstávají ve sloupcích osoby
(`person.email`, `person.phone`) kvůli hledání a kontrole duplicit; tady jsou jen doplňující údaje.

```ts
const personContactPoint: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "person_contact_point"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "person_contact_point"; dataType: "date"; columnTyp…
```
