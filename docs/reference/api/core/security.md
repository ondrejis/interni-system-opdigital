# @rebar/core/security

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/security` (soubor `packages/core/src/security/index.ts`). Exportů: 5, z toho s popisem 1.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`createCipher`](#createcipher) | function |  |  |
| [`parseKeyRing`](#parsekeyring) | function |  |  |
| [`randomToken`](#randomtoken) | function | Náhodný token (např. odkaz). |  |
| [`Cipher`](#cipher) | type |  |  |
| [`KeyRing`](#keyring) | type |  |  |

### createCipher

function · `packages/core/src/security/crypto.ts`

_Bez popisu._

```ts
function createCipher(ring: KeyRing): Cipher
```

### parseKeyRing

function · `packages/core/src/security/crypto.ts`

_Bez popisu._

```ts
function parseKeyRing(env: { APP_ENCRYPTION_KEY?: string | undefined; APP_ENCRYPTION_KEYS?: string | undefined; }): KeyRing
```

### randomToken

function · `packages/core/src/security/crypto.ts`

Náhodný token (např. odkaz).

```ts
function randomToken(bytes = 32): string
```

### Cipher

type · `packages/core/src/security/crypto.ts`

_Bez popisu._

```ts
type Cipher = {
  encrypt(plain: string): string;
  /** `null`, když hodnotu nejde dešifrovat (neznámý klíč, poškozená data). */
  decrypt(value: string | null | undefined): string | null;
};
```

### KeyRing

type · `packages/core/src/security/crypto.ts`

_Bez popisu._

```ts
type KeyRing = { current: string; keys: ReadonlyMap<string, Buffer> };
```
