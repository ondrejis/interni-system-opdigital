# Obchody

> Vyprávěcí dokumentace modulu `obchody`. Přesné seznamy (pole entit, oprávnění, příkazy a jejich vstupy, tabulky, úlohy, trasy) se tu **neopisují**: jsou v referenci, která vzniká z kódu a nezastará. Tady je to, co z kódu vyčíst nejde: jak věci fungují za sebou, proč jsou tak, jak jsou, a kde jsou hrany.

Referenční stránky vzniklé z kódu: [modul](../reference/moduly/obchody.md), [databáze](../reference/databaze/obchody.md).

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

- **Popis z manifestu:** Obchodní příležitosti: pipeline s pravděpodobnostmi, board se součty, výhra (založení zakázek) a prohra s důvodem.
- **Závisí na:** [`kontakty`](kontakty.md), [`zakazky`](zakazky.md)
- **Entity:** žádné
- **Příkazy:** žádné
- **Referenční stránky:** [modul](../reference/moduly/obchody.md), [databáze](../reference/databaze/obchody.md)

**Oprávnění a jejich výchozí přidělení rolím:**

| Oprávnění           | Název                     | Výchozí: owner |
| ------------------- | ------------------------- | -------------- |
| `obchody.read`      | Vidí obchody              | vše            |
| `obchody.create`    | Zakládá obchody           | vše            |
| `obchody.write`     | Upravuje obchody          | vše            |
| `obchody.delete`    | Maže obchody              | vše            |
| `obchody.export`    | Exportuje obchody         | vše            |
| `obchody.pipelines` | Spravuje pipeline obchodů | vše            |

<!-- docs:generated:end -->

## Účel

<!-- Co modul řeší, pro koho, proč existuje a co do něj naopak nepatří. Tři až šest vět. -->

Modul vede obchodní příležitosti agentury (lead, nabídka, vyjednávání) v pipeline podobné Pipedrivu: fáze s pravděpodobností a lhůtou, board se součty a prohra či výhra jako **výsledek** obchodu (`open`, `won`, `lost`), ne jako fáze. Výhra z obchodu dělá klienta a zakázky, prohra si pamatuje důvod. Příjem leadů z Meta staví modul Reklama, obchody mu dávají jen funkci `createDealFromLead`. Úkoly a poznámky patří modulu Úkoly, zakázky modulu Zakázky; CSV import, schránka poptávek, kvalifikace, sledující a upozornění ze starého kódu v OPSYS nejsou.

## Kdo to používá (role)

<!-- Které výchozí role modul používají, co v něm každá dělá a jaký mají rozsah (vše / moje). Matice oprávnění je v souhrnu výše. -->

Owner (Ondřej) a partner (Patrik) mají výchozí přístup ke všem obchodům; externí role nemá nic. Rozsah „jen moje“ (`ownerColumns`) filtruje board, detail i metriky. Soukromé obchody vidí jen ten, kdo má `private.read`; board, detail, metriky, karta klienta a e-mailové proměnné je pro ostatní vynechají. Správa fází a důvodů prohry vyžaduje `obchody.pipelines`.

## Hlavní toky krok za krokem

<!-- Každý tok zvlášť: spouštěč, očíslované kroky z pohledu uživatele i systému (co se zapíše, spočítá, odešle), výsledek a co se stane při chybě. -->

**Založení.** `obchody.create` nebo `obchody.quickAdd` (firma, kontakt a obchod v jedné transakci přes `@rebar/kontakty/api`; firma se hledá podle IČO a názvu, kontakt podle e-mailu a telefonu) jde přes engine entity. Háčky `packages/modules/obchody/src/deals/hooks.ts#dealHooks` doplní první fázi, vlastníka, váženou hodnotu, první řádek historie a událost `deal.created`.

**Přesun mezi fázemi.** `obchody.moveStage` (nebo úprava stavu v tabulce, tažení na boardu) uzavře dosavadní pobyt ve fázi v `deal_stage_history` (`left_at`, `duration_sec`), založí nový, nastaví `stage_entered_at`, přepočte váženou hodnotu a vyšle `deal.stage_changed` s dobou v předchozí fázi.

**Výhra.** `obchody.win` v jedné transakci: výsledek `won` k datu (výchozí dnes, ne do budoucna), uzavření pobytu ve fázi, služba `clients` (aktivní klient, služby z obchodu; bez modulu Klienti se přeskočí), `createJobsFromWonDeal` ze Zakázek pro řádky dialogu (prázdný seznam = „Přeskočit“) a událost `deal.won` s id zakázek. Selže-li cokoli, obchod zůstane otevřený. Údaje pro dialog dává `obchody.winPreview`.

**Prohra.** `obchody.lose` vyžaduje aktivní důvod z číselníku `deal.lost_reason`, poznámka je volitelná; obchod zůstane ve své fázi a vyšle se `deal.lost` (`reason` je klíč důvodu).

**Znovuotevření.** `obchody.reopen` vrátí prohraný (nebo vyhraný bez zakázek) obchod do jeho fáze, smaže datum a důvod a začne nový pobyt ve fázi (hnití se počítá znovu). Stav klienta se nevrací.

**Lead z Meta.** `createDealFromLead` je idempotentní podle `meta.leadgenId` (unikátní index), založí obchod ve fázi z mapování formuláře se zdrojem Meta a kampaní. Nový lead je „neotevřený“, dokud někdo nezavolá `obchody.markOpened`.

## Stavy a přechody

<!-- Stavové automaty (pipeline, fáze, stavy dokladů): z čeho kam se smí, za jakých podmínek, co přechod automaticky udělá. Hodí se tabulka nebo diagram Mermaid. -->

Fáze pipeline `deal/default` jsou jen otevřené. Výsledek obchodu: `open` → `won` (výhra) nebo `lost` (prohra); z `lost` (a z `won` bez zakázek) zpět `open` (znovuotevření). Zavřený obchod se mezi fázemi nepřesouvá (`moveStage` ho odmítne větou „nejdřív znovu otevřete“). Archivace je přesun do Koše (`obchody.archive`, oprávnění `obchody.delete`).

## Pravidla a výpočty

<!-- Vzorce, zaokrouhlování, sazby, meze, priority pravidel a příklad s čísly. U každého pravidla odkaz na funkci, která ho provádí. -->

- Vážená hodnota = hodnota × pravděpodobnost fáze, zaokrouhleno na haléř (`packages/modules/obchody/src/deals/logic.ts#weightedValueMinor`); uložená je ve `weighted_minor`: otevřený obchod podle fáze, vyhraný 100 %, prohraný 0 % (`logic.ts#storedWeightedMinor`). Změna pravděpodobnosti fáze přepočte otevřené obchody ve fázi.
- Hnití: otevřený obchod „hnije“, když od pozdějšího ze vstupu do fáze a poslední dokončené aktivity uplynulo aspoň `rotting_days` fáze (`logic.ts#isRotting`). Jen vizuální, nic se neděje automaticky.
- Zvýraznění karty (`logic.ts#dealHighlight`): výstraha bez naplánované další aktivity, červeně po překročení lhůty fáze, zvýraznění neotevřeného Meta leadu. Zavřené obchody se nezvýrazňují.
- Souhrn sloupce boardu: počet, součet, vážený součet (`logic.ts#columnSummary`). Dny se počítají v pražském čase.
- „Další aktivita“ (`next_activity_at`), „poslední aktivita“ (`last_activity_at`) a `next_task_id` jsou systémová pole, která zapisuje modul Úkoly přes `writeSystemFields`; tento modul je jen čte.

## Oprávnění

<!-- Jak se oprávnění projevují v chování: kdo co vidí a smí, co je skryté (například peníze), jak funguje rozsah „jen moje“. Seznam oprávnění je v souhrnu. -->

`obchody.read` čte (board, detail, historie, důvody prohry), `obchody.create` zakládá, `obchody.write` mění, přesouvá, vyhrává, prohrává a mění další kontakty, `obchody.delete` archivuje, `obchody.pipelines` spravuje fáze a důvody prohry (modul si pro zápis do nastavení jádra dočasně přidá jeho oprávnění, historie zůstane na skutečném uživateli).

## Nastavení

<!-- Co se nastavuje v administraci a v konfiguraci klienta, co která volba mění a jaké jsou výchozí hodnoty. -->

Nastavení → Stavy: fáze (název, barva, pravděpodobnost, počet dní do zvýraznění, pořadí) a číselník důvodů prohry (přidání, přejmenování, vypnutí, pořadí) obsluhují příkazy `obchody.pipeline.*`. Výchozí pipeline „Obchody“: Nová poptávka 10 % / 1 den, Kontaktováno 20 % / 5, Schůzka / konzultace 40 % / 7, Nabídka odeslaná 60 % / 7, Vyjednávání 80 % / 10.

## Události a upozornění

<!-- Kdy a komu přijde upozornění, jaké události modul oznamuje rozšířením klienta, které plánované úlohy běží a co dělají. -->

Modul vysílá `deal.created`, `deal.stage_changed`, `deal.won` a `deal.lost` (všechny i jako webhooky; `entity.isPrivate` podle obchodu). Upozornění (e-mail, push) nejsou. Odznaky: žádné.

## Exporty

<!-- Co a jak se exportuje (XLSX, CSV, PDF, ISDOC, kalendářový kanál), kdo to smí a co je v souboru. -->

Seznam obchodů exportuje generický export entity (`obchody.export`).

## Integrace s jinými moduly

<!-- Závislosti, poskytovatelé dat, sloty, události; kdo od modulu data bere a komu je modul dává; co se stane po vypnutí modulu. -->

Zakázky (`createJobsFromWonDeal`), Kontakty (rychlé založení, jména firem a osob), Klienti (služba `clients`, volitelná), Reklama (volá `createDealFromLead`), Úkoly (zapisují systémová pole obchodu). Modul přispívá kartě klienta (`tabCounts.obchody`, `summary.deals`), proměnnou `{obchod}` do e-mailových šablon, metrikami a widgety nástěnek (`obchody.pipeline_value`, `pipeline_total`, `pipeline_weighted`, `my_open`, `no_activity`).

## Hrany a známá omezení

<!-- Co funguje jinak, než by uživatel čekal, co zatím chybí, a odkazy na otevřené otázky. -->

- Board a engine entity znají jedinou pipeline (`deal/default`); více pipeline z OBCH-03 vyžaduje změnu atributu `status` v jádru. API fází pracuje s touto jedinou pipeline.
- Archivace je Koš; samostatný stav „archivováno“ spec nemá.
- Řádky dialogu zakázek se v kontraktu duplikují (zod kopie `JobFromDealRow` ze Zakázek).

## Odkazy na kód a testy

<!-- Hlavní místa v kódu a testy, které chování zajišťují, ve tvaru `cesta/soubor.ts#symbol`. -->

Logika: `packages/modules/obchody/src/deals/logic.ts#dealHighlight`, přechody: `packages/modules/obchody/src/deals/transitions.ts#winDeal`, háčky entity: `packages/modules/obchody/src/deals/hooks.ts#dealHooks`, lead: `packages/modules/obchody/src/deals/lead.ts#createDealFromLead`, board: `packages/modules/obchody/src/deals/queries.ts#board`. Testy: `packages/modules/obchody/src/deals/logic.test.ts`, `packages/modules/obchody/src/deals/deals.int.test.ts`.
