# @rebar/core/testing

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/testing` (soubor `packages/core/src/testing/index.ts`). Exportů: 13, z toho s popisem 8.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`connectAppDb`](#connectappdb) | function | Připojení k testovací DB pod aplikační rolí (minimální práva) — stejně jako v produkci. |  |
| [`connectMigratorDb`](#connectmigratordb) | function | Připojení pod uživatelem migrací; jen pro přípravu dat, kterou aplikační role nesmí. |  |
| [`cookieHeader`](#cookieheader) | function | Z hlaviček `Set-Cookie` odpovědi složí hlavičku `Cookie` pro další požadavek. |  |
| [`createTestAuth`](#createtestauth) | function |  |  |
| [`expectPgError`](#expectpgerror) | function | Drizzle obaluje chyby PostgreSQL do „Failed query“; skutečná příčina je v `cause`. |  |
| [`fakeMailer`](#fakemailer) | function |  |  |
| [`makeUser`](#makeuser) | function | Uživatel s vlastní rolí a danými oprávnění (`[klíč, rozsah]`) a kontextem pro volání služeb. Role i uživatel jsou unikátní, takže testy se navzájem neovlivňují. |  |
| [`rebarDbUrls`](#rebardburls) | function | Adresy databáze, kterou má k dispozici právě běžící soubor testů: vlastní kopie šablony (viz `setup-file.ts`), jinak sdílená databáze z globálního nastavení. |  |
| [`secretFromTotpUri`](#secretfromtotpuri) | function |  |  |
| [`totpCode`](#totpcode) | function | TOTP podle RFC 6238 (SHA-1, 6 číslic, 30 s) z tajemství v base32 — nezávisle na Better Auth. |  |
| [`uniqueEmail`](#uniqueemail) | function |  |  |
| [`waitFor`](#waitfor) | function | Čeká, až podmínka platí (např. až worker zpracuje úlohu). |  |
| [`TestDbUrls`](#testdburls) | type |  |  |

### connectAppDb

function · `packages/core/src/testing/index.ts`

Připojení k testovací DB pod aplikační rolí (minimální práva) — stejně jako v produkci.

```ts
function connectAppDb(): DbHandle
```

### connectMigratorDb

function · `packages/core/src/testing/index.ts`

Připojení pod uživatelem migrací; jen pro přípravu dat, kterou aplikační role nesmí.

```ts
function connectMigratorDb(): DbHandle
```

### cookieHeader

function · `packages/core/src/testing/auth.ts`

Z hlaviček `Set-Cookie` odpovědi složí hlavičku `Cookie` pro další požadavek.

```ts
function cookieHeader(responseHeaders: Headers, previous = ""): Headers
```

### createTestAuth

function · `packages/core/src/testing/auth.ts`

_Bez popisu._

```ts
function createTestAuth(db: Db, mailer: Mailer, over: { idleTimeoutMinutes?: number } = {}): import("better-auth").Auth<{ appName: string; baseURL: string; secret: string; trustedOrigins: string[]; disabledPaths: string[]; database: (options: import("better-auth").BetterAuthOptions) => import("better-auth").DBAdapter<import("bette…
```

### expectPgError

function · `packages/core/src/testing/index.ts`

Drizzle obaluje chyby PostgreSQL do „Failed query“; skutečná příčina je v `cause`.

```ts
async function expectPgError(promise: PromiseLike<unknown>, pattern: RegExp): Promise<void>
```

### fakeMailer

function · `packages/core/src/testing/auth.ts`

_Bez popisu._

```ts
function fakeMailer(): Mailer & { sent: AuthMail[]; last(template?: AuthMail["template"]): AuthMail | undefined; }
```

### makeUser

function · `packages/core/src/testing/index.ts`

Uživatel s vlastní rolí a danými oprávnění (`[klíč, rozsah]`) a kontextem pro volání služeb.
Role i uživatel jsou unikátní, takže testy se navzájem neovlivňují.

```ts
async function makeUser(db: Db, perms: readonly [string, "all" | "own"][] = [], opts: { name?: string; systemRole?: boolean } = {}): Promise<{ id: string; name: string; email: string; ctx: import("../rbac").Ctx; }>
```

### rebarDbUrls

function · `packages/core/src/testing/index.ts`

Adresy databáze, kterou má k dispozici právě běžící soubor testů: vlastní kopie šablony (viz `setup-file.ts`),
jinak sdílená databáze z globálního nastavení.

```ts
function rebarDbUrls(): TestDbUrls
```

### secretFromTotpUri

function · `packages/core/src/testing/auth.ts`

_Bez popisu._

```ts
function secretFromTotpUri(uri: string): string
```

### totpCode

function · `packages/core/src/testing/auth.ts`

TOTP podle RFC 6238 (SHA-1, 6 číslic, 30 s) z tajemství v base32 — nezávisle na Better Auth.

```ts
function totpCode(secretBase32: string, at = Date.now()): string
```

### uniqueEmail

function · `packages/core/src/testing/index.ts`

_Bez popisu._

```ts
function uniqueEmail(prefix = "u"): string
```

### waitFor

function · `packages/core/src/testing/index.ts`

Čeká, až podmínka platí (např. až worker zpracuje úlohu).

```ts
async function waitFor<T>(fn: () => Promise<T | false | null | undefined>, timeoutMs = 15_000, intervalMs = 100): Promise<T>
```

### TestDbUrls

type · `packages/core/src/testing/index.ts`

_Bez popisu._

```ts
type TestDbUrls = { app: string; migrator: string; admin: string };
```
