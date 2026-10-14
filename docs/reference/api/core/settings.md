# @rebar/core/settings

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/settings` (soubor `packages/core/src/settings/index.ts`). Exportů: 9, z toho s popisem 5.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`createSettings`](#createsettings) | function |  |  |
| [`defineSetting`](#definesetting) | function |  |  |
| [`resolveBranding`](#resolvebranding) | function | Výsledný branding: nastavení v administraci má přednost před konfigurací klienta. |  |
| [`brandingSetting`](#brandingsetting) | const | Branding upravitelný v administraci; přepisuje hodnoty z konfigurace klienta. |  |
| [`companySetting`](#companysetting) | const | Údaje o firmě klienta (na dokladech, v PDF a e-mailech). |  |
| [`smtpSetting`](#smtpsetting) | const | Odesílání e-mailů (SMTP). Heslo je v DB zašifrované. |  |
| [`Branding`](#branding) | type |  |  |
| [`SettingDef`](#settingdef) | type | Definice jednoho nastavení. `secret` jsou názvy polí (nejvyšší úroveň), která se ukládají zašifrovaná a do auditu ani do administrace se nedostanou v čitelné podobě. |  |
| [`SettingsService`](#settingsservice) | type |  |  |

### createSettings

function · `packages/core/src/settings/settings.ts`

_Bez popisu._

```ts
function createSettings(cipher: Cipher): { get<T extends Record<string, unknown>>(db: Executor, def: SettingDef<T>): Promise<T>; getForAdmin<T extends Record<string, unknown>>(ctx: Ctx, def: SettingDef<T>): Promise<{ value: Partial<T>; secretsSet: string[]; }>; set<T extends Reco…
```

### defineSetting

function · `packages/core/src/settings/settings.ts`

_Bez popisu._

```ts
function defineSetting<T extends Record<string, unknown>>(def: SettingDef<T>): SettingDef<T>
```

### resolveBranding

function · `packages/core/src/settings/defs.ts`

Výsledný branding: nastavení v administraci má přednost před konfigurací klienta.

```ts
function resolveBranding(config: { name: string; accentColor: string }, override: { name: string | null; accentColor: string | null; logoFileId: string | null }): Branding
```

### brandingSetting

const · `packages/core/src/settings/defs.ts`

Branding upravitelný v administraci; přepisuje hodnoty z konfigurace klienta.

```ts
const brandingSetting: import("./settings").SettingDef<{ name: string | null; accentColor: string | null; logoFileId: string | null; }>
```

### companySetting

const · `packages/core/src/settings/defs.ts`

Údaje o firmě klienta (na dokladech, v PDF a e-mailech).

```ts
const companySetting: import("./settings").SettingDef<{ name: string; ico: string | null; dic: string | null; street: string | null; city: string | null; zip: string | null; email: string | null; phone: string | null; web: string | null; bankAccount: string | n…
```

### smtpSetting

const · `packages/core/src/settings/defs.ts`

Odesílání e-mailů (SMTP). Heslo je v DB zašifrované.

```ts
const smtpSetting: import("./settings").SettingDef<{ enabled: boolean; host: string; port: number; secure: boolean; user: string; password: string | null; from: string; }>
```

### Branding

type · `packages/core/src/settings/defs.ts`

_Bez popisu._

```ts
type Branding = { name: string; accentColor: string; logoFileId: string | null };
```

### SettingDef

type · `packages/core/src/settings/settings.ts`

Definice jednoho nastavení. `secret` jsou názvy polí (nejvyšší úroveň), která se ukládají
zašifrovaná a do auditu ani do administrace se nedostanou v čitelné podobě.

```ts
type SettingDef<T extends Record<string, unknown>> = {
  key: string;
  schema: ZodType<T>;
  default: T;
  secret?: readonly (keyof T & string)[];
};
```

### SettingsService

type · `packages/core/src/settings/settings.ts`

_Bez popisu._

```ts
type SettingsService = ReturnType<typeof createSettings>;
```
