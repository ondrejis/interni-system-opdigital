# Úkoly a poznámky

> Vyprávěcí dokumentace modulu `ukoly`. Přesné seznamy (pole entit, oprávnění, příkazy a jejich vstupy, tabulky, úlohy, trasy) se tu **neopisují**: jsou v referenci, která vzniká z kódu a nezastará. Tady je to, co z kódu vyčíst nejde: jak věci fungují za sebou, proč jsou tak, jak jsou, a kde jsou hrany.

Referenční stránky vzniklé z kódu: [modul](../reference/moduly/ukoly.md), [databáze](../reference/databaze/ukoly.md).

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

- **Popis z manifestu:** Úkoly (včetně hovorů, schůzek a termínů) s rychlým zadáním, podúkoly a poznámky s formátovaným textem navázané na obchody, klienty, kontakty a zakázky.
- **Závisí na:** žádném modulu
- **Entity:** žádné
- **Příkazy:** žádné
- **Referenční stránky:** [modul](../reference/moduly/ukoly.md), [databáze](../reference/databaze/ukoly.md)

**Oprávnění a jejich výchozí přidělení rolím:**

| Oprávnění      | Název                     | Výchozí: owner |
| -------------- | ------------------------- | -------------- |
| `ukoly.read`   | Vidí úkoly a poznámky     | vše            |
| `ukoly.create` | Zakládá úkoly a poznámky  | vše            |
| `ukoly.write`  | Upravuje úkoly a poznámky | vše            |
| `ukoly.delete` | Maže úkoly a poznámky     | vše            |
| `ukoly.types`  | Spravuje typy úkolů       | vše            |

<!-- docs:generated:end -->

## Účel

<!-- Co modul řeší, pro koho, proč existuje a co do něj naopak nepatří. Tři až šest vět. -->

Úkol a CRM aktivita (hovor, schůzka, e-mail, termín) jsou jedna entita `task` s typem; hovor u obchodu i úkol v zakázce jsou ve stejném seznamu „Moje úkoly“ i v kalendáři. Tato část dokumentu popisuje serverovou stranu úkolů a aktivit (UKO-A); poznámky a UI doplňují jejich autoři.

## Kdo to používá (role)

<!-- Které výchozí role modul používají, co v něm každá dělá a jaký mají rozsah (vše / moje). Matice oprávnění je v souhrnu výše. -->

TODO: doplnit vyprávění

## Hlavní toky krok za krokem

<!-- Každý tok zvlášť: spouštěč, očíslované kroky z pohledu uživatele i systému (co se zapíše, spočítá, odešle), výsledek a co se stane při chybě. -->

1. Rychlé zadání: `ukoly.parse` ukáže, co parser rozpoznal (`src/tasks/logic/quick-parse.ts#parseQuickTask`), `ukoly.quickAdd` úkol uloží; výslovné hodnoty z náhledu přebijí rozpoznané.
2. Všechny zápisy jdou přes engine entit (`src/tasks/write.ts#createTask`, `updateTask`), takže stejná pravidla (háčky `src/tasks/hooks.ts`), audit, soukromí a události platí i pro seznam a inline editaci.
3. Dokončení (`src/tasks/write.ts#completeTask`): stav Hotovo, čas dokončení; u hovoru, schůzky a vlastního typu „v kalendáři“ jen **nabídka** zapsat výsledek a naplánovat další aktivitu, nic se nevytváří samo; další aktivita vznikne jen s `next`.
4. Přiřazení druhému se projeví okamžitě, žádné notifikace; `@jméno` v komentáři jen zvýrazní.

## Stavy a přechody

<!-- Stavové automaty (pipeline, fáze, stavy dokladů): z čeho kam se smí, za jakých podmínek, co přechod automaticky udělá. Hodí se tabulka nebo diagram Mermaid. -->

K řešení (`todo`) ↔ Probíhá (`in_progress`) → Hotovo (`done`) nebo Zrušeno (`canceled`); z uzavřeného stavu jde úkol znovu otevřít. Při přechodu do uzavřeného stavu se zapíše `completedAt`, při otevření se smaže (`src/tasks/hooks.ts#taskBeforeUpdate`). Hotový úkol nejde přeplánovat.

## Pravidla a výpočty

<!-- Vzorce, zaokrouhlování, sazby, meze, priority pravidel a příklad s čísly. U každého pravidla odkaz na funkci, která ho provádí. -->

- Podúkol má jen jednu úroveň a zdědí vazby rodiče; úkol s podúkoly nemůže být podúkolem (`taskBeforeCreate`, `taskBeforeUpdate`).
- Čas (`dueTime`) jde zadat jen s datem; odebrání data odebere i čas; celodenní úkol čas nemá.
- Stav termínu (po termínu, dnes, budoucí, bez data) počítá `src/tasks/logic/due.ts#dueState` v pražském čase; úkol s časem je po termínu, jakmile čas uplyne.
- Obchod: „další aktivita“ = nejbližší otevřený úkol s termínem, „poslední“ = nejnovější dokončený; počítají se jen sdílené úkoly, aby soukromý termín neprozradil partnerovi nic (`src/tasks/events.ts#refreshDealActivity`). U organizace se píše `last_activity_at`.
- Obchod nebo zakázka bez zadané organizace doplní organizaci a kontakt (`src/tasks/write.ts#deriveLinks`).
- Parser: dny v týdnu vždy nejbližší po dnešku, datum bez roku v minulosti = příští rok, holá hodina 1–6 = odpoledne; podrobná pravidla jsou v hlavičce `quick-parse.ts`.

## Oprávnění

<!-- Jak se oprávnění projevují v chování: kdo co vidí a smí, co je skryté (například peníze), jak funguje rozsah „jen moje“. Seznam oprávnění je v souhrnu. -->

`ukoly.read` čte, `ukoly.create` zakládá, `ukoly.write` mění (stav, termín, řešitel, účastníci), `ukoly.delete` maže do koše, `ukoly.types` spravuje typy. Rozsah „jen moje“ = přidělené mně nebo zadané mnou (`src/tasks/scope.ts#visibleTasks`). Soukromý úkol vidí jen vlastník; partner ho nenajde v seznamu, počtech, metrikách ani kalendáři. Soukromý úkol nejde přiřadit uživateli bez `private.read` (`PrivateAssignmentError`); `ukoly.publishAndAssign` (jen vlastník) ho zveřejní a přiřadí.

## Nastavení

<!-- Co se nastavuje v administraci a v konfiguraci klienta, co která volba mění a jaké jsou výchozí hodnoty. -->

Typy aktivit (`/ukoly/typy`, příkazy `ukoly.type.*`): název, ikona, barva, „v kalendáři“, pořadí. Systémové typy Úkol, Hovor, Schůzka, E-mail, Termín se doplní při `db:seed` (`src/tasks/types.ts#ensureTaskTypes`) a nejdou smazat; typ, který úkoly používají, také ne; klíč se nemění.

## Události a upozornění

<!-- Kdy a komu přijde upozornění, jaké události modul oznamuje rozšířením klienta, které plánované úlohy běží a co dělají. -->

Žádná upozornění. Doménové události: `task.created`, `task.completed` (webhooky), `task.changed` (interní: změna času, řešitele, typu, vazeb, smazání; `before` je `null` při vzniku a `after` při smazání). Na `task.changed` modul sám přepočítává systémová pole obchodu a organizace (`src/tasks/events.ts#onTaskChanged`); kalendář ho čte pro push do Googlu.

## Exporty

<!-- Co a jak se exportuje (XLSX, CSV, PDF, ISDOC, kalendářový kanál), kdo to smí a co je v souboru. -->

TODO: doplnit vyprávění

## Integrace s jinými moduly

<!-- Závislosti, poskytovatelé dat, sloty, události; kdo od modulu data bere a komu je modul dává; co se stane po vypnutí modulu. -->

Služba `tasks` (`src/service.ts#createTasksService`): `createFromTemplate`, `overdueJobIds`, `openCounts`, `logDoneActivity`, `createMeeting`, `createPrivateNote`. Příspěvky: `clientCard` (počet úkolů v záložce, souhrn, poslední aktivita), vrstva kalendáře „Úkoly s termínem“, metriky `ukoly.today|overdue|open`, dlaždice „Úkoly na dnes“, „vyžaduje pozornost“, odznak „po termínu“ u Moje úkoly. Vše čtené ručně je v `privatePaths`. Cizí tabulky se nečtou přímo: obchod, zakázka a organizace přes registr entit, fáze zakázky přes čtecí pohled `src/tasks/external.ts#jobPhaseView`.

## Hrany a známá omezení

<!-- Co funguje jinak, než by uživatel čekal, co zatím chybí, a odkazy na otevřené otázky. -->

- Obnova úkolu z koše nepřepočítá pole obchodu (přepočte se při další změně úkolu obchodu).
- Komentáře k úkolu jsou z jádra (`comment`, `entity_type = task`).
- Generická tvorba přes seznam (bez příkazu) neodvozuje organizaci z obchodu; to dělá jen `ukoly.create`/`quickAdd`.
- Úkol s vlastní viditelností pod soukromým obchodem nebo zakázkou zůstává soukromý, dokud rodič není veřejný.

## Odkazy na kód a testy

<!-- Hlavní místa v kódu a testy, které chování zajišťují, ve tvaru `cesta/soubor.ts#symbol`. -->

`packages/modules/ukoly/src/tasks/commands.ts#taskCommands`, `packages/modules/ukoly/src/tasks/logic/quick-parse.ts#parseQuickTask` (test `quick-parse.test.ts`, 88 případů), `packages/modules/ukoly/src/service.ts#createTasksService`; integrační test `tests/ukoly-tasks.int.test.ts`.
