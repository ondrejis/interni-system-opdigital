# @rebar/sablony-emailu/schema

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/sablony-emailu/schema` (soubor `packages/modules/sablony-emailu/src/schema.ts`). Exportů: 2, z toho s popisem 2.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`EMAIL_LANGUAGES`](#email_languages) | const | Jazyk šablony. |  |
| [`emailTemplate`](#emailtemplate) | const | Šablona e-mailu pro klienty a obchody (předmět a tělo s proměnnými jako `{{jmeno}}`). Tělo je Tiptap JSON, `body_text` je prostý text pro hledání a odkaz Gmailu. Viditelnost: kořen s vlastním zámkem. |  |

### EMAIL_LANGUAGES

const · `packages/modules/sablony-emailu/src/schema.ts`

Jazyk šablony.

```ts
const EMAIL_LANGUAGES: readonly ["cs", "sk", "en"]
```

### emailTemplate

const · `packages/modules/sablony-emailu/src/schema.ts`

Šablona e-mailu pro klienty a obchody (předmět a tělo s proměnnými jako `{{jmeno}}`). Tělo je Tiptap JSON,
`body_text` je prostý text pro hledání a odkaz Gmailu. Viditelnost: kořen s vlastním zámkem.

```ts
const emailTemplate: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "email_template"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "email_template"; dataType: "date"; columnType: "PgTimest…
```
