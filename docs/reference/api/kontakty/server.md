# @rebar/kontakty/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/kontakty/server` (soubor `packages/modules/kontakty/src/server.ts`). Exportů: 19, z toho s popisem 14.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`findContactDuplicates`](#findcontactduplicates) | function | Najde existující firmy a osoby, které se shodují v IČO (jen firmy), e-mailu nebo telefonu (shoda bez ohledu na velikost písmen, mezery a předvolbu). Respektuje rozsah oprávnění ke kontaktům aktéra (`kontakty.read`). Slouží kontrole duplicit při zakládání obchodů i rychlém zadání (a při sloučení kontaktů). |  |
| [`normalizeEmail`](#normalizeemail) | function | E-mail pro porovnání: bez mezer, malými písmeny; bez zavináče je neplatný (`null`). |  |
| [`normalizeIco`](#normalizeico) | function | IČO: jen číslice (mezery a pomlčky pryč), kratší se doplní zleva nulami na osm. Prázdné nebo nesmyslné = `null`. |  |
| [`normalizePhone`](#normalizephone) | function | Telefon: devět koncových číslic (bez předvolby +420 / 00420); kratší než devět číslic se neporovnává. |  |
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
| [`CompanyMatch`](#companymatch) | type | Existující firma, která se shoduje s hledanými údaji. |  |
| [`ContactQuery`](#contactquery) | type | Údaje, podle kterých se hledá existující firma nebo osoba. |  |
| [`MatchedBy`](#matchedby) | type | V čem se nalezený záznam shoduje s hledaným: IČO, e-mail, telefon. |  |
| [`PersonMatch`](#personmatch) | type | Existující osoba, která se shoduje s hledanými údaji. |  |

### findContactDuplicates

function · `packages/modules/kontakty/src/duplicates.ts`

Najde existující firmy a osoby, které se shodují v IČO (jen firmy), e-mailu nebo telefonu (shoda bez ohledu na velikost
písmen, mezery a předvolbu). Respektuje rozsah oprávnění ke kontaktům aktéra (`kontakty.read`). Slouží kontrole duplicit
při zakládání obchodů i rychlém zadání (a při sloučení kontaktů).

```ts
async function findContactDuplicates(ctx: Ctx, query: ContactQuery): Promise<{ companies: CompanyMatch[]; persons: PersonMatch[] }>
```

### normalizeEmail

function · `packages/modules/kontakty/src/duplicates.ts`

E-mail pro porovnání: bez mezer, malými písmeny; bez zavináče je neplatný (`null`).

```ts
function normalizeEmail(v: string | null | undefined): string | null
```

### normalizeIco

function · `packages/modules/kontakty/src/duplicates.ts`

IČO: jen číslice (mezery a pomlčky pryč), kratší se doplní zleva nulami na osm. Prázdné nebo nesmyslné = `null`.

```ts
function normalizeIco(v: string | null | undefined): string | null
```

### normalizePhone

function · `packages/modules/kontakty/src/duplicates.ts`

Telefon: devět koncových číslic (bez předvolby +420 / 00420); kratší než devět číslic se neporovnává.

```ts
function normalizePhone(v: string | null | undefined): string | null
```

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

### CompanyMatch

type · `packages/modules/kontakty/src/duplicates.ts`

Existující firma, která se shoduje s hledanými údaji.

```ts
type CompanyMatch = {
  id: string;
  name: string;
  ico: string | null;
  email: string | null;
  phone: string | null;
  matchedBy: MatchedBy[];
};
```

### ContactQuery

type · `packages/modules/kontakty/src/duplicates.ts`

Údaje, podle kterých se hledá existující firma nebo osoba.

```ts
type ContactQuery = {
  ico?: string | null | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
};
```

### MatchedBy

type · `packages/modules/kontakty/src/duplicates.ts`

V čem se nalezený záznam shoduje s hledaným: IČO, e-mail, telefon.

```ts
type MatchedBy = "ico" | "email" | "phone";
```

### PersonMatch

type · `packages/modules/kontakty/src/duplicates.ts`

Existující osoba, která se shoduje s hledanými údaji.

```ts
type PersonMatch = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  companyId: string | null;
  matchedBy: MatchedBy[];
};
```
