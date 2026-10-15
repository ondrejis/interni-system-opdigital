# @rebar/kontakty/api

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/kontakty/api` (soubor `packages/modules/kontakty/src/api.ts`). Exportů: 42, z toho s popisem 42.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`checkCompanyDuplicates`](#checkcompanyduplicates) | function | Zkontroluje, zda organizace s tímto IČO, podobným názvem nebo stejnou doménou webu už existuje. `excludeId` je upravovaná organizace (sama sebe nehlásí). Přes soukromé záznamy se nevidí: shoda v IČO u soukromé organizace vrátí `visible: false` bez názvu (uložit nejde, ale nic se neprozradí), ostatní shody se u skrytých záznamů vynechají. |  |
| [`companyUrl`](#companyurl) | function | Adresa detailu organizace (stejná jako `EntityDef.url`). |  |
| [`countCompanyContacts`](#countcompanycontacts) | function | Počet kontaktů organizace (hlavních i dalších), bez soukromých osob pro toho, kdo je nevidí. |  |
| [`createCompanyQuick`](#createcompanyquick) | function | Rychle založí organizaci jen s názvem (a volitelně IČO a vlastníkem). Stejné IČO nedovolí (vyhodí `UserError` s odkazem na existující organizaci, použijte nejdřív `findCompanyByIco`). `client_status` nenastavuje. |  |
| [`createDbAresCache`](#createdbarescache) | function | Cache v tabulce `ares_cache` (přežije restart, sdílí ji aplikace i worker). Chyba cache nikdy nerozbije dotaz. |  |
| [`createPersonQuick`](#createpersonquick) | function | Rychle založí kontaktní osobu (jméno, volitelně hlavní organizace, e-mail a telefon). Duplicity nehlídá: volající si je předtím zjistí přes `findContactDuplicates` a rozhodne se (použít existující, nebo založit). |  |
| [`findCompanyByIco`](#findcompanybyico) | function | Živá organizace podle IČO (v jakémkoli zápisu), nebo `null`; soukromé záznamy se aktérovi bez práva neukážou. |  |
| [`findCompanyByName`](#findcompanybyname) | function | Živá organizace podle přesného názvu (bez ohledu na velikost písmen a diakritiku), nebo `null`. |  |
| [`findContactDuplicates`](#findcontactduplicates) | function | Osoby, které se shodují v e-mailu nebo telefonu (E.164, bez ohledu na mezery a předvolbu) s některým ze zadaných, bez osoby `excludeId`. Shoduje se i podle jiných než hlavních údajů osoby. |  |
| [`findPersonDuplicates`](#findpersonduplicates) | function | Osoby, které se shodují v některém z e-mailů (malá písmena) nebo telefonů (E.164: `777 123 456`, `+420777123456` a `00420 777 123 456` jsou totéž). Bez osoby `excludeId`, bez soukromých osob (pro toho, kdo je nevidí). Osoba se shoduje i podle jiného než hlavního údaje. Jedna osoba může být v obou druzích (e-mail dřív). |  |
| [`formatPhone`](#formatphone) | function | Telefon k zobrazení: platné číslo v mezinárodním tvaru se skupinami (`+420 777 123 456`), jinak beze změny. |  |
| [`getPrimaryContact`](#getprimarycontact) | function | Hlavní kontaktní osoba organizace s primárním telefonem a e-mailem: ten, kdo rozhoduje; jinak osoba s hlavní organizací touto organizací, která má telefon nebo e-mail; jinak první. `null`, když organizace nemá žádný kontakt. |  |
| [`icoDuplicateMessage`](#icoduplicatemessage) | function | Věta pro uživatele, když IČO už v evidenci je; bez práva na záznam se neprozradí název. |  |
| [`isValidIco`](#isvalidico) | function | Kontrolní součet IČO (modulo 11 podle váh 8–2); chybně opsané IČO se pozná, aniž by se volala síť. |  |
| [`isValidPhone`](#isvalidphone) | function | Je to platné telefonní číslo (podle pravidel číslovacího plánu), ne jen něco, co se dá porovnat? |  |
| [`listCompanyContacts`](#listcompanycontacts) | function | Kontakty organizace: osoby, které mají organizaci jako hlavní, i ty, které ji mají mezi dalšími. Nejdřív ti, kdo rozhodují, potom hlavní organizace, pak podle příjmení. Soukromé osoby se vynechají, kdo je nevidí. |  |
| [`listPoints`](#listpoints) | function | Živé kontaktní údaje jedné osoby. |  |
| [`lookupAres`](#lookupares) | function | Vyhledá organizaci v ARES podle IČO s cache 24 h. Nejdřív kontrola tvaru a kontrolního součtu (chybně opsané IČO se do sítě neposílá), pak cache, pak ARES. Když ARES neodpovídá a v cache je starší odpověď, vrátí ji s `stale`. Nikdy nevyhodí výjimku kvůli síti: `ok: false` nese větu pro uživatele. |  |
| [`matchContactDuplicates`](#matchcontactduplicates) | function | Najde existující organizace a osoby, které se shodují v IČO (jen organizace), e-mailu nebo telefonu (bez ohledu na velikost písmen, mezery a předvolbu; osoby podle všech jejich údajů, ne jen hlavních). Respektuje rozsah `kontakty.read` aktéra a soukromé záznamy. Slouží kontrole duplicit při zakládání obchodů a rychlém zadání a při sloučení kontaktů. |  |
| [`normalizeEmail`](#normalizeemail) | function | E-mail pro porovnání: bez mezer, malými písmeny; bez zavináče je neplatný (`null`). |  |
| [`normalizeIco`](#normalizeico) | function | IČO: jen číslice (mezery a pomlčky pryč), kratší se doplní zleva nulami na osm. Prázdné nebo nesmyslné = `null`. |  |
| [`normalizePhone`](#normalizephone) | function | Telefon ve starém tvaru: devět koncových číslic (bez předvolby +420 / 00420); kratší než devět číslic se neporovnává. Nové kontaktní údaje se porovnávají v E.164 (`normalizePhoneE164`); tohle zůstává pro volající, kteří mají jen volný text. |  |
| [`normalizePhoneE164`](#normalizephonee164) | function | Telefon v E.164 (`+420777123456`) nezávisle na mezerách, pomlčkách a předvolbě: `777 123 456`, `+420 777 123 456` i `00420777123456` dají totéž. Číslo bez předvolby se čte jako české. Neplatné číslo (třeba nesmyslný prefix) se nezahodí, ale zapíše se co nejvěrněji (`+420…` u devíti číslic, jinak číslice), aby šlo kontrolovat duplicity i u lead formulářů s překlepem. Méně než pět číslic nebo prázdný text = `null`. |  |
| [`personUrl`](#personurl) | function | Adresa detailu osoby (stejná jako `EntityDef.url`). |  |
| [`searchContacts`](#searchcontacts) | function | Hledání organizací a osob podle jména (bez diakritiky a velikosti písmen), IČO, e-mailu a telefonu (podčástí čísla bez předvolby: „777 12“ najde „+420 777 123 456“, i podle dalších než hlavních údajů). Respektuje rozsah `kontakty.read` a soukromé záznamy. Prázdný dotaz vrátí naposledy upravené záznamy. |  |
| [`setAresClient`](#setaresclient) | function | Adaptér ARES, který používají příkazy modulu. V testech se nahradí fake (`createFakeAres`); `null` vrátí reálný. |  |
| [`splitFullName`](#splitfullname) | function | Rozdělí jméno `Jan Novák` na křestní jméno a příjmení (poslední slovo je příjmení). Jedno slovo je příjmení. |  |
| [`upsertContactFromLead`](#upsertcontactfromlead) | function | Najde nebo založí kontakt a organizaci z leadu (REK, OBC). Organizace: podle IČO, jinak podle přesného názvu, jinak se založí (jen z názvu nebo IČO) a **nemá `client_status`** (R-15: lead z reklamy nedělá klienta). Osoba: podle e-mailu nebo telefonu (E.164, nezávisle na mezerách a předvolbě); nalezené osobě se doplní chybějící údaje z leadu a chybějící organizace, jinak se založí. Volat v transakci volajícího (`inTx`), aby lead a obchod vznikly atomicky; nic dalšího nekontroluje (oprávnění je na volajícím příkazu). |  |
| [`webDomainOf`](#webdomainof) | function | Doména z adresy webu: bez protokolu, `www.`, cesty, portu a přihlašovacích údajů, malými písmeny. Nesmysl nebo prázdný text = `null`. |  |
| [`CompanyContact`](#companycontact) | type | Kontakt organizace pro seznam v kartě: osoba s rolí v této organizaci a hlavními údaji. |  |
| [`CompanyDuplicate`](#companyduplicate) | type | Nalezená organizace, která se shoduje s hledanou. |  |
| [`CompanyDuplicateCheck`](#companyduplicatecheck) | type | Výsledek kontroly duplicit organizace. |  |
| [`CompanyHit`](#companyhit) | type | Výsledek hledání organizace pro výběr (rychlé zadání, účastníci zakázky, sloučení). |  |
| [`CompanyMatch`](#companymatch) | type | Existující organizace, která se shoduje s hledanými údaji. |  |
| [`ContactQuery`](#contactquery) | type | Údaje, podle kterých se hledá existující firma nebo osoba. |  |
| [`LeadContactInput`](#leadcontactinput) | type | Vstup `upsertContactFromLead`: jméno a údaje z formuláře (Meta lead, web). |  |
| [`LeadContactResult`](#leadcontactresult) | type | Výsledek: osoba a organizace (nebo `null`) a co z toho vzniklo nově. |  |
| [`MatchedBy`](#matchedby) | type | V čem se nalezený záznam shoduje s hledaným: IČO, e-mail, telefon. |  |
| [`PersonDuplicate`](#personduplicate) | type | Nalezená osoba, která se shoduje v e-mailu nebo telefonu. |  |
| [`PersonHit`](#personhit) | type | Osoba nalezená hledáním (jméno, kontakt a organizace pro výběr). |  |
| [`PersonMatch`](#personmatch) | type | Existující osoba, která se shoduje s hledanými údaji. |  |
| [`PointRow`](#pointrow) | type | Kontaktní údaj osoby tak, jak se čte. |  |

### checkCompanyDuplicates

function · `packages/modules/kontakty/src/duplicates.ts`

Zkontroluje, zda organizace s tímto IČO, podobným názvem nebo stejnou doménou webu už existuje. `excludeId` je
upravovaná organizace (sama sebe nehlásí). Přes soukromé záznamy se nevidí: shoda v IČO u soukromé organizace
vrátí `visible: false` bez názvu (uložit nejde, ale nic se neprozradí), ostatní shody se u skrytých záznamů vynechají.

```ts
async function checkCompanyDuplicates(ctx: Ctx, q: { name?: string | null; ico?: string | null; web?: string | null; excludeId?: string | null }): Promise<CompanyDuplicateCheck>
```

### companyUrl

function · `packages/modules/kontakty/src/companies.ts`

Adresa detailu organizace (stejná jako `EntityDef.url`).

```ts
function companyUrl(id: string): string
```

### countCompanyContacts

function · `packages/modules/kontakty/src/persons.ts`

Počet kontaktů organizace (hlavních i dalších), bez soukromých osob pro toho, kdo je nevidí.

```ts
async function countCompanyContacts(ctx: Ctx, companyId: string): Promise<number>
```

### createCompanyQuick

function · `packages/modules/kontakty/src/api.ts`

Rychle založí organizaci jen s názvem (a volitelně IČO a vlastníkem). Stejné IČO nedovolí (vyhodí `UserError`
s odkazem na existující organizaci, použijte nejdřív `findCompanyByIco`). `client_status` nenastavuje.

```ts
async function createCompanyQuick(ctx: Ctx, input: { name: string; ico?: string; ownerId?: string }): Promise<{ id: string }>
```

### createDbAresCache

function · `packages/modules/kontakty/src/ares/lookup.ts`

Cache v tabulce `ares_cache` (přežije restart, sdílí ji aplikace i worker). Chyba cache nikdy nerozbije dotaz.

```ts
function createDbAresCache(db: Executor): AresCache
```

### createPersonQuick

function · `packages/modules/kontakty/src/api.ts`

Rychle založí kontaktní osobu (jméno, volitelně hlavní organizace, e-mail a telefon). Duplicity nehlídá: volající
si je předtím zjistí přes `findContactDuplicates` a rozhodne se (použít existující, nebo založit).

```ts
async function createPersonQuick(ctx: Ctx, input: { firstName?: string; lastName: string; companyId?: string; position?: string; email?: string; phone?: string; ownerId?: string; }): Promise<{ id: string; name: string }>
```

### findCompanyByIco

function · `packages/modules/kontakty/src/companies.ts`

Živá organizace podle IČO (v jakémkoli zápisu), nebo `null`; soukromé záznamy se aktérovi bez práva neukážou.

```ts
async function findCompanyByIco(ctx: Ctx, icoInput: string): Promise<{ id: string; name: string } | null>
```

### findCompanyByName

function · `packages/modules/kontakty/src/companies.ts`

Živá organizace podle přesného názvu (bez ohledu na velikost písmen a diakritiku), nebo `null`.

```ts
async function findCompanyByName(ctx: Ctx, name: string): Promise<{ id: string; name: string } | null>
```

### findContactDuplicates

function · `packages/modules/kontakty/src/api.ts`

Osoby, které se shodují v e-mailu nebo telefonu (E.164, bez ohledu na mezery a předvolbu) s některým ze zadaných,
bez osoby `excludeId`. Shoduje se i podle jiných než hlavních údajů osoby.

```ts
async function findContactDuplicates(ctx: Ctx, input: { emails?: string[]; phones?: string[]; excludeId?: string }): Promise<{ personId: string; name: string; match: "email" | "phone" }[]>
```

### findPersonDuplicates

function · `packages/modules/kontakty/src/duplicates.ts`

Osoby, které se shodují v některém z e-mailů (malá písmena) nebo telefonů (E.164: `777 123 456`, `+420777123456`
a `00420 777 123 456` jsou totéž). Bez osoby `excludeId`, bez soukromých osob (pro toho, kdo je nevidí). Osoba se
shoduje i podle jiného než hlavního údaje. Jedna osoba může být v obou druzích (e-mail dřív).

```ts
async function findPersonDuplicates(ctx: Ctx, q: { emails?: readonly string[] | undefined; phones?: readonly string[] | undefined; excludeId?: string | null | undefined; }): Promise<PersonDuplicate[]>
```

### formatPhone

function · `packages/modules/kontakty/src/normalize.ts`

Telefon k zobrazení: platné číslo v mezinárodním tvaru se skupinami (`+420 777 123 456`), jinak beze změny.

```ts
function formatPhone(raw: string | null | undefined): string
```

### getPrimaryContact

function · `packages/modules/kontakty/src/persons.ts`

Hlavní kontaktní osoba organizace s primárním telefonem a e-mailem: ten, kdo rozhoduje; jinak osoba s hlavní
organizací touto organizací, která má telefon nebo e-mail; jinak první. `null`, když organizace nemá žádný kontakt.

```ts
async function getPrimaryContact(ctx: Ctx, companyId: string): Promise<{ personId: string; name: string; phone?: string; email?: string } | null>
```

### icoDuplicateMessage

function · `packages/modules/kontakty/src/companies.ts`

Věta pro uživatele, když IČO už v evidenci je; bez práva na záznam se neprozradí název.

```ts
function icoDuplicateMessage(ico: string, match: CompanyDuplicate): string
```

### isValidIco

function · `packages/modules/kontakty/src/normalize.ts`

Kontrolní součet IČO (modulo 11 podle váh 8–2); chybně opsané IČO se pozná, aniž by se volala síť.

```ts
function isValidIco(ico: string): boolean
```

### isValidPhone

function · `packages/modules/kontakty/src/normalize.ts`

Je to platné telefonní číslo (podle pravidel číslovacího plánu), ne jen něco, co se dá porovnat?

```ts
function isValidPhone(raw: string | null | undefined): boolean
```

### listCompanyContacts

function · `packages/modules/kontakty/src/persons.ts`

Kontakty organizace: osoby, které mají organizaci jako hlavní, i ty, které ji mají mezi dalšími. Nejdřív ti, kdo
rozhodují, potom hlavní organizace, pak podle příjmení. Soukromé osoby se vynechají, kdo je nevidí.

```ts
async function listCompanyContacts(ctx: Ctx, companyId: string, opts: { limit?: number } = {}): Promise<CompanyContact[]>
```

### listPoints

function · `packages/modules/kontakty/src/points.ts`

Živé kontaktní údaje jedné osoby.

```ts
async function listPoints(db: Executor, personId: string): Promise<PointRow[]>
```

### lookupAres

function · `packages/modules/kontakty/src/ares/lookup.ts`

Vyhledá organizaci v ARES podle IČO s cache 24 h. Nejdřív kontrola tvaru a kontrolního součtu (chybně opsané IČO
se do sítě neposílá), pak cache, pak ARES. Když ARES neodpovídá a v cache je starší odpověď, vrátí ji s `stale`.
Nikdy nevyhodí výjimku kvůli síti: `ok: false` nese větu pro uživatele.

```ts
async function lookupAres(icoInput: string, opts: { cache: AresCache; client?: AresClient; now?: Date; fresh?: boolean }): Promise<AresResult>
```

### matchContactDuplicates

function · `packages/modules/kontakty/src/duplicates.ts`

Najde existující organizace a osoby, které se shodují v IČO (jen organizace), e-mailu nebo telefonu (bez ohledu
na velikost písmen, mezery a předvolbu; osoby podle všech jejich údajů, ne jen hlavních). Respektuje rozsah
`kontakty.read` aktéra a soukromé záznamy. Slouží kontrole duplicit při zakládání obchodů a rychlém zadání a při
sloučení kontaktů.

```ts
async function matchContactDuplicates(ctx: Ctx, query: ContactQuery): Promise<{ companies: CompanyMatch[]; persons: PersonMatch[] }>
```

### normalizeEmail

function · `packages/modules/kontakty/src/normalize.ts`

E-mail pro porovnání: bez mezer, malými písmeny; bez zavináče je neplatný (`null`).

```ts
function normalizeEmail(v: string | null | undefined): string | null
```

### normalizeIco

function · `packages/modules/kontakty/src/normalize.ts`

IČO: jen číslice (mezery a pomlčky pryč), kratší se doplní zleva nulami na osm. Prázdné nebo nesmyslné = `null`.

```ts
function normalizeIco(v: string | null | undefined): string | null
```

### normalizePhone

function · `packages/modules/kontakty/src/normalize.ts`

Telefon ve starém tvaru: devět koncových číslic (bez předvolby +420 / 00420); kratší než devět číslic se
neporovnává. Nové kontaktní údaje se porovnávají v E.164 (`normalizePhoneE164`); tohle zůstává pro volající,
kteří mají jen volný text.

```ts
function normalizePhone(v: string | null | undefined): string | null
```

### normalizePhoneE164

function · `packages/modules/kontakty/src/normalize.ts`

Telefon v E.164 (`+420777123456`) nezávisle na mezerách, pomlčkách a předvolbě: `777 123 456`, `+420 777 123 456`
i `00420777123456` dají totéž. Číslo bez předvolby se čte jako české. Neplatné číslo (třeba nesmyslný prefix)
se nezahodí, ale zapíše se co nejvěrněji (`+420…` u devíti číslic, jinak číslice), aby šlo kontrolovat duplicity
i u lead formulářů s překlepem. Méně než pět číslic nebo prázdný text = `null`.

```ts
function normalizePhoneE164(raw: string | null | undefined): string | null
```

### personUrl

function · `packages/modules/kontakty/src/persons.ts`

Adresa detailu osoby (stejná jako `EntityDef.url`).

```ts
function personUrl(id: string): string
```

### searchContacts

function · `packages/modules/kontakty/src/search.ts`

Hledání organizací a osob podle jména (bez diakritiky a velikosti písmen), IČO, e-mailu a telefonu (podčástí čísla
bez předvolby: „777 12“ najde „+420 777 123 456“, i podle dalších než hlavních údajů). Respektuje rozsah
`kontakty.read` a soukromé záznamy. Prázdný dotaz vrátí naposledy upravené záznamy.

```ts
async function searchContacts(ctx: Ctx, input: { q?: string | undefined; limit?: number | undefined; kinds?: ("company" | "person")[] | undefined; }): Promise<{ companies: CompanyHit[]; persons: PersonHit[] }>
```

### setAresClient

function · `packages/modules/kontakty/src/ares/lookup.ts`

Adaptér ARES, který používají příkazy modulu. V testech se nahradí fake (`createFakeAres`); `null` vrátí reálný.

```ts
function setAresClient(next: AresClient | null): void
```

### splitFullName

function · `packages/modules/kontakty/src/normalize.ts`

Rozdělí jméno `Jan Novák` na křestní jméno a příjmení (poslední slovo je příjmení). Jedno slovo je příjmení.

```ts
function splitFullName(full: string): { firstName: string | null; lastName: string }
```

### upsertContactFromLead

function · `packages/modules/kontakty/src/leads.ts`

Najde nebo založí kontakt a organizaci z leadu (REK, OBC). Organizace: podle IČO, jinak podle přesného názvu,
jinak se založí (jen z názvu nebo IČO) a **nemá `client_status`** (R-15: lead z reklamy nedělá klienta). Osoba:
podle e-mailu nebo telefonu (E.164, nezávisle na mezerách a předvolbě); nalezené osobě se doplní chybějící údaje
z leadu a chybějící organizace, jinak se založí. Volat v transakci volajícího (`inTx`), aby lead a obchod vznikly
atomicky; nic dalšího nekontroluje (oprávnění je na volajícím příkazu).

```ts
async function upsertContactFromLead(ctx: Ctx, input: LeadContactInput): Promise<LeadContactResult>
```

### webDomainOf

function · `packages/modules/kontakty/src/normalize.ts`

Doména z adresy webu: bez protokolu, `www.`, cesty, portu a přihlašovacích údajů, malými písmeny.
Nesmysl nebo prázdný text = `null`.

```ts
function webDomainOf(web: string | null | undefined): string | null
```

### CompanyContact

type · `packages/modules/kontakty/src/persons.ts`

Kontakt organizace pro seznam v kartě: osoba s rolí v této organizaci a hlavními údaji.

```ts
type CompanyContact = {
  id: string;
  name: string;
  /** Pozice u hlavní organizace, u další organizace pozice v ní. */
  position: string | null;
  /** Role v další organizaci (u hlavní organizace prázdná). */
  role: string | null;
  isDecisionMaker: boolean;
  /** Organizace je hlavní organizací osoby. */
  isPrimaryCompany: boolean;
  email: string | null;
  phone: string | null;
};
```

### CompanyDuplicate

type · `packages/modules/kontakty/src/duplicates.ts`

Nalezená organizace, která se shoduje s hledanou.

```ts
type CompanyDuplicate = {
  id: string;
  name: string;
  ico: string | null;
  city: string | null;
  reason: "ico" | "name" | "domain";
  /** Podobnost názvu 0–1 (jen `name`). */
  similarity?: number;
  /** Aktér záznam smí otevřít; jinak jsou údaje skryté a zbývá obecná věta. */
  visible: boolean;
};
```

### CompanyDuplicateCheck

type · `packages/modules/kontakty/src/duplicates.ts`

Výsledek kontroly duplicit organizace.

```ts
type CompanyDuplicateCheck = {
  /** Stejné IČO už existuje: ukládání se zakáže a odkáže na tento záznam. */
  icoMatch: CompanyDuplicate | null;
  /** Podobný název nebo stejná doména webu: varování, jde pokračovat. */
  similar: CompanyDuplicate[];
};
```

### CompanyHit

type · `packages/modules/kontakty/src/search.ts`

Výsledek hledání organizace pro výběr (rychlé zadání, účastníci zakázky, sloučení).

```ts
type CompanyHit = {
  id: string;
  name: string;
  ico: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  clientStatus: string | null;
};
```

### CompanyMatch

type · `packages/modules/kontakty/src/duplicates.ts`

Existující organizace, která se shoduje s hledanými údaji.

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

type · `packages/modules/kontakty/src/normalize.ts`

Údaje, podle kterých se hledá existující firma nebo osoba.

```ts
type ContactQuery = {
  ico?: string | null | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
};
```

### LeadContactInput

type · `packages/modules/kontakty/src/leads.ts`

Vstup `upsertContactFromLead`: jméno a údaje z formuláře (Meta lead, web).

```ts
type LeadContactInput = {
  name: string;
  email?: string | undefined;
  phone?: string | undefined;
  companyName?: string | undefined;
  ico?: string | undefined;
};
```

### LeadContactResult

type · `packages/modules/kontakty/src/leads.ts`

Výsledek: osoba a organizace (nebo `null`) a co z toho vzniklo nově.

```ts
type LeadContactResult = {
  personId: string;
  companyId: string | null;
  created: { person: boolean; company: boolean };
};
```

### MatchedBy

type · `packages/modules/kontakty/src/normalize.ts`

V čem se nalezený záznam shoduje s hledaným: IČO, e-mail, telefon.

```ts
type MatchedBy = "ico" | "email" | "phone";
```

### PersonDuplicate

type · `packages/modules/kontakty/src/duplicates.ts`

Nalezená osoba, která se shoduje v e-mailu nebo telefonu.

```ts
type PersonDuplicate = {
  personId: string;
  name: string;
  /** Hlavní organizace osoby (pro rozlišení jmenovců). */
  companyName: string | null;
  match: "email" | "phone";
  /** Hodnota, ve které se shodují (zapsaná u nalezené osoby). */
  value: string;
};
```

### PersonHit

type · `packages/modules/kontakty/src/search.ts`

Osoba nalezená hledáním (jméno, kontakt a organizace pro výběr).

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

### PointRow

type · `packages/modules/kontakty/src/points.ts`

Kontaktní údaj osoby tak, jak se čte.

```ts
type PointRow = {
  id: string;
  kind: PointKind;
  value: string;
  valueNorm: string;
  label: PointLabel | null;
  isPrimary: boolean;
  position: number;
  /** Telefon odpovídá číslovacímu plánu (u e-mailu vždy `true`). */
  valid: boolean;
};
```
