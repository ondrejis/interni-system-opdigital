# @rebar/core/collab

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/collab` (soubor `packages/core/src/collab/index.ts`). Exportů: 13, z toho s popisem 9.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`addComment`](#addcomment) | function | Přidá komentář. Smí ho přidat ten, kdo záznam vidí. Zmínění uživatelé dostanou upozornění. |  |
| [`claimReminder`](#claimreminder) | function | Zabere si klíč připomínky. Vrací `true` jen poprvé; kdo `false` dostane, připomínku už někdo odeslal, takže ji znovu posílat nemá. Díky jednomu `INSERT … ON CONFLICT` je to bezpečné i při souběžných bězích. |  |
| [`createNotifications`](#createnotifications) | function | Vytvoří upozornění bez katalogu událostí (starší způsob). Kdo vyvolává událost z modulu, má použít `notify()` z `@rebar/core/notifications`: tam má správce klienta pravidla, uživatel předvolby a text jde přepsat. Tato funkce dělá totéž s tím, co zná: je-li `kind` v katalogu, platí pro něj pravidla události; jinak jde o běžné upozornění (zvoneček + push). Částky v textu dostanou jen ti, kdo smí vidět peníze (`MONEY_PERMISSIONS`). Příjemci, kteří nejsou aktivní, se vynechají. Vrací počet vytvořených (sloučených a zdeduplikovaných bez nich). |  |
| [`deleteComment`](#deletecomment) | function | Smaže (měkce) vlastní komentář; cizí jen s oprávněním `comments.moderate`. |  |
| [`editComment`](#editcomment) | function | Upraví vlastní komentář. |  |
| [`listComments`](#listcomments) | function | Komentáře záznamu (nejstarší první). Čte ten, kdo záznam vidí. |  |
| [`listNotifications`](#listnotifications) | function | Inbox přihlášeného uživatele (nejnovější první). |  |
| [`markAllRead`](#markallread) | function |  |  |
| [`markRead`](#markread) | function | Označí jako přečtené jen upozornění přihlášeného uživatele (cizí id se ignoruje). |  |
| [`parseMentions`](#parsementions) | function |  |  |
| [`unreadCount`](#unreadcount) | function |  |  |
| [`usersWithPermission`](#userswithpermission) | function | Aktivní uživatelé, kteří mají dané oprávnění (v kterémkoli rozsahu), a majitelé (systémová role má vždy všechna). Pro upozornění typu „schválená platba → fakturace“. |  |
| [`NewNotification`](#newnotification) | type |  |  |

### addComment

function · `packages/core/src/collab/comments.ts`

Přidá komentář. Smí ho přidat ten, kdo záznam vidí. Zmínění uživatelé dostanou upozornění.

```ts
async function addComment(ctx: Ctx, input: { entityType: string; entityId: string; body: string }): Promise<{ body: string; id: string; createdAt: Date; updatedAt: Date; createdBy: string | null; updatedBy: string | null; deletedAt: Date | null; deletedBy: string | null; deletedBatch: string | null; entityType: string; entityId: string; …
```

### claimReminder

function · `packages/core/src/collab/reminders.ts`

Zabere si klíč připomínky. Vrací `true` jen poprvé; kdo `false` dostane, připomínku už někdo odeslal,
takže ji znovu posílat nemá. Díky jednomu `INSERT … ON CONFLICT` je to bezpečné i při souběžných bězích.

```ts
async function claimReminder(db: Executor, key: string): Promise<boolean>
```

### createNotifications

function · `packages/core/src/collab/notifications.ts`

Vytvoří upozornění bez katalogu událostí (starší způsob). Kdo vyvolává událost z modulu, má použít `notify()`
z `@rebar/core/notifications`: tam má správce klienta pravidla, uživatel předvolby a text jde přepsat.
Tato funkce dělá totéž s tím, co zná: je-li `kind` v katalogu, platí pro něj pravidla události; jinak jde o běžné
upozornění (zvoneček + push). Částky v textu dostanou jen ti, kdo smí vidět peníze (`MONEY_PERMISSIONS`).
Příjemci, kteří nejsou aktivní, se vynechají. Vrací počet vytvořených (sloučených a zdeduplikovaných bez nich).

```ts
async function createNotifications(db: Executor, items: readonly NewNotification[]): Promise<number>
```

### deleteComment

function · `packages/core/src/collab/comments.ts`

Smaže (měkce) vlastní komentář; cizí jen s oprávněním `comments.moderate`.

```ts
async function deleteComment(ctx: Ctx, id: string): Promise<void>
```

### editComment

function · `packages/core/src/collab/comments.ts`

Upraví vlastní komentář.

```ts
async function editComment(ctx: Ctx, id: string, body: string): Promise<void>
```

### listComments

function · `packages/core/src/collab/comments.ts`

Komentáře záznamu (nejstarší první). Čte ten, kdo záznam vidí.

```ts
async function listComments(ctx: Ctx, entityType: string, entityId: string): Promise<{ id: string; body: string; authorId: string; authorName: string; mentions: string[]; createdAt: Date; editedAt: Date | null; }[]>
```

### listNotifications

function · `packages/core/src/collab/notifications.ts`

Inbox přihlášeného uživatele (nejnovější první).

```ts
async function listNotifications(ctx: Ctx, opts: { unreadOnly?: boolean; limit?: number } = {}): Promise<{ id: string; userId: string; kind: string; severity: "normal" | "urgent"; title: string; body: string | null; url: string | null; entityType: string | null; entityId: string | null; inbox: boolean; dedupeKey: string | null; collap…
```

### markAllRead

function · `packages/core/src/collab/notifications.ts`

_Bez popisu._

```ts
async function markAllRead(ctx: Ctx): Promise<void>
```

### markRead

function · `packages/core/src/collab/notifications.ts`

Označí jako přečtené jen upozornění přihlášeného uživatele (cizí id se ignoruje).

```ts
async function markRead(ctx: Ctx, ids: readonly string[]): Promise<void>
```

### parseMentions

function · `packages/core/src/collab/comments.ts`

_Bez popisu._

```ts
function parseMentions(body: string): string[]
```

### unreadCount

function · `packages/core/src/collab/notifications.ts`

_Bez popisu._

```ts
async function unreadCount(ctx: Ctx): Promise<number>
```

### usersWithPermission

function · `packages/core/src/notifications/recipients.ts`

Aktivní uživatelé, kteří mají dané oprávnění (v kterémkoli rozsahu), a majitelé (systémová role má vždy všechna).
Pro upozornění typu „schválená platba → fakturace“.

```ts
async function usersWithPermission(db: Executor, permission: string): Promise<string[]>
```

### NewNotification

type · `packages/core/src/collab/notifications.ts`

_Bez popisu._

```ts
type NewNotification = {
  userId: string;
  kind: string;
  title: string;
  body?: string | null;
  url?: string | null;
  entityType?: string | null;
  entityId?: string | null;
};
```
