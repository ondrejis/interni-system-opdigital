# @rebar/core/auth

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/auth` (soubor `packages/core/src/auth/index.ts`). Exportů: 35, z toho s popisem 20.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`acceptInvitation`](#acceptinvitation) | function | Přijetí pozvánky (bez přihlášení): vytvoří uživatele s heslem. Pozvánku nejdřív „zabere“ jedním UPDATE, takže ji nejde přijmout dvakrát souběžně; při selhání se vrátí. |  |
| [`bootstrapOwner`](#bootstrapowner) | function | Založí prvního uživatele (majitele) při instalaci. Idempotentní: když uživatel s e-mailem už je, nedělá nic. Roli `owner` musí předtím založit seed. Heslo se nikam nezapisuje a vynutí se jeho změna až přes 2FA a pozvánky. |  |
| [`changeOwnPassword`](#changeownpassword) | function | Změna vlastního hesla. Ověří současné heslo (omezení počtu pokusů v databázi), uloží otisk nového hesla, odhlásí ostatní zařízení a zapíše audit bez jakékoli hodnoty hesla; vše v jedné transakci. |  |
| [`clientIp`](#clientip) | function | IP klienta za důvěryhodnou proxy (Caddy): první adresa z X-Forwarded-For. |  |
| [`createAuth`](#createauth) | function | Autentizace: e-mail + heslo (argon2id), 2FA (TOTP), sessions v DB, rate limit v DB, žádná veřejná registrace (účty vznikají jen pozvánkou). Role a oprávnění jsou naše (`rbac`), Better Auth řeší jen identitu. |  |
| [`createInvitation`](#createinvitation) | function | Pozve uživatele e-mailem. Předchozí nevyřízené pozvánky na stejný e-mail se zneplatní. |  |
| [`describeUserAgent`](#describeuseragent) | function | Rozpozná prohlížeč, systém a typ zařízení. Neznámý nebo prázdný text vrátí obecný popis, nikdy nevyhodí chybu. |  |
| [`getAccount`](#getaccount) | function | Údaje přihlášeného uživatele pro hlavičku, stránku Můj účet a zabezpečení. Každý vidí jen sebe. |  |
| [`hashPassword`](#hashpassword) | function |  |  |
| [`inspectInvitation`](#inspectinvitation) | function | Co ukázat na stránce pozvánky (bez přihlášení): komu je určena a do jaké role. |  |
| [`listInvitations`](#listinvitations) | function |  |  |
| [`listOwnSessions`](#listownsessions) | function | Aktivní přihlášení (zařízení) přihlášeného uživatele, nejnovější aktivita první. Každý vidí jen svá. |  |
| [`maskIp`](#maskip) | function | Zkrácená adresa pro zobrazení uživateli: IPv4 bez poslední části, IPv6 jen první tři bloky. Úplná adresa zůstává v databázi (historie přihlášení pro správce), ale uživateli se neukazuje celá. |  |
| [`resolveCtx`](#resolvectx) | function | Z cookie vyrobí kontext s aktérem, nebo `null` (nepřihlášen, relace vypršela, účet deaktivován). Relace starší než absolutní maximum se zruší. |  |
| [`revokeInvitation`](#revokeinvitation) | function |  |  |
| [`revokeOtherOwnSessions`](#revokeotherownsessions) | function | Odhlásí všechna vlastní zařízení kromě aktuálního. Vrací počet odhlášených. |  |
| [`revokeOwnSession`](#revokeownsession) | function | Odhlásí jedno vlastní zařízení. Cizí přihlášení se tváří jako neexistující. |  |
| [`updateOwnProfile`](#updateownprofile) | function | Úprava vlastního profilu: jméno (`user.name`) a telefon (`employee.phone`). E-mail si uživatel nemění sám, protože je to přihlašovací jméno a cíl odkazů pro obnovu hesla; mění se přes správce uživatelů nebo novou pozvánku. Jméno i telefon se čtou ze stejných tabulek všude jinde (záznamy, aktivita, docházka), takže se změna projeví hned všude. |  |
| [`verifyPassword`](#verifypassword) | function |  |  |
| [`INVITATION_TTL_DAYS`](#invitation_ttl_days) | const | Pozvánka platí 7 dní (demo měl 1 hodinu a pozvánka často vypršela dřív, než ji uživatel otevřel). |  |
| [`MAX_PASSWORD_LENGTH`](#max_password_length) | const |  |  |
| [`MIN_PASSWORD_LENGTH`](#min_password_length) | const |  |  |
| [`PASSWORD_CHANGE_LIMIT`](#password_change_limit) | const | Pokusů o změnu hesla (správných i špatných) za okno; chrání současné heslo před hádáním z ukradené relace. |  |
| [`acceptInput`](#acceptinput) | const |  |  |
| [`changePasswordInput`](#changepasswordinput) | const | Vstup změny hesla; stejné minimum jako u pozvánky a obnovy hesla. |  |
| [`inviteInput`](#inviteinput) | const |  |  |
| [`profileInput`](#profileinput) | const |  |  |
| [`Auth`](#auth) | type |  |  |
| [`AuthMail`](#authmail) | type |  |  |
| [`AuthMailTemplate`](#authmailtemplate) | type | Šablony systémových e-mailů, které posílá autentizace. Obsah a překlad řeší `mail` modul. |  |
| [`AuthOptions`](#authoptions) | type |  |  |
| [`DeviceInfo`](#deviceinfo) | type | Čitelný popis zařízení z hlavičky User-Agent (jen to, co uživatel pozná: prohlížeč, systém, typ zařízení). |  |
| [`Mailer`](#mailer) | type |  |  |
| [`OwnSession`](#ownsession) | type |  |  |
| [`ResolveCtxOptions`](#resolvectxoptions) | type |  |  |

### acceptInvitation

function · `packages/core/src/auth/invitations.ts`

Přijetí pozvánky (bez přihlášení): vytvoří uživatele s heslem. Pozvánku nejdřív „zabere“
jedním UPDATE, takže ji nejde přijmout dvakrát souběžně; při selhání se vrátí.

```ts
async function acceptInvitation(deps: { auth: Auth; db: Db }, input: z.input<typeof acceptInput>): Promise<{ userId: string; email: string; }>
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

Změna vlastního hesla. Ověří současné heslo (omezení počtu pokusů v databázi), uloží otisk nového hesla,
odhlásí ostatní zařízení a zapíše audit bez jakékoli hodnoty hesla; vše v jedné transakci.

`keepSessionId` je relace, která zůstane přihlášená (obvykle ta, ze které se heslo mění). `null` odhlásí všechny.

```ts
async function changeOwnPassword(ctx: Ctx, raw: z.input<typeof changePasswordInput>, opts: { keepSessionId: string | null }): Promise<{ revokedSessions: number }>
```

### clientIp

function · `packages/core/src/auth/ip.ts`

IP klienta za důvěryhodnou proxy (Caddy): první adresa z X-Forwarded-For.

```ts
function clientIp(headers: Headers): string | null
```

### createAuth

function · `packages/core/src/auth/create-auth.ts`

Autentizace: e-mail + heslo (argon2id), 2FA (TOTP), sessions v DB, rate limit v DB,
žádná veřejná registrace (účty vznikají jen pozvánkou). Role a oprávnění jsou naše
(`rbac`), Better Auth řeší jen identitu.

```ts
function createAuth(opts: AuthOptions): import("better-auth").Auth<{ appName: string; baseURL: string; secret: string; trustedOrigins: string[]; disabledPaths: string[]; database: (options: import("better-auth").BetterAuthOptions) => import("better-auth").DBAdapter<import("bette…
```

### createInvitation

function · `packages/core/src/auth/invitations.ts`

Pozve uživatele e-mailem. Předchozí nevyřízené pozvánky na stejný e-mail se zneplatní.

```ts
async function createInvitation(ctx: Ctx, input: z.input<typeof inviteInput>, deps: { mailer: Mailer; baseURL: string }): Promise<{ id: string; expiresAt: Date; }>
```

### describeUserAgent

function · `packages/core/src/auth/user-agent.ts`

Rozpozná prohlížeč, systém a typ zařízení. Neznámý nebo prázdný text vrátí obecný popis, nikdy nevyhodí chybu.

```ts
function describeUserAgent(ua: string | null | undefined): DeviceInfo
```

### getAccount

function · `packages/core/src/auth/account.ts`

Údaje přihlášeného uživatele pro hlavičku, stránku Můj účet a zabezpečení. Každý vidí jen sebe.

```ts
async function getAccount(ctx: Ctx): Promise<{ id: string; name: string; email: string; roleName: string; twoFactorEnabled: boolean; twoFactorRequired: boolean; phone: string | null; }>
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

### listInvitations

function · `packages/core/src/auth/invitations.ts`

_Bez popisu._

```ts
async function listInvitations(ctx: Ctx): Promise<{ id: string; email: string; roleName: string; expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null; }[]>
```

### listOwnSessions

function · `packages/core/src/auth/credentials.ts`

Aktivní přihlášení (zařízení) přihlášeného uživatele, nejnovější aktivita první. Každý vidí jen svá.

```ts
async function listOwnSessions(ctx: Ctx, currentSessionId: string | null): Promise<OwnSession[]>
```

### maskIp

function · `packages/core/src/auth/user-agent.ts`

Zkrácená adresa pro zobrazení uživateli: IPv4 bez poslední části, IPv6 jen první tři bloky.
Úplná adresa zůstává v databázi (historie přihlášení pro správce), ale uživateli se neukazuje celá.

```ts
function maskIp(ip: string | null | undefined): string | null
```

### resolveCtx

function · `packages/core/src/auth/session.ts`

Z cookie vyrobí kontext s aktérem, nebo `null` (nepřihlášen, relace vypršela,
účet deaktivován). Relace starší než absolutní maximum se zruší.

```ts
async function resolveCtx({ auth, db, headers, catalog, maxSessionAgeDays = 30, }: ResolveCtxOptions): Promise<Ctx | null>
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

### updateOwnProfile

function · `packages/core/src/auth/account.ts`

Úprava vlastního profilu: jméno (`user.name`) a telefon (`employee.phone`). E-mail si uživatel nemění sám, protože je to
přihlašovací jméno a cíl odkazů pro obnovu hesla; mění se přes správce uživatelů nebo novou pozvánku.
Jméno i telefon se čtou ze stejných tabulek všude jinde (záznamy, aktivita, docházka), takže se změna projeví hned všude.

```ts
async function updateOwnProfile(ctx: Ctx, raw: z.input<typeof profileInput>): Promise<void>
```

### verifyPassword

function · `packages/core/src/auth/password.ts`

_Bez popisu._

```ts
async function verifyPassword({ hash: stored, password, }: { hash: string; password: string; }): Promise<boolean>
```

### INVITATION_TTL_DAYS

const · `packages/core/src/auth/invitations.ts`

Pozvánka platí 7 dní (demo měl 1 hodinu a pozvánka často vypršela dřív, než ji uživatel otevřel).

```ts
const INVITATION_TTL_DAYS: 7
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

### acceptInput

const · `packages/core/src/auth/invitations.ts`

_Bez popisu._

```ts
const acceptInput: z.ZodObject<{ token: z.ZodString; name: z.ZodString; password: z.ZodString; }, z.core.$strip>
```

### changePasswordInput

const · `packages/core/src/auth/credentials.ts`

Vstup změny hesla; stejné minimum jako u pozvánky a obnovy hesla.

```ts
const changePasswordInput: z.ZodObject<{ currentPassword: z.ZodString; newPassword: z.ZodString; }, z.core.$strip>
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
const profileInput: z.ZodObject<{ name: z.ZodString; phone: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | null, string | null | undefined>>; }, z.core.$strip>
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
};
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
  /** Absolutní maximum stáří relace, bez ohledu na aktivitu. */
  maxSessionAgeDays?: number;
};
```
