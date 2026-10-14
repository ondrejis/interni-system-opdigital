# @rebar/kontakty/api

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/kontakty/api` (soubor `packages/modules/kontakty/src/api.ts`). Exportů: 29, z toho s popisem 29.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`aresLookup`](#areslookup) | function | Vyhledá firmu v ARES podle IČO. `fetchImpl` je pro testy. |  |
| [`createCompanyQuick`](#createcompanyquick) | function | Rychle založí organizaci jen s názvem (a volitelně IČO a vlastníkem). |  |
| [`discoverReferences`](#discoverreferences) | function | Najde v katalogu databáze všechno, co odkazuje na firmu nebo osobu (viz popis nahoře). |  |
| [`findCompanyByIco`](#findcompanybyico) | function | Živá firma podle IČO (bez ohledu na formát zápisu), nebo `null`. |  |
| [`findContactDuplicates`](#findcontactduplicates) | function | Osoby, které se shodují v e-mailu nebo telefonu (E.164), bez osoby `excludeId`. |  |
| [`getPrimaryContact`](#getprimarycontact) | function | Hlavní kontaktní osoba firmy s primárním telefonem a e-mailem, nebo `null`. |  |
| [`isValidIco`](#isvalidico) | function | Kontrolní součet IČO (modulo 11 podle váh 8–2); chybně opsané IČO se pozná, aniž by se volala síť. |  |
| [`listContactPoints`](#listcontactpoints) | function | Další e-maily a telefony osoby s typem (hlavní údaje jsou ve sloupcích osoby). |  |
| [`mapAres`](#mapares) | function | Převede odpověď ARES na pole firmy (ulice s číslem popisným a orientačním, město, PSČ s mezerou). |  |
| [`matchContactDuplicates`](#matchcontactduplicates) | function | Najde existující firmy a osoby, které se shodují v IČO (jen firmy), e-mailu nebo telefonu (shoda bez ohledu na velikost písmen, mezery a předvolbu). Respektuje rozsah oprávnění ke kontaktům aktéra (`kontakty.read`). Slouží kontrole duplicit při zakládání obchodů i rychlém zadání (a při sloučení kontaktů). |  |
| [`mergeContacts`](#mergecontacts) | function | Sloučí `sourceId` do `targetId`: přepojí všechny odkazy, doplní prázdná pole cíle, spojí štítky, role a kontaktní údaje, zdroj smaže (měkce, jde obnovit z koše, ale odkazy se nevrací) a zapíše audit. Vše v jedné transakci. Oprávnění: zápis do obou záznamů (rozsah „jen moje“ platí) a příkaz `kontakty.merge`. |  |
| [`normalizeEmail`](#normalizeemail) | function | E-mail pro porovnání: bez mezer, malými písmeny; bez zavináče je neplatný (`null`). |  |
| [`normalizeIco`](#normalizeico) | function | IČO: jen číslice (mezery a pomlčky pryč), kratší se doplní zleva nulami na osm. Prázdné nebo nesmyslné = `null`. |  |
| [`normalizeIcoInput`](#normalizeicoinput) | function | IČO jen z číslic, kratší doplněné nulami zleva na osm; nesmysl vrátí `null`. |  |
| [`normalizePhone`](#normalizephone) | function | Telefon: devět koncových číslic (bez předvolby +420 / 00420); kratší než devět číslic se neporovnává. |  |
| [`previewMerge`](#previewmerge) | function | Náhled sloučení: co se přepojí, co se doplní a před čím je potřeba varovat. Nic nemění. |  |
| [`searchContacts`](#searchcontacts) | function | Hledání firem a osob podle jména (bez diakritiky a velikosti písmen), IČO, e-mailu a telefonu. Respektuje rozsah oprávnění ke kontaktům (`kontakty.read`). Prázdný dotaz vrátí posledně upravené záznamy. |  |
| [`upsertContactFromLead`](#upsertcontactfromlead) | function | Najde nebo založí kontakt a firmu z leadu (e-mail a telefon, firma podle IČO nebo názvu); firmě nenastaví `client_status`. |  |
| [`AresCompany`](#arescompany) | type | Co ARES o firmě ví a co z toho se hodí do karty firmy. |  |
| [`AresResult`](#aresresult) | type | Výsledek dotazu na ARES: nalezená firma, nebo důvod a věta pro uživatele. |  |
| [`CompanyHit`](#companyhit) | type | Výsledek hledání kontaktu pro výběr (rychlé zadání, účastníci zakázky, sloučení). |  |
| [`CompanyMatch`](#companymatch) | type | Existující firma, která se shoduje s hledanými údaji. |  |
| [`ContactQuery`](#contactquery) | type | Údaje, podle kterých se hledá existující firma nebo osoba. |  |
| [`MatchedBy`](#matchedby) | type | V čem se nalezený záznam shoduje s hledaným: IČO, e-mail, telefon. |  |
| [`MergeEntity`](#mergeentity) | type | Sloučení duplicitních kontaktů (firma do firmy, osoba do osoby). |  |
| [`MergePreview`](#mergepreview) | type | Náhled sloučení: co se přepojí, doplní a před čím je třeba varovat. |  |
| [`MergeRefs`](#mergerefs) | type | Všechny odkazy na firmu nebo osobu zjištěné v databázi: sloupce a polymorfní vazby. |  |
| [`PersonHit`](#personhit) | type | Osoba nalezená hledáním (jméno, kontakt a firma pro výběr). |  |
| [`PersonMatch`](#personmatch) | type | Existující osoba, která se shoduje s hledanými údaji. |  |

### aresLookup

function · `packages/modules/kontakty/src/ares.ts`

Vyhledá firmu v ARES podle IČO. `fetchImpl` je pro testy.

```ts
async function aresLookup(icoInput: string, fetchImpl: typeof fetch = fetch): Promise<AresResult>
```

### createCompanyQuick

function · `packages/modules/kontakty/src/api.ts`

Rychle založí organizaci jen s názvem (a volitelně IČO a vlastníkem).

```ts
async function createCompanyQuick(_ctx: Ctx, _input: { name: string; ico?: string; ownerId?: string }): Promise<{ id: string }>
```

### discoverReferences

function · `packages/modules/kontakty/src/merge.ts`

Najde v katalogu databáze všechno, co odkazuje na firmu nebo osobu (viz popis nahoře).

```ts
async function discoverReferences(db: Executor, entity: MergeEntity): Promise<MergeRefs>
```

### findCompanyByIco

function · `packages/modules/kontakty/src/api.ts`

Živá firma podle IČO (bez ohledu na formát zápisu), nebo `null`.

```ts
async function findCompanyByIco(_ctx: Ctx, _ico: string): Promise<{ id: string; name: string } | null>
```

### findContactDuplicates

function · `packages/modules/kontakty/src/api.ts`

Osoby, které se shodují v e-mailu nebo telefonu (E.164), bez osoby `excludeId`.

```ts
async function findContactDuplicates(_ctx: Ctx, _input: { emails?: string[]; phones?: string[]; excludeId?: string }): Promise<{ personId: string; name: string; match: "email" | "phone" }[]>
```

### getPrimaryContact

function · `packages/modules/kontakty/src/api.ts`

Hlavní kontaktní osoba firmy s primárním telefonem a e-mailem, nebo `null`.

```ts
async function getPrimaryContact(_ctx: Ctx, _companyId: string): Promise<{ personId: string; name: string; phone?: string; email?: string } | null>
```

### isValidIco

function · `packages/modules/kontakty/src/ares.ts`

Kontrolní součet IČO (modulo 11 podle váh 8–2); chybně opsané IČO se pozná, aniž by se volala síť.

```ts
function isValidIco(ico: string): boolean
```

### listContactPoints

function · `packages/modules/kontakty/src/api.ts`

Další e-maily a telefony osoby s typem (hlavní údaje jsou ve sloupcích osoby).

```ts
async function listContactPoints(ctx: Ctx, personId: string): Promise<{ id: string; kind: string; value: string; label: string | null; }[]>
```

### mapAres

function · `packages/modules/kontakty/src/ares.ts`

Převede odpověď ARES na pole firmy (ulice s číslem popisným a orientačním, město, PSČ s mezerou).

```ts
function mapAres(raw: unknown): AresCompany | null
```

### matchContactDuplicates

function · `packages/modules/kontakty/src/duplicates.ts`

Najde existující firmy a osoby, které se shodují v IČO (jen firmy), e-mailu nebo telefonu (shoda bez ohledu na velikost
písmen, mezery a předvolbu). Respektuje rozsah oprávnění ke kontaktům aktéra (`kontakty.read`). Slouží kontrole duplicit
při zakládání obchodů i rychlém zadání (a při sloučení kontaktů).

```ts
async function matchContactDuplicates(ctx: Ctx, query: ContactQuery): Promise<{ companies: CompanyMatch[]; persons: PersonMatch[] }>
```

### mergeContacts

function · `packages/modules/kontakty/src/merge.ts`

Sloučí `sourceId` do `targetId`: přepojí všechny odkazy, doplní prázdná pole cíle, spojí štítky, role a kontaktní údaje,
zdroj smaže (měkce, jde obnovit z koše, ale odkazy se nevrací) a zapíše audit. Vše v jedné transakci.
Oprávnění: zápis do obou záznamů (rozsah „jen moje“ platí) a příkaz `kontakty.merge`.

```ts
async function mergeContacts(ctx: Ctx, entity: MergeEntity, sourceId: string, targetId: string): Promise<{ moved: number; targetId: string }>
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

### normalizeIcoInput

function · `packages/modules/kontakty/src/ares.ts`

IČO jen z číslic, kratší doplněné nulami zleva na osm; nesmysl vrátí `null`.

```ts
function normalizeIcoInput(v: string | null | undefined): string | null
```

### normalizePhone

function · `packages/modules/kontakty/src/duplicates.ts`

Telefon: devět koncových číslic (bez předvolby +420 / 00420); kratší než devět číslic se neporovnává.

```ts
function normalizePhone(v: string | null | undefined): string | null
```

### previewMerge

function · `packages/modules/kontakty/src/merge.ts`

Náhled sloučení: co se přepojí, co se doplní a před čím je potřeba varovat. Nic nemění.

```ts
async function previewMerge(ctx: Ctx, entity: MergeEntity, sourceId: string, targetId: string): Promise<MergePreview>
```

### searchContacts

function · `packages/modules/kontakty/src/api.ts`

Hledání firem a osob podle jména (bez diakritiky a velikosti písmen), IČO, e-mailu a telefonu. Respektuje rozsah
oprávnění ke kontaktům (`kontakty.read`). Prázdný dotaz vrátí posledně upravené záznamy.

```ts
async function searchContacts(ctx: Ctx, input: { q?: string | undefined; limit?: number | undefined; kinds?: ("company" | "person")[] }): Promise<{ companies: CompanyHit[]; persons: PersonHit[] }>
```

### upsertContactFromLead

function · `packages/modules/kontakty/src/api.ts`

Najde nebo založí kontakt a firmu z leadu (e-mail a telefon, firma podle IČO nebo názvu); firmě nenastaví `client_status`.

```ts
async function upsertContactFromLead(_ctx: Ctx, _input: { name: string; email?: string; phone?: string; companyName?: string; ico?: string }): Promise<{ personId: string; companyId: string | null; created: { person: boolean; company: boolean }; }>
```

### AresCompany

type · `packages/modules/kontakty/src/ares.ts`

Co ARES o firmě ví a co z toho se hodí do karty firmy.

```ts
type AresCompany = {
  ico: string;
  name: string;
  dic: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
};
```

### AresResult

type · `packages/modules/kontakty/src/ares.ts`

Výsledek dotazu na ARES: nalezená firma, nebo důvod a věta pro uživatele.

```ts
type AresResult =
  | { ok: true; company: AresCompany; cached: boolean }
  | { ok: false; reason: "invalid" | "not_found" | "unavailable"; message: string };
```

### CompanyHit

type · `packages/modules/kontakty/src/api.ts`

Výsledek hledání kontaktu pro výběr (rychlé zadání, účastníci zakázky, sloučení).

```ts
type CompanyHit = {
  id: string;
  name: string;
  ico: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  type: string | null;
};
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

### MergeEntity

type · `packages/modules/kontakty/src/merge.ts`

Sloučení duplicitních kontaktů (firma do firmy, osoba do osoby).

Odkazy na záznam se nehledají ručním výčtem tabulek (ten by zastaral s každým novým modulem), ale v katalogu
databáze (`discoverReferences`):
 1. cizí klíče na `company(id)` / `person(id)` (zakázky, poptávky, účastníci…),
 2. sloupce `company_id` / `person_id` bez cizího klíče (aktivity CRM, jejich vazby jsou měkké),
 3. polymorfní vazby `entity_type` + `entity_id` (komentáře, úkoly, soubory, poznámky, upozornění, e-maily).
Test (`merge.int.test.ts`) hlídá, že žádný sloupec s podobným názvem nezůstane mimo tento výčet.

Výjimky: `audit_log` a `search_document` se nepřepisují (historie zůstane u původního id, hledání se přeindexuje).

```ts
type MergeEntity = "company" | "person";
```

### MergePreview

type · `packages/modules/kontakty/src/merge.ts`

Náhled sloučení: co se přepojí, doplní a před čím je třeba varovat.

```ts
type MergePreview = {
  entity: MergeEntity;
  source: { id: string; name: string };
  target: { id: string; name: string };
  /** Související záznamy, které se přepojí na cílový záznam. */
  moves: { table: string; label: string; count: number }[];
  /** Pole, která se doplní z mizejícího záznamu do cílového, protože cílový je nemá. */
  fills: { field: string; label: string; value: string }[];
  /** Co se přidá sjednocením (role, štítky, další kontaktní údaje). */
  adds: string[];
  /** Věty, které mají uživatele upozornit (IČO se liší, firmy jsou v různých skupinách…). */
  warnings: string[];
};
```

### MergeRefs

type · `packages/modules/kontakty/src/merge.ts`

Všechny odkazy na firmu nebo osobu zjištěné v databázi: sloupce a polymorfní vazby.

```ts
type MergeRefs = { columns: RefColumn[]; poly: PolyRef[] };
```

### PersonHit

type · `packages/modules/kontakty/src/api.ts`

Osoba nalezená hledáním (jméno, kontakt a firma pro výběr).

```ts
type PersonHit = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  companyId: string | null;
  companyName: string | null;
};
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
