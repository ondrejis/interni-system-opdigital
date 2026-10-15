# @rebar/sablony-emailu/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/sablony-emailu/server` (soubor `packages/modules/sablony-emailu/src/server.ts`). Exportů: 5, z toho s popisem 4.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`emailTemplatesService`](#emailtemplatesservice) | function | Port pro knihovnu e-mailů v Můj prostor (MPR-2, KNI-02): přesun textu mezi soukromou knihovnou a sdílenými šablonami. Služba `emailTemplates` (`ServiceMap`); vše jde přes entitu, takže platí oprávnění `sablony-emailu.*`, zámek i audit. |  |
| [`emailTemplate`](schema.md#emailtemplate) | const | Šablona e-mailu pro klienty a obchody (předmět a tělo s proměnnými jako `{{jmeno}}`). Tělo je Tiptap JSON, `body_text` je prostý text pro hledání a odkaz Gmailu. Viditelnost: kořen s vlastním zámkem. | v `@rebar/sablony-emailu/schema` |
| [`emailTemplateEntity`](#emailtemplateentity) | const | Šablona e-mailu s proměnnými z příspěvků modulů (`emailVars`). Šablony jsou sdílené (vidí je každý s oprávněním `sablony-emailu.read`); autor je může zamknout jako soukromé (vidí je jen vlastník). Soukromá knihovna textů vlastníka je v Můj prostor. Text e-mailu je atribut `bodyText` (prostý text, ve kterém se hledá a který jde do Gmailu); tělo jako dokument Tiptap (`body_json`) se z něj odvozuje v háčcích níže, aby se nerozešly. |  |
| [`entities`](#entities) | const |  |  |
| [`server`](#server) | const | Serverová část modulu „sablony-emailu“: entita `email_template`, příkazy (náhled, e-mail ze šablony, počítadlo, zápis aktivity, uložení textu), privatePaths a služba `emailTemplates` (přesun textů s knihovnou v Můj prostor). |  |

### emailTemplatesService

function · `packages/modules/sablony-emailu/src/service.ts`

Port pro knihovnu e-mailů v Můj prostor (MPR-2, KNI-02): přesun textu mezi soukromou knihovnou a sdílenými
šablonami. Služba `emailTemplates` (`ServiceMap`); vše jde přes entitu, takže platí
oprávnění `sablony-emailu.*`, zámek i audit.

```ts
function emailTemplatesService(deps: ModuleDeps): { importText(ctx: Ctx, input: { name: string; category: string | null; language: Language; subject: string; bodyText: string; bodyJson: Record<string, unknown>; tags: string[]; }): Promise<{ id: string; href: string; }>; exportText(ctx: Ct…
```

### emailTemplateEntity

const · `packages/modules/sablony-emailu/src/entities.ts`

Šablona e-mailu s proměnnými z příspěvků modulů (`emailVars`). Šablony jsou sdílené (vidí je každý s oprávněním
`sablony-emailu.read`); autor je může zamknout jako soukromé (vidí je jen vlastník). Soukromá knihovna textů vlastníka
je v Můj prostor. Text e-mailu je atribut `bodyText` (prostý text, ve kterém se hledá a který jde do Gmailu); tělo jako
dokument Tiptap (`body_json`) se z něj odvozuje v háčcích níže, aby se nerozešly.

```ts
const emailTemplateEntity: import("@rebar/core/entities").EntityDef
```

### entities

const · `packages/modules/sablony-emailu/src/entities.ts`

_Bez popisu._

```ts
const entities: import("@rebar/core/entities").EntityDef[]
```

### server

const · `packages/modules/sablony-emailu/src/server.ts`

Serverová část modulu „sablony-emailu“: entita `email_template`, příkazy (náhled, e-mail ze šablony, počítadlo, zápis
aktivity, uložení textu), privatePaths a služba `emailTemplates` (přesun textů s knihovnou v Můj prostor).

```ts
const server: { readonly entities: import("@rebar/core/entities").EntityDef[]; readonly commands: (import("@rebar/core/module-server").CommandDef<import("zod").ZodObject<{}, import("zod/v4/core").$strip>, { variables: import("./contract").TemplateVariab…
```
