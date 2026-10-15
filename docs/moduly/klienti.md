# Klienti

> Vyprávěcí dokumentace modulu `klienti`. Přesné seznamy (pole entit, oprávnění, příkazy a jejich vstupy, tabulky, úlohy, trasy) se tu **neopisují**: jsou v referenci, která vzniká z kódu a nezastará. Tady je to, co z kódu vyčíst nejde: jak věci fungují za sebou, proč jsou tak, jak jsou, a kde jsou hrany.

Referenční stránky vzniklé z kódu: [modul](../reference/moduly/klienti.md), [databáze](../reference/databaze/klienti.md).

<!--
Jak psát (podrobně v docs/DOCS-PROCES.md):
- Každá věta musí platit pro aktuální kód. Co se mění s kódem a jde to vyčíst z kódu, patří do reference, ne sem.
- Odkazuj na kód ve tvaru `cesta/soubor.ts#symbol` (cesta od kořene repozitáře, symbol je deklarace v souboru).
  Test tests/docs.test.ts ověří, že soubor i symbol existují.
- Sekci, kterou jsi zatím nenapsal, nech s řádkem „TODO: doplnit vyprávění“; pnpm docs:status je vypíše.
- Blok „Souhrn z kódu“ nepiš ručně, doplňuje ho pnpm docs:generate.
-->

## Souhrn z kódu

<!-- docs:generated:start -->

_Tento blok vzniká z kódu (`pnpm docs:generate`); neupravuj ho ručně. Vyprávění píš pod ním._

- **Popis z manifestu:** Klienti agentury: stav (lead, aktivní, pozastavený, bývalý), služby, kontext a karta klienta složená z příspěvků ostatních modulů.
- **Závisí na:** [`kontakty`](kontakty.md)
- **Entity:** žádné
- **Příkazy:** [6 příkazů](../reference/prikazy/klienti.md)
- **Referenční stránky:** [modul](../reference/moduly/klienti.md), [příkazy](../reference/prikazy/klienti.md), [databáze](../reference/databaze/klienti.md)

**Oprávnění a jejich výchozí přidělení rolím:**

| Oprávnění       | Název                       | Výchozí: owner |
| --------------- | --------------------------- | -------------- |
| `klienti.read`  | Vidí klienty a jejich karty | vše            |
| `klienti.write` | Upravuje klienty            | vše            |

<!-- docs:generated:end -->

## Účel

<!-- Co modul řeší, pro koho, proč existuje a co do něj naopak nepatří. Tři až šest vět. -->

Klient agentury není samostatná entita: je to organizace (`company` z modulu Kontakty) se stavem klienta (`client_status`). Modul Klienti proto nemá tabulky. Vlastní **životní cyklus klienta** (stavy, „klient od“, události pro Disk), službu `clients` pro Obchody a Zakázky, **seznam klientů** na `/klienti` a **kartu klienta 360°**, což je detail organizace `/kontakty/firmy/<id>` složený z příspěvků ostatních modulů. Konkrétní seznamy zakázek, plateb, úkolů a poznámek mu patří jen jako odkazy na moduly, které je vlastní.

## Kdo to používá (role)

<!-- Které výchozí role modul používají, co v něm každá dělá a jaký mají rozsah (vše / moje). Matice oprávnění je v souhrnu výše. -->

Ondřej (vlastník) vidí všechny klienty včetně soukromých, hostingu a domén a příjmů ze všech zakázek. Patrik (partner) má `klienti.read` a `klienti.write`: soukromého klienta nevidí nikde (seznam, karta, počty, součty, hledání) a finanční souhrn má jen ze sdílených zakázek. Role bez `finance.read` nevidí sloupec Příjem za 12 měsíců ani kartu Finance.

## Hlavní toky krok za krokem

<!-- Každý tok zvlášť: spouštěč, očíslované kroky z pohledu uživatele i systému (co se zapíše, spočítá, odešle), výsledek a co se stane při chybě. -->

1. **Nový klient.** Organizace vznikne v Kontaktech bez stavu (R-15); na její kartě pás hlavičky nabídne „Označit jako klienta (Lead)“. Lead spustí `client.status_changed`, Disk založí složku.
2. **Výhra obchodu.** Obchody zavolají službu `clients`: `setStatus(active, deal_won)` a `addServices`. Lead, pozastavený i bývalý klient se stane Aktivním (u prvního přechodu se uloží „klient od“, bývalému se smaže datum ukončení a Disk vrátí složku z Archivu, R-16) a doplní se služby z obchodu (`client.service_added`).
3. **Změna stavu na kartě.** Klik na čip stavu otevře dialog (`ui/status-dialog.tsx`). Bývalý se ptá na důvod (povinný) a datum ukončení (výchozí dnes); složka jde do Archivu.
4. **Ukončení zakázky.** Zakázky při dokončení posledního živého projektu nabídnou Bývalého (`zakazky.client.setFormer` → `setStatus(former, job_ended)`; důvod je volitelný, jinak se zapíše „Poslední zakázka byla ukončena.“).
5. **Seznam klientů** `/klienti`: výchozí lead, aktivní a pozastavení; přepínač „Všichni, včetně bývalých“; hledání (název, IČO, město); seskupení podle stavu nebo služby; řazení po sloupcích; klik otevře kartu; tlačítko Disk otevře složku.
6. **Karta klienta.** Hlavička (stav, služby, vlastník, štítky, „klient od“, Zavolat hlavnímu kontaktu, Web, Navigovat, Nová zakázka, Nový obchod; zámek, Otevřít Disk, E-mail ze šablony, Nový úkol a Nová poznámka přidávají hostitel a moduly Disk, Šablony e-mailů a Úkoly). Přehled: kontext, kontakty, aktivní zakázky s fází, otevřené obchody, úkoly, poznámky, finance, složka na Disku, posledních 5 událostí. Záložky: Kontext, Zakázky, Obchody (od klientů) a záložky ostatních modulů; záložky bez dat se skryjí.
7. **Kontext.** Pět polí (kdo rozhoduje, jak komunikovat, historie spolupráce, na co si dát pozor, proč spolupráce skončila) se upravuje na místě; ukládá se po jednom poli 800 ms po psaní a při opuštění pole, zapíše se do historie (`Kontext klienta`).
8. **Telefon.** Na telefonu hlavička ukáže jen stav, služby a vlastníka a Přehled začíná kartou se čtyřmi velkými tlačítky Zavolat, E-mail, Navigovat (adresa v mapách) a Disk; pod ní kontakty, aktivní zakázky, otevřené obchody, úkoly a poznámky (MOB-03).

## Stavy a přechody

<!-- Stavové automaty (pipeline, fáze, stavy dokladů): z čeho kam se smí, za jakých podmínek, co přechod automaticky udělá. Hodí se tabulka nebo diagram Mermaid. -->

Stavy: Lead → Aktivní ⇄ Pozastavený → Bývalý; ze kteréhokoli stavu lze přejít do kteréhokoli jiného (výhra obchodu vrací i Bývalého). Co přechod dělá, určuje čistá funkce `packages/modules/klienti/src/shared.ts#planStatusChange`: „klient od“ se uloží jen při **prvním** přechodu na Aktivní (R-17) a pak se nemění; Bývalý ukládá datum ukončení a důvod; návrat z Bývalého smaže datum ukončení (důvod zůstává v historii změn). Pravidla běží v háčku entity `company` (`packages/modules/klienti/src/lifecycle.ts#clientLifecycle`), takže platí i pro úpravu stavu přímo v seznamu organizací. Událost `client.status_changed` nese `from` (`null` při založení), `to`, u Bývalého `reason` a `endedOn`; Disk podle ní složku založí (Lead, Aktivní), archivuje (Bývalý) nebo vrátí.

## Pravidla a výpočty

<!-- Vzorce, zaokrouhlování, sazby, meze, priority pravidel a příklad s čísly. U každého pravidla odkaz na funkci, která ho provádí. -->

- **Důvod u Bývalého** je povinný při ručním přechodu (příkaz `klienti.setStatus`, `source: manual`); u `job_ended` ne.
- **Přejmenování** klienta (`name`) vyšle `client.renamed`, **nová služba** `client.service_added` (jen organizacím se stavem klienta; organizace bez stavu události nevyvolává). Disk složku přejmenuje, resp. dovytvoří složku služby.
- **Seznam** (`packages/modules/klienti/src/data.ts#listClients`): sloupce zakázky, příjem a Disk se skládají z příspěvků modulů (`ClientTabProvider.listMetrics`); poslední aktivita je maximum z `company.last_activity_at` a poskytovatelů. Příjem je `null` bez `finance.read`.
- **Záložky bez dat** (`packages/modules/klienti/src/shared.ts#hiddenTabs`): skryje se záložka s nulovým počtem z `tabCounts`; Přehled, Kontext a Historie (Aktivita jádra) vždy zůstávají; Zakázky a Obchody (kreslí je klienti) zmizí i bez poskytovatele.
- **Finanční souhrn** (KLI-10): celkem zaplaceno, za 12 měsíců, aktivní měsíční retainer, nezaplacené platby; čte ho `clientSummary` z poskytovatele financí, který počítá jen platby viditelné aktérovi, proto má Patrik jen součty ze sdílených zakázek (karta to uvádí).

## Oprávnění

<!-- Jak se oprávnění projevují v chování: kdo co vidí a smí, co je skryté (například peníze), jak funguje rozsah „jen moje“. Seznam oprávnění je v souhrnu. -->

`klienti.read` (seznam, karta, souhrn, počty záložek) a `klienti.write` (stav, služby, kontext; příkazy také ověřují rozsah „jen moje“ podle vlastníka organizace). Změna stavu a služeb jde přes `updateRecord` entity `company`, takže ji vyžaduje i `kontakty.write`. Soukromá organizace (zámek) je pro aktéra bez `private.read` `NotFoundError` ve všech příkazech a služba `clients` u ní nic nezmění. Všechny ruční dotazy nad `company` používají `privateScope`; příkazy mají záznam v `privatePaths` (canary test).

## Nastavení

<!-- Co se nastavuje v administraci a v konfiguraci klienta, co která volba mění a jaké jsou výchozí hodnoty. -->

Modul nemá vlastní nastavení. Struktura složek na Disku je v Nastavení → Google Disk (modul Disk).

## Události a upozornění

<!-- Kdy a komu přijde upozornění, jaké události modul oznamuje rozšířením klienta, které plánované úlohy běží a co dělají. -->

Žádná upozornění. Vysílá `client.status_changed` (webhook), `client.renamed`, `client.service_added` (jen vnitřní, reaguje Disk). Neobsluhuje žádnou událost.

## Exporty

<!-- Co a jak se exportuje (XLSX, CSV, PDF, ISDOC, kalendářový kanál), kdo to smí a co je v souboru. -->

Modul nic nevyváží; seznam organizací včetně stavu klienta se exportuje z Kontaktů.

## Integrace s jinými moduly

<!-- Závislosti, poskytovatelé dat, sloty, události; kdo od modulu data bere a komu je modul dává; co se stane po vypnutí modulu. -->

Závisí jen na Kontaktech (`company`). Ostatní moduly klienta nikdy neimportuje (jsou v pořadí modulů až za ním): data čte přes `deps.services.all("clientCard")` (Kontakty, Zakázky, Obchody, Úkoly, Finance, Reklama, Můj prostor, Disk) a z příkazů `zakazky.board`, `obchody.board`, `ukoly.note.list`, `disk.folderState` v prohlížeči; vypnutý modul prostě chybí (záložka, karta nebo sloupec se neukážou). Pro ostatní nabízí službu `clients` (`setStatus`, `addServices`). Nová zakázka a nový obchod jsou odkazy `?novy=1&klient=<id>` (viz ZADOSTI).

## Hrany a známá omezení

<!-- Co funguje jinak, než by uživatel čekal, co zatím chybí, a odkazy na otevřené otázky. -->

- Skrytí prázdných záložek zatím řeší `packages/modules/klienti/src/ui/hide-tabs.tsx#applyTabVisibility` v DOM hostitele; čeká na oficiální háček v jádru (ZADOSTI).
- Úprava `Stav klienta` v obecném seznamu organizací nemůže zeptat na důvod ukončení: Bývalý se tam nastaví s datem dnes a bez důvodu. Důvod si vyžádá až dialog na kartě a příkaz.
- Přehled čte zakázky a obchody z boardů a filtruje je v prohlížeči (stačí pro desítky klientů).
- Odkazy Nová zakázka a Nový obchod předvyplní klienta, až to stránky podpoří (ZADOSTI).
- Reklama (v2) a Hosting a domény (jen Ondřej) jsou záložky ostatních modulů; kartu je jen řadí podle `CLIENT_TABS`.

## Odkazy na kód a testy

<!-- Hlavní místa v kódu a testy, které chování zajišťují, ve tvaru `cesta/soubor.ts#symbol`. -->

- Pravidla stavů: `packages/modules/klienti/src/shared.ts#planStatusChange`, háček a události `packages/modules/klienti/src/lifecycle.ts#emitClientChanges`.
- Služba: `packages/modules/klienti/src/service.ts#setClientStatus`, `packages/modules/klienti/src/service.ts#addClientServices`.
- Data karty: `packages/modules/klienti/src/data.ts#clientSummary`, `packages/modules/klienti/src/data.ts#clientTabs`, `packages/modules/klienti/src/data.ts#saveContext`.
- UI: `packages/modules/klienti/src/ui/clients-page.tsx#ClientsPage`, `packages/modules/klienti/src/ui/header.tsx#ClientHeaderBand`, `packages/modules/klienti/src/ui/context-tab.tsx#ClientContextTab`, `packages/modules/klienti/src/ui/mobile.tsx#MobileClientCard`.
- Testy: `packages/modules/klienti/src/shared.test.ts` (pravidla stavů, záložky, seskupení), `tests/klienti.int.test.ts` (přechody, události a požadavky Disku, služba, seznam, souhrn, kontext, soukromí), `apps/web/e2e/klienti.spec.ts` (napsáno, neběželo).
