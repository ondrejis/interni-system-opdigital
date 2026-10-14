# @rebar/core/admin

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/admin` (soubor `packages/core/src/admin/index.ts`). Exportů: 16, z toho s popisem 12.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`createRole`](#createrole) | function |  |  |
| [`deleteRole`](#deleterole) | function |  |  |
| [`listLoginEvents`](#listloginevents) | function | Historie přihlášení: svá vidí každý, cizí správce uživatelů. |  |
| [`listRoles`](#listroles) | function | Role s oprávněními a počtem uživatelů (pro matici oprávnění v administraci). |  |
| [`listUsers`](#listusers) | function | Seznam uživatelů pro administraci. |  |
| [`lookupRoles`](#lookuproles) | function | Role k výběru při přidělování (id, název, příznak systémové). Smí ji vidět ten, kdo spravuje uživatele nebo role; oprávnění jednotlivých rolí z ní nevyčtete (ta jsou jen pro `roles.manage`). |  |
| [`lookupUsers`](#lookupusers) | function | Aktivní uživatelé pro výběr (řešitel úkolu, vedoucí zakázky, zmínka). Jména vidí každý přihlášený. |  |
| [`revokeSessions`](#revokesessions) | function | Odhlásí uživatele ze všech zařízení — sebe kdykoli, jiné jen správce uživatelů (majitele jen majitel). |  |
| [`sendPasswordReset`](#sendpasswordreset) | function | Správce uživateli umožní nastavit si nové heslo (heslo za něj nikdy nenastavuje a nevidí). |  |
| [`setRolePermissions`](#setrolepermissions) | function | Nastaví oprávnění role (celá sada najednou). Klíče musí být v katalogu zapnutých modulů. Změny se zapíší do auditu po jednotlivých oprávněních; platí pro další požadavek uživatelů role. |  |
| [`setUserActive`](#setuseractive) | function | Deaktivuje nebo znovu aktivuje účet. Deaktivovaný se okamžitě odhlásí ze všech zařízení. |  |
| [`setUserRole`](#setuserrole) | function |  |  |
| [`updateOwnName`](#updateownname) | function | Změna vlastního jména. |  |
| [`updateRole`](#updaterole) | function | Systémovou roli (majitel) nejde měnit ani mazat — správce by se mohl zamknout mimo systém. |  |
| [`PASSWORD_RESET_TTL_MINUTES`](#password_reset_ttl_minutes) | const | Jak dlouho platí odkaz pro nastavení hesla (stejně jako odkaz z e-mailu). |  |
| [`PasswordResetResult`](#passwordresetresult) | type |  |  |

### createRole

function · `packages/core/src/admin/roles.ts`

_Bez popisu._

```ts
async function createRole(ctx: Ctx, raw: z.input<typeof roleInput>): Promise<{ name: string; key: string; id: string; description: string | null; isSystem: boolean; require2fa: boolean; createdAt: Date; updatedAt: Date; createdBy: string | null; updatedBy: string | null; deletedAt: Date | null; }>
```

### deleteRole

function · `packages/core/src/admin/roles.ts`

_Bez popisu._

```ts
async function deleteRole(ctx: Ctx, id: string): Promise<void>
```

### listLoginEvents

function · `packages/core/src/admin/users.ts`

Historie přihlášení: svá vidí každý, cizí správce uživatelů.

```ts
async function listLoginEvents(ctx: Ctx, userId: string, limit = 50): Promise<{ outcome: string; ipAddress: string | null; userAgent: string | null; createdAt: Date; }[]>
```

### listRoles

function · `packages/core/src/admin/roles.ts`

Role s oprávněními a počtem uživatelů (pro matici oprávnění v administraci).

```ts
async function listRoles(ctx: Ctx): Promise<{ permissions: Record<string, Scope>; userCount: number; createdAt: Date; updatedAt: Date; createdBy: string | null; updatedBy: string | null; deletedAt: Date | null; id: string; key: string; name: string; description: string | nul…
```

### listUsers

function · `packages/core/src/admin/users.ts`

Seznam uživatelů pro administraci.

```ts
async function listUsers(ctx: Ctx): Promise<{ id: string; name: string; email: string; roleId: string; roleName: string; roleKey: string; active: boolean; twoFactorEnabled: boolean; lastLoginAt: Date | null; createdAt: Date; }[]>
```

### lookupRoles

function · `packages/core/src/admin/roles.ts`

Role k výběru při přidělování (id, název, příznak systémové). Smí ji vidět ten, kdo spravuje uživatele nebo role;
oprávnění jednotlivých rolí z ní nevyčtete (ta jsou jen pro `roles.manage`).

```ts
async function lookupRoles(ctx: Ctx): Promise<{ id: string; name: string; isSystem: boolean; }[]>
```

### lookupUsers

function · `packages/core/src/admin/users.ts`

Aktivní uživatelé pro výběr (řešitel úkolu, vedoucí zakázky, zmínka). Jména vidí každý přihlášený.

```ts
async function lookupUsers(ctx: Ctx, query: string, limit = 20): Promise<{ id: string; name: string; }[]>
```

### revokeSessions

function · `packages/core/src/admin/users.ts`

Odhlásí uživatele ze všech zařízení — sebe kdykoli, jiné jen správce uživatelů (majitele jen majitel).

```ts
async function revokeSessions(ctx: Ctx, userId: string): Promise<void>
```

### sendPasswordReset

function · `packages/core/src/admin/users.ts`

Správce uživateli umožní nastavit si nové heslo (heslo za něj nikdy nenastavuje a nevidí).

- S nastaveným odesíláním e-mailů (`deliverByEmail`) pošle uživateli odkaz e-mailem; správce ho nevidí.
- Bez e-mailů vznikne jednorázový odkaz s platností 1 hodina, který správce jednou dostane k předání (osobně, telefonem).
  Odkaz je stejný jako z e-mailu, takže po jeho použití se zruší všechna přihlášení uživatele a 2FA zůstává v platnosti.
  V auditu je jen to, že odkaz vznikl, nikdy jeho obsah.

Dříve vydané, nepoužité odkazy tohoto uživatele se zneplatní.

```ts
async function sendPasswordReset(ctx: Ctx, deps: { auth: Auth; baseURL?: string; deliverByEmail?: boolean }, userId: string): Promise<PasswordResetResult>
```

### setRolePermissions

function · `packages/core/src/admin/roles.ts`

Nastaví oprávnění role (celá sada najednou). Klíče musí být v katalogu zapnutých modulů.
Změny se zapíší do auditu po jednotlivých oprávněních; platí pro další požadavek uživatelů role.

```ts
async function setRolePermissions(ctx: Ctx, id: string, permissions: Record<string, Scope>, catalog: ReadonlySet<string>): Promise<void>
```

### setUserActive

function · `packages/core/src/admin/users.ts`

Deaktivuje nebo znovu aktivuje účet. Deaktivovaný se okamžitě odhlásí ze všech zařízení.

```ts
async function setUserActive(ctx: Ctx, userId: string, active: boolean): Promise<void>
```

### setUserRole

function · `packages/core/src/admin/users.ts`

_Bez popisu._

```ts
async function setUserRole(ctx: Ctx, userId: string, roleId: string): Promise<void>
```

### updateOwnName

function · `packages/core/src/admin/users.ts`

Změna vlastního jména.

```ts
async function updateOwnName(ctx: Ctx, name: string): Promise<void>
```

### updateRole

function · `packages/core/src/admin/roles.ts`

Systémovou roli (majitel) nejde měnit ani mazat — správce by se mohl zamknout mimo systém.

```ts
async function updateRole(ctx: Ctx, id: string, patch: { name?: string; description?: string | null; require2fa?: boolean }): Promise<void>
```

### PASSWORD_RESET_TTL_MINUTES

const · `packages/core/src/admin/users.ts`

Jak dlouho platí odkaz pro nastavení hesla (stejně jako odkaz z e-mailu).

```ts
const PASSWORD_RESET_TTL_MINUTES: 60
```

### PasswordResetResult

type · `packages/core/src/admin/users.ts`

_Bez popisu._

```ts
type PasswordResetResult =
  | { delivery: "email"; email: string }
  | { delivery: "link"; email: string; url: string; expiresAt: Date };
```
