# @rebar/core/audit

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/audit` (soubor `packages/core/src/audit/index.ts`). Exportů: 7, z toho s popisem 5.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`auditChange`](#auditchange) | function | Spočítá rozdíl `before` → `after` a zapíše ho; když se nic nezměnilo, nezapíše nic. |  |
| [`diffRecords`](#diffrecords) | function | Strukturovaný rozdíl dvou záznamů: jen změněná pole, tajná pole zamaskovaná. |  |
| [`recordAudit`](#recordaudit) | function | Zapíše auditní záznam. Volat uvnitř téže transakce jako změna (`inTx`), aby změna bez stopy nemohla vzniknout. Při selhání zápisu se vrací celá transakce. |  |
| [`redact`](#redact) | function | Kopie hodnoty bez tajných polí (rekurzivně). |  |
| [`redactChanges`](#redactchanges) | function | Zamaskuje změny tajných polí a tajné klíče uvnitř vnořených hodnot. |  |
| [`AuditEntry`](#auditentry) | type |  |  |
| [`DiffOptions`](#diffoptions) | type |  |  |

### auditChange

function · `packages/core/src/audit/audit.ts`

Spočítá rozdíl `before` → `after` a zapíše ho; když se nic nezměnilo, nezapíše nic.

```ts
async function auditChange(ctx: Ctx, spec: { entityType: string; entityId: string; before: Record<string, unknown>; after: Record<string, unknown>; summary?: string; ignore?: readonly string[]; }): Promise<AuditChange[]>
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
