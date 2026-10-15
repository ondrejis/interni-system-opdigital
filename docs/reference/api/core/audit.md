# @rebar/core/audit

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/audit` (soubor `packages/core/src/audit/index.ts`). Exportů: 9, z toho s popisem 7.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`auditCategoryOf`](#auditcategoryof) | function | Kategorie historie podle typu záznamu: uživatelé, pozvánky a role jsou `security`, nastavení a integrace `integration`, vše ostatní `data`. Přihlášení a neúspěšné pokusy zapisuje auth s `category: "security"`. |  |
| [`auditChange`](#auditchange) | function | Spočítá rozdíl `before` → `after` a zapíše ho; když se nic nezměnilo, nezapíše nic. |  |
| [`auditReadScope`](#auditreadscope) | function | Podmínka do `WHERE` pro každé čtení `audit_log` (historie záznamu, `/historie`, přehled změn, export CSV). Vlastník (`private.read`) vidí vše (`undefined`). Ostatní nevidí: (1) záznamy zapsané jako soukromé (`is_private`, kopie zámku v době změny, takže staré soukromé záznamy zůstanou skryté i po zveřejnění, R-33), (2) historii záznamů, které jsou právě soukromé (`private_record`), včetně vedlejších záznamů o nich (komentáře, soubory přes `context`), (3) bezpečnostní události (`category = security`) kromě vlastních (HIS-05). |  |
| [`diffRecords`](#diffrecords) | function | Strukturovaný rozdíl dvou záznamů: jen změněná pole, tajná pole zamaskovaná. |  |
| [`recordAudit`](#recordaudit) | function | Zapíše auditní záznam. Volat uvnitř téže transakce jako změna (`inTx`), aby změna bez stopy nemohla vzniknout. Při selhání zápisu se vrací celá transakce. |  |
| [`redact`](#redact) | function | Kopie hodnoty bez tajných polí (rekurzivně). |  |
| [`redactChanges`](#redactchanges) | function | Zamaskuje změny tajných polí a tajné klíče uvnitř vnořených hodnot. |  |
| [`AuditEntry`](#auditentry) | type |  |  |
| [`DiffOptions`](#diffoptions) | type |  |  |

### auditCategoryOf

function · `packages/core/src/audit/audit.ts`

Kategorie historie podle typu záznamu: uživatelé, pozvánky a role jsou `security`, nastavení a integrace
`integration`, vše ostatní `data`. Přihlášení a neúspěšné pokusy zapisuje auth s `category: "security"`.

```ts
function auditCategoryOf(entityType: string): AuditCategory
```

### auditChange

function · `packages/core/src/audit/audit.ts`

Spočítá rozdíl `before` → `after` a zapíše ho; když se nic nezměnilo, nezapíše nic.

```ts
async function auditChange(ctx: Ctx, spec: { entityType: string; entityId: string; before: Record<string, unknown>; after: Record<string, unknown>; summary?: string; ignore?: readonly string[]; category?: AuditCategory; isPrivate?: boolean; entityTitle?: string | null; context?: Record<string, unknown>; }): Promise<AuditChange[]>
```

### auditReadScope

function · `packages/core/src/audit/visibility.ts`

Podmínka do `WHERE` pro každé čtení `audit_log` (historie záznamu, `/historie`, přehled změn, export CSV).
Vlastník (`private.read`) vidí vše (`undefined`). Ostatní nevidí: (1) záznamy zapsané jako soukromé (`is_private`,
kopie zámku v době změny, takže staré soukromé záznamy zůstanou skryté i po zveřejnění, R-33), (2) historii záznamů,
které jsou právě soukromé (`private_record`), včetně vedlejších záznamů o nich (komentáře, soubory přes `context`),
(3) bezpečnostní události (`category = security`) kromě vlastních (HIS-05).

```ts
function auditReadScope(ctx: Ctx): SQL | undefined
```

### diffRecords

function · `packages/core/src/audit/audit.ts`

Strukturovaný rozdíl dvou záznamů: jen změněná pole, tajná pole zamaskovaná.

```ts
function diffRecords(before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined, { ignore = [] }: DiffOptions = {}): AuditChange[]
```

### recordAudit

function · `packages/core/src/audit/audit.ts`

Zapíše auditní záznam. Volat uvnitř téže transakce jako změna (`inTx`), aby změna
bez stopy nemohla vzniknout. Při selhání zápisu se vrací celá transakce.

```ts
async function recordAudit(ctx: Ctx, entry: AuditEntry): Promise<void>
```

### redact

function · `packages/core/src/audit/audit.ts`

Kopie hodnoty bez tajných polí (rekurzivně).

```ts
function redact<T>(value: T): T
```

### redactChanges

function · `packages/core/src/audit/audit.ts`

Zamaskuje změny tajných polí a tajné klíče uvnitř vnořených hodnot.

```ts
function redactChanges(changes: readonly AuditChange[]): AuditChange[]
```

### AuditEntry

type · `packages/core/src/audit/audit.ts`

_Bez popisu._

```ts
type AuditEntry = {
  action: string;
  entityType: string;
  entityId: string;
  summary?: string;
  changes?: AuditChange[];
  /** Kategorie záznamu v historii; bez ní se určí z typu záznamu (`auditCategoryOf`). */
  category?: AuditCategory;
  /**
   * Soukromá změna: kopie viditelnosti záznamu v době změny, která zůstane i po jeho zveřejnění (R-33). Bez zadání se
   * zjistí z `private_record`. Záznam o vedlejší věci soukromého záznamu (komentář, soubor) ji musí předat výslovně.
   */
  isPrivate?: boolean;
  /** Název záznamu v době změny (R-34): historie dává smysl i po přejmenování nebo smazání záznamu. */
  entityTitle?: string | null;
  /** Kontext pro filtrování a odkazy: `{ entityType, entityId, dealId, jobId, companyId… }`. */
  context?: Record<string, unknown>;
};
```

### DiffOptions

type · `packages/core/src/audit/audit.ts`

_Bez popisu._

```ts
type DiffOptions = {
  /** Pole, která se nesledují (např. `updatedAt`). */
  ignore?: readonly string[];
};
```
