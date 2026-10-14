# ADR 019: Konfigurace v administraci (stavy, číselníky, vlastní pole, řady, DPH, moduly)

- Stav: přijato (2026-10-09)
- Kontext: ADR 010 (registr entit), ADR 016 (fáze a stavy), zadání jádra §4.4 „Úpravy pro klienta“ (klient si bez kódu nastaví stavy, číselníky, pole, řady, sazby)

## Rozhodnutí

**Jedno místo: Nastavení → skupina „Konfigurace“.** Šest stránek pod oprávněním `settings.manage` (majitel a role, které ho dostanou): Stavy a pipeline,
Číselníky, Vlastní pole, Číselné řady, Sazby DPH, Moduly. Stránka bez oprávnění se v menu nezobrazí a server akce (`apps/web/src/server/config-actions.ts`)
i služby jádra ji odmítnou (oprávnění v datové vrstvě, ADR 007). Každá změna jde do auditu; mazání je měkké a v UI má „Zpět“ (stav, pole, sazba).
Po změně se obnoví stránka a zneplatní se klientská cache `["entity", …]`, takže kanban, filtry a tabulky hned uvidí nové nastavení.

**Stavy.** `listPipelines` vrací stavy s počtem použití. Počet používajících záznamů se zjišťuje **z popisů entit** (`registerStageUsageFromEntities`: každý atribut
`status` s pipeline), moduly nic neregistrují ručně; smazání používaného stavu selže větou „Stav … používá N záznamů“. Pevné fáze zakázek registruje
`buildRegistry` (`setPipelinePhases("job", …)`); jádro pak hlídá, že každá fáze má aspoň jeden stav (při změně fáze stavu i při smazání), že fáze existuje, že název
je jedinečný a že poslední stav pipeline nejde smazat. Pořadí se mění šipkami (přístupnější než tažení, stejný výsledek).

**Číselníky.** Položky se přidávají, přejmenovávají, přebarvují, vypínají a řadí; nemažou se (záznamy se na ně odkazují). Stabilní `value` vzniká z názvu při založení.
Nové číselníky zakládají moduly seedem; administrace spravuje jen jejich položky (číselníky vypnutého modulu se nenabízejí).

**Vlastní pole.** Výchozí hodnota a skrytí jsou v `custom_field_def.options` (jsonb), **bez migrace**: `defaultValue` (jen skalární typy, kontroluje se `normalizeValue`),
`hidden` (pole zmizí z entity: tabulka, filtr, řazení, detail, formulář, hledání; hodnoty zůstanou v `custom`). Pořadí polí je pořadí atributů. Hledání: `indexRecord`
přidává do `search_document` hodnoty textových polí a popisky vybraných možností; po změně definice (skrytí, smazání, přejmenování možnosti) akce znovu zaindexuje entitu
(`reindexEntity`, po dávkách 500). Export CSV je složen z tabulky (`buildCsv`), takže vlastní pole jsou sloupce jako ostatní.

**Číselné řady.** `listSeries` ukazuje vzor, reset a číslo, které dostane další doklad (`previewNext`, bez přidělení). Úprava vzoru má živý náhled a validaci
(`@rebar/core/numbering-pattern`, čistý modul pro prohlížeč), upozornění „změna platí od dalšího dokladu“ a varování, když roční řada nemá ve vzoru rok
(čísla by se po Novém roce opakovala). Reset (ročně/nikdy) se jen zobrazuje; mění ho deklarace řady v modulu.

**Sazby DPH.** Platnost jedné sazby (kódu) se nesmí překrývat; změna sazby v čase = nový řádek se stejným kódem a novým „platí od“. **Výchozí sazba** je nastavení `vat_default`
(kód sazby; bez něj nejvyšší platná). Server (`defaultVatRateBp`: nové řádky faktur, přijatých faktur, rozpočtu, změn) i UI berou sazby z konfigurace:
`VatRatesProvider` v layoutu aplikace dodá platné sazby a `useVatRates`/`vatBpChoices` je nabízejí ve faktuře, přijaté faktuře, objednávce a hromadné změně DPH v rozpočtu.
Vystavené doklady si sazbu drží u sebe, změna konfigurace se jich netýká.

**Moduly.** Stránka je jen přehled (název, popis, ikona, závislosti, zapnuto/vypnuto, oprávnění, odkazy). **Zapínání a vypínání za běhu se nedělá:** sestava modulů je v
`clients/<slug>/config.ts` (`modules`) a mění se nasazením, protože modul přidává tabulky, menu a oprávnění (ADR 001, 012). UI to říká srozumitelně.

## Důsledky

- Vlastní pole mají jen entity, které se zakládají enginem (`createRecord`): doklady s `noCreate` (faktury…) pole zobrazí a upraví, ale výchozí hodnotu a povinnost při vzniku
  neuplatní (vznikají příkazy modulu).
- Povinné pole přidané později nevyžaduje vyplnění starých záznamů (kontroluje se při zakládání a při úpravě téhož pole).
- Změna možností výběru nepřepíše staré hodnoty záznamů; odstraněná možnost zůstane u starších záznamů jako holá hodnota.
- Reindexace po změně pole běží v požadavku; pro desítky tisíc záznamů by patřila do fronty úloh (zatím nepotřeba).
