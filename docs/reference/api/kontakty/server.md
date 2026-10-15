# @rebar/kontakty/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/kontakty/server` (soubor `packages/modules/kontakty/src/server.ts`). Exportů: 23, z toho s popisem 22.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`discoverReferences`](#discoverreferences) | function | Najde v katalogu databáze všechno, co odkazuje na firmu nebo osobu (viz popis nahoře). |  |
| [`matchContactDuplicates`](api.md#matchcontactduplicates) | function | Najde existující organizace a osoby, které se shodují v IČO (jen organizace), e-mailu nebo telefonu (bez ohledu na velikost písmen, mezery a předvolbu; osoby podle všech jejich údajů, ne jen hlavních). Respektuje rozsah `kontakty.read` aktéra a soukromé záznamy. Slouží kontrole duplicit při zakládání obchodů a rychlém zadání a při sloučení kontaktů. | v `@rebar/kontakty/api` |
| [`mergeContacts`](#mergecontacts) | function | Sloučí `sourceId` do `targetId` (hlavní záznam): přepojí všechny odkazy (obchody, zakázky, úkoly, poznámky, platby, komentáře, soubory…), doplní prázdná pole hlavního záznamu, spojí štítky, služby a kontaktní údaje, zdroj smaže (měkce, jde obnovit z koše, ale odkazy se nevrací) a zapíše historii k oběma záznamům. Vše v jedné transakci. Oprávnění: příkaz `kontakty.merge` (vlastník) a zápis do obou záznamů (rozsah „jen moje“ platí). |  |
| [`normalizeEmail`](api.md#normalizeemail) | function | E-mail pro porovnání: bez mezer, malými písmeny; bez zavináče je neplatný (`null`). | v `@rebar/kontakty/api` |
| [`normalizeIco`](api.md#normalizeico) | function | IČO: jen číslice (mezery a pomlčky pryč), kratší se doplní zleva nulami na osm. Prázdné nebo nesmyslné = `null`. | v `@rebar/kontakty/api` |
| [`normalizePhone`](api.md#normalizephone) | function | Telefon ve starém tvaru: devět koncových číslic (bez předvolby +420 / 00420); kratší než devět číslic se neporovnává. Nové kontaktní údaje se porovnávají v E.164 (`normalizePhoneE164`); tohle zůstává pro volající, kteří mají jen volný text. | v `@rebar/kontakty/api` |
| [`planMerge`](#planmerge) | function | Rozhodne, co z mizejícího záznamu přejde do hlavního: prázdná pole se doplní, štítky, služby a vlastní pole se spojí, u klienta vyhraje aktivnější stav (a nejstarší „klient od“), u osoby se spojí příznak „rozhoduje“. Rozdílné IČO, DIČ, e-mail a telefon zůstanou z hlavního záznamu a uživatel je dostane jako varování. Bez databáze. |  |
| [`previewMerge`](#previewmerge) | function | Náhled sloučení: co se přepojí, co se doplní a před čím je potřeba varovat. Nic nemění. |  |
| [`setAresClient`](api.md#setaresclient) | function | Adaptér ARES, který používají příkazy modulu. V testech se nahradí fake (`createFakeAres`); `null` vrátí reálný. | v `@rebar/kontakty/api` |
| [`CLIENT_STATUSES`](schema.md#client_statuses) | const | Stav klienta u organizace (`company.client_status`); `null` = organizace není klient (jen kontakt, dodavatel…). | v `@rebar/kontakty/schema` |
| [`SERVICE_TYPES`](schema.md#service_types) | const | Typy služeb, které agentura klientovi poskytuje (`company.services`). | v `@rebar/kontakty/schema` |
| [`TAG_LOOKUP`](#tag_lookup) | const | Společný číselník štítků (core `tag`), nabídka se zužuje na entitu přes `lookupScope`. |  |
| [`aresCache`](schema.md#arescache) | const | Cache odpovědí ARES podle IČO (24 h, ORG-04); technická tabulka bez soft-delete. | v `@rebar/kontakty/schema` |
| [`company`](schema.md#company) | const | Organizace. Klient je organizace se `client_status` (ne samostatná entita). IČO je mezi živými záznamy unikátní. Viditelnost: kořen s vlastním zámkem (soukromá organizace nedědí do obchodů ani zakázek, R-31). `drive_*` píše jen modul Disk, `last_activity_at` modul Úkoly (oboje přes `writeSystemFields`). | v `@rebar/kontakty/schema` |
| [`companyEntity`](#companyentity) | const | Organizace: klienti, potenciální klienti, dodavatelé a ostatní firmy v jedné evidenci (klient = `client_status`). |  |
| [`entities`](#entities) | const |  |  |
| [`person`](schema.md#person) | const | Kontaktní osoba. Jméno se skládá ze `first_name` a `last_name` (`full_name` je generovaný sloupec pro název záznamu, hledání a řazení). E-maily a telefony jsou v `person_contact_point`; hlavní firma je `primary_company_id`, další firmy jsou v `person_company`. | v `@rebar/kontakty/schema` |
| [`personCompany`](schema.md#personcompany) | const | Další organizace osoby (kromě hlavní, ta je v `person.primary_company_id`) s rolí a pozicí v nich. `is_primary` je vždy `false`; hlavní firma se do této tabulky nezapisuje (dotazy čtou obě místa). | v `@rebar/kontakty/schema` |
| [`personContactPoint`](schema.md#personcontactpoint) | const | E-mail nebo telefon osoby se štítkem. `value_norm` je normalizovaná hodnota pro porovnání a hledání (e-mail malými písmeny, telefon v E.164). Duplicity mezi osobami se jen hlásí (KON-03), unikátní je údaj jen u jedné osoby a jen jeden údaj daného druhu je hlavní. | v `@rebar/kontakty/schema` |
| [`personEntity`](#personentity) | const | Kontaktní osoby, volitelně u organizace; e-maily a telefony jsou v `person_contact_point`. |  |
| [`server`](#server) | const | Serverová část modulu „kontakty“: entity `company` a `person`, příkazy (hledání, ARES, duplicity, rychlé založení, kontaktní údaje, sloučení) a příspěvky pro ostatní moduly (karta klienta, proměnné e-mailů). |  |
| [`ContactQuery`](api.md#contactquery) | type | Údaje, podle kterých se hledá existující firma nebo osoba. | v `@rebar/kontakty/api` |
| [`MatchedBy`](api.md#matchedby) | type | V čem se nalezený záznam shoduje s hledaným: IČO, e-mail, telefon. | v `@rebar/kontakty/api` |

### discoverReferences

function · `packages/modules/kontakty/src/merge.ts`

Najde v katalogu databáze všechno, co odkazuje na firmu nebo osobu (viz popis nahoře).

```ts
async function discoverReferences(db: Executor, entity: MergeEntity): Promise<MergeRefs>
```

### mergeContacts

function · `packages/modules/kontakty/src/merge.ts`

Sloučí `sourceId` do `targetId` (hlavní záznam): přepojí všechny odkazy (obchody, zakázky, úkoly, poznámky, platby,
komentáře, soubory…), doplní prázdná pole hlavního záznamu, spojí štítky, služby a kontaktní údaje, zdroj smaže
(měkce, jde obnovit z koše, ale odkazy se nevrací) a zapíše historii k oběma záznamům. Vše v jedné transakci.
Oprávnění: příkaz `kontakty.merge` (vlastník) a zápis do obou záznamů (rozsah „jen moje“ platí).

```ts
async function mergeContacts(ctx: Ctx, entity: MergeEntity, sourceId: string, targetId: string): Promise<{ moved: number; targetId: string }>
```

### planMerge

function · `packages/modules/kontakty/src/merge.ts`

Rozhodne, co z mizejícího záznamu přejde do hlavního: prázdná pole se doplní, štítky, služby a vlastní pole se
spojí, u klienta vyhraje aktivnější stav (a nejstarší „klient od“), u osoby se spojí příznak „rozhoduje“. Rozdílné
IČO, DIČ, e-mail a telefon zůstanou z hlavního záznamu a uživatel je dostane jako varování. Bez databáze.

```ts
function planMerge(entity: MergeEntity, source: Raw, target: Raw): MergePlan
```

### previewMerge

function · `packages/modules/kontakty/src/merge.ts`

Náhled sloučení: co se přepojí, co se doplní a před čím je potřeba varovat. Nic nemění.

```ts
async function previewMerge(ctx: Ctx, entity: MergeEntity, sourceId: string, targetId: string): Promise<MergePreview>
```

### TAG_LOOKUP

const · `packages/modules/kontakty/src/entities.ts`

Společný číselník štítků (core `tag`), nabídka se zužuje na entitu přes `lookupScope`.

```ts
const TAG_LOOKUP: "tag"
```

### companyEntity

const · `packages/modules/kontakty/src/entities.ts`

Organizace: klienti, potenciální klienti, dodavatelé a ostatní firmy v jedné evidenci (klient = `client_status`).

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

Kontaktní osoby, volitelně u organizace; e-maily a telefony jsou v `person_contact_point`.

```ts
const personEntity: import("@rebar/core/entities").EntityDef
```

### server

const · `packages/modules/kontakty/src/server.ts`

Serverová část modulu „kontakty“: entity `company` a `person`, příkazy (hledání, ARES, duplicity, rychlé založení,
kontaktní údaje, sloučení) a příspěvky pro ostatní moduly (karta klienta, proměnné e-mailů).

```ts
const server: { readonly entities: import("@rebar/core/entities").EntityDef[]; readonly deleteBlockers: import("@rebar/core/entities").DeleteBlocker[]; readonly commands: (import("@rebar/core/module-server").CommandDef<import("zod").ZodObject<{ q: impor…
```
