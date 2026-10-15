# Zakázky

> Vyprávěcí dokumentace modulu `zakazky`. Přesné seznamy (pole entit, oprávnění, příkazy a jejich vstupy, tabulky, úlohy, trasy) se tu **neopisují**: jsou v referenci, která vzniká z kódu a nezastará. Tady je to, co z kódu vyčíst nejde: jak věci fungují za sebou, proč jsou tak, jak jsou, a kde jsou hrany.

Referenční stránky vzniklé z kódu: [modul](../reference/moduly/zakazky.md), [entity](../reference/entity/zakazky.md), [příkazy](../reference/prikazy/zakazky.md), [databáze](../reference/databaze/zakazky.md).

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

- **Popis z manifestu:** Zakázky: fáze, termíny, tým, šablony, komentáře a úkoly (kostra, model se přepracovává).
- **Závisí na:** [`kontakty`](kontakty.md)
- **Entity:** [`job`](../reference/entity/zakazky.md#job)
- **Příkazy:** [11 příkazů](../reference/prikazy/zakazky.md)
- **Referenční stránky:** [modul](../reference/moduly/zakazky.md), [entity](../reference/entity/zakazky.md), [příkazy](../reference/prikazy/zakazky.md), [databáze](../reference/databaze/zakazky.md)

**Oprávnění a jejich výchozí přidělení rolím:**

| Oprávnění           | Název                          | Výchozí: owner |
| ------------------- | ------------------------------ | -------------- |
| `zakazky.read`      | Vidí zakázky                   | vše            |
| `zakazky.create`    | Zakládá zakázky                | vše            |
| `zakazky.write`     | Upravuje zakázky               | vše            |
| `zakazky.delete`    | Maže zakázky                   | vše            |
| `zakazky.export`    | Exportuje zakázky              | vše            |
| `zakazky.templates` | Spravuje šablony zakázek       | vše            |
| `zakazky.finance`   | Vidí hodnotu a finance zakázek | vše            |

<!-- docs:generated:end -->

## Účel

Zakázka je konkrétní práce pro jednoho klienta, typ Web, Marketing nebo Systémy. Modul drží zakázku, její fáze, tým, stav a šablony (fáze, úkoly s termíny a plánované platby). Vzniká ručně, ze šablony nebo z vyhraného obchodu. Úkoly, platby, klienty a složky na Disku modul sám neukládá: volá je přes volitelné služby ostatních modulů (`tasks`, `finance`, `clients`) a oznamuje události `project.*`.

## Kdo to používá (role)

Vlastník a partner mají všechna oprávnění modulu; externí spolupracovník má rozsah „jen moje“ (zakázky, kde je vlastník nebo člen týmu). Soukromé zakázky vidí jen vlastník.

## Hlavní toky krok za krokem

**Založení zakázky** (`zakazky.create`, `zakazky.createFromTemplate`, `createJob`, `createJobsFromWonDeal` v `packages/modules/zakazky/src/core/create.ts#createJobTx`). Vše v jedné transakci:

1. Ověří se klient, vlastník, členové (aktivní uživatelé) a šablona (stejný typ, nearchivovaná). Šablona: zadaná, jinak výchozí pro typ; `withoutTemplate` dá prázdnou zakázku.
2. Plán ze šablony (`core/plan.ts#planFromTemplate`): fáze s daty od startu, úkoly s termínem start + počet dní a řešitelem podle pravidla (vlastník, vedoucí, uživatel, nikdo), platby s fakturujícím (vlastník, druhý partner, uživatel).
3. Z řady `zakazky.cislo` se přidělí kód `Z-RRRR-NNN`; zakázka je Aktivní, začíná-li dnes nebo dřív, jinak Plánovaná.
4. Vzniknou fáze (první nepřeskočená je aktuální a rozpracovaná) a tým (vedoucí `lead`, ostatní `member`).
5. Služby: `clients.addServices` (služba klienta), `tasks.createFromTemplate` (úkoly), `finance.initJobFinance` (platby a rozdělení; volá se pro každou zakázku). Chybějící služba se přeskočí.
6. Audit, zaindexování, událost `project.created` (Disk založí složku).

U zakázky z obchodu se při jediném řádku cena předvyplní hodnotou obchodu (R-39), soukromý obchod dává soukromé zakázky. Prázdný název řádku = „{klient} – {typ}“. Zakázka založená obecným formulářem entity dostane jen fáze a událost (`core/after-create.ts`).

**Fáze** (`core/phases.ts`). Klik na fázi (`zakazky.setPhase`): dřívější nehotové fáze se dokončí, cílová je rozpracovaná, pozdější hotové nebo rozpracované se vrátí do Nezahájená (R-38). Před změnou `zakazky.phase.preview` vrátí uzavírané fáze a počet jejich otevřených úkolů; s `completeOpenTasks` se úkoly dokončí. `zakazky.phase.complete` dokončí fázi a posune aktuální na další nehotovou. `zakazky.phases.edit` přepíše seznam fází (odebrané jdou do koše). Za každou dokončenou fázi se vyšle `project.phase_completed`, při změně aktuální `project.phase_changed`.

**Marketing**. Šablona „Marketing – úvodní fáze“ dá dvě platby po 7 000 Kč (první fakturuje vlastník zakázky, druhou druhý partner = jiný uživatel s `finance.read`), stav marketingu `intro`. Dokončení fáze „Vyhodnocení úvodní fáze“ (role `intro_evaluation`) vyšle `phase_completed` s rolí; finance nastaví `decision` přes `setMarketingStage`. Na fázi Retainer se klikem nepřechází (chyba s odkazem na volbu); `setMarketingStage(…, "retainer")` zakázku do fáze Retainer přesune a dřívější dokončí. „Ukončit“ = `completeJob(…, "retainer_ended")` (stav marketingu `ended`). Při „rovnou retainer“ (model `retainer`) je fáze vyhodnocení přeskočená, úvodní platby nevznikají a `RetainerSetup` jde do finance.

**Ukončení** (`core/status.ts`). `zakazky.complete` (Dokončená / Zrušená) nikdy neblokuje: vrací počet otevřených úkolů, neuhrazených plateb a zda má klient jinou živou zakázku (Plánovaná, Aktivní, Pozastavená). Není-li jiná, UI nabídne `zakazky.client.setFormer` (služba `clients`, zdroj `job_ended`). Uzavřenou zakázku znovu otevře `zakazky.setStatus` (Aktivní, Plánovaná, Pozastavená).

**Šablony** (`templates/`). CRUD, první šablona typu je výchozí, `setDefault` přepíná, výchozí nejde archivovat, duplikát není výchozí, `saveFromJob` uloží fáze bez dat a (když to služba `tasks` umí) otevřené úkoly jako posuny od startu. Zakázka si obsah při založení zkopíruje, takže změna šablony běžící zakázky neovlivní. Výchozí šablony (Web, Marketing – úvodní fáze, Marketing – retainer, Systémy) zakládá `ensure` při `db:seed`, jen do úplně prázdné tabulky.

## Stavy a přechody

Stav zakázky: Plánovaná, Aktivní, Pozastavená, Dokončená, Zrušená; je oddělený od fáze. Atribut `status` je jen pro čtení, mění se příkazy. Dokončená a Zrušená nastaví `completed_at`, znovuotevření ho smaže. Fáze: Nezahájená, Probíhá, Hotová, Přeskočená. Marketing: `intro` → `decision` → `retainer` → `ended`.

## Pravidla a výpočty

- Plánovaná data fáze: začátek = start + posun, konec = začátek + délka − 1 (délka 0 = jeden den), `shared.ts#phaseDates`. Termín zakázky = konec poslední nepřeskočené fáze, nebo zadaný.
- Platby druhu `intro` vznikají jen u modelu „úvodní fáze, pak retainer“, fáze `intro_evaluation` se jinak přeskočí (`plan.ts#phaseSkipped`).
- Zakázka ve skluzu: živá a po termínu, nebo s úkoly po termínu (`tasks.overdueJobIds`), `insights.ts#slippingJobs`.

## Oprávnění

`zakazky.read` (čtení, rozsah „jen moje“ = vlastník nebo člen), `zakazky.create`, `zakazky.write` (změny fází, stavu, týmu), `zakazky.templates` (správa šablon), cena zakázky jen s `finance.read`. Každé ruční čtení (metriky, vrstva, karta klienta, souhrny, `getJobBrief`) používá `visibleJobs`, takže cizí soukromé zakázky se nikdy nezapočítají; má záznam v `privatePaths`. Soukromou zakázku nejde přidělit uživateli bez `private.read`.

## Nastavení

Číselná řada `zakazky.cislo` (vzor `Z-{YYYY}-{NNN}`), šablony zakázek v Nastavení → Šablony zakázek (`/zakazky/sablony`), rozdělení plateb v Nastavení → Finance.

## Události a upozornění

Vysílá `project.created`, `project.phase_changed`, `project.phase_completed`, `project.completed` (D §2.2). Žádné notifikace. Odznaky a červené řádky: zakázka po termínu, dlaždice „Zakázky ve skluzu“, položka „Vyžaduje pozornost“, vrstva kalendáře „Termíny zakázek“.

## Exporty

Seznam zakázek exportuje obecný export entity (`zakazky.export`).

## Integrace s jinými moduly

Služby: `clients` (`addServices`, `setStatus`), `tasks` (`createFromTemplate`, `openCounts`, `overdueJobIds`), `finance` (`initJobFinance` včetně `retainer`, `unpaidCount`). Příspěvky: karta klienta (`clientCard`) a proměnné e-mailů pro zakázku. Veřejné API: `@rebar/zakazky/api`. Po vypnutí služeb se úkoly a platby prostě nezakládají.

## Uživatelské rozhraní (ZAK-B)

Vlastní trasy aplikace (`apps/web/src/app/(app)/zakazky/**`) mají přednost před obecným seznamem entit; detail `/zakazky/<id>` zůstává obecný záznam jádra (`RecordView`) rozšířený modulem (`packages/modules/zakazky/src/ui/index.tsx#areaUi`).

- **`/zakazky`** (`ui/jobs-page.tsx#JobsPage`): přepínač Seznam, Board podle stavu, Board podle fází, Tabulka a filtry. Seznam ukazuje kód, název, klienta, typ, stav, aktuální fázi, vlastníka, tým, termín, hodnotu (jen s `finance.read`), tlačítko Disk (modul Disk) a výstražnou ikonu po termínu nebo s úkoly po termínu; na mobilu jsou z řádků karty. Hledání je bez diakritiky, filtry Živé/Uzavřené/Vše, typ, Moje, Po termínu (`ui/logic.ts#filterCards`). Klávesa **C** a tlačítko otevřou Novou zakázku, `?novy=1` ji otevře hned. „Tabulka a filtry“ je plná `EntityList` jádra (uložené pohledy, export, vlastní pole).
- **Boardy**: karty jdou přetahovat, nebo použít nabídku „Přesunout“ (klávesnice, mobil). Přetažení mezi stavy volá `zakazky.setStatus`, do Dokončená/Zrušená otevře dialog dokončení; přetažení mezi fázemi (`/zakazky/faze?typ=`) projde stejným postupem jako pás fází (`ui/logic.ts#dropOutcome`).
- **Hlavička detailu** (`ui/header.tsx#JobHeader`): kód, typ, stav (výběr), varování, zámek (jen ukazatel; přepínač je v jádru), klient, vlastník (výběr), tým (okno s úpravou), termín (výběr data), slot `job.header.extra` (Disk, financí), pás fází. Klik na fázi volá `zakazky.phase.preview`; mají-li dokončované fáze otevřené úkoly, zeptá se, zda je dokončit také (`ui/logic.ts#planPhaseChange`, `ui/flows.tsx#usePhaseFlow`). Na fázi Retainer u marketingu se klikem nepřechází (zámek v pásu), jen volbou Pokračovat na retainer. „Dokončit fázi“ dokončí aktuální fázi a posune zakázku dál, „Fáze“ otevře úpravu fází jedné zakázky.
- **Marketing po vyhodnocení úvodní fáze** (`JobDetail.decisionPending`): v hlavičce pruh Pokračovat na retainer / Ukončit. Pokračovat otevře `ui/retainer.tsx#RetainerDialog` (částka, od měsíce, den vystavení 1–28, fakturující stále stejný nebo střídavě, rozdělení přes slot `job.create.extras`) a volá `finance.retainer.continue` s plochým vstupem (`ui/logic.ts#toRetainerContinueInput`: u střídání `firstIssuerId` začíná a `issuerId` je druhý v pořadí); bez zapnutých Financí je tlačítko neaktivní. Ukončit volá `zakazky.complete` s důvodem `retainer_ended`.
- **Dokončení a zrušení** (`ui/flows.tsx#CompleteForm`): upozorní na otevřené úkoly a neuhrazené platby (nezablokuje) a nabídne stav Bývalý pro klienta bez jiné živé zakázky (`zakazky.client.setFormer`, důvod povinný ve formuláři). Uzavřenou zakázku znovu otevře tlačítko v pruhu „Zakázka je dokončená“.
- **Záložky**: Úkoly po fázích se skupinou „Bez fáze“, přetahováním a nabídkou „Přesunout do fáze“, odškrtnutím a rychlým přidáním do fáze (`ui/tasks-tab.tsx#JobTasksTab`, příkazy `ukoly.list/update/complete/setStatus/quickAdd`; bez modulu Úkoly prázdný stav); Historie (`ui/history-tab.tsx#JobHistoryTab`). Základní záložky Úkoly a Aktivita jádra jsou skryté, Aktivita zůstává kartou na Přehledu. Finance, Hodiny, Poznámky, Obchod a Reklama přidávají vlastní moduly přes `recordTabs.job` s pořadím `ui/tab-order.ts#JOB_TAB_ORDER`; bez zapnutého modulu záložka prostě není. Přehled má karty Fáze, Původní obchod, Tým a Kontakty na zakázce.
- **Nová zakázka** (`ui/create-job.tsx#CreateJobDialog`): klient, typ, název „{klient} – {typ}“, šablona (výchozí, žádná, konkrétní), vlastník, členové, začátek, termín, u marketingu model fakturace (u „Rovnou retainer“ pole retaineru), cena, rozdělení (slot financí), soukromá (jen vlastník systému). Volá `zakazky.create`.
- **Založit zakázky z obchodu** (`ui/create-job.tsx#JobsFromDealDialog`, export `@rebar/zakazky/ui`): řádek za službu obchodu předvyplněný `zakazky.prefillFromDeal`, řádky jdou upravit, odebrat a přidat, „Přeskočit“ zakázky nezaloží. Potvrzení volá `obchody.win` s řádky `jobs` (nebo vlastní `onSubmit`); `onDone` dostane `{ skipped, created }`.
- **Šablony** (`/zakazky/sablony`, `ui/templates.tsx#TemplatesPage`, `#TemplateEditorPage`): seznam po typech (výchozí, souhrn, archivované), nová šablona, duplikace, výchozí pro typ, archivace, zakázka ze šablony. Editor: fáze (role, posun a délka ve dnech, pořadí), úkoly (typ, priorita, řešitel podle pravidla, termín a odhad), plánované platby (částka, fakturující, splatnost); kontrola před uložením (`ui/logic.ts#payloadIssues`), upozornění na neuložené změny. Na mobilu je editor jen ke čtení. Akce „Uložit jako šablonu“ na detailu zakázky (`SaveAsTemplateForm`, `zakazky.template.saveFromJob`).
- Čistá logika (pás fází, board, seznam, úkoly po fázích, retainer, řádky dialogu, úpravy šablony) je v `packages/modules/zakazky/src/ui/logic.ts` s testy `logic.test.ts`; e2e `apps/web/e2e/zakazky.spec.ts`.

Omezení UI: `BoardCard` zatím nemá členy (sloupec Tým v seznamu je prázdný, dokud ZAK-A pole `members` nedoplní); tlačítko Disk v seznamu čte `disk.folderState` (`{ entityType: "job", ids }`) a bez zapnutého Disku se nezobrazí.

## Hrany a známá omezení

- Dokončení otevřených úkolů při dokončení fáze (i soukromých, systémovým oprávněním) a šablona z hotové zakázky jdou přes službu `tasks`; počty soukromé úkoly nezapočítávají.
- Šablona nemá platby při uložení z hotové zakázky.
- Zakázka založená obecným formulářem entity (ne přes `zakazky.create`) nemá úkoly ani platby; UI zakázek proto vždy používá `zakazky.create`.

## Odkazy na kód a testy

- `packages/modules/zakazky/src/core/create.ts#createJobTx`, `core/plan.ts#planFromTemplate`, `core/phase-plan.ts#planPhaseChange`
- `packages/modules/zakazky/src/core/phases.ts#setCurrentPhaseImpl`, `core/status.ts#completeJobImpl`, `core/marketing.ts#setMarketingStageImpl`
- `packages/modules/zakazky/src/templates/crud.ts#saveTemplateFromJobImpl`, `templates/defaults.ts#ensureDefaultTemplates`
- Testy: `core/plan.test.ts`, `core/phase-plan.test.ts`, `shared.test.ts`, `contract.test.ts`, `core/zakazky.int.test.ts`
