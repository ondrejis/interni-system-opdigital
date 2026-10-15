# @rebar/core/rbac

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/rbac` (soubor `packages/core/src/rbac/index.ts`). Exportů: 27, z toho s popisem 19.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`assertCan`](#assertcan) | function |  |  |
| [`assertCanAny`](#assertcanany) | function | Aktér musí mít kterékoli z oprávnění (`PermissionError`, když žádné). |  |
| [`can`](#can) | function | Smí aktér provést akci? Bez `record` odpovídá na „má k tomu vůbec přístup“ (rozsah `own` stačí). S `record` u rozsahu `own` musí být aktér mezi vlastníky. |  |
| [`canSeePrivate`](entities.md#canseeprivate) | function | Smí aktér vidět soukromé záznamy (zámek)? Jen s oprávněním `private.read`, které má vlastník (role `owner`) a které nejde přidělit jiné roli. Partner nikdy; systémový aktér (úlohy, n8n) ano. | v `@rebar/core/entities` |
| [`createCtx`](#createctx) | function |  |  |
| [`ensureRoles`](#ensureroles) | function | Založí chybějící role z výchozí definice (seed klienta). Existující role správce upravil v administraci, proto se jim dorovná jen povinné 2FA podle konfigurace a oprávnění, která seed přidal nově (např. nový modul): ta se jen přidají, nikdy neodeberou a nepřidá se znovu to, co správce ručně odebral (seznam už nasazených oprávnění je v nastavení `rbac.seeded.<klíč role>`). Oprávnění `private.read` nedostane žádná role kromě systémové. |  |
| [`inTx`](#intx) | function | Provede `fn` v transakci; `ctx.db` uvnitř je transakce (zápis i audit jsou atomické). |  |
| [`loadActor`](#loadactor) | function | Načte aktéra (uživatele s oprávněními jeho role). Vrací `null` pro neexistujícího, deaktivovaného nebo smazaného uživatele. Systémová role (owner) dostane všechna oprávnění katalogu v rozsahu `all`, aby se po přidání modulu nemusela doplňovat. |  |
| [`requireScope`](#requirescope) | function | Vrátí rozsah, nebo vyhodí PermissionError. |  |
| [`scopeOf`](#scopeof) | function | Jaký rozsah má aktér u oprávnění (`null` = nemá ho vůbec). |  |
| [`scopedWhere`](#scopedwhere) | function | Podmínka do `WHERE` pro seznamy: u rozsahu `all` nic (`undefined`), u `own` jen záznamy, kde je aktér v kterémkoli ze sloupců s vlastníkem. Bez oprávnění vyhodí PermissionError. Každý dotaz nad záznamy s rozsahem musí podmínku použít (kontrola je v datové vrstvě). |  |
| [`sourceCtx`](#sourcectx) | function | Kontext pro změny, které nedělá člověk: příchozí volání z n8n, synchronizace s Googlem nebo Metou, naplánovaná úloha. Smí všechno (jako systém), ale historie u změny ukáže `kind` a `label` („n8n: Disk“). |  |
| [`systemCtx`](#systemctx) | function |  |  |
| [`NotFoundError`](#notfounderror) | class | Záznam neexistuje (nebo ho uživatel nesmí vidět — oboje se tváří stejně). |  |
| [`PermissionError`](#permissionerror) | class | Uživatel nemá právo na akci nebo záznam. |  |
| [`UserError`](#usererror) | class | Chyba, jejíž text se smí ukázat uživateli (špatný vstup, porušené obchodní pravidlo). |  |
| [`SELF_SERVICE_PERMISSIONS`](#self_service_permissions) | const | Oprávnění, která smí i omezená relace (např. nastavení vlastního 2FA). |  |
| [`SYSTEM_ACTOR`](#system_actor) | const | Aktér pro úlohy na pozadí: smí všechno, v auditu je vidět jako „system“. |  |
| [`Actor`](#actor) | type |  |  |
| [`ActorKind`](#actorkind) | type | Druh aktéra změny: uživatel, systém (úlohy), servisní přístup agentury, nebo vnější zdroj (n8n, Google, Meta, naplánovaná úloha). Vnější zdroje a úlohy jsou `unrestricted`; v historii je vidět `kind` a `label`. |  |
| [`Ctx`](#ctx) | type |  |  |
| [`EnsureRolesOptions`](#ensurerolesoptions) | type |  |  |
| [`LoadActorOptions`](#loadactoroptions) | type |  |  |
| [`OwnedRecord`](#ownedrecord) | type | Záznam, jehož vlastníci rozhodují o přístupu při rozsahu `own`. |  |
| [`Restriction`](#restriction) | type | Omezená relace: dokud uživatel neudělá požadovaný krok, smí jen self-service oprávnění. |  |
| [`RoleDef`](#roledef) | type |  |  |
| [`Scope`](#scope) | type | `all` = všechny záznamy, `own` = jen vlastní nebo přidělené. |  |

### assertCan

function · `packages/core/src/rbac/permissions.ts`

_Bez popisu._

```ts
function assertCan(ctx: Ctx, key: string, record?: OwnedRecord): void
```

### assertCanAny

function · `packages/core/src/rbac/permissions.ts`

Aktér musí mít kterékoli z oprávnění (`PermissionError`, když žádné).

```ts
function assertCanAny(ctx: Ctx, ...keys: string[]): void
```

### can

function · `packages/core/src/rbac/permissions.ts`

Smí aktér provést akci? Bez `record` odpovídá na „má k tomu vůbec přístup“
(rozsah `own` stačí). S `record` u rozsahu `own` musí být aktér mezi vlastníky.

```ts
function can(ctx: Ctx, key: string, record?: OwnedRecord): boolean
```

### createCtx

function · `packages/core/src/rbac/context.ts`

_Bez popisu._

```ts
function createCtx(db: Executor, actor: Actor, meta: { requestId?: string | undefined; ip?: string | null | undefined } = {}): Ctx
```

### ensureRoles

function · `packages/core/src/rbac/seed.ts`

Založí chybějící role z výchozí definice (seed klienta). Existující role správce upravil v administraci, proto se jim
dorovná jen povinné 2FA podle konfigurace a oprávnění, která seed přidal nově (např. nový modul): ta se jen přidají,
nikdy neodeberou a nepřidá se znovu to, co správce ručně odebral (seznam už nasazených oprávnění je v nastavení
`rbac.seeded.<klíč role>`). Oprávnění `private.read` nedostane žádná role kromě systémové.

```ts
async function ensureRoles(db: Executor, defs: readonly RoleDef[], { catalog, require2faRoles = [] }: EnsureRolesOptions = {}): Promise<void>
```

### inTx

function · `packages/core/src/rbac/context.ts`

Provede `fn` v transakci; `ctx.db` uvnitř je transakce (zápis i audit jsou atomické).

```ts
function inTx<T>(ctx: Ctx, fn: (ctx: Ctx) => Promise<T>): Promise<T>
```

### loadActor

function · `packages/core/src/rbac/actor.ts`

Načte aktéra (uživatele s oprávněními jeho role). Vrací `null` pro neexistujícího,
deaktivovaného nebo smazaného uživatele. Systémová role (owner) dostane všechna
oprávnění katalogu v rozsahu `all`, aby se po přidání modulu nemusela doplňovat.

```ts
async function loadActor(db: Executor, userId: string, options: LoadActorOptions = {}): Promise<Actor | null>
```

### requireScope

function · `packages/core/src/rbac/permissions.ts`

Vrátí rozsah, nebo vyhodí PermissionError.

```ts
function requireScope(ctx: Ctx, key: string): Scope
```

### scopeOf

function · `packages/core/src/rbac/permissions.ts`

Jaký rozsah má aktér u oprávnění (`null` = nemá ho vůbec).

```ts
function scopeOf(ctx: Ctx, key: string): Scope | null
```

### scopedWhere

function · `packages/core/src/rbac/permissions.ts`

Podmínka do `WHERE` pro seznamy: u rozsahu `all` nic (`undefined`), u `own` jen záznamy,
kde je aktér v kterémkoli ze sloupců s vlastníkem. Bez oprávnění vyhodí PermissionError.
Každý dotaz nad záznamy s rozsahem musí podmínku použít (kontrola je v datové vrstvě).

```ts
function scopedWhere(ctx: Ctx, key: string, ownerColumns: readonly AnyColumn[]): SQL | undefined
```

### sourceCtx

function · `packages/core/src/rbac/context.ts`

Kontext pro změny, které nedělá člověk: příchozí volání z n8n, synchronizace s Googlem nebo Metou, naplánovaná
úloha. Smí všechno (jako systém), ale historie u změny ukáže `kind` a `label` („n8n: Disk“).

```ts
function sourceCtx(db: Executor, kind: Exclude<ActorKind, "user">, label?: string, requestId?: string): Ctx
```

### systemCtx

function · `packages/core/src/rbac/context.ts`

_Bez popisu._

```ts
function systemCtx(db: Executor, requestId?: string): Ctx
```

### NotFoundError

class · `packages/core/src/rbac/errors.ts`

Záznam neexistuje (nebo ho uživatel nesmí vidět — oboje se tváří stejně).

```ts
class NotFoundError extends Error {
  code;
  constructor(message = "Záznam nenalezen.");
}
```

### PermissionError

class · `packages/core/src/rbac/errors.ts`

Uživatel nemá právo na akci nebo záznam.

```ts
class PermissionError extends Error {
  code;
  constructor(message = "Na tuto akci nemáte oprávnění.");
}
```

### UserError

class · `packages/core/src/rbac/errors.ts`

Chyba, jejíž text se smí ukázat uživateli (špatný vstup, porušené obchodní pravidlo).

```ts
class UserError extends Error {
  code;
  constructor(message: string);
}
```

### SELF_SERVICE_PERMISSIONS

const · `packages/core/src/rbac/types.ts`

Oprávnění, která smí i omezená relace (např. nastavení vlastního 2FA).

```ts
const SELF_SERVICE_PERMISSIONS: readonly string[]
```

### SYSTEM_ACTOR

const · `packages/core/src/rbac/context.ts`

Aktér pro úlohy na pozadí: smí všechno, v auditu je vidět jako „system“.

```ts
const SYSTEM_ACTOR: Actor
```

### Actor

type · `packages/core/src/rbac/types.ts`

_Bez popisu._

```ts
type Actor = {
  kind: ActorKind;
  userId: string | null;
  roleKey: string | null;
  /** Popisek vnějšího aktéra do historie (např. „n8n: Disk“, „Google Kalendář“); u uživatele prázdný. */
  label?: string | undefined;
  /** Role aktéra je systémová (owner). Jen takový aktér smí přidělovat systémové role. */
  systemRole?: boolean;
  /** Oprávnění role v aktuální sestavě modulů (oprávnění vypnutých modulů tu nejsou). */
  permissions: ReadonlyMap<string, Scope>;
  /** Systémový aktér (úlohy na pozadí) smí všechno. */
  unrestricted: boolean;
  restriction: Restriction | null;
};
```

### ActorKind

type · `packages/core/src/rbac/types.ts`

Druh aktéra změny: uživatel, systém (úlohy), servisní přístup agentury, nebo vnější zdroj (n8n, Google, Meta,
naplánovaná úloha). Vnější zdroje a úlohy jsou `unrestricted`; v historii je vidět `kind` a `label`.

```ts
type ActorKind = "user" | "system" | "agency" | "n8n" | "google" | "meta" | "job";
```

### Ctx

type · `packages/core/src/rbac/types.ts`

_Bez popisu._

```ts
type Ctx = {
  actor: Actor;
  /** Připojení, nebo transakce — viz `inTx`. */
  db: Executor;
  requestId?: string | undefined;
  ip?: string | null | undefined;
};
```

### EnsureRolesOptions

type · `packages/core/src/rbac/seed.ts`

_Bez popisu._

```ts
type EnsureRolesOptions = {
  /** Katalog oprávnění zapnutých modulů. Klíče mimo katalog se u nových rolí přeskočí; neznámý tvar je chyba. */
  catalog?: ReadonlySet<string>;
  /** Klíče rolí, pro které je 2FA povinné. Hodnota z konfigurace je minimum — nikdy se nesnižuje. */
  require2faRoles?: readonly string[];
};
```

### LoadActorOptions

type · `packages/core/src/rbac/actor.ts`

_Bez popisu._

```ts
type LoadActorOptions = {
  /**
   * Katalog oprávnění zapnutých modulů (klíče). Oprávnění mimo katalog se zahodí,
   * takže vypnutý modul nezanechá žádné oprávnění. Bez katalogu se nefiltruje.
   */
  catalog?: ReadonlySet<string>;
};
```

### OwnedRecord

type · `packages/core/src/rbac/permissions.ts`

Záznam, jehož vlastníci rozhodují o přístupu při rozsahu `own`.

```ts
type OwnedRecord = { ownerIds: ReadonlyArray<string | null | undefined> };
```

### Restriction

type · `packages/core/src/rbac/types.ts`

Omezená relace: dokud uživatel neudělá požadovaný krok, smí jen self-service oprávnění.

```ts
type Restriction = "2fa_setup";
```

### RoleDef

type · `packages/core/src/rbac/seed.ts`

_Bez popisu._

```ts
type RoleDef = {
  key: string;
  name: string;
  description?: string;
  /** Systémová role dostane všechna oprávnění sestavy a nejde smazat (owner). */
  isSystem?: boolean;
  /** Oprávnění role: klíč → rozsah (`all`, `own`); `true` = `all`. */
  permissions?: Record<string, Scope | true>;
};
```

### Scope

type · `packages/core/src/rbac/types.ts`

`all` = všechny záznamy, `own` = jen vlastní nebo přidělené.

```ts
type Scope = "all" | "own";
```
