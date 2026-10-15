# @rebar/klienti/ui

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/klienti/ui` (soubor `packages/modules/klienti/src/ui.tsx`). Exportů: 5, z toho s popisem 4.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`ClientContextTab`](#clientcontexttab) | function | Záložka Kontext (KLI-06, R-27): pět textových polí upravovaných přímo na místě. Pole se ukládá po 800 ms od poslední změny a při opuštění pole, po jednom (souběžná úprava jiného pole se nepřepíše). |  |
| [`ClientHeaderBand`](#clientheaderband) | function | Hlavička karty klienta (KLI-04), pás pod názvem organizace: stav (klik otevře změnu stavu), služby, vlastník, štítky, „klient od“ a tlačítka Zavolat (hlavní kontakt), Web, Navigovat, Nová zakázka a Nový obchod. Zámek, Otevřít Disk, E-mail ze šablony, Nový úkol a Nová poznámka dodávají moduly Disk, Šablony e-mailů a Úkoly do lišty akcí hostitele. Pás zároveň skrývá záložky bez dat (`klienti.tabCounts`). Organizace bez stavu klienta nabídne „Označit jako klienta“. |  |
| [`ClientsPage`](#clientspage) | function | Stránka `/klienti` (KLI-03): tabulka klientů se sloupci název, stav, služby, vlastník, aktivní zakázky, příjem za 12 měsíců (jen s právem na finance), klient od, poslední aktivita a tlačítko Disk. Výchozí jsou lead, aktivní a pozastavení, přepínač přidá bývalé; seskupení podle stavu nebo služby; klik na řádek otevře kartu klienta. |  |
| [`MobileClientCard`](#mobileclientcard) | function | Mobilní karta klienta (MOB-03): čtyři velká tlačítka Zavolat (hlavní kontakt), E-mail, Navigovat (adresa v mapách) a Disk. Viditelná jen na telefonu (`sm:hidden`); pod ní následují karty kontaktů, zakázek, obchodů, úkolů a poznámek z Přehledu ve stejném pořadí jako na počítači. Chybí-li údaj (telefon, adresa), tlačítko se nezobrazí. |  |
| [`ui`](#ui) | const |  |  |

### ClientContextTab

function · `packages/modules/klienti/src/ui/context-tab.tsx`

Záložka Kontext (KLI-06, R-27): pět textových polí upravovaných přímo na místě. Pole se ukládá po 800 ms od
poslední změny a při opuštění pole, po jednom (souběžná úprava jiného pole se nepřepíše).

```ts
function ClientContextTab({ companyId }: { companyId: string }): import("react").JSX.Element
```

### ClientHeaderBand

function · `packages/modules/klienti/src/ui/header.tsx`

Hlavička karty klienta (KLI-04), pás pod názvem organizace: stav (klik otevře změnu stavu), služby, vlastník, štítky,
„klient od“ a tlačítka Zavolat (hlavní kontakt), Web, Navigovat, Nová zakázka a Nový obchod. Zámek, Otevřít Disk,
E-mail ze šablony, Nový úkol a Nová poznámka dodávají moduly Disk, Šablony e-mailů a Úkoly do lišty akcí hostitele.
Pás zároveň skrývá záložky bez dat (`klienti.tabCounts`). Organizace bez stavu klienta nabídne „Označit jako klienta“.

```ts
function ClientHeaderBand({ id, row, labels, entity }): import("react").JSX.Element
```

### ClientsPage

function · `packages/modules/klienti/src/ui/clients-page.tsx`

Stránka `/klienti` (KLI-03): tabulka klientů se sloupci název, stav, služby, vlastník, aktivní zakázky, příjem za
12 měsíců (jen s právem na finance), klient od, poslední aktivita a tlačítko Disk. Výchozí jsou lead, aktivní a
pozastavení, přepínač přidá bývalé; seskupení podle stavu nebo služby; klik na řádek otevře kartu klienta.

```ts
function ClientsPage(): import("react").JSX.Element
```

### MobileClientCard

function · `packages/modules/klienti/src/ui/mobile.tsx`

Mobilní karta klienta (MOB-03): čtyři velká tlačítka Zavolat (hlavní kontakt), E-mail, Navigovat (adresa v mapách)
a Disk. Viditelná jen na telefonu (`sm:hidden`); pod ní následují karty kontaktů, zakázek, obchodů, úkolů a poznámek
z Přehledu ve stejném pořadí jako na počítači. Chybí-li údaj (telefon, adresa), tlačítko se nezobrazí.

```ts
function MobileClientCard({ id, row }: { id: string; row: Record<string, unknown> }): import("react").JSX.Element
```

### ui

const · `packages/modules/klienti/src/ui.tsx`

_Bez popisu._

```ts
const ui: { readonly pages: readonly [{ readonly path: "/klienti"; readonly render: () => import("react").JSX.Element; }]; readonly recordHeader: { readonly company: import("@rebar/ui").RecordHeader; }; readonly recordTabs: { readonly company: Recor…
```
