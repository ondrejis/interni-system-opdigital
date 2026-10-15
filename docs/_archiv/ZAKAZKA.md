# Zakázka jako kořen: pracovní smlouva oblastí

> **Archiv (2026-10-15).** Dokument popisuje stavební „zakázku jako kořen“ (ADR 015) z jádra před OPSYS: rozpočty, schvalování, zádržné, deník, investor.
> V OPSYS je zakázka jiná entita (typy Web, Marketing, Systémy, fáze ze šablon); platný popis je [docs/moduly/zakazky.md](../moduly/zakazky.md) a [ADR 028](../adr/028-opsys-z-jadra-rebar.md).
> Ponecháno jako historie; odkazy na kód a oblasti modulu už neodpovídají.

Rozhodnutí a důvody: [ADR 015](../adr/015-zakazka-jako-koren.md). Zdrojová analýza: `../../podklady/2026-10-09-stavario-analyza-zakazky.md`
(mimo repo; co převzít, co ne, datový model, životní cyklus, UI, fáze). Tento dokument říká **kdo co vlastní a jak se oblasti volají**.

## Rozsah této vlny

MVP i stavební agenda z analýzy: životní cyklus, rozpočet (verze/objekt/oddíl/položka, marže, původní vs. aktuální), náklady s párováním,
plán vs. skutečnost, přijaté faktury, objednávky, změny (ZBV) se schválením, soupisy prací → dílčí faktura, zádržné, přenesená daňová povinnost,
zamykání dokladů, schvalování s limitem, šablony zakázek, deník jako sběrné místo dne, hlavička a osm záložek, odkaz pro investora (jen čtení).
**Mimo tuto vlnu:** Gantt se závislostmi navíc (už existuje v Realizaci), import z Excelu/KROS, e-mailový příjem faktur a čtení přes AI, podpisy,
rezervace ze skladu, uzávěrky docházky. **Nikdy:** ISO 19650, BIM, virtuální prohlídky, beacony, marketplace.

## Vlastníci oblastí (kdo smí psát kam)

| #   | Oblast (agent)                           | Vlastní soubory                                                                                                                                                      | Hlavní výstup                                                                                                                                                |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Životní cyklus a seznam**              | `zakazky/src/lifecycle/**`, `zakazky/src/server.ts` (entita `job`), `poptavky/**`, seed pipeline, `clients/*/` ukázkové pohledy                                      | Fáze, přechody a hooky, entita zakázky (nové atributy), uložené pohledy, kanban podle fází, převod poptávky na zakázku, atributy souhrnu v seznamu           |
| 2   | **Rozpočet a šablony**                   | `zakazky/src/budget/**`, `zakazky/src/templates/**`, PDF nabídky (`apps/web/src/app/api/zakazky/**`)                                                                 | Verze, objekty, oddíly, položky, marže, původní/aktuální, zamčení, kopie nabídka→realizace, migrace starých řádků odhadu, stromová tabulka, šablony          |
| 3   | **Náklady, objednávky, přijaté faktury** | `zakazky/src/costs/**`, `zakazky/src/orders/**`, `fakturace/src/received/**`, poskytovatelé nákladů v `dochazka`, `sklad`, `stroje` (jen doplnění `ref`)             | Jedna tabulka nákladů s párováním, plán vs. skutečnost, `recomputeJobSummary`, příkaz `zakazky.summary`, objednávky, přijaté faktury, záložka Náklady        |
| 4   | **Změny, soupisy, schvalování**          | `zakazky/src/changes/**`, `zakazky/src/statements/**`, `zakazky/src/approvals/**`                                                                                    | ZBV s řádky a propsáním, soupisy provedených prací, pravidla schvalování a fronta, zamykání dokladů                                                          |
| 5   | **Fakturace**                            | `fakturace/src/billing/**`, `fakturace/src/server.ts`, `fakturace/src/ui.tsx`, `fakturace/src/pdf.ts`, `fakturace/src/totals*.ts`                                    | PDP, zádržné, konečná faktura po zálohách, faktura ze soupisu, uvolnění zádržného, zamykání, záložka Fakturace, PDF                                          |
| 6   | **Detail zakázky, deník, terén**         | `zakazky/src/ui.tsx`, `zakazky/src/share/**`, `realizace/**` (deník, předání), `apps/web/src/app/(app)/**` (jen související), `packages/ui/src/data/record-view.tsx` | Hlavička se čtyřmi čísly a hlavní akcí, osm záložek, Přehled, záložka Realizace, deník jako sběrné místo dne, mobilní zobrazení bez cen, odkaz pro investora |

Cizí složku **nikdy neupravuj**. Potřebuješ-li od ní něco, zavolej její `api.ts` (viz níže) nebo napiš vlastníkovi (`SendMessage`, seznam adres dostaneš od hlavního agenta). Společné soubory
(`zakazky/src/index.ts` manifest, `zakazky/src/schema.ts`, `core/**`, `packages/ui/**`) smíš měnit jen malými cílenými úpravami (Edit, nikdy přepis celého souboru)
a jen když to tvoje oblast nutně potřebuje; ve zprávě napiš, co jsi změnil.

## Zapojení oblasti

- **Server:** `zakazky/src/<oblast>/index.ts` exportuje `area: ModuleServer` (entity, příkazy, `costProviders`, `attention`, `widgets`, `calendarLayers`,
  `diaryPrefill`, `jobs`, `phaseHooks`). Název příkazu `zakazky.<oblast>.<akce>`; oprávnění příkazu + zod vstup, data hlídá handler (ADR 007, 012).
- **UI:** `zakazky/src/<oblast>/ui.tsx` exportuje `tabs`, `actions`, `pages`. Záložka na detailu zakázky **musí mít `group`** z `JOB_TAB_GROUPS`
  (`rozpocet`, `zmeny`, `naklady`, `fakturace`, `realizace`) a `order`; samostatné záložky jen s odůvodněním (lišta má mít nejvýš osm záložek). `ui.tsx` nikdy neimportuje serverový kód.
- **Veřejné serverové funkce:** `<oblast>/api.ts`; ostatní je volají jako `import { budgetApi } from "@rebar/zakazky/server"`. Fakturace analogicky `billingApi`, `receivedApi`
  z `@rebar/fakturace/server`. Fakturace smí importovat Zakázky (závislost), obráceně ne — Zakázky na faktury odkazují měkkým `uuid` a příkazem/poskytovatelem.
- **Entity** nového typu přidej do `manifest.entities` a do `area.entities`; `listPath` `/zakazky/<x>`; test `tests/modules.test.ts` hlídá zapojení.

## Smlouvy mezi oblastmi (tvary jsou závazné; měnit jen domluvou)

**Fáze (A1):** `PHASES` v `zakazky/src/lifecycle/phases.ts` (klientsky bezpečné): klíče `inquiry offer preparation execution handover warranty closed lost paused`,
každá s `label`, `color`, `primaryAction` (`{ label, to }`: další fáze nebo `null`), `order`. Přechod provádí příkaz `zakazky.transition` (`{ jobId, to, reason? }`)
a také změna atributu `stage` (inline, kanban): obojí vede do téhož `beforeUpdate` entity. Hooky: `phaseHooks` v `ModuleServer`, tvar `PhaseTransitionHook`
(`packages/core/src/entities/phase-hooks.ts`). Při **založení** zakázky entita zavolá `after` hooky s `from: ""`, takže hook „vstup do fáze X“ funguje i při vzniku v dané fázi.
Kdo co přidává: rozpočet (A2) `offer` (založí nabídkovou verzi), `preparation` (zamkne vyhranou nabídku, zkopíruje do realizace); realizace (A6) `execution` (otevře deník),
`handover` (předávací protokol, otevřené vady přenese), `warranty` (A1 nastaví `warrantyUntil` a připomínky), `closed` (A1: kontrola zádržného a vad přes A5/A6 `check`).

**Rozpočet (A2):** `budgetApi` exportuje:
`getBudgetTotals(ctx, jobId): Promise<{ versionId: string | null; sellMinor; costMinor; originalSellMinor; originalCostMinor; bySection: Record<string, { sellMinor; costMinor; originalSellMinor; originalCostMinor }> }>`
(aktuální realizační verze, jinak poslední nabídka; částky bez DPH), `getBudgetTree(ctx, jobId)`, `copyOfferToRealization(ctx, jobId)`, `lockVersion(ctx, versionId)`,
`applyChangeLines(ctx, changeId)` (volá A4 při schválení ZBV; propíše řádky do položek realizační verze, původní hodnoty zůstanou).

**Náklady (A3):** `costsApi.recomputeJobSummary(ctx, jobId)` přepočte sloupce `job.sum_*`; **volají ho všichni**, kdo mění peníze zakázky
(rozpočet, změny, faktury, náklady) — jako poslední krok své transakce. Příkaz `zakazky.summary` `{ jobId }` vrací
`{ contractMinor, originalContractMinor, approvedChangesMinor, plannedCostMinor, costMinor, drawdownPct, marginMinor, marginPct, plannedMarginMinor, plannedMarginPct, invoicedMinor, paidMinor, unpairedCount, health }`
(vše bez DPH). `CostLine` v jádru dostane `ref` (stabilní id zdroje) a `date`; páruje se přes `cost_allocation (source, sourceRef)`.
Přijaté faktury (`receivedApi`) dodávají řádky nákladů přes poskytovatele fakturace.

**Změny, soupisy, schvalování (A4):** `approvalsApi.requestApproval(ctx, { docType, docId, jobId, amountMinor }): Promise<{ status: "approved" | "pending"; approvalId }>`
(vyhodnotí pravidla; bez pravidla a pod limitem schválí hned), `approvalsApi.decide(ctx, approvalId, { approve, comment })`, `approvalsApi.assertUnlocked(row, label)`
(vyhodí `UserError` s důvodem „Doklad je schválený a zamčený, vraťte ho do konceptu“), `approvalsApi.reopen(ctx, docType, docId)` (vrátí do konceptu + audit).
`docType`: `change`, `statement`, `order`, `received_invoice`. Po rozhodnutí volá A4 `onDecision` doklad vlastnícího modulu přes registr callbacků
(`approvalsApi.registerHandler(docType, handler)`; fakturace/orders se registrují při sestavení modulu). Soupis: `statementsApi.createInvoiceDraft(ctx, statementId)`
vrací payload pro fakturu (řádky s `budgetItemId`, částky, období); skutečné založení faktury dělá `billingApi.createFromStatement(ctx, statementId)` (A5) — A5 volá A4 a ne naopak.

**Fakturace (A5):** `billingApi.createFromStatement`, `billingApi.finalSettlement(ctx, jobId)` (částky pro konečnou fakturu: zakázka + schválené změny − zálohy − zádržné),
`billingApi.releaseRetention(ctx, jobId, { amountMinor? })`, `billingApi.jobInvoicing(ctx, jobId)` `{ invoicedMinor, paidMinor, retentionHeldMinor, retentionReleasedMinor, advancesPaidMinor }` (A3 z toho plní souhrn).
PDP: `job.vat_mode = reverse_charge` ⇒ faktura bez DPH s textem „Daň odvede zákazník (§ 92a zákona o DPH)“; kód zakázky v záhlaví.

**Souhrn pro seznam a hlavičku:** čte jen `job.sum_*` a `zakazky.summary`; nikdo si čísla nepočítá po svém.

## Sdílená pravidla

- **Peníze v haléřích** (`*_minor`, `bigint`), množství `numeric(14,3)` jako desetinný řetězec (ADR 003). Částky v souhrnech bez DPH, sazba DPH v setinách procenta (`vatRateBp`).
- **Čísla z řad** přes `nextNumber`; číslo se přiděluje ve stejné transakci jako vznik dokladu.
- **Oprávnění:** čtení peněz `zakazky.economics`, zápis rozpočtu/nákladů `zakazky.budget`, schvalování `zakazky.approve` (do limitu) a `zakazky.approve_all`, odkaz pro investora `zakazky.share`.
  Role `foreman` a `worker` **nesmí dostat do API ani UI ceny, sazby a marže** (UI skrývá, server nevrací).
- **Zamčený doklad** (`lockedAt`, stav `approved`/vystavený) se nemění; příkaz musí selhat s českou větou „proč“ (`assertUnlocked`). Vrácení do konceptu jde jen přes `reopen` a zapíše audit.
- **Audit a časová osa:** změna fáze, schválení, zamčení a vrácení do konceptu jdou do auditu (`auditChange`) a zakázka je ukáže v aktivitě.
- **Texty UI česky** s diakritikou; slovo „rebar“ nikde v UI. Kód a názvy souborů anglicky/kebab-case, `docs` česky.
- **Rozpočtové a fakturační výpočty jako čisté funkce** v samostatných souborech s unit testy (jako `economics.ts`, `totals.ts`); databázová část s integračními testy proti PostgreSQL.

## Schéma a migrace (důležité)

Model je založen předem v `zakazky/src/schema.ts` a `fakturace/src/schema.ts` (migrace `zakazka_model`, `zakazka_souhrn`, `prijate_faktury_zadrzne`, jádro `pipeline_phase`).
**Potřebuješ-li změnit schéma:**

1. Zvaž nejdřív, jestli nestačí `custom` JSON nebo existující sloupec.
2. Změnu dělej **v `schema.ts`** (cílený Edit) a migraci generuj pod zámkem, ať se nepřekryjí snapshoty:
   ```sh
   until mkdir /tmp/rebar-migrate.lock 2>/dev/null; do sleep 2; done
   (cd packages/modules/zakazky && pnpm exec drizzle-kit generate --name <popis>)   # nebo fakturace
   pnpm exec prettier --write packages/modules/zakazky/drizzle
   rmdir /tmp/rebar-migrate.lock
   ```
3. Přesun starých dat a mazání starých tabulek (např. `job_estimate_line`) je ruční SQL migrace (`drizzle-kit generate --custom --name <popis>`), vždy s datovou kontrolou v testu.
4. Dev databázi nemigruj sám; řekni hlavnímu agentovi, nebo spusť `pnpm db:migrate` (je idempotentní), když to nikdo jiný právě nedělá.

## Testy a prostředí (důležité, jinak si agenti navzájem rozbijí běhy)

- **Integrační testy každý agent pouští proti vlastní databázi:** `REBAR_TEST_DB_NAME=rebar_test_<oblast> pnpm exec vitest run <cesty>` (globální setup databázi zahazuje a znovu vytváří —
  sdílený název by ostatním přerušil běh). Příklady jmen: `rebar_test_lifecycle`, `rebar_test_budget`, `rebar_test_costs`, `rebar_test_changes`, `rebar_test_billing`, `rebar_test_detail`.
- **E2E testy nespouštěj** (sdílený build a databáze `rebar_e2e`); spustí je hlavní agent na konci. Specy ve své oblasti **piš a upravuj** (`apps/web/e2e/<oblast>.spec.ts`), ať je hlavní agent jen spustí.
- Před předáním: `pnpm typecheck`, `pnpm exec eslint <tvé cesty>`, `pnpm exec prettier --write <tvé cesty>`, `pnpm exec vitest run tests/guards.test.ts tests/modules.test.ts apps/web/src/modules.test.ts` a testy tvé oblasti.
- **Dev server** `rebar-web` na `http://localhost:3100` (preview) sdílíš s ostatními. UI mění HMR; po změně manifestu, příkazů nebo hooků je potřeba restart (`preview_stop` + `preview_start name=rebar-web`) — dělej to střídmě a až po dokončení většího kusu.
  Prohlížeč: vlastní záložka (`tabs_create`), přihlášení `ondrej@example.test` (heslo v `.env.local`, `OWNER_PASSWORD`), jen `localhost`. Nikdy neukládej branding/nastavení, nemaž cizí data.
- **Git:** nikdo nedělá `commit`/`push`/`add`; commity dělá hlavní agent po integraci.

## Doporučené pořadí práce uvnitř oblasti

1. čistá logika + unit testy → 2. příkazy/entity + integrační testy → 3. UI → 4. e2e spec → 5. screenshot desktop/mobil, světlý/tmavý režim → 6. report.
   Report hlavnímu agentovi: co je hotové, rozhraní (`api.ts`) která ostatní mohou volat, co je potřeba od ostatních, co jsi změnil mimo svou složku, co neověřeno.

## Náklady, objednávky a přijaté faktury (oblast 3): jak to drží pohromadě

- **Jedna tabulka nákladů** je živý pohled, ne kopie: `costsApi.listJobCosts` spojí ruční náklady (`job_cost`), řádky poskytovatelů
  (`CostProvider` vrací řádky na úrovni záznamu s `ref` a `date`: docházka, sklad, stroje, schválené a uhrazené přijaté faktury, deník)
  a stav párování. Párování na oddíl aktuálního rozpočtu je v `cost_allocation (source, sourceRef)`; ruční náklad nese jediný oddíl
  přímo v `job_cost.section_id`, řádek přijaté faktury v `received_invoice_line.section_id` (přepárování v `cost_allocation` má přednost).
  Rozpad na víc oddílů musí sedět na haléř; když se částka zdroje změní, zbytek je „nespárovaný“.
- **Souhrn zakázky** (`job.sum_*`, `zakazky.summary`) počítá jen `costsApi.recomputeJobSummary(ctx, jobId)`; je levný a idempotentní
  (bez změny nic nezapíše). Docházka, sklad a stroje zakázky nevolají, proto ho navíc srovnává denní úloha `zakazky.summary.refresh`
  a každé otevření detailu (příkaz `zakazky.summary`). Semafor: `danger` při záporné marži (jsou-li náklady), čerpání nad 100 % plánu nebo
  zpoždění termínu; `warning` při čerpání nad 85 % nebo marži o víc než 10 p. b. pod plánovanou; v poptávce, nabídce, po uzavření `null`.
- **Poskytovatelé bez cyklu balíčků:** `recomputeJobSummary` nemá `deps`, proto jádro drží globální registr (`setJobFinanceProviders`,
  plní ho `collectServers` jako `setPhaseHooks`): poskytovatele nákladů a nový typ `jobInvoicing` (kolik je vyfakturováno a uhrazeno bez DPH;
  dodává Fakturace, Zakázky ji neimportují). V testech bez `collectServers` se registr nastaví ručně.
- **Objednávky nejsou náklad, ale závazek:** schválená a přijatá objednávka se v plánu vs skutečnosti počítá jako „objednáno“, dokud ji
  nepokryjí náklady s `orderId` (faktura, ruční náklad); otevřený závazek nikdy není záporný.
- **Schvalování** objednávek a přijatých faktur registruje `approvalsApi.registerHandler` při sestavení modulu (`orders/index.ts`,
  `received/index.ts`); handler zapíše stav a zámek, schválená přijatá faktura i její vrácení do konceptu přepočítá souhrn zakázky.
- **Sazby pracovníků:** řádek docházky nese jen částku a hodiny v popisu, nikdy sazbu; všechny příkazy `zakazky.costs.*`,
  `zakazky.orders.*` a `zakazky.summary` vyžadují `zakazky.economics` (zápis `zakazky.budget`), takže mistr a montér ceny nedostanou.
