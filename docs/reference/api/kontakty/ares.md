# @rebar/kontakty/ares

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/kontakty/ares` (soubor `packages/modules/kontakty/src/ares/index.ts`). Exportů: 28, z toho s popisem 28.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`aresValues`](#aresvalues) | function | Co přináší ARES jako hodnoty polí organizace (`name` i `officialName` z obchodního jména). |  |
| [`buildAresDiff`](#buildaresdiff) | function | Náhled změn: co ARES doplní nebo přepíše v organizaci (ORG-03). `current = null` je nová organizace (vše se doplní). Stejné hodnoty a údaje, které ARES nemá, se vynechají. Název (`name`) se přepisuje jen tam, kde je prázdný nebo zrcadlí oficiální název; vlastní zkrácený název („Novák Stavby“) se nepřepisuje, jen se nabídne (nezaškrtnutý). |  |
| [`createDbAresCache`](api.md#createdbarescache) | function | Cache v tabulce `ares_cache` (přežije restart, sdílí ji aplikace i worker). Chyba cache nikdy nerozbije dotaz. | v `@rebar/kontakty/api` |
| [`createFakeAres`](#createfakeares) | function | Vyrobí fake adaptér ARES; bez argumentů zná `FAKE_ARES_COMPANIES`. |  |
| [`createFetchAresClient`](#createfetcharesclient) | function | Reálný adaptér ARES přes `fetch` s časovým limitem. `fetchImpl` a `timeoutMs` jsou pro testy. |  |
| [`createMemoryAresCache`](#creatememoryarescache) | function | Cache v paměti pro testy a výchozí použití bez databáze. |  |
| [`getAresClient`](#getaresclient) | function | Aktuálně nastavený adaptér ARES. |  |
| [`isValidIco`](api.md#isvalidico) | function | Kontrolní součet IČO (modulo 11 podle váh 8–2); chybně opsané IČO se pozná, aniž by se volala síť. | v `@rebar/kontakty/api` |
| [`lookupAres`](api.md#lookupares) | function | Vyhledá organizaci v ARES podle IČO s cache 24 h. Nejdřív kontrola tvaru a kontrolního součtu (chybně opsané IČO se do sítě neposílá), pak cache, pak ARES. Když ARES neodpovídá a v cache je starší odpověď, vrátí ji s `stale`. Nikdy nevyhodí výjimku kvůli síti: `ok: false` nese větu pro uživatele. | v `@rebar/kontakty/api` |
| [`mapAres`](#mapares) | function | Převede odpověď ARES na pole organizace (ulice s číslem popisným a orientačním, město, PSČ s mezerou). |  |
| [`normalizeIco`](api.md#normalizeico) | function | IČO: jen číslice (mezery a pomlčky pryč), kratší se doplní zleva nulami na osm. Prázdné nebo nesmyslné = `null`. | v `@rebar/kontakty/api` |
| [`setAresClient`](api.md#setaresclient) | function | Adaptér ARES, který používají příkazy modulu. V testech se nahradí fake (`createFakeAres`); `null` vrátí reálný. | v `@rebar/kontakty/api` |
| [`ARES_BASE`](#ares_base) | const | Doplnění firmy z ARES (veřejné API Ministerstva financí, bez klíče; respektovat limity). |  |
| [`ARES_CACHE_MS`](#ares_cache_ms) | const | Jak dlouho se odpověď ARES drží v cache (ORG-04). |  |
| [`ARES_FIELDS`](#ares_fields) | const | Pole organizace, která jde doplnit z ARES. |  |
| [`ARES_FIELD_LABELS`](#ares_field_labels) | const | Popisky polí v náhledu změn. |  |
| [`ARES_TIMEOUT_MS`](#ares_timeout_ms) | const | Časový limit dotazu: ARES má doplnit údaje do 2 s (NFR-04), jinak se pokračuje ručně. |  |
| [`FAKE_ARES_COMPANIES`](#fake_ares_companies) | const | Ukázkové firmy pro testy (platná IČO). |  |
| [`LEGAL_FORMS`](#legal_forms) | const | Kód právní formy z ARES (`pravniForma`) → název. Neznámý kód se do organizace nepíše (lepší prázdné než hádat). |  |
| [`AresCache`](#arescache) | interface | Cache odpovědí ARES podle IČO (v DB tabulka `ares_cache`, v testech paměť). |  |
| [`AresClient`](#aresclient) | interface | Adaptér ARES: jediné místo, které mluví se sítí. Reálná implementace je `createFetchAresClient` (přes `fetch` s časovým limitem), pro testy `createFakeAres`. Nikdy nevyhazuje výjimku: chyba je výsledek `ok: false`. |  |
| [`AresChange`](#areschange) | type | Jedna změna v náhledu: co je teď, co přináší ARES a zda je výchozí zaškrtnutá. |  |
| [`AresCompany`](#arescompany) | type | Co ARES o firmě ví a co z toho se hodí do karty organizace. |  |
| [`AresFetchResult`](#aresfetchresult) | type | Surový výsledek dotazu na ARES (bez cache a kontroly IČO). |  |
| [`AresField`](#aresfield) | type | Pole organizace, které jde doplnit z ARES. |  |
| [`AresResult`](#aresresult) | type | Výsledek dotazu na ARES pro uživatele: nalezená firma (z paměti, nebo z ARES), nebo důvod a věta. |  |
| [`AresTarget`](#arestarget) | type | Údaje organizace, které se porovnávají s ARES (`null` = prázdné). |  |
| [`FakeAres`](#fakeares) | type | Fake ARES pro testy: znalé firmy, počítání volání, simulace výpadku a zpoždění. Bez sítě. |  |

### aresValues

function · `packages/modules/kontakty/src/ares/diff.ts`

Co přináší ARES jako hodnoty polí organizace (`name` i `officialName` z obchodního jména).

```ts
function aresValues(ares: AresCompany): AresTarget
```

### buildAresDiff

function · `packages/modules/kontakty/src/ares/diff.ts`

Náhled změn: co ARES doplní nebo přepíše v organizaci (ORG-03). `current = null` je nová organizace (vše se doplní).
Stejné hodnoty a údaje, které ARES nemá, se vynechají. Název (`name`) se přepisuje jen tam, kde je prázdný nebo
zrcadlí oficiální název; vlastní zkrácený název („Novák Stavby“) se nepřepisuje, jen se nabídne (nezaškrtnutý).

```ts
function buildAresDiff(current: Partial<AresTarget> | null, ares: AresCompany): AresChange[]
```

### createFakeAres

function · `packages/modules/kontakty/src/ares/fake.ts`

Vyrobí fake adaptér ARES; bez argumentů zná `FAKE_ARES_COMPANIES`.

```ts
function createFakeAres(companies: readonly AresCompany[] = FAKE_ARES_COMPANIES, opts: { latencyMs?: number; down?: boolean } = {}): FakeAres
```

### createFetchAresClient

function · `packages/modules/kontakty/src/ares/client.ts`

Reálný adaptér ARES přes `fetch` s časovým limitem. `fetchImpl` a `timeoutMs` jsou pro testy.

```ts
function createFetchAresClient(opts: { fetch?: typeof fetch; timeoutMs?: number } = {}): AresClient
```

### createMemoryAresCache

function · `packages/modules/kontakty/src/ares/lookup.ts`

Cache v paměti pro testy a výchozí použití bez databáze.

```ts
function createMemoryAresCache(): AresCache & { clear(): void }
```

### getAresClient

function · `packages/modules/kontakty/src/ares/lookup.ts`

Aktuálně nastavený adaptér ARES.

```ts
function getAresClient(): AresClient
```

### mapAres

function · `packages/modules/kontakty/src/ares/parse.ts`

Převede odpověď ARES na pole organizace (ulice s číslem popisným a orientačním, město, PSČ s mezerou).

```ts
function mapAres(raw: unknown): AresCompany | null
```

### ARES_BASE

const · `packages/modules/kontakty/src/ares/client.ts`

Doplnění firmy z ARES (veřejné API Ministerstva financí, bez klíče; respektovat limity).

Bezpečnost: volá se vždy jen pevná adresa ARES a do ní se vkládá pouze osmimístné IČO (žádná adresa od uživatele,
takže nejde o SSRF); bez přesměrování, s časovým limitem a stropem velikosti odpovědi. Každá chyba (bez sítě, limit,
neznámé IČO, jiný tvar odpovědi) se vrací jako výsledek `ok: false` s českou větou, nikdy jako výjimka: ruční
vyplnění organizace proto funguje i bez sítě.

```ts
const ARES_BASE: "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/"
```

### ARES_CACHE_MS

const · `packages/modules/kontakty/src/ares/lookup.ts`

Jak dlouho se odpověď ARES drží v cache (ORG-04).

```ts
const ARES_CACHE_MS: number
```

### ARES_FIELDS

const · `packages/modules/kontakty/src/ares/types.ts`

Pole organizace, která jde doplnit z ARES.

```ts
const ARES_FIELDS: readonly ["name", "officialName", "ico", "dic", "legalForm", "street", "city", "zip"]
```

### ARES_FIELD_LABELS

const · `packages/modules/kontakty/src/ares/types.ts`

Popisky polí v náhledu změn.

```ts
const ARES_FIELD_LABELS: Record<AresField, string>
```

### ARES_TIMEOUT_MS

const · `packages/modules/kontakty/src/ares/client.ts`

Časový limit dotazu: ARES má doplnit údaje do 2 s (NFR-04), jinak se pokračuje ručně.

```ts
const ARES_TIMEOUT_MS: 2000
```

### FAKE_ARES_COMPANIES

const · `packages/modules/kontakty/src/ares/fake.ts`

Ukázkové firmy pro testy (platná IČO).

```ts
const FAKE_ARES_COMPANIES: readonly AresCompany[]
```

### LEGAL_FORMS

const · `packages/modules/kontakty/src/ares/parse.ts`

Kód právní formy z ARES (`pravniForma`) → název. Neznámý kód se do organizace nepíše (lepší prázdné než hádat).

```ts
const LEGAL_FORMS: Record<string, string>
```

### AresCache

interface · `packages/modules/kontakty/src/ares/types.ts`

Cache odpovědí ARES podle IČO (v DB tabulka `ares_cache`, v testech paměť).

```ts
interface AresCache {
  get(ico: string): Promise<{ company: AresCompany; fetchedAt: Date } | null>;
  set(ico: string, company: AresCompany, at: Date): Promise<void>;
}
```

### AresClient

interface · `packages/modules/kontakty/src/ares/types.ts`

Adaptér ARES: jediné místo, které mluví se sítí. Reálná implementace je `createFetchAresClient` (přes `fetch`
s časovým limitem), pro testy `createFakeAres`. Nikdy nevyhazuje výjimku: chyba je výsledek `ok: false`.

```ts
interface AresClient {
  lookup(ico: string): Promise<AresFetchResult>;
}
```

### AresChange

type · `packages/modules/kontakty/src/ares/types.ts`

Jedna změna v náhledu: co je teď, co přináší ARES a zda je výchozí zaškrtnutá.

```ts
type AresChange = {
  field: AresField;
  label: string;
  current: string | null;
  incoming: string | null;
  /** `fill` = pole je prázdné, `change` = přepíše se jiná hodnota. */
  kind: "fill" | "change";
  /** Výchozí volba v náhledu (název se přepisuje jen tam, kde zrcadlí oficiální název). */
  selected: boolean;
};
```

### AresCompany

type · `packages/modules/kontakty/src/ares/types.ts`

Co ARES o firmě ví a co z toho se hodí do karty organizace.

```ts
type AresCompany = {
  ico: string;
  /** Obchodní jméno z ARES (v organizaci jde do `officialName`, případně i do `name`). */
  name: string;
  dic: string | null;
  /** Právní forma slovy (`Společnost s ručením omezeným`); neznámý kód = `null`. */
  legalForm: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
};
```

### AresFetchResult

type · `packages/modules/kontakty/src/ares/types.ts`

Surový výsledek dotazu na ARES (bez cache a kontroly IČO).

```ts
type AresFetchResult =
  | { ok: true; company: AresCompany }
  | { ok: false; reason: "not_found" | "unavailable"; message: string };
```

### AresField

type · `packages/modules/kontakty/src/ares/types.ts`

Pole organizace, které jde doplnit z ARES.

```ts
type AresField = (typeof ARES_FIELDS)[number];
```

### AresResult

type · `packages/modules/kontakty/src/ares/types.ts`

Výsledek dotazu na ARES pro uživatele: nalezená firma (z paměti, nebo z ARES), nebo důvod a věta.

```ts
type AresResult =
  | {
      ok: true;
      company: AresCompany;
      /** Odpověď přišla z cache (do 24 h), ne ze sítě. */
      cached: boolean;
      /** ARES neodpovídal a údaje jsou starší než 24 h (lepší než nic; UI na to upozorní). */
      stale: boolean;
      /** Kdy se údaje z ARES naposledy stáhly (ISO). */
      fetchedAt: string;
    }
  | { ok: false; reason: "invalid" | "not_found" | "unavailable"; message: string };
```

### AresTarget

type · `packages/modules/kontakty/src/ares/diff.ts`

Údaje organizace, které se porovnávají s ARES (`null` = prázdné).

```ts
type AresTarget = Record<AresField, string | null>;
```

### FakeAres

type · `packages/modules/kontakty/src/ares/fake.ts`

Fake ARES pro testy: znalé firmy, počítání volání, simulace výpadku a zpoždění. Bez sítě.

```ts
type FakeAres = AresClient & {
  /** IČO všech dotazů v pořadí, v jakém přišly. */
  readonly calls: string[];
  /** Přepne simulaci výpadku (`unavailable`). */
  setDown(down: boolean): void;
  /** Přidá nebo přepíše firmu, kterou ARES „zná“. */
  add(company: AresCompany): void;
};
```
