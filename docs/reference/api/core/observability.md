# @rebar/core/observability

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/observability` (soubor `packages/core/src/observability/index.ts`). Exportů: 6, z toho s popisem 5.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`captureError`](#captureerror) | function | Nahlásí neočekávanou chybu (pokud je tracking zapnutý). Kontext smí obsahovat jen technická data. |  |
| [`initErrorTracking`](#initerrortracking) | function | Zapne hlášení chyb. Bez DSN nedělá nic. Osobní údaje se neposílají (`dataCollection` vypnuté + `scrubEvent`). |  |
| [`scrubError`](#scruberror) | function | Chyba jako očištěný text pro log: název, zpráva, zásobník a příčiny (`cause`). |  |
| [`scrubEvent`](#scrubevent) | function | Očištění události před odesláním do error trackingu (GlitchTip/Sentry): žádný uživatel, IP, cookies, hlavičky, těla požadavků ani query string; texty bez e-mailů, telefonů a tokenů. |  |
| [`scrubText`](#scrubtext) | function | Z textu odstraní e-maily, telefonní čísla, dlouhé tokeny a UUID (mohou identifikovat osobu nebo záznam), parametry SQL dotazů, přihlašovací údaje v adresách a tajemství zapsaná jako `klíč=hodnota`. |  |
| [`ErrorTrackingOptions`](#errortrackingoptions) | type |  |  |

### captureError

function · `packages/core/src/observability/scrub.ts`

Nahlásí neočekávanou chybu (pokud je tracking zapnutý). Kontext smí obsahovat jen technická data.

```ts
function captureError(err: unknown, context?: Record<string, string>): void
```

### initErrorTracking

function · `packages/core/src/observability/scrub.ts`

Zapne hlášení chyb. Bez DSN nedělá nic. Osobní údaje se neposílají (`dataCollection` vypnuté + `scrubEvent`).

```ts
function initErrorTracking({ dsn, release, environment }: ErrorTrackingOptions): boolean
```

### scrubError

function · `packages/core/src/observability/scrub.ts`

Chyba jako očištěný text pro log: název, zpráva, zásobník a příčiny (`cause`).

```ts
function scrubError(err: unknown, depth = 0): string
```

### scrubEvent

function · `packages/core/src/observability/scrub.ts`

Očištění události před odesláním do error trackingu (GlitchTip/Sentry): žádný uživatel, IP, cookies,
hlavičky, těla požadavků ani query string; texty bez e-mailů, telefonů a tokenů.

```ts
function scrubEvent<T extends ErrorEvent>(event: T): T
```

### scrubText

function · `packages/core/src/observability/scrub.ts`

Z textu odstraní e-maily, telefonní čísla, dlouhé tokeny a UUID (mohou identifikovat osobu nebo záznam),
parametry SQL dotazů, přihlašovací údaje v adresách a tajemství zapsaná jako `klíč=hodnota`.

```ts
function scrubText(text: string): string
```

### ErrorTrackingOptions

type · `packages/core/src/observability/scrub.ts`

_Bez popisu._

```ts
type ErrorTrackingOptions = {
  dsn: string | undefined;
  release: string;
  environment: string;
};
```
