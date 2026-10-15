# @rebar/sablony-emailu/api

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/sablony-emailu/api` (soubor `packages/modules/sablony-emailu/src/api.ts`). Exportů: 5, z toho s popisem 5.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`composeLinks`](#composelinks) | function | Odkazy do Gmailu a `mailto:`; přesáhne-li adresa `GMAIL_URL_MAX`, nenabídne se ani jedna (R-46: jen Kopírovat). |  |
| [`gmailComposeUrl`](#gmailcomposeurl) | function | Adresa pro napsání nové zprávy v Gmailu: `view=cm` (compose), adresát, předmět a text. Diakritika i konce řádků se kódují jako UTF-8 (`%C5%A0`, `%0A`), mezera jako `%20` (ne `+`), aby ji Gmail i jiné programy četly stejně. |  |
| [`mailtoComposeUrl`](#mailtocomposeurl) | function | Odkaz `mailto:` s předmětem a textem (konce řádků jako CRLF podle RFC 6068). |  |
| [`GMAIL_URL_MAX`](#gmail_url_max) | const | Nejdelší adresa pro napsání zprávy v Gmailu (R-46). Delší e-mail jde jen zkopírovat (Gmail i prohlížeče krátí kolem 8 000 znaků). |  |
| [`ComposeLinks`](#composelinks) | type | Odkazy pro odeslání z poštovního klienta. |  |

### composeLinks

function · `packages/modules/sablony-emailu/src/logic.ts`

Odkazy do Gmailu a `mailto:`; přesáhne-li adresa `GMAIL_URL_MAX`, nenabídne se ani jedna (R-46: jen Kopírovat).

```ts
function composeLinks(msg: { to?: string | null; subject: string; body: string }, max = GMAIL_URL_MAX): ComposeLinks
```

### gmailComposeUrl

function · `packages/modules/sablony-emailu/src/logic.ts`

Adresa pro napsání nové zprávy v Gmailu: `view=cm` (compose), adresát, předmět a text. Diakritika i konce řádků se
kódují jako UTF-8 (`%C5%A0`, `%0A`), mezera jako `%20` (ne `+`), aby ji Gmail i jiné programy četly stejně.

```ts
function gmailComposeUrl(msg: { to?: string | null; subject: string; body: string; }): string
```

### mailtoComposeUrl

function · `packages/modules/sablony-emailu/src/logic.ts`

Odkaz `mailto:` s předmětem a textem (konce řádků jako CRLF podle RFC 6068).

```ts
function mailtoComposeUrl(msg: { to?: string | null; subject: string; body: string; }): string
```

### GMAIL_URL_MAX

const · `packages/modules/sablony-emailu/src/logic.ts`

Nejdelší adresa pro napsání zprávy v Gmailu (R-46). Delší e-mail jde jen zkopírovat (Gmail i prohlížeče krátí kolem 8 000 znaků).

```ts
const GMAIL_URL_MAX: 7500
```

### ComposeLinks

type · `packages/modules/sablony-emailu/src/logic.ts`

Odkazy pro odeslání z poštovního klienta.

```ts
type ComposeLinks = {
  /** Adresa pro napsání zprávy v Gmailu; `null`, když je text příliš dlouhý (jen kopírování). */
  gmailUrl: string | null;
  /** Odkaz `mailto:` pro jiný poštovní program; `null` z téhož důvodu. */
  mailtoUrl: string | null;
  /** Text je příliš dlouhý pro odkaz (R-46). */
  tooLong: boolean;
};
```
