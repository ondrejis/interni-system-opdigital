# @rebar/kontakty/contract

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/kontakty/contract` (soubor `packages/modules/kontakty/src/contract.ts`). Exportů: 42, z toho s popisem 41.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`ARES_FIELDS`](ares.md#ares_fields) | const | Pole organizace, která jde doplnit z ARES. | v `@rebar/kontakty/ares` |
| [`aresInput`](#aresinput) | const | `kontakty.ares`: doplnění z ARES podle IČO. Bez `apply` je to náhled (co se změní); s `apply: true` a `companyId` se zapíšou vybraná pole (`fields`; bez nich všechna předvybraná) a čas synchronizace. `companyId` bez `ico` použije IČO organizace (tlačítko „Aktualizovat z ARES“). |  |
| [`aresTestInput`](#arestestinput) | const | `kontakty.ares.test`: ověření dostupnosti ARES v Nastavení → Integrace (bez vstupu). |  |
| [`companyCheckInput`](#companycheckinput) | const | `kontakty.company.checkDuplicates`: stejné IČO, podobný název, stejná doména webu. |  |
| [`companyIdInput`](#companyidinput) | const | `kontakty.company.contacts`: kontakty organizace (hlavní i další). |  |
| [`mergeApplyInput`](#mergeapplyinput) | const | `kontakty.merge.apply`: totéž se zápisem; nevratné, proto výslovné potvrzení. |  |
| [`mergeInput`](#mergeinput) | const | Sloučení: `sourceId` zanikne, `targetId` (hlavní záznam) zůstane. |  |
| [`personCheckInput`](#personcheckinput) | const | `kontakty.person.checkDuplicates`: osoby se stejným e-mailem nebo telefonem (E.164). |  |
| [`personIdInput`](#personidinput) | const | `kontakty.person.points`: kontaktní údaje osoby. |  |
| [`personQuickCreateInput`](#personquickcreateinput) | const | `kontakty.person.quickCreate`: rychlé založení kontaktu (z organizace, obchodu, zakázky, palety). Při shodě e-mailu nebo telefonu s existující osobou nic nezaloží a vrátí shody; `force: true` založí i přesto. |  |
| [`pointInputSchema`](#pointinputschema) | const | Jeden kontaktní údaj osoby při úpravě (`id` mají jen už uložené). |  |
| [`pointKindSchema`](#pointkindschema) | const | Druh kontaktního údaje a jeho štítek. |  |
| [`pointLabelSchema`](#pointlabelschema) | const |  |  |
| [`searchInput`](#searchinput) | const | `kontakty.search`: hledání organizací a osob pro výběr (jméno, IČO, e-mail, část telefonu). |  |
| [`setCompaniesInput`](#setcompaniesinput) | const | `kontakty.person.setCompanies`: hlavní organizace osoby a další organizace s rolí. |  |
| [`setPointsInput`](#setpointsinput) | const | `kontakty.person.setPoints`: nahradí kontaktní údaje osoby (jeden hlavní od každého druhu). |  |
| [`AresChange`](ares.md#areschange) | type | Jedna změna v náhledu: co je teď, co přináší ARES a zda je výchozí zaškrtnutá. | v `@rebar/kontakty/ares` |
| [`AresCommandResult`](#arescommandresult) | type | Výsledek `kontakty.ares`: náhled změn, zápis, nebo věta o nedostupnosti. |  |
| [`AresCompany`](ares.md#arescompany) | type | Co ARES o firmě ví a co z toho se hodí do karty organizace. | v `@rebar/kontakty/ares` |
| [`AresField`](ares.md#aresfield) | type | Pole organizace, které jde doplnit z ARES. | v `@rebar/kontakty/ares` |
| [`AresInput`](#aresinput) | type | Vstup `kontakty.ares`. |  |
| [`AresTestResult`](#arestestresult) | type | Výsledek `kontakty.ares.test`. |  |
| [`CompanyContact`](api.md#companycontact) | type | Kontakt organizace pro seznam v kartě: osoba s rolí v této organizaci a hlavními údaji. | v `@rebar/kontakty/api` |
| [`CompanyDuplicate`](api.md#companyduplicate) | type | Nalezená organizace, která se shoduje s hledanou. | v `@rebar/kontakty/api` |
| [`CompanyDuplicateCheck`](api.md#companyduplicatecheck) | type | Výsledek kontroly duplicit organizace. | v `@rebar/kontakty/api` |
| [`CompanyHit`](api.md#companyhit) | type | Výsledek hledání organizace pro výběr (rychlé zadání, účastníci zakázky, sloučení). | v `@rebar/kontakty/api` |
| [`MergeInput`](#mergeinput) | type | Vstup `kontakty.merge.preview`. |  |
| [`MergePreview`](#mergepreview) | type | Náhled sloučení: co se přepojí, doplní a před čím je třeba varovat. |  |
| [`MergeResult`](#mergeresult) | type | Výsledek `kontakty.merge.apply`. |  |
| [`PersonCompanies`](#personcompanies) | type | Organizace osoby: hlavní a další s rolí. |  |
| [`PersonDuplicate`](api.md#personduplicate) | type | Nalezená osoba, která se shoduje v e-mailu nebo telefonu. | v `@rebar/kontakty/api` |
| [`PersonHit`](api.md#personhit) | type | Osoba nalezená hledáním (jméno, kontakt a organizace pro výběr). | v `@rebar/kontakty/api` |
| [`PersonQuickCreateInput`](#personquickcreateinput) | type | Vstup `kontakty.person.quickCreate`. |  |
| [`PointInputT`](#pointinputt) | type | Jeden kontaktní údaj osoby při úpravě. |  |
| [`PointKind`](#pointkind) | type | Druh kontaktního údaje. |  |
| [`PointLabel`](#pointlabel) | type | Štítek kontaktního údaje. |  |
| [`PointRow`](api.md#pointrow) | type | Kontaktní údaj osoby tak, jak se čte. | v `@rebar/kontakty/api` |
| [`QuickCreateResult`](#quickcreateresult) | type | Výsledek `kontakty.person.quickCreate`. |  |
| [`SearchInput`](#searchinput) | type | Vstup `kontakty.search`. |  |
| [`SearchResult`](#searchresult) | type | Výsledek `kontakty.search`. |  |
| [`SetCompaniesInput`](#setcompaniesinput) | type | Vstup `kontakty.person.setCompanies`. |  |
| [`SetPointsInput`](#setpointsinput) | type | Vstup `kontakty.person.setPoints`. |  |

### aresInput

const · `packages/modules/kontakty/src/contract.ts`

`kontakty.ares`: doplnění z ARES podle IČO. Bez `apply` je to náhled (co se změní); s `apply: true` a `companyId`
se zapíšou vybraná pole (`fields`; bez nich všechna předvybraná) a čas synchronizace. `companyId` bez `ico` použije
IČO organizace (tlačítko „Aktualizovat z ARES“).

```ts
const aresInput: z.ZodObject<{ ico: z.ZodOptional<z.ZodString>; companyId: z.ZodOptional<z.ZodUUID>; apply: z.ZodOptional<z.ZodBoolean>; fields: z.ZodOptional<z.ZodArray<z.ZodEnum<{ name: "name"; ico: "ico"; dic: "dic"; street: "street"; city: "city"; zip:…
```

### aresTestInput

const · `packages/modules/kontakty/src/contract.ts`

`kontakty.ares.test`: ověření dostupnosti ARES v Nastavení → Integrace (bez vstupu).

```ts
const aresTestInput: z.ZodObject<{}, z.core.$strip>
```

### companyCheckInput

const · `packages/modules/kontakty/src/contract.ts`

`kontakty.company.checkDuplicates`: stejné IČO, podobný název, stejná doména webu.

```ts
const companyCheckInput: z.ZodObject<{ name: z.ZodOptional<z.ZodString>; ico: z.ZodOptional<z.ZodString>; web: z.ZodOptional<z.ZodString>; excludeId: z.ZodOptional<z.ZodUUID>; }, z.core.$strip>
```

### companyIdInput

const · `packages/modules/kontakty/src/contract.ts`

`kontakty.company.contacts`: kontakty organizace (hlavní i další).

```ts
const companyIdInput: z.ZodObject<{ companyId: z.ZodUUID; }, z.core.$strip>
```

### mergeApplyInput

const · `packages/modules/kontakty/src/contract.ts`

`kontakty.merge.apply`: totéž se zápisem; nevratné, proto výslovné potvrzení.

```ts
const mergeApplyInput: z.ZodObject<{ entity: z.ZodEnum<{ company: "company"; person: "person"; }>; sourceId: z.ZodUUID; targetId: z.ZodUUID; confirm: z.ZodLiteral<true>; }, z.core.$strip>
```

### mergeInput

const · `packages/modules/kontakty/src/contract.ts`

Sloučení: `sourceId` zanikne, `targetId` (hlavní záznam) zůstane.

```ts
const mergeInput: z.ZodObject<{ entity: z.ZodEnum<{ company: "company"; person: "person"; }>; sourceId: z.ZodUUID; targetId: z.ZodUUID; }, z.core.$strip>
```

### personCheckInput

const · `packages/modules/kontakty/src/contract.ts`

`kontakty.person.checkDuplicates`: osoby se stejným e-mailem nebo telefonem (E.164).

```ts
const personCheckInput: z.ZodObject<{ emails: z.ZodOptional<z.ZodArray<z.ZodString>>; phones: z.ZodOptional<z.ZodArray<z.ZodString>>; excludeId: z.ZodOptional<z.ZodUUID>; }, z.core.$strip>
```

### personIdInput

const · `packages/modules/kontakty/src/contract.ts`

`kontakty.person.points`: kontaktní údaje osoby.

```ts
const personIdInput: z.ZodObject<{ personId: z.ZodUUID; }, z.core.$strip>
```

### personQuickCreateInput

const · `packages/modules/kontakty/src/contract.ts`

`kontakty.person.quickCreate`: rychlé založení kontaktu (z organizace, obchodu, zakázky, palety). Při shodě
e-mailu nebo telefonu s existující osobou nic nezaloží a vrátí shody; `force: true` založí i přesto.

```ts
const personQuickCreateInput: z.ZodObject<{ firstName: z.ZodOptional<z.ZodString>; lastName: z.ZodString; companyId: z.ZodOptional<z.ZodUUID>; position: z.ZodOptional<z.ZodString>; linkedin: z.ZodOptional<z.ZodString>; isDecisionMaker: z.ZodOptional<z.ZodBoolean>; poin…
```

### pointInputSchema

const · `packages/modules/kontakty/src/contract.ts`

Jeden kontaktní údaj osoby při úpravě (`id` mají jen už uložené).

```ts
const pointInputSchema: z.ZodObject<{ id: z.ZodOptional<z.ZodUUID>; kind: z.ZodEnum<{ email: "email"; phone: "phone"; }>; value: z.ZodString; label: z.ZodOptional<z.ZodNullable<z.ZodEnum<{ private: "private"; work: "work"; mobile: "mobile"; }>>>; isPrimary: z.Zod…
```

### pointKindSchema

const · `packages/modules/kontakty/src/contract.ts`

Druh kontaktního údaje a jeho štítek.

```ts
const pointKindSchema: z.ZodEnum<{ email: "email"; phone: "phone"; }>
```

### pointLabelSchema

const · `packages/modules/kontakty/src/contract.ts`

_Bez popisu._

```ts
const pointLabelSchema: z.ZodEnum<{ private: "private"; work: "work"; mobile: "mobile"; }>
```

### searchInput

const · `packages/modules/kontakty/src/contract.ts`

`kontakty.search`: hledání organizací a osob pro výběr (jméno, IČO, e-mail, část telefonu).

```ts
const searchInput: z.ZodObject<{ q: z.ZodOptional<z.ZodString>; limit: z.ZodOptional<z.ZodNumber>; kinds: z.ZodOptional<z.ZodArray<z.ZodEnum<{ company: "company"; person: "person"; }>>>; }, z.core.$strip>
```

### setCompaniesInput

const · `packages/modules/kontakty/src/contract.ts`

`kontakty.person.setCompanies`: hlavní organizace osoby a další organizace s rolí.

```ts
const setCompaniesInput: z.ZodObject<{ personId: z.ZodUUID; primaryCompanyId: z.ZodOptional<z.ZodNullable<z.ZodUUID>>; others: z.ZodArray<z.ZodObject<{ companyId: z.ZodUUID; role: z.ZodOptional<z.ZodNullable<z.ZodString>>; position: z.ZodOptional<z.ZodNullable<z.Z…
```

### setPointsInput

const · `packages/modules/kontakty/src/contract.ts`

`kontakty.person.setPoints`: nahradí kontaktní údaje osoby (jeden hlavní od každého druhu).

```ts
const setPointsInput: z.ZodObject<{ personId: z.ZodUUID; points: z.ZodArray<z.ZodObject<{ id: z.ZodOptional<z.ZodUUID>; kind: z.ZodEnum<{ email: "email"; phone: "phone"; }>; value: z.ZodString; label: z.ZodOptional<z.ZodNullable<z.ZodEnum<{ private: "private"; …
```

### AresCommandResult

type · `packages/modules/kontakty/src/contract.ts`

Výsledek `kontakty.ares`: náhled změn, zápis, nebo věta o nedostupnosti.

```ts
type AresCommandResult =
  | {
      ok: true;
      company: AresCompany;
      cached: boolean;
      stale: boolean;
      fetchedAt: string;
      /** Co ARES změní u organizace (u nové organizace vše doplní). */
      changes: AresChange[];
      /** Organizace s tímto IČO už existuje (jiná než upravovaná): ukládání s tímto IČO nejde (ORG-05). */
      duplicate: { id: string; name: string; visible: boolean } | null;
      /** Zapsaná pole, jen u `apply: true`. */
      applied?: AresField[];
      /** Čas synchronizace zapsaný do organizace, jen u `apply: true`. */
      syncedAt?: string;
    }
  | {
      ok: false;
      reason: "invalid" | "not_found" | "unavailable" | "rate_limited";
      message: string;
    };
```

### AresInput

type · `packages/modules/kontakty/src/contract.ts`

Vstup `kontakty.ares`.

```ts
type AresInput = z.infer<typeof aresInput>;
```

### AresTestResult

type · `packages/modules/kontakty/src/contract.ts`

Výsledek `kontakty.ares.test`.

```ts
type AresTestResult = {
  ok: boolean;
  /** Doba odpovědi v ms. */
  ms: number;
  /** Odpověď přišla v limitu 2 s (NFR-04). */
  withinBudget: boolean;
  message: string;
  /** Firma, kterou ARES vrátil pro zkušební IČO. */
  sample?: string;
};
```

### MergeInput

type · `packages/modules/kontakty/src/contract.ts`

Vstup `kontakty.merge.preview`.

```ts
type MergeInput = z.infer<typeof mergeInput>;
```

### MergePreview

type · `packages/modules/kontakty/src/contract.ts`

Náhled sloučení: co se přepojí, doplní a před čím je třeba varovat.

```ts
type MergePreview = {
  entity: "company" | "person";
  source: { id: string; name: string };
  target: { id: string; name: string };
  /** Související záznamy, které se přepojí na hlavní záznam (podle tabulek). */
  moves: { table: string; label: string; count: number }[];
  /** Pole, která se doplní z mizejícího záznamu do hlavního, protože hlavní je nemá. */
  fills: { field: string; label: string; value: string }[];
  /** Co se přidá sjednocením (štítky, kontaktní údaje, služby, další organizace). */
  adds: string[];
  /** Věty, které mají uživatele upozornit (IČO se liší, stavy klienta se liší…). */
  warnings: string[];
};
```

### MergeResult

type · `packages/modules/kontakty/src/contract.ts`

Výsledek `kontakty.merge.apply`.

```ts
type MergeResult = { moved: number; targetId: string };
```

### PersonCompanies

type · `packages/modules/kontakty/src/persons.ts`

Organizace osoby: hlavní a další s rolí.

```ts
type PersonCompanies = {
  primary: { companyId: string; name: string; position: string | null } | null;
  others: {
    id: string;
    companyId: string;
    name: string;
    role: string | null;
    position: string | null;
  }[];
};
```

### PersonQuickCreateInput

type · `packages/modules/kontakty/src/contract.ts`

Vstup `kontakty.person.quickCreate`.

```ts
type PersonQuickCreateInput = z.infer<typeof personQuickCreateInput>;
```

### PointInputT

type · `packages/modules/kontakty/src/contract.ts`

Jeden kontaktní údaj osoby při úpravě.

```ts
type PointInputT = z.infer<typeof pointInputSchema>;
```

### PointKind

type · `packages/modules/kontakty/src/points.ts`

Druh kontaktního údaje.

```ts
type PointKind = "email" | "phone";
```

### PointLabel

type · `packages/modules/kontakty/src/points.ts`

Štítek kontaktního údaje.

```ts
type PointLabel = (typeof CONTACT_POINT_LABELS)[number];
```

### QuickCreateResult

type · `packages/modules/kontakty/src/contract.ts`

Výsledek `kontakty.person.quickCreate`.

```ts
type QuickCreateResult =
  | { created: true; personId: string; name: string }
  | { created: false; duplicates: PersonDuplicate[] };
```

### SearchInput

type · `packages/modules/kontakty/src/contract.ts`

Vstup `kontakty.search`.

```ts
type SearchInput = z.infer<typeof searchInput>;
```

### SearchResult

type · `packages/modules/kontakty/src/contract.ts`

Výsledek `kontakty.search`.

```ts
type SearchResult = { companies: CompanyHit[]; persons: PersonHit[] };
```

### SetCompaniesInput

type · `packages/modules/kontakty/src/contract.ts`

Vstup `kontakty.person.setCompanies`.

```ts
type SetCompaniesInput = z.infer<typeof setCompaniesInput>;
```

### SetPointsInput

type · `packages/modules/kontakty/src/contract.ts`

Vstup `kontakty.person.setPoints`.

```ts
type SetPointsInput = z.infer<typeof setPointsInput>;
```
