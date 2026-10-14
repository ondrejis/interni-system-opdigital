# @rebar/poptavky/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/poptavky/server` (soubor `packages/modules/poptavky/src/server.ts`). Exportů: 23, z toho s popisem 14.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`receiveInquiry`](#receiveinquiry) | function | Příjem poptávky z webu: ověří klíč (v databázi je jen hash), založí poptávku jako „systém“, upozorní obchodníky a zapíše záznam o příjmu. Selhání se zapisují také (bez klíče). |  |
| [`utmOf`](#utmof) | function | Kanál a kampaň z UTM značek poptávky (prázdné hodnoty se vynechají). |  |
| [`IntakeAuthError`](#intakeautherror) | class |  |  |
| [`INQUIRY_PIPELINE`](#inquiry_pipeline) | const |  |  |
| [`INTAKE_MAX_BYTES`](#intake_max_bytes) | const | Nejvyšší velikost těla požadavku příjmu poptávek (bajty); větší se odmítne dřív, než se zpracuje. |  |
| [`LOST_LOOKUP`](#lost_lookup) | const |  |  |
| [`SOURCE_LOOKUP`](#source_lookup) | const |  |  |
| [`convertCommand`](#convertcommand) | const | Kvalifikace poptávky (příkaz zůstal pod původním jménem `poptavky.convert` kvůli kompatibilitě): jedním krokem určí firmu a kontaktní osobu (vybranou, existující podle IČO, e-mailu a telefonu, nebo novou), založí zakázku (číslo ze série) v prvním stavu fáze poptávka a poptávku označí jako kvalifikovanou (stav typu „vyhráno“). Volitelně přijme data první aktivity. Vše v jedné transakci. Vyžaduje zapnutý modul zakázek. |  |
| [`createIntakeKeyCommand`](#createintakekeycommand) | const |  |  |
| [`crmActivity`](schema.md#crmactivity) | const | Aktivita: motor prodeje (co a kdy se má s obchodem udělat). Může se vázat na zakázku, firmu i osobu zároveň; vazby jsou měkká uuid bez cizího klíče (jako jinde). Přepočet `job.crm_*` provádí `crmApi.recomputeJobCrm`. Aktivita na celý den (`all_day`) má `due_at` v půlnoci pražského času. | v `@rebar/poptavky/schema` |
| [`crmActivityType`](schema.md#crmactivitytype) | const | Typ aktivity (hovor, schůzka, úkol, termín, e-mail, obhlídka). Konfiguruje se; výchozí sadu zakládá seed. | v `@rebar/poptavky/schema` |
| [`crmFollower`](schema.md#crmfollower) | const | Sledující zakázky: dostávají upozornění na změny a aktivity, i když zakázku nevedou. | v `@rebar/poptavky/schema` |
| [`crmNote`](schema.md#crmnote) | const | Poznámka u zakázky, firmy nebo osoby (polymorfní vazba), volitelně připnutá nahoru. | v `@rebar/poptavky/schema` |
| [`entities`](#entities) | const |  |  |
| [`inquiry`](schema.md#inquiry) | const | Poptávka (lead). Firma nemusí existovat (příchozí poptávka z webu má jen volný text); při převodu na zakázku se firma vytvoří nebo vybere. `convertedJobId` je záměrně bez cizího klíče — poptávky nesmí záviset na modulu zakázek. | v `@rebar/poptavky/schema` |
| [`inquiryEntity`](#inquiryentity) | const | Poptávka. Vlastník (obchodník) ji vidí i při oprávnění „jen moje“. |  |
| [`intakeKey`](schema.md#intakekey) | const | Klíč příjmu poptávek (webhook, formulář na webu). Ukládá se jen hash; hodnotu klíče uvidí správce jednou. | v `@rebar/poptavky/schema` |
| [`intakeKeysCommand`](#intakekeyscommand) | const |  |  |
| [`intakeLog`](schema.md#intakelog) | const | Záznam o každém příchozím požadavku (bez klíče a bez nadbytečných osobních údajů mimo to, co je v poptávce). | v `@rebar/poptavky/schema` |
| [`intakePayload`](#intakepayload) | const |  |  |
| [`markLostCommand`](#marklostcommand) | const | Prohra: stav „prohráno“ a důvod z číselníku. Důvod je povinný (hlídá to i entita). |  |
| [`revokeIntakeKeyCommand`](#revokeintakekeycommand) | const |  |  |
| [`server`](#server) | const | Základ modulu a oblasti CRM (docs/CRM.md), každá ve své složce `crm/<oblast>/` se svým vlastníkem. |  |

### receiveInquiry

function · `packages/modules/poptavky/src/server.ts`

Příjem poptávky z webu: ověří klíč (v databázi je jen hash), založí poptávku jako „systém“, upozorní obchodníky
a zapíše záznam o příjmu. Selhání se zapisují také (bez klíče).

```ts
async function receiveInquiry(db: Db, deps: Pick<ModuleDeps, "registry" | "baseURL">, key: string, payload: unknown, ip: string | null): Promise<{ id: string; spam?: boolean }>
```

### utmOf

function · `packages/modules/poptavky/src/server.ts`

Kanál a kampaň z UTM značek poptávky (prázdné hodnoty se vynechají).

```ts
function utmOf(p: z.output<typeof intakePayload>): { sourceChannel?: string; campaign?: string; }
```

### IntakeAuthError

class · `packages/modules/poptavky/src/server.ts`

_Bez popisu._

```ts
class IntakeAuthError extends Error {

}
```

### INQUIRY_PIPELINE

const · `packages/modules/poptavky/src/server.ts`

_Bez popisu._

```ts
const INQUIRY_PIPELINE: { readonly entityType: "inquiry"; readonly key: "default"; }
```

### INTAKE_MAX_BYTES

const · `packages/modules/poptavky/src/server.ts`

Nejvyšší velikost těla požadavku příjmu poptávek (bajty); větší se odmítne dřív, než se zpracuje.

```ts
const INTAKE_MAX_BYTES: number
```

### LOST_LOOKUP

const · `packages/modules/poptavky/src/server.ts`

_Bez popisu._

```ts
const LOST_LOOKUP: "inquiry.lost_reason"
```

### SOURCE_LOOKUP

const · `packages/modules/poptavky/src/server.ts`

_Bez popisu._

```ts
const SOURCE_LOOKUP: "inquiry.source"
```

### convertCommand

const · `packages/modules/poptavky/src/server.ts`

Kvalifikace poptávky (příkaz zůstal pod původním jménem `poptavky.convert` kvůli kompatibilitě): jedním krokem
určí firmu a kontaktní osobu (vybranou, existující podle IČO, e-mailu a telefonu, nebo novou), založí zakázku
(číslo ze série) v prvním stavu fáze poptávka a poptávku označí jako kvalifikovanou (stav typu „vyhráno“). Volitelně
přijme data první aktivity. Vše v jedné transakci. Vyžaduje zapnutý modul zakázek.

Duplicity: `duplicates` = `ask` (výchozí; shoda v e-mailu nebo telefonu skončí větou, která duplicitu pojmenuje),
`use` (použije nalezený záznam), `create` (založí nový). Shoda v IČO použije existující firmu vždy.

```ts
const convertCommand: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ id: z.ZodUUID; companyId: z.ZodOptional<z.ZodUUID>; personId: z.ZodOptional<z.ZodUUID>; title: z.ZodOptional<z.ZodString>; ico: z.ZodOptional<z.ZodString>; duplicates: z.ZodDefau…
```

### createIntakeKeyCommand

const · `packages/modules/poptavky/src/server.ts`

_Bez popisu._

```ts
const createIntakeKeyCommand: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ name: z.ZodString; }, z.core.$strip>, { id: string; secret: string; }>
```

### entities

const · `packages/modules/poptavky/src/server.ts`

_Bez popisu._

```ts
const entities: import("@rebar/core/entities").EntityDef[]
```

### inquiryEntity

const · `packages/modules/poptavky/src/server.ts`

Poptávka. Vlastník (obchodník) ji vidí i při oprávnění „jen moje“.

```ts
const inquiryEntity: import("@rebar/core/entities").EntityDef
```

### intakeKeysCommand

const · `packages/modules/poptavky/src/server.ts`

_Bez popisu._

```ts
const intakeKeysCommand: import("@rebar/core/module-server").CommandDef<z.ZodObject<{}, z.core.$strip>, { keys: { lastUsedAt: string | null; revokedAt: string | null; createdAt: string; id: string; name: string; prefix: string; }[]; log: { id: string; receivedAt: …
```

### intakePayload

const · `packages/modules/poptavky/src/server.ts`

_Bez popisu._

```ts
const intakePayload: z.ZodObject<{ name: z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>, z.ZodString>; email: z.ZodPipe<z.ZodPipe<z.ZodOptional<z.ZodString>, z.ZodTransform<string | undefined, string | undefined>>, z.ZodOptional<z.ZodEmail>>;…
```

### markLostCommand

const · `packages/modules/poptavky/src/server.ts`

Prohra: stav „prohráno“ a důvod z číselníku. Důvod je povinný (hlídá to i entita).

```ts
const markLostCommand: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ id: z.ZodUUID; reason: z.ZodString; }, z.core.$strip>, void>
```

### revokeIntakeKeyCommand

const · `packages/modules/poptavky/src/server.ts`

_Bez popisu._

```ts
const revokeIntakeKeyCommand: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ id: z.ZodUUID; }, z.core.$strip>, void>
```

### server

const · `packages/modules/poptavky/src/server.ts`

Základ modulu a oblasti CRM (docs/CRM.md), každá ve své složce `crm/<oblast>/` se svým vlastníkem.

```ts
const server: import("@rebar/core/module-server").ModuleServer
```
