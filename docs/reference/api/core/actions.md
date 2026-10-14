# @rebar/core/actions

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/actions` (soubor `packages/core/src/actions/index.ts`). Exportů: 5, z toho s popisem 1.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`makeActionRunner`](#makeactionrunner) | function | Továrna na server actions: každá akce projde stejným řetězcem — kontext, kontrola oprávnění, validace vstupu Zodem, handler, převod chyb na čitelnou hlášku. Oprávnění se kontroluje vždy, bez ohledu na to, co UI zobrazuje. |  |
| [`toResult`](#toresult) | function |  |  |
| [`ActionOptions`](#actionoptions) | type |  |  |
| [`ActionResult`](#actionresult) | type |  |  |
| [`ActionRunnerOptions`](#actionrunneroptions) | type |  |  |

### makeActionRunner

function · `packages/core/src/actions/run.ts`

Továrna na server actions: každá akce projde stejným řetězcem — kontext, kontrola oprávnění,
validace vstupu Zodem, handler, převod chyb na čitelnou hlášku. Oprávnění se kontroluje
vždy, bez ohledu na to, co UI zobrazuje.

```ts
function makeActionRunner({ resolveCtx, onError }: ActionRunnerOptions): <S extends ZodType, R>(opts: ActionOptions<S, R>) => (raw: z.input<S>) => Promise<ActionResult<R>>
```

### toResult

function · `packages/core/src/actions/run.ts`

_Bez popisu._

```ts
function toResult(err: unknown, onError?: (err: unknown, info: { errorId: string }) => void): { ok: false; error: string; code: string }
```

### ActionOptions

type · `packages/core/src/actions/run.ts`

_Bez popisu._

```ts
type ActionOptions<S extends ZodType, R> = {
  /** Oprávnění (stačí kterékoli z uvedených). Bez něj akce vyžaduje jen přihlášení. */
  permission?: string | readonly string[];
  input: S;
  handler: (ctx: Ctx, input: z.output<S>) => Promise<R>;
};
```

### ActionResult

type · `packages/core/src/actions/run.ts`

_Bez popisu._

```ts
type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; code: string };
```

### ActionRunnerOptions

type · `packages/core/src/actions/run.ts`

_Bez popisu._

```ts
type ActionRunnerOptions = {
  /** Z požadavku (cookie) vyrobí kontext s aktérem; vrací `null`, když není nikdo přihlášen. */
  resolveCtx: () => Promise<Ctx | null>;
  /** Neočekávaná chyba (do error trackingu a logu); `errorId` je kód, který uživatel dostane v hlášce. */
  onError?: (err: unknown, info: { errorId: string }) => void;
};
```
