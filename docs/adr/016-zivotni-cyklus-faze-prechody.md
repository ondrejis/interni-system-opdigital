# ADR 016: Životní cyklus zakázky: fáze, přechody a seznam

- Stav: přijato (2026-10-09)
- Kontext: ADR 015 (zakázka jako kořen), ADR 012 (moduly, příkazy, poskytovatelé), ADR 010 (registr entit), `docs/ZAKAZKA.md` (oblast 1)

## Rozhodnutí

**Fáze a stavy.** Fáze jsou v kódu (`zakazky/src/lifecycle/phases.ts`, klientsky bezpečné): `inquiry`, `offer`, `preparation`, `execution`, `handover`,
`warranty`, `closed` a vedlejší `lost`, `paused`; každá má název, barvu, pořadí a hlavní akci. Klient konfiguruje _stavy_ pipeline `job/default`, každý patří do
jedné fáze (`pipeline_stage.phase`). Výchozí stavy se jmenují jako fáze (stav „Realizace“ se jmenuje přesně tak). Stav bez fáze nemění fázi zakázky.
Stávající databáze doplní migrace `0006_lifecycle_phases` (Příprava → preparation, Realizace → execution, Předání → handover, Hotovo → closed, Zrušeno → lost,
chybějící stavy se přidají, pořadí podle fází, `job.phase` podle stavu zakázky); stejné mapování je v `phaseForLegacyStage`.

**Přechod je změna stavu.** Inline úprava, přetažení na kanbanu, příkaz `zakazky.transition` i dialog vedou do téhož `beforeUpdate` entity `job`
(`lifecycle/transitions.ts`). Ten při změně fáze: ověří povolený přechod (`allowedNext`: o jednu fázi dopředu i zpět, poptávka rovnou do přípravy, prohra před
předáním, pozastavení během přípravy až záruky a návrat jen do `pausedFrom`, uzavřenou jde znovu otevřít do záruky), spustí `check` všech hooků (první nesplněná
podmínka je `UserError` s českou větou), potom `run`, a nastaví `phase`, `phase_changed_at`, `won_at`, `handover_at`, `closed_at`, `paused_from`, `lost_reason`.
`afterUpdate` zapíše do auditu akci `phase` (časová osa zakázky) a spustí `after` hooky; `afterCreate` volá `after` hooky s `from: ""`. Při založení se `check` a `run` nepouštějí
(zakázku jde ručně založit v kterékoli fázi, výchozí je `inquiry`). Důvod prohry je invariant entity, ostatní kontroly jsou hooky (`lifecycle/hooks.ts`, ostatní oblasti dodávají
svoje přes `phaseHooks`). `zakazky.phase.preview` vrací pro každou možnou další fázi nesplněné kontroly, takže UI vysvětlí, proč tlačítko nejde.

**Zámky.** Uzavřená zakázka je zamčená (jen přechod do záruky ji znovu otevře). Původní smluvní cena (`value`) se od `execution` nemění; smluvní cena roste jen schválenými
změnami (zápis rozpočtu přímým SQL ji obchází záměrně).

**Viditelnost sloupců podle oprávnění.** `AttributeDef.permission` (např. `zakazky.economics`): aktér bez oprávnění atribut nevidí v popisu, řádcích, součtech, filtrech ani řazení
a nemůže ho upravit (engine zužuje entitu funkcí `visibleTo`). Při založení záznamu se hodnota skrytého atributu přijme (převod poptávky předává odhad hodnoty), ale zpět se nevrací.
`AttributeDef.unit` (`percent`, `percent_bp`) určuje zobrazení čísel; zádržné se ukládá v setinách procenta a zobrazuje v procentech.

**Seznam.** Výchozí sloupce: číslo, název, zákazník, fáze, stav, odpovědný, smluvní cena, marže %, čerpání %, termín, semafor. Výchozí sdílené pohledy (`lifecycle/views.ts`:
Moje zakázky, Nabídky čekající na odpověď, V realizaci, Po termínu, V záruce, Kanban podle stavu) zakládá seed (`ModuleSeed.views`, vlastník je nejstarší aktivní uživatel;
smazaný pohled se nevrací). Pohled „Po termínu“ používá „posledních 3650 dní“, takže zahrnuje i zakázky s termínem dnes.
Součet ve sloupci kanbanu bere první atribut s `aggregate` (smluvní cena).

**Poptávky.** Převod poptávky vytvoří zakázku ve fázi `inquiry`, nikoli `offer`: poptávka nemá adresu stavby, kterou přechod do nabídky vyžaduje, a nabídka teprve vznikne.
Přenese zákazníka (nebo ho založí), kontaktní osobu (vybranou, nebo novou ze jména kontaktu), odhad hodnoty jako původní smluvní cenu, zprávu jako popis a `sourceInquiryId`.
Hlavní akce zakázky „Vytvořit nabídku“ pak vede do `offer`.

**Přehled.** `attention`: nabídky bez odpovědi déle než 14 dní, záruka končí do 60 dní (varování do 14 dní), zakázky se semaforem `danger`. Kalendářní vrstva „Konec záruky“.
Po vstupu do záruky se odpovědnému založí úkol 30 dní před koncem záruky.

## Důsledky

- Hooky jsou globální registr; testy, které entitu sestavují bez `collectServers`, volají `setPhaseHooks(...)` samy.
- Kdo mění peníze nebo termín zakázky přímým SQL, obchází zámek ceny i uzavření; vědomě to dělá jen rozpočet při vyhrané nabídce.
- Stav bez fáze (vlastní stav klienta) jde přidat, zakázka v něm drží dosavadní fázi. Správa fáze stavu v administraci zatím chybí (`updateStage` už `phase` umí).
- Prohru z kanbanu nejde provést přetažením: chybí důvod; chyba to řekne a důvod se doplní v dialogu přechodu na detailu.
