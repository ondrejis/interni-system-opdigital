# ADR 025: Vlastní nástěnky: datový model a bezpečnostní model dotazů

- Stav: přijato (2026-10-10)
- Kontext: ADR 007 (oprávnění v datové vrstvě), ADR 010 (registr entit), ADR 012 (moduly, poskytovatelé), zadání „vlastní dashboardy a exporty“

## Kontext

Každý klient i každý uživatel chce data zobrazit jinak. Dosavadní Přehled je pevný (dlaždice a „Vyžaduje pozornost“ od modulů). Potřebujeme, aby si uživatel s právem
poskládal vlastní nástěnku z widgetů, aby šla sdílet, mít výchozí pro roli a aby nikdo nikdy neviděl součet, na který nemá právo, ani úpravou definice widgetu.

## Rozhodnutí

**Datový zdroj widgetu jsou entity z registru a dotazovací engine, nikdy SQL od uživatele.** Widget má `source` ve třech tvarech: `entity` (filtr → agregace
`count/sum/avg/min/max` → seskupení podle atributu nebo období den/týden/měsíc/čtvrtletí/rok → řazení a limit), `records` (seznam záznamů, top N) a `metric`
(pojmenovaná metrika modulu). Filtry jsou stejný strom podmínek jako v seznamech (`filterGroupSchema`, `buildFilter`), agregaci provádí `aggregateRecords`
(`packages/core/src/entities/aggregate.ts`), která staví dotaz **přes stejnou podmínku jako seznam** (`whereOf`: smazané, rozsah „jen moje“, filtry) a nad entitou zúženou `visibleTo`.
Důsledek: atribut skrytý oprávněním (`AttributeDef.permission`, např. `zakazky.economics`) pro aktéra nejen nemá hodnotu, on **neexistuje**: součet, filtr, seskupení ani řazení
podle něj skončí chybou „neznámý nebo nedostupný atribut“. Úprava definice widgetu (nebo odeslání vlastní definice na server) proto nic neodemkne. Bez `sql.raw`: koše období jsou pevné literály.

**Pojmenované metriky** (`dashboardMetrics` v serverové části modulu, `defineDashboardMetric`) pro výpočty, které nejdou složit z jedné entity (marže zakázek, nevyfakturováno,
cashflow proti plánu, využití lidí a strojů). Metrika deklaruje `permissions` (potřeba všech) a jádro ji bez nich **vůbec nevyhodnotí** a v katalogu pro editor neukáže;
uvnitř čte data přes entity a datovou vrstvu (rozsah aktéra). Klíč metriky začíná id modulu, vypnutý modul metriky nemá. Záměrně ne v manifestu: manifest jde do prohlížeče, výpočet je serverový.

**Definice nástěnky je JSON se schématem verze** (`schemaVersion`, zod `definitionSchema`, `migrateDefinition` převádí krok za krokem starší verze, novější odmítne). Mřížka má 12 sloupců;
widget nese šířku `w` (3/4/6/8/12) a výšku `h` (1–6 řádků), pořadí widgetů v poli je pořadí v mřížce (na telefonu jeden sloupec, na tabletu 6). Limity: 24 widgetů na nástěnku, 25 nástěnek na uživatele.

**Tabulky** `dashboard` (definice, autor, `seed_key`, `default_for_role`, `is_home`), `dashboard_share` (role nebo uživatel) a `dashboard_pref` (osobní pořadí v přepínači); migrace `0010_dashboards_exports`.
Viditelnost: moje, sdílená s mou rolí nebo se mnou, výchozí pro mou roli. Oprávnění `dashboards.write` (skládat a klonovat vlastní, sdílet své) a `dashboards.manage`
(výchozí pro roli, cizí nástěnky). Role s příznakem „domů“ otevře nástěnku na úvodní stránce místo klasického Přehledu (za roli jedna, částečný unikátní index). Výchozí sady z `config.ts`
(`dashboards.defaults`, `standardDashboards`) se zakládají jednou přes `seed_key`; co správce změnil nebo smazal, se nepřepisuje. Žádná sada není domovská, takže výchozí vzhled zůstává.

**Vyhodnocení.** Každý widget se načítá samostatným požadavkem `POST /api/dashboards/evaluate` (server actions z jedné stránky běží po jedné; widgety mají jít souběžně). Chyba widgetu je součástí odpovědi
(`ok: false`, česká věta), nikdy 5xx, takže jeden rozbitý widget nerozbije nástěnku (a na klientovi je navíc error boundary). Dotaz běží v transakci s `statement_timeout` 8 s (`57014` → „trval příliš dlouho“),
agregace vrací nejvýš 100 skupin. Krátká mezipaměť (30 s, v paměti procesu) je **na uživatele a podpis jeho oprávnění**, takže výsledek majitele se nikdy nevrátí mistrovi; tlačítko Obnovit a režim pro TV ji obcházejí.
Filtry nástěnky (období, zakázka, osoba) se do widgetů propisují přes datumový atribut widgetu a automaticky rozpoznaný atribut zakázky/uživatele; stav je v URL (`obdobi`, `od`, `do`, `zakazka`, `osoba`).
Období se počítá v české zóně; sloupce s časem se seskupují podle místního dne (`at time zone 'Europe/Prague'`), takže přechod letního času den neposune.

**Rozhodnuto vědomě:** úvodní stránka zůstává server komponenta s klasickým Přehledem; přepínač nástěnek je klientský a nástěnku renderuje klient (React Query). PDF a PNG snímek nástěnky jsou bez těžkých
závislostí (pdfmake už v repu je; PNG se skládá v prohlížeči přes SVG `foreignObject`). Grafy jsou vlastní lehké SVG komponenty (`packages/ui/src/charts`), žádná knihovna.

## Důsledky

- Nová agregace a metriky jdou přes datovou vrstvu, takže test bezpečnostní matice a `tests/dashboards.int.test.ts` hlídají, že mistr a montér nedostanou součty bez práva (ani přes úpravu widgetu).
- Metriky počítají z uložených souhrnů (např. `job.sum_*`), ne z živých součtů: přesnost závisí na přepočtu souhrnů zakázek.
- Mezipaměť je v paměti jednoho procesu; při více procesech má každý svou (nejvýš 30 s zastaralosti).
- Nová závislost: žádná.
