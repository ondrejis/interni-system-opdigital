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
- **Entity:** [`task`](../reference/entity/ukoly.md#task), [`note`](../reference/entity/ukoly.md#note), [`task_type`](../reference/entity/ukoly.md#task_type)
- **Příkazy:** [26 příkazů](../reference/prikazy/ukoly.md)
- **Referenční stránky:** [modul](../reference/moduly/ukoly.md), [entity](../reference/entity/ukoly.md), [příkazy](../reference/prikazy/ukoly.md), [databáze](../reference/databaze/ukoly.md)

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

- **Vlastník (Ondřej)** smí vše, včetně soukromých úkolů a poznámek; vidí je jen on.
- **Partner (Patrik)** má `ukoly.read/create/write/delete/types` s rozsahem „vše“: běžná práce se sdílenými úkoly a poznámkami, správa typů aktivit. Soukromé úkoly a poznámky vlastníka nevidí (seznamy, kalendář, přehled, hledání, historie ani počty).
- **Externí spolupracovník** nemá žádné oprávnění; vlastník mu je přidělí podle potřeby (úkol má rozsah „jen moje“).

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

Seznamy úkolů (`/ukoly/vse`) a poznámek se exportují obecným exportem entit (CSV a XLSX) s oprávněním `exports.*`; export respektuje soukromí stejně jako seznam (soukromé záznamy partnerovi nevyjdou). Modul nemá vlastní export.

## Integrace s jinými moduly

<!-- Závislosti, poskytovatelé dat, sloty, události; kdo od modulu data bere a komu je modul dává; co se stane po vypnutí modulu. -->

Služba `tasks` (`src/service.ts#createTasksService`): `createFromTemplate`, `overdueJobIds`, `openCounts`, `logDoneActivity`, `createMeeting`, `createPrivateNote`. Příspěvky: `clientCard` (počet úkolů v záložce, souhrn, poslední aktivita), vrstva kalendáře „Úkoly s termínem“, metriky `ukoly.today|overdue|open`, dlaždice „Úkoly na dnes“, „vyžaduje pozornost“, odznak „po termínu“ u Moje úkoly. Vše čtené ručně je v `privatePaths`. Cizí tabulky se nečtou přímo: obchod, zakázka a organizace přes registr entit, fáze zakázky přes čtecí pohled `src/tasks/external.ts#jobPhaseView`.

## UI úkolů (UKO-B)

- **Moje úkoly** (`/ukoly`, `packages/modules/ukoly/src/ui/my-tasks.tsx#MyTasksPage`): záložky Dnes (včetně po termínu), Nadcházejících 7 dní, Bez termínu, Delegované, Hotové s počty (klávesy 1 až 5), seskupení podle data, zakázky (fáze, „Bez fáze“), klienta nebo priority (`src/ui/logic.ts#groupTasks`), přepínač Seznam / Board podle stavu (tažení mezi sloupci, na telefonu nabídka „Přesunout do“), hledání, filtr typu a priority, Moje / Vše. Klávesy: C rychlé přidání, / hledání, B přepne rozložení; v řádku Enter otevře, F2 přejmenuje, šipky a J/K přecházejí.
- **Rychlé přidání** (`src/ui/quick-add.tsx#QuickAdd`): z textu parser (`parseQuickTask`) pozná typ, datum, čas, délku a prioritu a hned je ukáže; typ, datum, čas i prioritu jde v náhledu opravit a úkol se uloží až po potvrzení (Enter nebo „Přidat“). Opravy putují jako `override` příkazu `ukoly.quickAdd` (`src/ui/logic.ts#quickOverridePayload`). Na telefonu je to běžné textové pole, takže jde diktovat tlačítkem klávesnice.
- **Úpravy v řádku**: přejmenování, termín (Dnes, Zítra, příští pondělí, za týden, vlastní datum, bez termínu), priorita a řešitel; hromadné akce (výběr tlačítkem „Vybrat“): Hotovo, termín, priorita, řešitel, smazat (do koše, „Zpět“). Operace sdílí `src/ui/ops.tsx#useTaskOps`; přiřazení soukromého úkolu uživateli bez práva na soukromé (kód `private_assign`) nabídne „Zveřejnit a přiřadit“ s potvrzením (VID-06).
- **Uložené pohledy**: používají `saved_view` jádra pro entitu `task`; stav stránky se převádí na filtr s relativními operátory a skutečnými atributy (`src/ui/logic.ts#toSavedConfig`, `fromSavedConfig`), takže pohled funguje i v obecném seznamu úkolů.
- **Dokončení** (`src/ui/complete.tsx#useCompleteFlow`): hovor, schůzka a typ „v kalendáři“ nabídnou zapsat výsledek a naplánovat další aktivitu (předvyplněný návrh); nic se nevytvoří, dokud to uživatel nepotvrdí. Ostatní úkoly se odškrtnou s „Zpět“.
- **Dialog úkolu** (`src/ui/task-dialog.tsx#TaskDialog`, odkaz `?record=<id>`): každé pole se ukládá při změně, podúkoly (jedna úroveň), komentáře z jádra se zvýrazněním `@jméno`, výsledek, odhad času, štítky, vazby obchod, organizace, kontakt, zakázka a fáze (fáze přes příkaz `zakazky.detail`, je-li zakázky zapnutá), slot `task.dialog.extras` pro „Zapsat čas“ (HOD).
- **Karty záznamů** (`src/ui/record-tab.tsx#RecordTasksPanel`): záložka „Úkoly a aktivity“ na organizaci, kontaktu, obchodu a zakázce (`recordTabs`, pořadí `CLIENT_TABS.ukoly`), rychlé přidání, composer „Další aktivita“ a „Zapsat hotovou“ (rychlý zápis hovoru, e-mailu, schůzky s výsledkem), další kroky a časová osa; karta „Úkoly a aktivity“ na Přehledu a akce hlavičky „Nový úkol“. Základní záložka „Úkoly“ jádra je skrytá (`hiddenCoreTabs`).
- **Typy aktivit** (`src/ui/types-page.tsx#TaskTypesPage`): název, ikona, barva, „V kalendáři“, pořadí, mazání vlastních nepoužitých typů; stránka se otevře na `/ukoly/typy`, jakmile entita `task_type` dostane jinou adresu (žádost v `docs/opsys/ZADOSTI.md`).
- **Mobil**: řádky jsou karty, swipe doleva odkryje Odložit a Hotovo, dlouhý tah rovnou dokončí (`src/ui/logic.ts#swipeOutcome`, `src/ui/task-row.tsx`); ovládací prvky mají na dotyku výšku 44 px. Žádné notifikace.

## Poznámky (UKO-11)

Poznámka je entita `note` s formátovaným textem: nadpisy, seznamy, checklisty, citace, kód a odkazy. Obrázky a soubory do ní nepatří (jdou na Disk). Patří nejvýš k jednomu záznamu (klient, kontakt, obchod, zakázka), nebo je samostatná; samostatné sdílené poznámky nemají položku v navigaci (R-23), otevírají se z Cmd+K („Nová poznámka“, „Poznámky“ → `/poznamky/samostatne`) a samostatné soukromé zakládá Můj prostor → Soukromé přes službu `tasks.createPrivateNote` (`packages/modules/ukoly/src/notes/service.ts#createPrivateNote`). Záložka „Poznámky“ je u klienta, kontaktu, obchodu i zakázky (`packages/modules/ukoly/src/notes/ui/index.tsx#notesUi`), počet u klienta dodává příspěvek `clientCard` (`src/notes/providers.ts#noteClientCard`).

1. **Psaní a autosave.** Editor (`src/notes/ui/note-editor.tsx#NoteEditor`, Tiptap) ukládá 800 ms po poslední změně, nejpozději po 10 s nepřetržitého psaní; pod textem je stav „Neuloženo / Ukládám / Uloženo / Nepodařilo se uložit“. Nová poznámka se založí při prvním psaní (prázdná nevznikne). Logika časování je čistá a testovaná (`src/notes/autosave.ts#Autosaver`): nikdy neběží dva zápisy naráz, změny během zápisu se uloží hned po něm, po chybě se zápis opakuje (2, 5, 15, 30 s) a text zůstane čekající, při zavření okna se uloží, co čeká, a záloha neuloženého textu je v prohlížeči.
2. **Souběh a ztráta.** Každá poznámka má `version`, která roste při změně obsahu. Autosave posílá verzi, ze které vychází (`baseVersion`); neshoda = konflikt, text se nepřepíše a editor nabídne „Přepsat mou verzí“ (poslední zápis vyhrává, `force`) nebo „Načíst jejich verzi“ (`src/notes/write.ts#saveNote`). Změna samotného názvu verzi nezvedá. Stejný obsah nic nezapíše.
3. **Sanitizace.** Server nevěří JSON z klienta: `src/notes/doc.ts#sanitizeNoteDoc` povolí jen známé uzly a značky, zahodí obrázky, `style`, `class` a události, odkazy omezí na `http`, `https`, `mailto`, `tel`, adresy v aplikaci a kotvy, a hlídá velikost (200 000 znaků, 40 000 uzlů, hloubka 16). Prostý text (`body_text`) a automatický název (první řádek; ručně zadaný název zůstane) se odvozují na serveru. Vykreslení jde z JSON na prvky Reactu (`src/notes/ui/note-view.tsx#NoteView`), nikdy přes HTML.
4. **Pořadí a hledání.** Seznam (`ukoly.note.list`): připnuté nahoře, pak nejnovější podle data vzniku; hledání v názvu i textu bez diakritiky a velikosti písmen. Cmd+K najde poznámku podle celého textu (`src/notes/entity.ts#noteEntity`, `search`).
5. **Historie a soukromí.** Každá uložená změna textu, názvu, štítků, připnutí, přesunu i smazání je v historii (`audit_log`, s kontextem klienta nebo obchodu). Soukromí řeší jádro: poznámka pod soukromým obchodem nebo zakázkou je soukromá, soukromá organizace a kontakt do poznámek nedědí (R-31); poznámku zamyká jen vlastník soukromých záznamů a partner ji nenajde v seznamu, hledání, počtu u klienta, historii ani přímým voláním.

Omezení: rozsah „jen moje“ vidí jen vlastní poznámky; poznámky neposílají žádná upozornění; sdílená poznámka se needituje současně (konflikt se řeší rozhodnutím, ne slučováním).

## Hrany a známá omezení

<!-- Co funguje jinak, než by uživatel čekal, co zatím chybí, a odkazy na otevřené otázky. -->

- Obnova úkolu z koše nepřepočítá pole obchodu (přepočte se při další změně úkolu obchodu).
- UI: seznamy čtou příkazy (`useCommandQuery`), ne entity, takže realtime z C3 je zneplatní jen po úpravě `useRealtime`; do té doby se obnovují po 20 s a při akci. Board bere sloupce Hotovo a Zrušeno z posledních 30 záznamů. Hromadné akce volají příkazy po jednom (bez společné transakce).
- Komentáře k úkolu jsou z jádra (`comment`, `entity_type = task`).
- Generická tvorba přes seznam (bez příkazu) neodvozuje organizaci z obchodu; to dělá jen `ukoly.create`/`quickAdd`.
- Úkol s vlastní viditelností pod soukromým obchodem nebo zakázkou zůstává soukromý, dokud rodič není veřejný.

## Odkazy na kód a testy

<!-- Hlavní místa v kódu a testy, které chování zajišťují, ve tvaru `cesta/soubor.ts#symbol`. -->

`packages/modules/ukoly/src/tasks/commands.ts#taskCommands`, `packages/modules/ukoly/src/tasks/logic/quick-parse.ts#parseQuickTask` (test `quick-parse.test.ts`, 88 případů), `packages/modules/ukoly/src/service.ts#createTasksService`; integrační test `tests/ukoly-tasks.int.test.ts`.

Poznámky: `packages/modules/ukoly/src/notes/commands.ts#noteCommands`, `packages/modules/ukoly/src/notes/doc.ts#sanitizeNoteDoc` (test `doc.test.ts`), `packages/modules/ukoly/src/notes/autosave.ts#Autosaver` (test `autosave.test.ts`); integrační test `tests/ukoly-notes.int.test.ts`, e2e `apps/web/e2e/poznamky.spec.ts`.
