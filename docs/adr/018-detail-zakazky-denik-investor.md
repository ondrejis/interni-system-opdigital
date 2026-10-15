# ADR 018: Detail zakázky, stavební deník a odkaz pro investora

- Stav: v OPSYS se nepoužívá (stavební deník a investor odstraněny, viz ADR 028); původně přijato (2026-10-09)
- Kontext: ADR 015 (zakázka jako kořen), ADR 010 (registr entit a UI), ADR 012 (moduly, příkazy a poskytovatelé), `docs/_archiv/ZAKAZKA.md`

## Rozhodnutí

**Hlavička zakázky** (`zakazky/src/detail/header.tsx`, `recordHeader`): čip fáze, semafor, zákazník, kontakt, odpovědný, adresa stavby s odkazem do
Mapy.cz, hlavní akce podle fáze (`PhaseButton` z životního cyklu otevře dialog přechodu s kontrolami) a čtyři čísla ze `zakazky.summary`
(Smluvní cena včetně změn · Náklady a čerpání · Marže plán vs. skutečnost · Fakturováno / uhrazeno). Čísla a semafor vidí jen držitel
`zakazky.economics`; příkaz bez oprávnění selže, takže server ceny nevrací. Když příkaz selže, hlavička čte přepočtené `job.sum_*`.
Na telefonu je hlavička kompaktní (čtyři čísla se posouvají do strany) a celý detail se posouvá, lišta záložek zůstává nahoře (`sticky`).

**Záložky a viditelnost podle fáze** (`zakazky/src/detail/visibility.ts`). V liště je nejvýš osm záložek: Přehled, Rozpočet, Změny, Náklady, Fakturace,
Realizace, Úkoly, Soubory. Aktivita je v Přehledu, Tým je karta v pravém panelu Přehledu, Ekonomika je nahrazena oblastí Náklady.
Pravidlo skupiny se k vlastnímu `visible` záložky přidává přes AND (`withPhaseRules` v `ui.tsx`):

| Skupina / záložka                | Viditelná od fáze                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Přehled, Úkoly, Soubory          | vždy                                                                                                         |
| Rozpočet                         | vždy (nabídka vzniká už u poptávky), u prohrané zakázky taky                                                 |
| Náklady, Fakturace               | příprava (objednávky a zálohy se řeší před stavbou; analýza říkala „od realizace“ pro Náklady, záměrně dřív) |
| Změny                            | realizace (změny proti smlouvě vznikají až na stavbě)                                                        |
| Realizace → Harmonogram          | příprava                                                                                                     |
| Realizace → Deník, Předání, Vady | realizace                                                                                                    |

Pozastavená zakázka se chová jako fáze, ze které byla pozastavena (`pausedFrom`); prohraná zakázka má jen obchodní část. Skupina Náklady vyžaduje
`zakazky.economics`, protože její záložky (Materiál, Stroje) nesou ceny.

**Přehled skládaný z karet.** `ModuleUi.recordOverview` (`RecordOverviewCard`: `column` main/side, `order`, `permission`, `visible`, `render`) umožňuje
každému modulu přidat kartu (poslední zápis z deníku, otevřené vady, nespárované náklady, čekající schválení…). `render` dostane i `openTab(tab, sub)`.
U entity, která má karty nebo skrytou Aktivitu, má Přehled vlevo karty, nejbližší úkoly a celou aktivitu s komentáři a vpravo údaje (edituje se na místě) a tým.

**Stavební deník jako sběrné místo dne** (`realizace/src/diary*.ts`): pás dní s ikonou u dne se zápisem a skokem na datum; záznam dne má počasí,
provedené práce, pracovníky z docházky (struktura jméno + hodiny), materiál, stroje, fotky (nahrané, nebo z fotek zakázky), nehody a vady a podpis.
Úprava schématu `site_diary` je jen přídavná (jsonb sloupce `weather_data`, `workers`, `material_rows`, `machine_rows`, `incidents`, `photo_ids`,
`for_investor`, `signed_*`); textové sloupce zůstávají jako čitelný souhrn (starší zápisy a tisk). Nezadané pole při úpravě zůstává, jak bylo.

- **Počasí** si server vezme při vzniku zápisu z Open-Meteo (`api.open-meteo.com`, starší dny z `archive-api`, souřadnice zakázky nebo obec z adresy přes
  `geocoding-api`). Hostitelé jsou napevno povolení, do adresy jdou jen čísla, časový limit 4 s, bez přesměrování; selhání deník neshodí, počasí se doplní ručně.
- **Materiál s cenou za jednotku vytvoří náklad zakázky** (`costsApi.createManualCost`, zdroj `diary`, odkaz `<zápis>:<řádek>`). Změna řádku náklad přepíše,
  odebraný řádek a smazání zápisu ho zruší; nezměněný řádek zachová náklad (a jeho případné spárování). Cenu vidí jen držitel `zakazky.economics` a zapisuje
  ten, kdo má i `zakazky.budget`; montér řádek upraví, ale cena a náklad zůstanou (`mergeMaterialRows`). Párování na oddíl se dělá v Nákladech (karta nespárovaných).
- **Vada z deníku** založí vadu zakázky (a odkazuje na ni), podepsaný zápis nejde měnit ani smazat; podpis může zrušit držitel `realizace.write`.
- **Tisk** je stránka `/tisk/denik/<zakázka>` (bez navigace, bez cen), tisk se spouští tlačítkem, z tisku prohlížeče jde uložit PDF.

**Hooky přechodů v Realizaci** (`realizace/src/hooks.ts`): vstup do `execution` vyžaduje, aby měl kdo zapisovat do deníku (vedoucí nebo člen týmu), a
upozorní tým; `execution`→`handover` vyžaduje, aby nezbyla rozpracovaná změna (`changesApi.countOpenChanges`), a založí koncept předávacího protokolu
s kontrolními body a otevřenými vadami (vady zůstávají vadami zakázky, protokol je eviduje); `warranty`/`closed` z předání vyžaduje podepsaný protokol;
`closed` vyžaduje, aby nezbyla otevřená vada.

**Montér nevidí ceny.** Příkazy `zakazky.summary`, náklady a rozpočet vyžadují `zakazky.economics`; deník, tisk a odkaz investora ceny nevrací;
`sklad.jobMaterial` a `stroje.jobFleet` bez `zakazky.economics` vrací nulové hodnoty a bez sazeb. Test: `tests/detail-zakazky.int.test.ts`.

**Odkaz pro investora** (`zakazky/src/share/**`, `apps/web/src/app/investor/**`): token má 32 náhodných bajtů, v tabulce `job_share` je jen otisk (SHA-256),
token se ukáže jednou při vytvoření. Rozsah (`scope`): fáze a postup, deník (ne / vybrané zápisy / všechny), fotky zakázky, vybrané dokumenty;
chybné hodnoty rozsahu se zahodí, nikdy nevznikne širší přístup. Veřejná stránka `/investor/<token>` je mimo `(app)` (bez přihlášení a navigace), `noindex`,
s omezením počtu požadavků; neplatný, zrušený a prošlý odkaz jsou stejně „nenalezeno“. Data skládá aplikace: základ zakázky a soubory z `shareApi`
(explicitní sloupce, žádné ceny ani číslo zakázky), harmonogram a deník z příkazu `realizace.investor.view`, který smí běžet jen pod systémovým
kontextem (přihlášený uživatel ho přes `runCommand` volat nesmí). Z deníku jdou bez cen, hodin a dodavatelů; interní události a vady jen u zápisů označených
„pro investora“. Soubory podává `/api/investor/<token>/files/<id>` jen v rozsahu odkazu. Správa je karta „Sdílení s investorem“ v Přehledu
(vytvoření, zrušení, náhled `/investor/nahled/<id>` přes přihlášení), oprávnění `zakazky.share`.

## Důsledky

- Přehled i hlavička jsou rozšiřitelné z modulů bez zásahu do `RecordView`; typ karty drží `@rebar/ui`.
- Realizace závisí na Zakázkách (náklady z deníku, hooky), ne naopak; odkaz investora proto čte deník přes příkaz, ne přes import.
- Dev i test prostředí potřebují migraci `0001_stavebni_denik` v balíčku Realizace.
- Nemění se model oprávnění: nové je jen využití `zakazky.share` a `zakazky.economics`.
