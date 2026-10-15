# @rebar/prehled/my-tasks

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/prehled/my-tasks` (soubor `packages/modules/prehled/src/my-tasks.ts`). Exportů: 3, z toho s popisem 3.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`createMyTasks`](#createmytasks) | function | Moje úkoly na dnes a po termínu (pohled `today` modulu úkolů). S `includeDelegated` přibudou úkoly, které jsem zadal já a řeší je jiný, s termínem do dneška. Bez zapnutého modulu nebo oprávnění je seznam prázdný. |  |
| [`MyTask`](#mytask) | type | Úkol ve widgetu Úkoly na dnes. |  |
| [`RunCommand`](#runcommand) | type | Spuštění příkazu modulu jako aktér (aplikace zkontroluje oprávnění příkazu). |  |

### createMyTasks

function · `packages/modules/prehled/src/my-tasks.ts`

Moje úkoly na dnes a po termínu (pohled `today` modulu úkolů). S `includeDelegated` přibudou úkoly, které jsem zadal
já a řeší je jiný, s termínem do dneška. Bez zapnutého modulu nebo oprávnění je seznam prázdný.

```ts
function createMyTasks(run: RunCommand): (ctx: Ctx, opts: { includeDelegated: boolean; limit: number; }) => Promise<MyTask[]>
```

### MyTask

type · `packages/modules/prehled/src/my-tasks.ts`

Úkol ve widgetu Úkoly na dnes.

```ts
type MyTask = {
  id: string;
  title: string;
  dueDate: string | null;
  subtitle?: string;
  href?: string;
  delegated?: boolean;
};
```

### RunCommand

type · `packages/modules/prehled/src/my-tasks.ts`

Spuštění příkazu modulu jako aktér (aplikace zkontroluje oprávnění příkazu).

```ts
type RunCommand = (ctx: Ctx, name: string, input: unknown) => Promise<unknown>;
```
