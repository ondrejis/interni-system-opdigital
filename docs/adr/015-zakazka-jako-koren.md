# ADR 015: Zakázka jako kořen systému

- Stav: přijato (2026-10-09)
- Kontext: analýza konkurenčního řešení (podklad `podklady/2026-10-09-stavario-analyza-zakazky.md`), ADR 003 (peníze), ADR 007 (oprávnění v datové vrstvě), ADR 010 (registr entit), ADR 012 (moduly, příkazy, poskytovatele)

## Kontext

Dosavadní zakázka je plochá: jeden stav pipeline, ploché řádky odhadu, náklady jen součtem po kategoriích, vícepráce jedním číslem
a faktury vedle. Chybí životní cyklus od poptávky po záruku, rozpočet po oddílech s nákladovou i prodejní cenou, párování nákladů
na rozpočet, změny jako doklad se schválením, soupisy prací, zádržné a přenesená daňová povinnost. Konkurent má finanční
řetězec dobře, ale začíná až realizací a rozbíjí detail do 13 záložek. Naše výhoda: jedna zakázka od poptávky po záruku, všechno v jejím detailu.

## Rozhodnutí

**Životní cyklus.** Fáze jsou pevné v kódu: `inquiry` (poptávka), `offer` (nabídka), `preparation` (příprava), `execution` (realizace),
`handover` (předání), `warranty` (záruka), `closed` (uzavřeno); vedlejší `lost` (prohráno), `paused` (pozastaveno). Stavy uvnitř fází
konfiguruje klient v pipeline `job/default`; stav patří do fáze přes `pipeline_stage.phase`. `job.phase` je odvozený sloupec pro filtry,
mění se jen přechodem. Přechod (inline změna stavu, kanban, tlačítko) jde vždy přes entitu: `beforeUpdate` zjistí fázi cílového stavu a
spustí **hooky přechodu** (`PhaseTransitionHook` v `@rebar/core/entities`): `check` vrátí důvod, proč přechod nejde, `run`/`after` jsou
automatické akce v téže transakci. Hooky dodává modul, který zná důsledek, přes `phaseHooks` v `defineModuleServer` (rozpočet zamkne nabídku
a zkopíruje ji do realizace, realizace otevře deník a založí předávací protokol…); entita o nich nic neví.

**Rozpočet.** Verze (`offer`, `realization`) → stavební objekt (volitelný; každá verze má skrytý výchozí „Celá zakázka“) → oddíl (strom)
→ položka → řádky výkazu výměr. Jedna položka nese nákladovou i prodejní jednotkovou cenu (marže), ne dva rozpočty. Při zamčení verze se
uloží `original*` hodnoty položek; „původní → aktuální“ je vidět na každé úrovni. Smluvní cena = původní cena zakázky + schválené změny.

**Náklady.** Automatické náklady zůstávají ve svých modulech (poskytovatelé nákladů vracejí řádky živě se `source` a stabilním `ref`),
párování na oddíl je v `cost_allocation`. Ruční náklady (`job_cost`), řádky přijaté faktury a objednávky nesou `sectionId` přímo.
Nespárovaný náklad je úkol k doplnění. Plán vs skutečnost se počítá po oddílech, souhrn zakázky (`zakazky.summary`) je jedno místo pro čísla v hlavičce.

**Změny, soupisy, schvalování.** Změna (ZBV) má řádky (`add`, `qty`, `remove`) a po schválení se propíše do položek realizační verze
(původní hodnoty zůstanou). Soupis provedených prací (za období a objekt) je podklad pro dílčí fakturu. Schvalování řídí pravidla s limitem
částky (`approval_rule`) a žádosti (`approval`); schválený doklad je zamčený (`lockedAt`), úprava = vrátit do konceptu a zapsat do auditu.

**Fakturace.** Vydané faktury: záloha, dílčí, konečná (odečte zaplacené zálohy a zádržné), dobropis, uvolnění zádržného. Režim DPH zakázky
`standard` / `reverse_charge` (faktura bez DPH s povinným textem), zádržné v setinách procenta na zakázce. Přijaté faktury (`received_invoice`)
se rozpadají na oddíly rozpočtu a tvoří skutečné náklady.

**UI.** Detail zakázky: hlavička se čtyřmi čísly (smluvní cena, náklady a čerpání, marže, fakturováno/uhrazeno) a jednou hlavní akcí podle fáze;
v liště nejvýš osm záložek: Přehled, Rozpočet, Změny, Náklady, Fakturace, Realizace, Úkoly, Soubory. Moduly dodávají záložky s `group`
(skupina = jedna záložka v liště, uvnitř přepínač), skupiny a hlavičku deklaruje `recordTabGroups` / `recordHeader` v `defineModuleUi`.
Aktivní záložka a podzáložka jsou v adrese (`?tab=`, `?sub=`). Montér nevidí ceny, marže ani sazby (oprávnění `zakazky.economics`).

**Organizace kódu.** Modul Zakázky (a Fakturace) se dělí na oblasti, každá je složka se vlastním `index.ts` (`area: ModuleServer`), `ui.tsx`
(`tabs`, `actions`, `pages`) a `api.ts` (veřejné serverové funkce pro ostatní oblasti). `server.ts` je spojí (`mergeServers`), `ui.tsx` modulu
je složí. Oblast má jednoho vlastníka; do cizí oblasti se nepíše, volá se její `api.ts` přes `<oblast>Api` z `@rebar/zakazky/server`.

## Důsledky

- Datový model celé zakázky je založen předem (migrace `zakazka_model`, `prijate_faktury_zadrzne`, jádro `pipeline_phase`), aby oblasti
  nevytvářely souběžné konfliktní migrace. Další změna schématu jen přes zámek (viz `docs/ZAKAZKA.md`).
- Hooky přechodu jsou globální registr (`setPhaseHooks` při sestavení modulů); testy, které sestavují entity bez `collectServers`, je musí nastavit samy.
- Vyhraná nabídka se zamkne; úprava realizace jde jen přes změny (ZBV), takže původní dohoda zůstane dohledatelná.
- Stavební objekty, katalog položek, import z Excelu/KROS, podpisy a Gantt se závislostmi navazují později; model na ně počítá (`budget_calc_line`, `catalogItemId`).
