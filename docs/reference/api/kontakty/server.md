# @rebar/kontakty/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/kontakty/server` (soubor `packages/modules/kontakty/src/server.ts`). Exportů: 19, z toho s popisem 14.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`matchContactDuplicates`](api.md#matchcontactduplicates) | function | Najde existující firmy a osoby, které se shodují v IČO (jen firmy), e-mailu nebo telefonu (shoda bez ohledu na velikost písmen, mezery a předvolbu). Respektuje rozsah oprávnění ke kontaktům aktéra (`kontakty.read`). Slouží kontrole duplicit při zakládání obchodů i rychlém zadání (a při sloučení kontaktů). | v `@rebar/kontakty/api` |
| [`normalizeEmail`](api.md#normalizeemail) | function | E-mail pro porovnání: bez mezer, malými písmeny; bez zavináče je neplatný (`null`). | v `@rebar/kontakty/api` |
| [`normalizeIco`](api.md#normalizeico) | function | IČO: jen číslice (mezery a pomlčky pryč), kratší se doplní zleva nulami na osm. Prázdné nebo nesmyslné = `null`. | v `@rebar/kontakty/api` |
| [`normalizePhone`](api.md#normalizephone) | function | Telefon: devět koncových číslic (bez předvolby +420 / 00420); kratší než devět číslic se neporovnává. | v `@rebar/kontakty/api` |
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
| [`CompanyMatch`](api.md#companymatch) | type | Existující firma, která se shoduje s hledanými údaji. | v `@rebar/kontakty/api` |
| [`ContactQuery`](api.md#contactquery) | type | Údaje, podle kterých se hledá existující firma nebo osoba. | v `@rebar/kontakty/api` |
| [`MatchedBy`](api.md#matchedby) | type | V čem se nalezený záznam shoduje s hledaným: IČO, e-mail, telefon. | v `@rebar/kontakty/api` |
| [`PersonMatch`](api.md#personmatch) | type | Existující osoba, která se shoduje s hledanými údaji. | v `@rebar/kontakty/api` |

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
