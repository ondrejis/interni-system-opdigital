# @rebar/core/custom-fields

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/custom-fields` (soubor `packages/core/src/custom-fields/index.ts`). Exportů: 12, z toho s popisem 8.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`createFieldDef`](#createfielddef) | function |  |  |
| [`deleteFieldDef`](#deletefielddef) | function | Smaže (měkce) definici; hodnoty v záznamech zůstanou, jen se přestanou zobrazovat. |  |
| [`listFieldDefs`](#listfielddefs) | function | Definice vlastních polí entity v pořadí. Čtou je všichni přihlášení (potřebují je formuláře a tabulky). |  |
| [`normalizeValue`](#normalizevalue) | function | Zkontroluje a upraví jednu hodnotu podle typu. Vrací normalizovanou hodnotu nebo vyhodí text chyby (bez názvu pole — doplní volající). Používá se pro vlastní pole i nativní atributy entit. |  |
| [`reorderFieldDefs`](#reorderfielddefs) | function | Přeuspořádá pole entity; `orderedIds` musí obsahovat všechna aktivní pole entity právě jednou. |  |
| [`restoreFieldDef`](#restorefielddef) | function | Vrátí smazané pole, pokud mezitím nevzniklo jiné se stejným klíčem (zpět po omylu; hodnoty v záznamech zůstaly). |  |
| [`updateFieldDef`](#updatefielddef) | function | Typ a klíč pole se nemění (rozbilo by uložená data); jde změnit název, možnosti, povinnost a zobrazení. |  |
| [`validateCustomValues`](#validatecustomvalues) | function | Ověří hodnoty vlastních polí podle jejich definic a vrátí normalizovaný objekt do sloupce `custom`. Prázdná hodnota pole odstraní. Neznámý klíč je chyba (překlep neprojde mlčky). `partial: true` (úprava) nevyžaduje povinná pole, která v zadání nejsou. |  |
| [`fieldInput`](#fieldinput) | const |  |  |
| [`FieldDef`](#fielddef) | type |  |  |
| [`ValueDef`](#valuedef) | type |  |  |
| [`ValueType`](#valuetype) | type | Typy hodnot atributů záznamů: typy vlastních polí plus dlouhý text a stav z pipeline. |  |

### createFieldDef

function · `packages/core/src/custom-fields/definitions.ts`

_Bez popisu._

```ts
async function createFieldDef(ctx: Ctx, raw: z.input<typeof fieldInput>): Promise<{ type: "number" | "email" | "currency" | "date" | "record" | "user" | "select" | "url" | "phone" | "text" | "multiselect" | "checkbox"; key: string; id: string; label: string; options: schema.CustomFieldOptions; createdAt: Date; u…
```

### deleteFieldDef

function · `packages/core/src/custom-fields/definitions.ts`

Smaže (měkce) definici; hodnoty v záznamech zůstanou, jen se přestanou zobrazovat.

```ts
async function deleteFieldDef(ctx: Ctx, id: string): Promise<void>
```

### listFieldDefs

function · `packages/core/src/custom-fields/definitions.ts`

Definice vlastních polí entity v pořadí. Čtou je všichni přihlášení (potřebují je formuláře a tabulky).

```ts
async function listFieldDefs(db: Executor, entityType: string): Promise<{ createdAt: Date; updatedAt: Date; createdBy: string | null; updatedBy: string | null; deletedAt: Date | null; id: string; entityType: string; key: string; label: string; type: "number" | "email" | "currency" | "date" | "record" |…
```

### normalizeValue

function · `packages/core/src/custom-fields/validate.ts`

Zkontroluje a upraví jednu hodnotu podle typu. Vrací normalizovanou hodnotu nebo vyhodí text
chyby (bez názvu pole — doplní volající). Používá se pro vlastní pole i nativní atributy entit.

```ts
function normalizeValue(def: ValueDef, v: unknown): unknown
```

### reorderFieldDefs

function · `packages/core/src/custom-fields/definitions.ts`

Přeuspořádá pole entity; `orderedIds` musí obsahovat všechna aktivní pole entity právě jednou.

```ts
async function reorderFieldDefs(ctx: Ctx, entityType: string, orderedIds: readonly string[]): Promise<void>
```

### restoreFieldDef

function · `packages/core/src/custom-fields/definitions.ts`

Vrátí smazané pole, pokud mezitím nevzniklo jiné se stejným klíčem (zpět po omylu; hodnoty v záznamech zůstaly).

```ts
async function restoreFieldDef(ctx: Ctx, id: string): Promise<void>
```

### updateFieldDef

function · `packages/core/src/custom-fields/definitions.ts`

Typ a klíč pole se nemění (rozbilo by uložená data); jde změnit název, možnosti, povinnost a zobrazení.

```ts
async function updateFieldDef(ctx: Ctx, id: string, patch: { label?: string; options?: z.input<typeof optionsSchema>; required?: boolean; showInTable?: boolean; position?: number; }): Promise<void>
```

### validateCustomValues

function · `packages/core/src/custom-fields/validate.ts`

Ověří hodnoty vlastních polí podle jejich definic a vrátí normalizovaný objekt do sloupce `custom`.
Prázdná hodnota pole odstraní. Neznámý klíč je chyba (překlep neprojde mlčky).
`partial: true` (úprava) nevyžaduje povinná pole, která v zadání nejsou.

```ts
function validateCustomValues(defs: readonly FieldDef[], values: Record<string, unknown>, opts: { partial?: boolean } = {}): Record<string, unknown>
```

### fieldInput

const · `packages/core/src/custom-fields/definitions.ts`

_Bez popisu._

```ts
const fieldInput: z.ZodObject<{ entityType: z.ZodString; key: z.ZodString; label: z.ZodString; type: z.ZodEnum<{ number: "number"; email: "email"; currency: "currency"; date: "date"; record: "record"; user: "user"; select: "select"; url: "url"; phone: "phon…
```

### FieldDef

type · `packages/core/src/custom-fields/validate.ts`

_Bez popisu._

```ts
type FieldDef = {
  key: string;
  label: string;
  type: CustomFieldType;
  options: CustomFieldOptions;
  required: boolean;
};
```

### ValueDef

type · `packages/core/src/custom-fields/validate.ts`

_Bez popisu._

```ts
type ValueDef = { type: ValueType; options: CustomFieldOptions };
```

### ValueType

type · `packages/core/src/custom-fields/validate.ts`

Typy hodnot atributů záznamů: typy vlastních polí plus dlouhý text a stav z pipeline.

```ts
type ValueType = CustomFieldType | "longtext" | "status";
```
