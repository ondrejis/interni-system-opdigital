# @rebar/core/auth

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/auth` (soubor `packages/core/src/auth/index.ts`). Exportů: 91, z toho s popisem 76.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`acceptInvitation`](#acceptinvitation) | function | Přijetí pozvánky (bez přihlášení): vytvoří uživatele s heslem. Pozvánku nejdřív „zabere“ jedním UPDATE, takže ji nejde přijmout dvakrát souběžně; při selhání se vrátí. Heslo musí projít pravidly (≥ 12 znaků, ne běžné ani uniklé, bez jména a e-mailu); `deps.breachCheck` jen pro testy. |  |
| [`assertPasswordAcceptable`](#assertpasswordacceptable) | function | Ověří nové heslo: offline pravidla a (je-li zapnutá) k-anonymní kontrola uniklých hesel. Při problému vyhodí `UserError` s českou hláškou, kterou lze ukázat uživateli. Heslo se nikam nelogguje. |  |
| [`assertShortNameFree`](#assertshortnamefree) | function | Zkratka musí být mezi aktivními uživateli jedinečná (rozlišuje je v rozpisech a avatarech); bez ohledu na velikost písmen. |  |
| [`bootstrapOwner`](#bootstrapowner) | function | Založí prvního uživatele (majitele) při instalaci. Idempotentní: když uživatel s e-mailem už je, nedělá nic. Roli `owner` musí předtím založit seed. Heslo se nikam nezapisuje a vynutí se jeho změna až přes 2FA a pozvánky. |  |
| [`changeOwnPassword`](#changeownpassword) | function | Změna vlastního hesla. Ověří současné heslo (omezení počtu pokusů v databázi), nové heslo zkontroluje (délka, běžná a uniklá hesla), uloží otisk nového hesla, odhlásí ostatní zařízení a zruší důvěryhodná zařízení; do historie (kategorie bezpečnost) zapíše změnu bez jakékoli hodnoty hesla; vše v jedné transakci. |  |
| [`checkPasswordOffline`](#checkpasswordoffline) | function | Offline kontrola hesla (bez sítě): délka, běžné základy, řady a opakování, osobní údaje. Vrací první nalezený problém, nebo `null`, když je heslo v pořádku. |  |
| [`clientIp`](#clientip) | function | IP klienta za důvěryhodnou proxy (Caddy): první adresa z X-Forwarded-For. |  |
| [`createAuth`](#createauth) | function | Autentizace: e-mail + heslo (argon2id), povinné 2FA (TOTP s 10 záložními kódy, důvěryhodné zařízení na 30 dní), sessions v DB, omezení přihlašování 5 pokusů / 15 min, bezpečnostní události do historie, žádná veřejná registrace (účty vznikají jen pozvánkou). Role a oprávnění jsou naše (`rbac`), Better Auth řeší jen identitu. |  |
| [`createInvitation`](#createinvitation) | function | Pozve uživatele e-mailem. Předchozí nevyřízené pozvánky na stejný e-mail se zneplatní. |  |
| [`deleteTrustedDevices`](#deletetrusteddevices) | function | Smaže všechna důvěryhodná zařízení uživatele (po změně hesla, při odhlášení správcem). Bez auditu; zápis do historie dělá volající, který ví proč. |  |
| [`deriveShortName`](#deriveshortname) | function | Zkratka z jména: počáteční písmena slov, velkými písmeny, nejvýš dvě (Ondřej Dvořák → OD). |  |
| [`describeUserAgent`](#describeuseragent) | function | Rozpozná prohlížeč, systém a typ zařízení. Neznámý nebo prázdný text vrátí obecný popis, nikdy nevyhodí chybu. |  |
| [`fetchBreachRange`](#fetchbreachrange) | function | Výchozí dotaz na službu: 3 s limit, `Add-Padding` skryje i počet shod, bez cookies a bez odkazující adresy. |  |
| [`getAccount`](#getaccount) | function | Údaje přihlášeného uživatele pro hlavičku, stránku Můj účet a zabezpečení. Každý vidí jen sebe. |  |
| [`getOwnAppearance`](#getownappearance) | function | Předvolby přihlášeného uživatele (vzhled s výchozími hodnotami). |  |
| [`hashPassword`](#hashpassword) | function |  |  |
| [`inspectInvitation`](#inspectinvitation) | function | Co ukázat na stránce pozvánky (bez přihlášení): komu je určena a do jaké role. |  |
| [`isPasswordBreached`](#ispasswordbreached) | function | Je heslo mezi uniklými? K-anonymně: do `fetchRange` jde jen prvních 5 znaků SHA-1 (velkými písmeny), zbytek otisku se porovná tady. Vrací `null`, když se to nepodařilo zjistit (síť, služba); volající rozhodne, co s tím (my heslo nezablokujeme). Řádky s nulovým počtem jsou výplň služby a nepočítají se. |  |
| [`isValidIco`](#isvalidico) | function | Kontrolní součet IČO (modulo 11, vážené součty 8…2); IČO musí mít přesně osm číslic. |  |
| [`listInvitations`](#listinvitations) | function |  |  |
| [`listManagedUsers`](#listmanagedusers) | function | Aktivní uživatelé a deaktivovaní, s poli pro rozpisy plateb a stavem zabezpečení. |  |
| [`listOwnSessions`](#listownsessions) | function | Aktivní přihlášení (zařízení) přihlášeného uživatele, nejnovější aktivita první. Každý vidí jen svá. |  |
| [`listSecurityEvents`](#listsecurityevents) | function | Bezpečnostní události jednoho účtu, nejnovější první. Vlastní události vidí každý, cizí jen správce uživatelů (`users.manage`). Bez `userId` jde o vlastní účet. |  |
| [`listTrustedDevices`](#listtrusteddevices) | function | Důvěryhodná zařízení přihlášeného uživatele (platná), nejnovější první. `cookieHeader` označí aktuální zařízení. |  |
| [`listUserSessions`](#listusersessions) | function | Přihlášená zařízení (relace) cizího uživatele; jen majitel. Adresa je zkrácená stejně jako u vlastních zařízení. |  |
| [`maskIp`](#maskip) | function | Zkrácená adresa pro zobrazení uživateli: IPv4 bez poslední části, IPv6 jen první tři bloky. Úplná adresa zůstává v databázi (historie přihlášení pro správce), ale uživateli se neukazuje celá. |  |
| [`passwordIssueMessage`](#passwordissuemessage) | function | Čitelná hláška k důvodu zamítnutí. |  |
| [`readAppearance`](#readappearance) | function | Vzhled z uložených předvoleb; neplatný nebo chybějící klíč nahradí výchozí hodnotou (poškozená data nikdy nespadnou). |  |
| [`recordSecurityEvent`](#recordsecurityevent) | function | Zapíše bezpečnostní událost do historie. Jde o přímý zápis (bez `Ctx`), aby ho šlo volat i z hooků přihlášení, kde ještě žádný aktér není; uvnitř transakce předejte `ctx.db`. |  |
| [`resolveCtx`](#resolvectx) | function | Z cookie vyrobí kontext s aktérem, nebo `null` (nepřihlášen, relace vypršela, účet deaktivován). Relace starší než absolutní maximum se zruší. |  |
| [`resolveStartPage`](#resolvestartpage) | function | Kam po přihlášení: uložená úvodní stránka, je-li stále dostupná, jinak `fallback`. Cíl vždy projde seznamem dostupných adres, takže uložená adresa nikdy nevede mimo aplikaci ani na stránku bez přístupu. |  |
| [`revokeAllTrustedDevices`](#revokealltrusteddevices) | function | Zruší důvěru ke všem zařízením vlastního účtu. Vrací počet zrušených. |  |
| [`revokeInvitation`](#revokeinvitation) | function |  |  |
| [`revokeOtherOwnSessions`](#revokeotherownsessions) | function | Odhlásí všechna vlastní zařízení kromě aktuálního. Vrací počet odhlášených. |  |
| [`revokeOwnSession`](#revokeownsession) | function | Odhlásí jedno vlastní zařízení. Cizí přihlášení se tváří jako neexistující. |  |
| [`revokeTrustedDevice`](#revoketrusteddevice) | function | Zruší důvěru k jednomu zařízení: příště se tam znovu vyžádá kód. Cizí zařízení se tváří jako neexistující. |  |
| [`revokeUserSession`](#revokeusersession) | function | Odhlásí jedno konkrétní zařízení cizího uživatele (jen majitel). |  |
| [`revokeUserSessions`](#revokeusersessions) | function | Odhlásí uživatele ze všech zařízení a zruší jeho důvěryhodná zařízení (příště se vyžádá kód). Sebe kdykoli, jiné jen majitel (`users.manage`, majitele jen majitel). Do historie jde událost „odhlášena zařízení“ u dotčeného účtu. |  |
| [`securityActionLabel`](#securityactionlabel) | function | Popisek události; neznámý kód (starší nebo cizí záznam) vrátí beze změny. |  |
| [`securityVisibility`](#securityvisibility) | function | Podmínka do `WHERE` nad `audit_log`, která z historie vyřadí bezpečnostní události cizích účtů (Patrik vidí jen své, Ondřej vše). `undefined` = bez omezení. Musí ji použít každé místo, které čte historii (záznam, `/historie`, přehled). |  |
| [`trustedDeviceIdentifier`](#trusteddeviceidentifier) | function | Z hlavičky `Cookie` vytáhne identifikátor důvěryhodného zařízení (jen k označení „toto zařízení“, nic neověřuje). |  |
| [`updateOwnAppearance`](#updateownappearance) | function | Uloží vzhled: sloučí zadané klíče do `user.prefs` jedním `\|\|` (klíče jiných částí systému zůstanou, souběžné zápisy jiných klíčů se neztratí). Úvodní stránku si smí uživatel nastavit jen z `allowedStartPages` (adresy, na které má přístup); kontrolu s aktuální navigací dělá volající. |  |
| [`updateOwnProfile`](#updateownprofile) | function | Úprava vlastního profilu: jméno (`user.name`), telefon (`employee.phone`), zkratka a barva avataru. E-mail si uživatel nemění sám, protože je to přihlašovací jméno a cíl odkazů pro obnovu hesla; mění se přes správce uživatelů nebo novou pozvánku. IČO a fakturační nástroj mění jen správce uživatelů. Jméno i telefon se čtou ze stejných tabulek všude jinde (záznamy, aktivita, docházka), takže se změna projeví hned všude. |  |
| [`updateUserFields`](#updateuserfields) | function | Upraví zkratku, IČO a fakturační nástroj uživatele (jen majitel). Zkratka a IČO jsou mezi aktivními uživateli jedinečné. Změna jde do historie s hodnotami před a po. |  |
| [`verifyPassword`](#verifypassword) | function |  |  |
| [`AVATAR_COLORS`](#avatar_colors) | const | Barvy avataru (klíče `data-color` štítků v UI); `null` = barva podle jména. |  |
| [`BREACH_RANGE_URL`](#breach_range_url) | const | Adresa služby uniklých hesel (Pwned Passwords); dostupná jen s předponou otisku, nikdy s heslem. |  |
| [`DEFAULT_TWO_FACTOR_POLICY`](#default_two_factor_policy) | const | Výchozí zásada: druhý faktor je povinný pro každého. |  |
| [`DENSITIES`](#densities) | const | Hustota řádků v tabulkách a seznamech. |  |
| [`INVITATION_TTL_HOURS`](#invitation_ttl_hours) | const | Pozvánka platí 48 hodin od vytvoření (AUT-02); pak ji musí majitel vystavit znovu. |  |
| [`LOGIN_BLOCKED_MESSAGE`](#login_blocked_message) | const | Hláška při vyčerpání pokusů; kód zná klient (`authErrorMessage`). |  |
| [`LOGIN_IP_LIMIT`](#login_ip_limit) | const | Strop neúspěšných pokusů z jedné adresy přes všechny účty. |  |
| [`LOGIN_LIMIT`](#login_limit) | const | Neúspěšných pokusů na účet a adresu za okno, po kterých se přihlášení zablokuje. |  |
| [`MAX_PASSWORD_LENGTH`](#max_password_length) | const |  |  |
| [`MIN_PASSWORD_LENGTH`](#min_password_length) | const |  |  |
| [`PASSWORD_CHANGE_LIMIT`](#password_change_limit) | const | Pokusů o změnu hesla (správných i špatných) za okno; chrání současné heslo před hádáním z ukradené relace. |  |
| [`SECURITY_ACTIONS`](#security_actions) | const | Co se stalo. Hodnoty jsou stabilní kódy (ukládají se do historie); popisky jsou česky v `SECURITY_ACTION_LABELS`. |  |
| [`SECURITY_ACTION_LABELS`](#security_action_labels) | const | Popisky událostí pro seznamy (profil, uživatelé). |  |
| [`SHORT_NAME_LENGTH`](#short_name_length) | const | Nejkratší a nejdelší zkratka uživatele (počet znaků). |  |
| [`THEMES`](#themes) | const | Barevný motiv: světlý, tmavý, nebo podle systému. |  |
| [`TRUSTED_DEVICE_DAYS`](#trusted_device_days) | const | Na jak dlouho se zařízení označí jako důvěryhodné (dny). Platnost se při každém přihlášení z něj obnoví. |  |
| [`UNKNOWN_ACCOUNT`](#unknown_account) | const | Neznámý účet v historii (někdo zkoušel přihlášení na neexistující e-mail); vidí ho jen správce. |  |
| [`acceptInput`](#acceptinput) | const |  |  |
| [`appearancePatch`](#appearancepatch) | const | Změna vzhledu: každý klíč je nepovinný a chybějící zůstává beze změny (žádné výchozí hodnoty, jinak by změna jednoho klíče přepsala ostatní). |  |
| [`billingToolField`](#billingtoolfield) | const | Fakturační nástroj: volný text (Fakturoid, iDoklad, Excel…). |  |
| [`changePasswordInput`](#changepasswordinput) | const | Vstup změny hesla; stejné minimum jako u pozvánky a obnovy hesla. |  |
| [`icoField`](#icofield) | const | IČO: osm číslic se správným kontrolním součtem (mezery se ignorují); prázdné = bez IČO. |  |
| [`inviteInput`](#inviteinput) | const |  |  |
| [`profileInput`](#profileinput) | const |  |  |
| [`shortNameField`](#shortnamefield) | const | Zkratka: 2 až 4 znaky (písmena a číslice), ukládá se velkými písmeny; prázdná = odvodí se z jména. |  |
| [`userFieldsInput`](#userfieldsinput) | const | Vstup úpravy polí uživatele; neuvedené pole zůstává beze změny, prázdné se smaže. |  |
| [`Appearance`](#appearance) | type | Hodnoty Vzhledu s vyplněnými výchozími. |  |
| [`Auth`](#auth) | type |  |  |
| [`AuthMail`](#authmail) | type |  |  |
| [`AuthMailTemplate`](#authmailtemplate) | type | Šablony systémových e-mailů, které posílá autentizace. Obsah a překlad řeší `mail` modul. |  |
| [`AuthOptions`](#authoptions) | type |  |  |
| [`AvatarColor`](#avatarcolor) | type | Barva avataru z palety UI. |  |
| [`BreachCheck`](#breachcheck) | type | Jak se kontroluje únik hesla: vypnuto, výchozí služba, nebo vlastní zdroj (testy, vlastní zrcadlo). |  |
| [`DeviceInfo`](#deviceinfo) | type | Čitelný popis zařízení z hlavičky User-Agent (jen to, co uživatel pozná: prohlížeč, systém, typ zařízení). |  |
| [`Mailer`](#mailer) | type |  |  |
| [`OwnSession`](#ownsession) | type |  |  |
| [`PasswordCheckOptions`](#passwordcheckoptions) | type | Volby kontroly nového hesla: údaje o uživateli, které heslo nesmí obsahovat, a zdroj uniklých hesel. |  |
| [`PasswordIssue`](#passwordissue) | type | Důvod, proč se heslo nepřijme. |  |
| [`PasswordSubject`](#passwordsubject) | type | Údaje o uživateli, které heslo nesmí obsahovat. |  |
| [`RangeFetcher`](#rangefetcher) | type | Vrátí tělo odpovědi služby „range“ pro 5znakovou předponu SHA-1 otisku (řádky `ZBYTEK:POČET`). |  |
| [`ResolveCtxOptions`](#resolvectxoptions) | type |  |  |
| [`SecurityAction`](#securityaction) | type | Kód bezpečnostní události. |  |
| [`SecurityEvent`](#securityevent) | type | Bezpečnostní událost k zápisu do historie (kdo, čeho se týká, co se stalo). |  |
| [`SecurityEventRow`](#securityeventrow) | type | Řádek výpisu bezpečnostních událostí účtu. |  |
| [`TrustedDevice`](#trusteddevice) | type | Důvěryhodné zařízení uživatele (bez druhého faktoru po dobu platnosti důvěry). |  |
| [`TwoFactorPolicy`](#twofactorpolicy) | type | Komu je dvoufázové ověření (TOTP) povinné: `all` = všem rolím (OPSYS, AUT-01), `roles` = jen rolím s příznakem `require_2fa` (původní chování jádra). Bez druhého faktoru se uživatel po přihlášení heslem dostane jen na nastavení ověření; vypnout ho nejde. |  |

### acceptInvitation

function · `packages/core/src/auth/invitations.ts`

Přijetí pozvánky (bez přihlášení): vytvoří uživatele s heslem. Pozvánku nejdřív „zabere“
jedním UPDATE, takže ji nejde přijmout dvakrát souběžně; při selhání se vrátí.
Heslo musí projít pravidly (≥ 12 znaků, ne běžné ani uniklé, bez jména a e-mailu); `deps.breachCheck` jen pro testy.

```ts
async function acceptInvitation(deps: { auth: Auth; db: Db; breachCheck?: BreachCheck }, input: z.input<typeof acceptInput>): Promise<{ userId: string; email: string; }>
```

### assertPasswordAcceptable

function · `packages/core/src/auth/password-policy.ts`

Ověří nové heslo: offline pravidla a (je-li zapnutá) k-anonymní kontrola uniklých hesel. Při problému vyhodí
`UserError` s českou hláškou, kterou lze ukázat uživateli. Heslo se nikam nelogguje.

```ts
async function assertPasswordAcceptable(password: string, options: PasswordCheckOptions = {}): Promise<void>
```

### assertShortNameFree

function · `packages/core/src/auth/account.ts`

Zkratka musí být mezi aktivními uživateli jedinečná (rozlišuje je v rozpisech a avatarech); bez ohledu na velikost písmen.

```ts
async function assertShortNameFree(ctx: Ctx, shortName: string, exceptUserId: string): Promise<void>
```

### bootstrapOwner

function · `packages/core/src/auth/bootstrap.ts`

Založí prvního uživatele (majitele) při instalaci. Idempotentní: když uživatel s e-mailem už je, nedělá nic.
Roli `owner` musí předtím založit seed. Heslo se nikam nezapisuje a vynutí se jeho změna až přes 2FA a pozvánky.

```ts
async function bootstrapOwner(deps: { auth: Auth; db: Db }, input: { email: string; name: string; password: string; roleKey?: string }): Promise<{ userId: string; created: boolean; }>
```

### changeOwnPassword

function · `packages/core/src/auth/credentials.ts`

Změna vlastního hesla. Ověří současné heslo (omezení počtu pokusů v databázi), nové heslo zkontroluje (délka,
běžná a uniklá hesla), uloží otisk nového hesla, odhlásí ostatní zařízení a zruší důvěryhodná zařízení; do historie
(kategorie bezpečnost) zapíše změnu bez jakékoli hodnoty hesla; vše v jedné transakci.

`keepSessionId` je relace, která zůstane přihlášená (obvykle ta, ze které se heslo mění). `null` odhlásí všechny.
`breachCheck` jen pro testy (zdroj uniklých hesel).

```ts
async function changeOwnPassword(ctx: Ctx, raw: z.input<typeof changePasswordInput>, opts: { keepSessionId: string | null; breachCheck?: BreachCheck }): Promise<{ revokedSessions: number }>
```

### checkPasswordOffline

function · `packages/core/src/auth/password-policy.ts`

Offline kontrola hesla (bez sítě): délka, běžné základy, řady a opakování, osobní údaje.
Vrací první nalezený problém, nebo `null`, když je heslo v pořádku.

```ts
function checkPasswordOffline(password: string, subject: PasswordSubject = {}): PasswordIssue | null
```

### clientIp

function · `packages/core/src/auth/ip.ts`

IP klienta za důvěryhodnou proxy (Caddy): první adresa z X-Forwarded-For.

```ts
function clientIp(headers: Headers): string | null
```

### createAuth

function · `packages/core/src/auth/create-auth.ts`

Autentizace: e-mail + heslo (argon2id), povinné 2FA (TOTP s 10 záložními kódy, důvěryhodné zařízení na 30 dní),
sessions v DB, omezení přihlašování 5 pokusů / 15 min, bezpečnostní události do historie, žádná veřejná registrace
(účty vznikají jen pozvánkou). Role a oprávnění jsou naše (`rbac`), Better Auth řeší jen identitu.

```ts
function createAuth(opts: AuthOptions): import("better-auth").Auth<{ appName: string; baseURL: string; secret: string; trustedOrigins: string[]; disabledPaths: string[]; database: (options: import("better-auth").BetterAuthOptions) => import("better-auth").DBAdapter<import("bette…
```

### createInvitation

function · `packages/core/src/auth/invitations.ts`

Pozve uživatele e-mailem. Předchozí nevyřízené pozvánky na stejný e-mail se zneplatní.

```ts
async function createInvitation(ctx: Ctx, input: z.input<typeof inviteInput>, deps: { mailer: Mailer; baseURL: string }): Promise<{ id: string; expiresAt: Date; }>
```

### deleteTrustedDevices

function · `packages/core/src/auth/trusted-devices.ts`

Smaže všechna důvěryhodná zařízení uživatele (po změně hesla, při odhlášení správcem). Bez auditu; zápis do historie
dělá volající, který ví proč.

```ts
async function deleteTrustedDevices(exec: Executor, userId: string): Promise<number>
```

### deriveShortName

function · `packages/core/src/auth/user-fields.ts`

Zkratka z jména: počáteční písmena slov, velkými písmeny, nejvýš dvě (Ondřej Dvořák → OD).

```ts
function deriveShortName(name: string): string
```

### describeUserAgent

function · `packages/core/src/auth/user-agent.ts`

Rozpozná prohlížeč, systém a typ zařízení. Neznámý nebo prázdný text vrátí obecný popis, nikdy nevyhodí chybu.

```ts
function describeUserAgent(ua: string | null | undefined): DeviceInfo
```

### fetchBreachRange

function · `packages/core/src/auth/password-policy.ts`

Výchozí dotaz na službu: 3 s limit, `Add-Padding` skryje i počet shod, bez cookies a bez odkazující adresy.

```ts
async function fetchBreachRange(prefix): Promise<string>
```

### getAccount

function · `packages/core/src/auth/account.ts`

Údaje přihlášeného uživatele pro hlavičku, stránku Můj účet a zabezpečení. Každý vidí jen sebe.

```ts
async function getAccount(ctx: Ctx): Promise<{ twoFactorRequired: boolean; shortName: string; appearance: Appearance; id: string; name: string; email: string; roleName: string; twoFactorEnabled: boolean; phone: string | null; avatarColor: string | null; ico: string | null; bi…
```

### getOwnAppearance

function · `packages/core/src/auth/prefs.ts`

Předvolby přihlášeného uživatele (vzhled s výchozími hodnotami).

```ts
async function getOwnAppearance(ctx: Ctx): Promise<Appearance>
```

### hashPassword

function · `packages/core/src/auth/password.ts`

_Bez popisu._

```ts
function hashPassword(password: string): Promise<string>
```

### inspectInvitation

function · `packages/core/src/auth/invitations.ts`

Co ukázat na stránce pozvánky (bez přihlášení): komu je určena a do jaké role.

```ts
async function inspectInvitation(db: Db, token: string): Promise<{ email: string; roleName: string; }>
```

### isPasswordBreached

function · `packages/core/src/auth/password-policy.ts`

Je heslo mezi uniklými? K-anonymně: do `fetchRange` jde jen prvních 5 znaků SHA-1 (velkými písmeny), zbytek otisku se
porovná tady. Vrací `null`, když se to nepodařilo zjistit (síť, služba); volající rozhodne, co s tím (my heslo
nezablokujeme). Řádky s nulovým počtem jsou výplň služby a nepočítají se.

```ts
async function isPasswordBreached(password: string, fetchRange: RangeFetcher = fetchBreachRange): Promise<boolean | null>
```

### isValidIco

function · `packages/core/src/auth/user-fields.ts`

Kontrolní součet IČO (modulo 11, vážené součty 8…2); IČO musí mít přesně osm číslic.

```ts
function isValidIco(ico: string): boolean
```

### listInvitations

function · `packages/core/src/auth/invitations.ts`

_Bez popisu._

```ts
async function listInvitations(ctx: Ctx): Promise<{ id: string; email: string; roleName: string; expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null; }[]>
```

### listManagedUsers

function · `packages/core/src/auth/user-admin.ts`

Aktivní uživatelé a deaktivovaní, s poli pro rozpisy plateb a stavem zabezpečení.

```ts
async function listManagedUsers(ctx: Ctx): Promise<{ id: string; name: string; email: string; roleId: string; roleName: string; roleKey: string; active: boolean; twoFactorEnabled: boolean; lastLoginAt: Date | null; createdAt: Date; shortName: string | null; avatarColor: string | nu…
```

### listOwnSessions

function · `packages/core/src/auth/credentials.ts`

Aktivní přihlášení (zařízení) přihlášeného uživatele, nejnovější aktivita první. Každý vidí jen svá.

```ts
async function listOwnSessions(ctx: Ctx, currentSessionId: string | null): Promise<OwnSession[]>
```

### listSecurityEvents

function · `packages/core/src/auth/security-events.ts`

Bezpečnostní události jednoho účtu, nejnovější první. Vlastní události vidí každý, cizí jen správce uživatelů
(`users.manage`). Bez `userId` jde o vlastní účet.

```ts
async function listSecurityEvents(ctx: Ctx, opts: { userId?: string; limit?: number } = {}): Promise<SecurityEventRow[]>
```

### listTrustedDevices

function · `packages/core/src/auth/trusted-devices.ts`

Důvěryhodná zařízení přihlášeného uživatele (platná), nejnovější první. `cookieHeader` označí aktuální zařízení.

```ts
async function listTrustedDevices(ctx: Ctx, cookieHeader?: string | null): Promise<TrustedDevice[]>
```

### listUserSessions

function · `packages/core/src/auth/user-admin.ts`

Přihlášená zařízení (relace) cizího uživatele; jen majitel. Adresa je zkrácená stejně jako u vlastních zařízení.

```ts
async function listUserSessions(ctx: Ctx, userId: string): Promise<OwnSession[]>
```

### maskIp

function · `packages/core/src/auth/user-agent.ts`

Zkrácená adresa pro zobrazení uživateli: IPv4 bez poslední části, IPv6 jen první tři bloky.
Úplná adresa zůstává v databázi (historie přihlášení pro správce), ale uživateli se neukazuje celá.

```ts
function maskIp(ip: string | null | undefined): string | null
```

### passwordIssueMessage

function · `packages/core/src/auth/password-policy.ts`

Čitelná hláška k důvodu zamítnutí.

```ts
function passwordIssueMessage(issue: PasswordIssue): string
```

### readAppearance

function · `packages/core/src/auth/prefs.ts`

Vzhled z uložených předvoleb; neplatný nebo chybějící klíč nahradí výchozí hodnotou (poškozená data nikdy nespadnou).

```ts
function readAppearance(prefs: unknown): Appearance
```

### recordSecurityEvent

function · `packages/core/src/auth/security-events.ts`

Zapíše bezpečnostní událost do historie. Jde o přímý zápis (bez `Ctx`), aby ho šlo volat i z hooků přihlášení,
kde ještě žádný aktér není; uvnitř transakce předejte `ctx.db`.

```ts
async function recordSecurityEvent(exec: Executor, e: SecurityEvent): Promise<void>
```

### resolveCtx

function · `packages/core/src/auth/session.ts`

Z cookie vyrobí kontext s aktérem, nebo `null` (nepřihlášen, relace vypršela,
účet deaktivován). Relace starší než absolutní maximum se zruší.

Povinné druhé ověření: uživatel, který ho nemá nastavené, dostane omezený kontext (`restriction: "2fa_setup"`)
a smí jen nastavit ověření. Bez druhého faktoru se tedy nikdo dál nedostane, ani přes API.

```ts
async function resolveCtx({ auth, db, headers, catalog, maxSessionAgeDays = 90, twoFactorPolicy = DEFAULT_TWO_FACTOR_POLICY, }: ResolveCtxOptions): Promise<Ctx | null>
```

### resolveStartPage

function · `packages/core/src/auth/prefs.ts`

Kam po přihlášení: uložená úvodní stránka, je-li stále dostupná, jinak `fallback`. Cíl vždy projde seznamem
dostupných adres, takže uložená adresa nikdy nevede mimo aplikaci ani na stránku bez přístupu.

```ts
function resolveStartPage(appearance: Pick<Appearance, "startPage">, allowed: readonly string[], fallback: string): string
```

### revokeAllTrustedDevices

function · `packages/core/src/auth/trusted-devices.ts`

Zruší důvěru ke všem zařízením vlastního účtu. Vrací počet zrušených.

```ts
async function revokeAllTrustedDevices(ctx: Ctx): Promise<number>
```

### revokeInvitation

function · `packages/core/src/auth/invitations.ts`

_Bez popisu._

```ts
async function revokeInvitation(ctx: Ctx, id: string): Promise<void>
```

### revokeOtherOwnSessions

function · `packages/core/src/auth/credentials.ts`

Odhlásí všechna vlastní zařízení kromě aktuálního. Vrací počet odhlášených.

```ts
async function revokeOtherOwnSessions(ctx: Ctx, currentSessionId: string | null): Promise<number>
```

### revokeOwnSession

function · `packages/core/src/auth/credentials.ts`

Odhlásí jedno vlastní zařízení. Cizí přihlášení se tváří jako neexistující.

```ts
async function revokeOwnSession(ctx: Ctx, sessionId: string, currentSessionId: string | null): Promise<{ current: boolean }>
```

### revokeTrustedDevice

function · `packages/core/src/auth/trusted-devices.ts`

Zruší důvěru k jednomu zařízení: příště se tam znovu vyžádá kód. Cizí zařízení se tváří jako neexistující.

```ts
async function revokeTrustedDevice(ctx: Ctx, id: string): Promise<void>
```

### revokeUserSession

function · `packages/core/src/auth/user-admin.ts`

Odhlásí jedno konkrétní zařízení cizího uživatele (jen majitel).

```ts
async function revokeUserSession(ctx: Ctx, userId: string, sessionId: string): Promise<void>
```

### revokeUserSessions

function · `packages/core/src/auth/user-admin.ts`

Odhlásí uživatele ze všech zařízení a zruší jeho důvěryhodná zařízení (příště se vyžádá kód). Sebe kdykoli, jiné jen
majitel (`users.manage`, majitele jen majitel). Do historie jde událost „odhlášena zařízení“ u dotčeného účtu.

```ts
async function revokeUserSessions(ctx: Ctx, userId: string): Promise<void>
```

### securityActionLabel

function · `packages/core/src/auth/security-events.ts`

Popisek události; neznámý kód (starší nebo cizí záznam) vrátí beze změny.

```ts
function securityActionLabel(action: string): string
```

### securityVisibility

function · `packages/core/src/auth/security-events.ts`

Podmínka do `WHERE` nad `audit_log`, která z historie vyřadí bezpečnostní události cizích účtů (Patrik vidí jen své,
Ondřej vše). `undefined` = bez omezení. Musí ji použít každé místo, které čte historii (záznam, `/historie`, přehled).

```ts
function securityVisibility(ctx: Ctx): SQL | undefined
```

### trustedDeviceIdentifier

function · `packages/core/src/auth/trusted-devices.ts`

Z hlavičky `Cookie` vytáhne identifikátor důvěryhodného zařízení (jen k označení „toto zařízení“, nic neověřuje).

```ts
function trustedDeviceIdentifier(cookieHeader: string | null | undefined): string | null
```

### updateOwnAppearance

function · `packages/core/src/auth/prefs.ts`

Uloží vzhled: sloučí zadané klíče do `user.prefs` jedním `||` (klíče jiných částí systému zůstanou, souběžné zápisy
jiných klíčů se neztratí). Úvodní stránku si smí uživatel nastavit jen z `allowedStartPages` (adresy, na které má
přístup); kontrolu s aktuální navigací dělá volající.

```ts
async function updateOwnAppearance(ctx: Ctx, raw: z.input<typeof appearancePatch>, allowedStartPages: readonly string[]): Promise<Appearance>
```

### updateOwnProfile

function · `packages/core/src/auth/account.ts`

Úprava vlastního profilu: jméno (`user.name`), telefon (`employee.phone`), zkratka a barva avataru. E-mail si uživatel
nemění sám, protože je to přihlašovací jméno a cíl odkazů pro obnovu hesla; mění se přes správce uživatelů nebo novou
pozvánku. IČO a fakturační nástroj mění jen správce uživatelů. Jméno i telefon se čtou ze stejných tabulek všude jinde
(záznamy, aktivita, docházka), takže se změna projeví hned všude.

```ts
async function updateOwnProfile(ctx: Ctx, raw: z.input<typeof profileInput> | z.output<typeof profileInput>): Promise<void>
```

### updateUserFields

function · `packages/core/src/auth/user-admin.ts`

Upraví zkratku, IČO a fakturační nástroj uživatele (jen majitel). Zkratka a IČO jsou mezi aktivními uživateli
jedinečné. Změna jde do historie s hodnotami před a po.

```ts
async function updateUserFields(ctx: Ctx, raw: z.input<typeof userFieldsInput> | z.output<typeof userFieldsInput>): Promise<void>
```

### verifyPassword

function · `packages/core/src/auth/password.ts`

_Bez popisu._

```ts
async function verifyPassword({ hash: stored, password, }: { hash: string; password: string; }): Promise<boolean>
```

### AVATAR_COLORS

const · `packages/core/src/auth/user-fields.ts`

Barvy avataru (klíče `data-color` štítků v UI); `null` = barva podle jména.

```ts
const AVATAR_COLORS: readonly ["blue", "green", "orange", "purple", "pink", "teal", "indigo", "yellow"]
```

### BREACH_RANGE_URL

const · `packages/core/src/auth/password-policy.ts`

Adresa služby uniklých hesel (Pwned Passwords); dostupná jen s předponou otisku, nikdy s heslem.

```ts
const BREACH_RANGE_URL: "https://api.pwnedpasswords.com/range/"
```

### DEFAULT_TWO_FACTOR_POLICY

const · `packages/core/src/auth/policy.ts`

Výchozí zásada: druhý faktor je povinný pro každého.

```ts
const DEFAULT_TWO_FACTOR_POLICY: TwoFactorPolicy
```

### DENSITIES

const · `packages/core/src/auth/prefs.ts`

Hustota řádků v tabulkách a seznamech.

```ts
const DENSITIES: readonly ["comfortable", "compact"]
```

### INVITATION_TTL_HOURS

const · `packages/core/src/auth/invitations.ts`

Pozvánka platí 48 hodin od vytvoření (AUT-02); pak ji musí majitel vystavit znovu.

```ts
const INVITATION_TTL_HOURS: 48
```

### LOGIN_BLOCKED_MESSAGE

const · `packages/core/src/auth/security-plugin.ts`

Hláška při vyčerpání pokusů; kód zná klient (`authErrorMessage`).

```ts
const LOGIN_BLOCKED_MESSAGE: "Příliš mnoho neúspěšných pokusů o přihlášení. Zkuste to znovu za 15 minut."
```

### LOGIN_IP_LIMIT

const · `packages/core/src/auth/login-throttle.ts`

Strop neúspěšných pokusů z jedné adresy přes všechny účty.

```ts
const LOGIN_IP_LIMIT: { readonly attempts: 30; readonly windowSeconds: 900; }
```

### LOGIN_LIMIT

const · `packages/core/src/auth/login-throttle.ts`

Neúspěšných pokusů na účet a adresu za okno, po kterých se přihlášení zablokuje.

```ts
const LOGIN_LIMIT: { readonly attempts: 5; readonly windowSeconds: 900; }
```

### MAX_PASSWORD_LENGTH

const · `packages/core/src/auth/password.ts`

_Bez popisu._

```ts
const MAX_PASSWORD_LENGTH: 128
```

### MIN_PASSWORD_LENGTH

const · `packages/core/src/auth/password.ts`

_Bez popisu._

```ts
const MIN_PASSWORD_LENGTH: 12
```

### PASSWORD_CHANGE_LIMIT

const · `packages/core/src/auth/credentials.ts`

Pokusů o změnu hesla (správných i špatných) za okno; chrání současné heslo před hádáním z ukradené relace.

```ts
const PASSWORD_CHANGE_LIMIT: { readonly attempts: 6; readonly windowSeconds: 600; }
```

### SECURITY_ACTIONS

const · `packages/core/src/auth/security-events.ts`

Co se stalo. Hodnoty jsou stabilní kódy (ukládají se do historie); popisky jsou česky v `SECURITY_ACTION_LABELS`.

```ts
const SECURITY_ACTIONS: readonly ["login", "login_failed", "login_blocked", "two_factor_failed", "enable_2fa", "disable_2fa", "regenerate_backup_codes", "change_password", "change_password_failed", "password_reset", "revoke_session", "revoke_sessions", "trusted_d…
```

### SECURITY_ACTION_LABELS

const · `packages/core/src/auth/security-events.ts`

Popisky událostí pro seznamy (profil, uživatelé).

```ts
const SECURITY_ACTION_LABELS: Record<SecurityAction, string>
```

### SHORT_NAME_LENGTH

const · `packages/core/src/auth/user-fields.ts`

Nejkratší a nejdelší zkratka uživatele (počet znaků).

```ts
const SHORT_NAME_LENGTH: { readonly min: 2; readonly max: 4; }
```

### THEMES

const · `packages/core/src/auth/prefs.ts`

Barevný motiv: světlý, tmavý, nebo podle systému.

```ts
const THEMES: readonly ["system", "light", "dark"]
```

### TRUSTED_DEVICE_DAYS

const · `packages/core/src/auth/trusted-devices.ts`

Na jak dlouho se zařízení označí jako důvěryhodné (dny). Platnost se při každém přihlášení z něj obnoví.

```ts
const TRUSTED_DEVICE_DAYS: 30
```

### UNKNOWN_ACCOUNT

const · `packages/core/src/auth/security-events.ts`

Neznámý účet v historii (někdo zkoušel přihlášení na neexistující e-mail); vidí ho jen správce.

```ts
const UNKNOWN_ACCOUNT: "unknown"
```

### acceptInput

const · `packages/core/src/auth/invitations.ts`

_Bez popisu._

```ts
const acceptInput: z.ZodObject<{ token: z.ZodString; name: z.ZodString; password: z.ZodString; }, z.core.$strip>
```

### appearancePatch

const · `packages/core/src/auth/prefs.ts`

Změna vzhledu: každý klíč je nepovinný a chybějící zůstává beze změny (žádné výchozí hodnoty, jinak by změna jednoho klíče přepsala ostatní).

```ts
const appearancePatch: z.ZodObject<{ theme: z.ZodOptional<z.ZodEnum<{ system: "system"; light: "light"; dark: "dark"; }>>; density: z.ZodOptional<z.ZodEnum<{ comfortable: "comfortable"; compact: "compact"; }>>; startPage: z.ZodOptional<z.ZodNullable<z.ZodString>…
```

### billingToolField

const · `packages/core/src/auth/user-fields.ts`

Fakturační nástroj: volný text (Fakturoid, iDoklad, Excel…).

```ts
const billingToolField: z.ZodPreprocess<z.ZodPipe<z.ZodString, z.ZodTransform<string | null, string>>, unknown>
```

### changePasswordInput

const · `packages/core/src/auth/credentials.ts`

Vstup změny hesla; stejné minimum jako u pozvánky a obnovy hesla.

```ts
const changePasswordInput: z.ZodObject<{ currentPassword: z.ZodString; newPassword: z.ZodString; }, z.core.$strip>
```

### icoField

const · `packages/core/src/auth/user-fields.ts`

IČO: osm číslic se správným kontrolním součtem (mezery se ignorují); prázdné = bez IČO.

```ts
const icoField: z.ZodPreprocess<z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>, z.ZodTransform<string | null, string>>, unknown>
```

### inviteInput

const · `packages/core/src/auth/invitations.ts`

_Bez popisu._

```ts
const inviteInput: z.ZodObject<{ email: z.ZodEmail; roleId: z.ZodUUID; }, z.core.$strip>
```

### profileInput

const · `packages/core/src/auth/account.ts`

_Bez popisu._

```ts
const profileInput: z.ZodObject<{ name: z.ZodString; phone: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | null, string | null | undefined>>; shortName: z.ZodOptional<z.ZodPreprocess<z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransfor…
```

### shortNameField

const · `packages/core/src/auth/user-fields.ts`

Zkratka: 2 až 4 znaky (písmena a číslice), ukládá se velkými písmeny; prázdná = odvodí se z jména.

```ts
const shortNameField: z.ZodPreprocess<z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>, z.ZodTransform<string | null, string>>, unknown>
```

### userFieldsInput

const · `packages/core/src/auth/user-admin.ts`

Vstup úpravy polí uživatele; neuvedené pole zůstává beze změny, prázdné se smaže.

```ts
const userFieldsInput: z.ZodObject<{ userId: z.ZodUUID; shortName: z.ZodOptional<z.ZodPreprocess<z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>, z.ZodTransform<string | null, string>>, unknown>>; ico: z.ZodOptional<z.ZodPreprocess<z.ZodPipe<z.Z…
```

### Appearance

type · `packages/core/src/auth/prefs.ts`

Hodnoty Vzhledu s vyplněnými výchozími.

```ts
type Appearance = {
  theme: (typeof THEMES)[number];
  density: (typeof DENSITIES)[number];
  startPage: string | null;
};
```

### Auth

type · `packages/core/src/auth/create-auth.ts`

_Bez popisu._

```ts
type Auth = ReturnType<typeof createAuth>;
```

### AuthMail

type · `packages/core/src/auth/mailer.ts`

_Bez popisu._

```ts
type AuthMail = {
  to: string;
  template: AuthMailTemplate;
  /** Proměnné šablony. Mohou obsahovat tajný odkaz — nikdy se neukládají do logu v čitelné podobě. */
  vars: Record<string, string>;
};
```

### AuthMailTemplate

type · `packages/core/src/auth/mailer.ts`

Šablony systémových e-mailů, které posílá autentizace. Obsah a překlad řeší `mail` modul.

```ts
type AuthMailTemplate = "invitation" | "password-reset";
```

### AuthOptions

type · `packages/core/src/auth/create-auth.ts`

_Bez popisu._

```ts
type AuthOptions = {
  db: Db;
  /** Veřejná adresa aplikace (odkazy v e-mailech, kontrola původu požadavků). */
  baseURL: string;
  /** Tajemství pro podepisování cookies a šifrování 2FA (unikátní pro každou instanci). */
  secret: string;
  /** Viditelný název systému klienta (vydavatel v autentikační aplikaci). */
  appName: string;
  /** Odhlášení po neaktivitě; relace se prodlužuje s aktivitou. */
  idleTimeoutMinutes: number;
  mailer: Mailer;
  trustedOrigins?: string[];
  /** Komu je druhý faktor povinný: výchozí všem (OPSYS), `roles` jen rolím s příznakem `require_2fa`. */
  twoFactorPolicy?: TwoFactorPolicy;
  /** Pravidla pro nová hesla při obnově z odkazu (jen testy; výchozí viz `assertPasswordAcceptable`). */
  passwordCheck?: PasswordCheckOptions;
};
```

### AvatarColor

type · `packages/core/src/auth/user-fields.ts`

Barva avataru z palety UI.

```ts
type AvatarColor = (typeof AVATAR_COLORS)[number];
```

### BreachCheck

type · `packages/core/src/auth/password-policy.ts`

Jak se kontroluje únik hesla: vypnuto, výchozí služba, nebo vlastní zdroj (testy, vlastní zrcadlo).

```ts
type BreachCheck = "off" | "auto" | RangeFetcher;
```

### DeviceInfo

type · `packages/core/src/auth/user-agent.ts`

Čitelný popis zařízení z hlavičky User-Agent (jen to, co uživatel pozná: prohlížeč, systém, typ zařízení).

```ts
type DeviceInfo = {
  browser: string;
  os: string;
  device: "mobile" | "tablet" | "desktop";
  /** Např. „Chrome 141 na macOS“. */
  label: string;
};
```

### Mailer

type · `packages/core/src/auth/mailer.ts`

_Bez popisu._

```ts
type Mailer = { send(mail: AuthMail): Promise<void> };
```

### OwnSession

type · `packages/core/src/auth/credentials.ts`

_Bez popisu._

```ts
type OwnSession = {
  id: string;
  current: boolean;
  browser: string;
  os: string;
  device: "mobile" | "tablet" | "desktop";
  label: string;
  /** Zkrácená adresa (poslední část skrytá). */
  ip: string | null;
  createdAt: Date;
  lastActiveAt: Date;
};
```

### PasswordCheckOptions

type · `packages/core/src/auth/password-policy.ts`

Volby kontroly nového hesla: údaje o uživateli, které heslo nesmí obsahovat, a zdroj uniklých hesel.

```ts
type PasswordCheckOptions = PasswordSubject & {
  /**
   * Kontrola uniklých hesel. `auto` (výchozí) je zapnutá, kromě testů (`NODE_ENV=test`) a instance s
   * `PASSWORD_BREACH_CHECK=off` (provoz bez přístupu ven; offline kontrola běží vždy).
   */
  breachCheck?: BreachCheck;
};
```

### PasswordIssue

type · `packages/core/src/auth/password-policy.ts`

Důvod, proč se heslo nepřijme.

```ts
type PasswordIssue =
  "too_short" | "too_long" | "common" | "personal" | "repetitive" | "breached";
```

### PasswordSubject

type · `packages/core/src/auth/password-policy.ts`

Údaje o uživateli, které heslo nesmí obsahovat.

```ts
type PasswordSubject = { email?: string | null; name?: string | null };
```

### RangeFetcher

type · `packages/core/src/auth/password-policy.ts`

Vrátí tělo odpovědi služby „range“ pro 5znakovou předponu SHA-1 otisku (řádky `ZBYTEK:POČET`).

```ts
type RangeFetcher = (prefix: string) => Promise<string>;
```

### ResolveCtxOptions

type · `packages/core/src/auth/session.ts`

_Bez popisu._

```ts
type ResolveCtxOptions = {
  auth: Auth;
  db: Db;
  headers: Headers;
  /** Katalog oprávnění zapnutých modulů (viz `loadActor`). */
  catalog?: ReadonlySet<string>;
  /**
   * Absolutní maximum stáří relace, bez ohledu na aktivitu (dny). Relace se jinak při aktivitě prodlužuje
   * (klouzavé odhlášení po neaktivitě, `security.idleTimeoutMinutes`), takže bez maxima by platila navždy.
   */
  maxSessionAgeDays?: number;
  /** Komu je druhý faktor povinný (výchozí všem). Musí odpovídat volbě v `createAuth`. */
  twoFactorPolicy?: TwoFactorPolicy;
};
```

### SecurityAction

type · `packages/core/src/auth/security-events.ts`

Kód bezpečnostní události.

```ts
type SecurityAction = (typeof SECURITY_ACTIONS)[number];
```

### SecurityEvent

type · `packages/core/src/auth/security-events.ts`

Bezpečnostní událost k zápisu do historie (kdo, čeho se týká, co se stalo).

```ts
type SecurityEvent = {
  action: SecurityAction;
  /** Účet, kterého se událost týká; `null` = neznámý účet (neúspěšné přihlášení na cizí e-mail). */
  userId: string | null;
  /**
   * Kdo událost vyvolal: výchozí je sám dotčený účet, `null` = nikdo přihlášený (formulář přihlášení),
   * jiné id = správce, který zasáhl do cizího účtu.
   */
  actorId?: string | null;
  actorKind?: AuditActorKind;
  summary: string;
  changes?: AuditChange[];
  ip?: string | null;
  requestId?: string | null;
  /** Doplňující údaje (způsob přihlášení, zařízení…); nikdy tajné hodnoty. */
  context?: Record<string, unknown>;
};
```

### SecurityEventRow

type · `packages/core/src/auth/security-events.ts`

Řádek výpisu bezpečnostních událostí účtu.

```ts
type SecurityEventRow = {
  id: string;
  occurredAt: Date;
  action: string;
  label: string;
  summary: string | null;
  ip: string | null;
  /** Kdo událost vyvolal (jméno), nebo `null` pro formulář přihlášení. */
  actorName: string | null;
  /** Účet, kterého se týká (`unknown` = neznámý účet). */
  userId: string;
};
```

### TrustedDevice

type · `packages/core/src/auth/trusted-devices.ts`

Důvěryhodné zařízení uživatele (bez druhého faktoru po dobu platnosti důvěry).

```ts
type TrustedDevice = {
  id: string;
  /** Kdy bylo zařízení označeno, nebo naposledy použito (řádek se při použití obnovuje). */
  createdAt: Date;
  expiresAt: Date;
  /** Je to zařízení, ze kterého se právě díváte. */
  current: boolean;
};
```

### TwoFactorPolicy

type · `packages/core/src/auth/policy.ts`

Komu je dvoufázové ověření (TOTP) povinné: `all` = všem rolím (OPSYS, AUT-01), `roles` = jen rolím s příznakem
`require_2fa` (původní chování jádra). Bez druhého faktoru se uživatel po přihlášení heslem dostane jen na nastavení
ověření; vypnout ho nejde.

```ts
type TwoFactorPolicy = "all" | "roles";
```
