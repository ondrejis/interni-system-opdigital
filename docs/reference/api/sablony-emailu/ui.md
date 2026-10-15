# @rebar/sablony-emailu/ui

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/sablony-emailu/ui` (soubor `packages/modules/sablony-emailu/src/ui.tsx`). Exportů: 1, z toho s popisem 1.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`ui`](#ui) | const | UI modulu „sablony-emailu“: editor šablony s proměnnými a živým náhledem (záložka na detailu šablony), akce „E-mail ze šablony“ u kontaktu, organizace (klienta), obchodu a zakázky a položka v paletě. Seznam šablon dodává generická trasa entity `email_template`. |  |

### ui

const · `packages/modules/sablony-emailu/src/ui.tsx`

UI modulu „sablony-emailu“: editor šablony s proměnnými a živým náhledem (záložka na detailu šablony), akce „E-mail ze
šablony“ u kontaktu, organizace (klienta), obchodu a zakázky a položka v paletě. Seznam šablon dodává generická trasa
entity `email_template`.

```ts
const ui: { readonly recordTabs: { readonly email_template: readonly [{ readonly id: "text"; readonly label: "Text e-mailu"; readonly icon: "mail-template"; readonly order: 5; readonly permission: "sablony-emailu.read"; readonly render: ({ id, row }…
```
