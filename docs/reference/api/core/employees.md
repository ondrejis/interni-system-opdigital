# @rebar/core/employees

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/employees` (soubor `packages/core/src/employees/index.ts`). Exportů: 3, z toho s popisem 1.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`getEmployee`](#getemployee) | function | Údaje zaměstnance. Zaměstnanec vidí svůj záznam, ostatní jen s `employees.read`. Hodinový náklad firmy vidí jen ten, kdo má `employees.read` — zaměstnanec o něm neví. |  |
| [`saveEmployee`](#saveemployee) | function |  |  |
| [`employeeInput`](#employeeinput) | const |  |  |

### getEmployee

function · `packages/core/src/employees/employees.ts`

Údaje zaměstnance. Zaměstnanec vidí svůj záznam, ostatní jen s `employees.read`.
Hodinový náklad firmy vidí jen ten, kdo má `employees.read` — zaměstnanec o něm neví.

```ts
async function getEmployee(ctx: Ctx, userId: string): Promise<{ createdAt: Date; updatedAt: Date; createdBy: string | null; updatedBy: string | null; deletedAt: Date | null; userId: string; employeeNo: string | null; jobTitle: string | null; phone: string | null; employmentType: "hpp" | "dpp"…
```

### saveEmployee

function · `packages/core/src/employees/employees.ts`

_Bez popisu._

```ts
async function saveEmployee(ctx: Ctx, userId: string, raw: z.input<typeof employeeInput>): Promise<void>
```

### employeeInput

const · `packages/core/src/employees/employees.ts`

_Bez popisu._

```ts
const employeeInput: z.ZodObject<{ employeeNo: z.ZodOptional<z.ZodNullable<z.ZodString>>; jobTitle: z.ZodOptional<z.ZodNullable<z.ZodString>>; phone: z.ZodOptional<z.ZodNullable<z.ZodString>>; employmentType: z.ZodDefault<z.ZodEnum<{ hpp: "hpp"; dpp: "dpp"; dp…
```
