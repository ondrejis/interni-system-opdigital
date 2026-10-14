# @rebar/core/http

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/http` (soubor `packages/core/src/http/index.ts`). Exportů: 3, z toho s popisem 3.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`consumeRateLimit`](#consumeratelimit) | function | Omezení počtu požadavků (pevné okno, počítadlo v DB sdílené všemi procesy). Vrací `true`, když je požadavek povolen. Klíč začíná předponou oblasti, např. `upload:<uživatel>`. |  |
| [`isSameOrigin`](#issameorigin) | function | Ochrana proti CSRF u mutací mimo server actions: požadavek musí přijít z naší adresy (hlavička `Origin`, případně `Referer`). Požadavky bez obou hlaviček (např. z příkazové řádky) se odmítnou. |  |
| [`safeEqual`](#safeequal) | function | Porovnání tajemství v konstantním čase (bez úniku informace o shodě po znacích). |  |

### consumeRateLimit

function · `packages/core/src/http/http.ts`

Omezení počtu požadavků (pevné okno, počítadlo v DB sdílené všemi procesy). Vrací `true`, když je
požadavek povolen. Klíč začíná předponou oblasti, např. `upload:<uživatel>`.

```ts
async function consumeRateLimit(db: Executor, key: string, limit: number, windowSeconds: number): Promise<boolean>
```

### isSameOrigin

function · `packages/core/src/http/http.ts`

Ochrana proti CSRF u mutací mimo server actions: požadavek musí přijít z naší adresy (hlavička `Origin`,
případně `Referer`). Požadavky bez obou hlaviček (např. z příkazové řádky) se odmítnou.

```ts
function isSameOrigin(headers: Headers, appUrl: string): boolean
```

### safeEqual

function · `packages/core/src/http/http.ts`

Porovnání tajemství v konstantním čase (bez úniku informace o shodě po znacích).

```ts
function safeEqual(a: string, b: string): boolean
```
