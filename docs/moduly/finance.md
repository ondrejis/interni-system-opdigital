# Finance

> Vyprávěcí dokumentace modulu `finance`. Přesné seznamy (pole entit, oprávnění, příkazy a jejich vstupy, tabulky, úlohy, trasy) se tu **neopisují**: jsou v referenci, která vzniká z kódu a nezastará. Tady je to, co z kódu vyčíst nejde: jak věci fungují za sebou, proč jsou tak, jak jsou, a kde jsou hrany.

Referenční stránky vzniklé z kódu: [modul](../reference/moduly/finance.md), [databáze](../reference/databaze/finance.md).

<!--
Jak psát (podrobně v docs/DOCS-PROCES.md):
- Každá věta musí platit pro aktuální kód. Co se mění s kódem a jde to vyčíst z kódu, patří do reference, ne sem.
- Odkazuj na kód ve tvaru `cesta/soubor.ts#symbol` (cesta od kořene repozitáře, symbol je deklarace v souboru).
  Test tests/docs.test.ts ověří, že soubor i symbol existují.
- Sekci, kterou jsi zatím nenapsal, nech s řádkem „Finance evidují platby zakázek, rozdělují je mezi Ondřeje a Patrika podle pravidel zakázky, počítají saldo („Patrik dluží Ondřejovi X Kč“) a ukazují příjmy. Faktury se vystavují mimo OPSYS, každý ve svém nástroji; OPSYS jen eviduje číslo faktury, termíny a úhradu. Nikdo není plátce DPH, částky jsou v haléřích a v CZK. Modul nevystavuje faktury a nenapojuje banku; Fakturoid (v3) sem jen zapíše platbu přes službu `finance`.“; pnpm docs:status je vypíše.
- Blok „Souhrn z kódu“ nepiš ručně, doplňuje ho pnpm docs:generate.
-->

## Souhrn z kódu

<!-- docs:generated:start -->

_Tento blok vzniká z kódu (`pnpm docs:generate`); neupravuj ho ručně. Vyprávění píš pod ním._

- **Popis z manifestu:** Platby zakázek a jejich rozdělení mezi dvě IČO, retainery, vyrovnání mezi partnery (saldo) a přehledy příjmů.
- **Závisí na:** [`zakazky`](zakazky.md)
- **Entity:** [`payment`](../reference/entity/finance.md#payment), [`settlement`](../reference/entity/finance.md#settlement)
- **Příkazy:** [25 příkazů](../reference/prikazy/finance.md)
- **Úlohy na pozadí:** `finance.retainer.generate` (`0 5 1 * *`), `finance.retainer.catchup` (`30 5 * * *`)
- **Nastavení v administraci:** `finance.balance_basis`, `finance.default_split`
- **Referenční stránky:** [modul](../reference/moduly/finance.md), [entity](../reference/entity/finance.md), [příkazy](../reference/prikazy/finance.md), [databáze](../reference/databaze/finance.md)

**Oprávnění a jejich výchozí přidělení rolím:**

| Oprávnění                   | Název                          | Výchozí: owner |
| --------------------------- | ------------------------------ | -------------- |
| `finance.read`              | Vidí platby a přehledy financí | vše            |
| `finance.payments_write`    | Zapisuje a upravuje platby     | vše            |
| `finance.splits_edit`       | Upravuje rozdělení plateb      | vše            |
| `finance.settlements_write` | Zapisuje vyrovnání             | vše            |
| `finance.export`            | Exportuje platby a přehledy    | vše            |
| `finance.settings`          | Spravuje nastavení financí     | vše            |

<!-- docs:generated:end -->

## Účel

<!-- Co modul řeší, pro koho, proč existuje a co do něj naopak nepatří. Tři až šest vět. -->

Vlastník (Ondřej) smí všechno včetně pravidel rozdělení, vyrovnání a nastavení. Partner (Patrik) čte finance a zapisuje platby (`finance.read`, `finance.payments_write`), ale nemění pravidla rozdělení ani nezapisuje vyrovnání (R-21). Soukromé zakázky a platby bez zakázky vidí jen vlastník.

## Kdo to používá (role)

<!-- Které výchozí role modul používají, co v něm každá dělá a jaký mají rozsah (vše / moje). Matice oprávnění je v souhrnu výše. -->

**Platba:** vzniká ručně (`finance.payment.create`), ze šablony zakázky (`initJobFinance`, zdroj `template`) nebo z retaineru (zdroj `retainer`). Při každém zápisu se pod zámkem zakázky přepočítá rozdělení všech plateb zakázky (`allocateJob`). Změna rozdělení už zaplacené platby se nejdřív potvrzuje: příkaz vrátí `needs_confirmation` se seznamem změn a nic nezapíše; UI zavolá příkaz znovu s `confirmRecalc: true`.

**Rozdělení:** `finance.split.set` nahradí pravidla zakázky (součet procent nad 100 % je chyba, pod 100 % upozornění). Ruční přepis jedné platby (`finance.payment.overrideAllocation`) nastaví režim „Rozděleno ručně“ a platba se dál nepřepočítává; změna její částky vyžaduje nové rozdělení.

**Retainer:** po „Vyhodnocení úvodní fáze“ (událost `project.phase_completed`) handler přepne marketingovou zakázku do fáze „rozhodnutí“. `finance.retainer.continue` založí retainer (volitelně pravidla jen pro druh `retainer` s platností od–do), přepne zakázku do fáze Retainer přes `setMarketingStage` a založí platby do aktuálního měsíce. Úloha `finance.retainer.generate` (1. dne v 5:00) a záložní `finance.retainer.catchup` (denně) založí „Retainer MM/RRRR“ pro chybějící měsíce; je idempotentní (měsíc, který už platbu má i zrušenou nebo v koši, se nezakládá znovu). `finance.retainer.end` nastaví poslední měsíc, zruší budoucí plánované platby a končí-li retainer už teď, dokončí zakázku (`completeJob`, důvod `retainer_ended`); bez retaineru („Ukončit“ po vyhodnocení) jen ukončí marketingovou fázi a zakázku.

**Vyrovnání:** `finance.balance` počítá saldo ze zaplacených (nebo vystavených) plateb sdílených zakázek minus zapsaná vyrovnání. `finance.settlement.create` zapíše vyrovnání, `finance.settlement.cancel` ho stornuje (záznam zůstane).

## Hlavní toky krok za krokem

<!-- Každý tok zvlášť: spouštěč, očíslované kroky z pohledu uživatele i systému (co se zapíše, spočítá, odešle), výsledek a co se stane při chybě. -->

Plánovaná → Vystavená (povinné číslo faktury a datum vystavení) → Zaplacená (datum úhrady, nesmí být před vystavením); Zrušená z Plánované nebo Vystavené. Povolené kroky zpět: Vystavená → Plánovaná (smaže číslo faktury), Zaplacená → Vystavená, Zrušená → Plánovaná. Přímo Plánovaná → Zaplacená jde, když jsou zadané doklady. Po splatnosti je červeně jen Vystavená platba (R-40); plánovaná s prošlým termínem je jen upozornění. Přechod vysílá `payment.status_changed` a při úhradě `payment.paid`.

## Stavy a přechody

<!-- Stavové automaty (pipeline, fáze, stavy dokladů): z čeho kam se smí, za jakých podmínek, co přechod automaticky udělá. Hodí se tabulka nebo diagram Mermaid. -->

Rozdělení platby počítá čistá logika (`finance/src/logic`): fixní částky, zbytek podle procent, haléře fakturujícímu, bez pravidel vše fakturujícímu; pravidlo druhu platby má přednost před „vše“; platnost pravidla se hodnotí k měsíci platby (retainer: `period_month`, jinak měsíc vystavení, jinak dnešek). Fixně celkem se odečítá postupně v pořadí data vystavení a vytvoření. Příklad (AS-04): retainer 15 000 Kč, do 12/2026 70/30, od 01/2027 50/50 → 10 500/4 500 a 7 500/7 500. Datová vrstva jen načte stav, zavolá `allocateJob` a zapíše rozdíly (`data/plan.ts`).

## Pravidla a výpočty

<!-- Vzorce, zaokrouhlování, sazby, meze, priority pravidel a příklad s čísly. U každého pravidla odkaz na funkci, která ho provádí. -->

`finance.read` čte platby, `finance.payments_write` je zapisuje a spravuje retainery, `finance.splits_edit` mění pravidla a ruční rozdělení (bez něj se pravidlo zadané při založení zakázky ignoruje a platí výchozí), `finance.settlements_write` zapisuje a stornuje vyrovnání, `finance.settings` mění nastavení. Soukromé platby (soukromá zakázka, platba bez zakázky) mimo vlastníka nikdo nevidí, nepočítají se do součtů, metrik ani záložky klienta; do salda nevstupují vůbec, ani u vlastníka. Přehledy a saldo vyžadují `finance.read` v rozsahu „vše“.

## Oprávnění

<!-- Jak se oprávnění projevují v chování: kdo co vidí a smí, co je skryté (například peníze), jak funguje rozsah „jen moje“. Seznam oprávnění je v souhrnu. -->

`finance.balance_basis` (zaplacené, výchozí / vystavené) a `finance.default_split` (výchozí pravidla nových zakázek). Dokud není výchozí rozdělení zadané, odvodí se 50/50 mezi aktivním uživatelem s rolí `owner` a s rolí `partner`. Nastavení se zapisuje příkazem `finance.settings.set` (potřebuje i `settings.manage`).

## Nastavení

<!-- Co se nastavuje v administraci a v konfiguraci klienta, co která volba mění a jaké jsou výchozí hodnoty. -->

Vysílá `payment.created`, `payment.status_changed`, `payment.paid` (D §2.2); události vyrovnání katalog nemá, vyrovnání jsou jen v historii. Odebírá `project.phase_completed`. Úlohy: `finance.retainer.generate` (cron `0 5 1 * *`) a `finance.retainer.catchup` (`30 5 * * *`). Odznak u položky Finance = počet vystavených plateb po splatnosti. Žádná upozornění (e-mail, push) se neposílají.

## Události a upozornění

<!-- Kdy a komu přijde upozornění, jaké události modul oznamuje rozšířením klienta, které plánované úlohy běží a co dělají. -->

Platby a přehledy exportuje generický export entity `payment` (`finance.export`); přehledy se čtou příkazem `finance.reports`.

## Exporty

<!-- Co a jak se exportuje (XLSX, CSV, PDF, ISDOC, kalendářový kanál), kdo to smí a co je v souboru. -->

Závisí na `zakazky` (čte tabulku zakázek, píše přes `@rebar/zakazky/api`: `setMarketingStage`, `completeJob`). Poskytuje službu `finance` (`initJobFinance` včetně retaineru, `defaultSplit`, `createStandalonePayment`, `incomeSince`, `unpaidCount`, `allocatedByUser`), příspěvek ke kartě klienta (`ClientTabProvider`: počet plateb záložky, souhrn, příjem 12 měsíců), metriky nástěnek (`finance.income_month`, `balance`, `unpaid`, `unpaid_count`, `overdue_count`, `retainers`, `retainers_count`, `income_by_person`, `income_by_type`, `top_clients`) a dlaždice. Platba bez zakázky z Fakturoidu (`createStandalonePayment`) je vždy soukromá, druh `recurring`, mimo saldo.

## Integrace s jinými moduly

<!-- Závislosti, poskytovatelé dat, sloty, události; kdo od modulu data bere a komu je modul dává; co se stane po vypnutí modulu. -->

Změna fakturujícího či data u zaplacené platby se potvrzuje, ale změny pravidel retaineru (`finance.retainer.change`) podíly zaplacených plateb nepřepisují. Retainer s koncem v budoucnu dokončí zakázku až ručně. Platba smazaná do koše nevzniká znovu (měsíc retaineru se považuje za obsazený). Základ „vystavené“ počítá do salda i neuhrazené faktury.

## Hrany a známá omezení

<!-- Co funguje jinak, než by uživatel čekal, co zatím chybí, a odkazy na otevřené otázky. -->

`packages/modules/finance/src/data/plan.ts#computePlan` (přepočet a potvrzení), `packages/modules/finance/src/data/payments.ts#transitionPayment` (stavy), `packages/modules/finance/src/data/retainer.ts#generateForRetainer` (měsíční platby), `packages/modules/finance/src/data/settlements.ts#getBalance` (saldo), `packages/modules/finance/src/data/reports.ts#reports` (přehledy), `packages/modules/finance/src/data/finance-service.ts#createFinanceService` (služba), `packages/modules/finance/src/data/events.ts#onPhaseCompleted` (rozhodnutí), `packages/modules/finance/src/logic/allocate.ts#allocateJob` (logika). Testy: `packages/modules/finance/src/data/finance.int.test.ts` (AS-02, AS-03, AS-04, soukromí) a unit testy v `packages/modules/finance/src/logic`.

## UI (FIN-C)

Vše v `packages/modules/finance/src/ui/**` (UI nevolá databázi, jen příkazy `finance.*` přes `useCommandQuery`/`useCommandMutation`; čistou logiku `previewSplit`, `validateSplitRules`, `formatMoney`, `dueOnFrom` bere z `src/logic`).

- **`/finance` Platby a rozdělení** (`payments-page.tsx`, `payments-table.tsx`): filtry období (+ podle kterého data), fakturujícího, stavu, typu zakázky, klienta, „Po splatnosti“, hledání, vlastník „Včetně soukromých“; součty v patičce (celkem, plánováno / vystaveno / zaplaceno, po splatnosti, podíl každé osoby); inline úprava popisu, částky a splatnosti (změna zaplacené platby jde přes potvrzení přepočtu); vystavená platba po splatnosti červeně; štítek „Rozděleno ručně“ a „Soukromá“; na mobilu karty. Entita `payment` má tabulkový seznam jádra na `/finance/platby`; adresa `/finance/<id>` otevře detail platby (odkazy z hledání a historie).
- **Stavový tok** (`payment-dialogs.tsx`): Plánovaná → Vystavená (dialog: číslo faktury, datum, splatnost, odkaz) → Zaplacená (dialog: datum úhrady), Zrušit / Vrátit o stupeň / Obnovit. Mutace, které mohou změnit rozdělení zaplacené platby, vrací `needs_confirmation`; `useConfirmedMutation` (`common.tsx`) ukáže změny po osobách a po souhlasu zopakuje příkaz s `confirmRecalc: true`.
- **SplitEditor** (`split-editor.tsx`, logika `split-logic.ts`): řádek = osoba + způsob (procenta / fixně za platbu / fixně celkem) + hodnota + rozsah podle druhu + platnost od–do; živý náhled „Z platby 10 000 Kč dostane Ondřej 6 000 Kč, Patrik 4 000 Kč.“ (stejné `allocate` jako ukládání), blokující chyby (procenta nad 100 %) a upozornění (pod 100 %). Používá se v záložce Finance zakázky, v dialozích retaineru, v Nastavení → Finance a jako příspěvek do slotu `job.create.extras` (výchozí z Nastavení, nebo vlastní). Ruční přepis rozdělení jedné platby je v detailu platby (`finance.payment.overrideAllocation`, jen `finance.splits_edit`).
- **Záložky Finance**: `recordTabs.job` (souhrn, volba Pokračovat na retainer / Ukončit po vyhodnocení úvodní fáze, retainer, pravidla, platby) a `recordTabs.company` (zaplaceno celkem / 12 měsíců / rok, nezaplacené, aktivní retainery, platby všech zakázek). Slot `job.header.extra`: u aktivního retaineru štítek a akce Změnit / Ukončit retainer.
- **`/finance/vyrovnani`** (`settlement-page.tsx`): jedno číslo („Patrik dluží Ondřejovi 12 400 Kč“ / „Vyrovnáno“), přepínač základu, rozpis po osobách a měsících s rozkliknutím na platby, dialog Zapsat vyrovnání (předvyplněno saldem), seznam vyrovnání se stornem.
- **Retainer dialogy** (`retainer-dialogs.tsx`): Pokračovat na retainer, Změnit od měsíce, Ukončit k měsíci (náhled dopadu: zrušené plánované platby, ponechané vystavené, hned dokončená zakázka, nabídka karty klienta, nemá-li jinou aktivní zakázku).
- **`/finance/prehledy`** (`reports-page.tsx`): příjmy podle osoby po měsících (skládaný sloupcový graf), podle typu zakázky (prstenec), top 10 klientů (vodorovné sloupce), měsíční příjem z retainerů; grafy z `@rebar/ui`.
- **Nastavení → Finance** (`settings.tsx`, `apps/web/src/app/(app)/nastaveni/finance/page.tsx`): základ salda a výchozí rozdělení nových zakázek (`finance.settings.set`).
- **Paleta (Cmd+K):** „Zapsat platbu“ (`/finance?nova=1`), „Zapsat vyrovnání“ (`/finance/vyrovnani?zapsat=1`). Widgety pro Přehled (Příjmy tento měsíc, Saldo, Nezaplacené platby) dodává server (`data/metrics.ts`), odkazují na tyto stránky.
- **Mobil:** čtení a základní akce (stavový tok, zápis platby, vyrovnání); tabulky jako karty; editor pravidel je použitelný, ale určený pro počítač.
- **Testy:** `src/ui/split-logic.test.ts`, `src/ui/format.test.ts` (čistá logika UI), e2e `apps/web/e2e/finance.spec.ts` (AS-02 až AS-04 z pohledu UI).

## Odkazy na kód a testy

<!-- Hlavní místa v kódu a testy, které chování zajišťují, ve tvaru `cesta/soubor.ts#symbol`. -->

- `packages/modules/finance/src/logic/allocate.ts#allocate` (rozdělení platby podle pravidel), `#validateSplitRules`, `#allocateJob`; `logic/balance.ts#balance` (saldo vyrovnání); `logic/retainer.ts#retainerSchedule`, `#retainerEndImpact`; `logic/overdue.ts` (po splatnosti).
- Služba pro ostatní moduly: `packages/modules/finance/src/data/finance-service.ts` (`ServiceMap["finance"]`).
- Testy: `packages/modules/finance/src/logic/*.test.ts` (čistá logika: rozdělení, saldo, retainer, scénáře), `packages/modules/finance/src/data/finance.int.test.ts`, `packages/modules/finance/src/ui/*.test.ts`, e2e `apps/web/e2e/finance.spec.ts`.
