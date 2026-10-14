# ADR 026: Exporty: serverový export seznamů, fronta, šablony a plány

- Stav: přijato (2026-10-10)
- Kontext: ADR 009 (fronta úloh), ADR 020 (exporty XLSX, balík pro účetní), ADR 025 (nástěnky)

## Kontext

ADR 020 zavedl streamovaný export seznamů do XLSX a CSV. Chyběl PDF, volba sloupců a názvu, velké exporty, šablony, plánované exporty, jednotný audit a účetní formáty (ISDOC, podklady DPH).

## Rozhodnutí

**Jedna cesta pro každý export seznamu** (`startExport`, `POST /api/export/<entita>`): formát CSV, XLSX nebo PDF, rozsah `view` (aktuální pohled: filtry, řazení, hledání) nebo `all`, sloupce v pořadí,
název souboru (`{datum}`). Oprávnění vynucuje datová vrstva: sloupec skrytý oprávněním export odmítne (`exportColumns`), rozsah „jen moje“ zúží řádky. **Každý export vytvoří záznam
`export_run`** (kdo, co, kolik řádků, formát, filtry a sloupce ve `spec`) a audit `export` (i s nulou řádků, s filtrem a sloupci). Export z nástěnky (data widgetu do CSV/XLSX, nástěnka do PDF) se zapisuje stejně.

**Velké exporty přes frontu.** Nad `exports.syncMaxRows` (výchozí 5 000; PDF nad 1 500) nebo na vyžádání se export zařadí (`export.run`, odpověď 202). Úloha načte aktéra **znovu podle aktuálních oprávnění
uživatele** (`loadActor`, ne systém), takže kdo mezitím přišel o právo, dostane chybu. Soubor leží v úložišti jako `exports/<id>.<přípona>` do konce doby uchování (`exports.retentionDays`, 7 dní),
uživatel dostane upozornění a soubor stáhne v Nastavení → Exporty; denní úklid (`export.cleanup`) soubory smaže a řádek označí `expired` (záznam zůstává jako doklad). Soubor smí stáhnout jen autor exportu
(správce exportů vidí záznamy, ne cizí data). Strop: 50 000 řádků (CSV, XLSX), 5 000 (PDF); soubor se drží v paměti workeru nejvýš 150 MB.

**Šablony** (`export_template`): sada sloupců, filtrů, formátu a názvu pod jménem; osobní nebo sdílená v týmu (sdílet smí `exports.schedule`). **Plány** (`export_schedule`): denně, týdně, měsíčně v místním čase
Europe/Prague (`computeNextRun` počítá každý den zvlášť, takže přechod letního času čas nezkreslí), příjemci výhradně aktivní uživatelé **s právem na data** (kontrola při uložení i při každém spuštění),
doručení e-mailem (příloha do 8 MB, jinak odkaz), do „Moje exporty“, nebo obojí. **Každý příjemce dostane export podle svých oprávnění** (`export_run` na jeho jméno), ne podle oprávnění autora plánu.
Worker (`export.schedule.tick`, každých 5 minut) bere splatné plány `FOR UPDATE SKIP LOCKED`, v téže transakci posune `next_run_at` a vloží běh s jednoznačným klíčem (plán, příjemce, perioda; unikátní index),
takže opakované volání ani souběh workerů export nezdvojí; úlohy do fronty jdou až po commitu. Po výpadku se zameškané periody nedohánějí, spustí se jen aktuální. Zastavení plánu: autor nebo správce; příjemce se odhlásí odkazem
v e-mailu (`/nastaveni/exporty?plan=<id>`). Log běhů je `export_run` + `last_status` plánu.

**Formát souborů.** CSV: UTF-8 s BOM, oddělovač podle klienta (`exports.csvDelimiter` v `config.ts`, přepsatelný v Nastavení → Exporty; čárka mění desetinné číslo na tečku), texty začínající `=`, `+`, `-`, `@`, tabulátorem nebo CR se neutralizují
apostrofem (CSV injection; platí i pro klientský export vybraných řádků). XLSX: texty jako `inlineStr` (nikdy vzorec), čísla číselně, částky v Kč s formátem, data jako data, procenta jako zlomek.
PDF: pdfmake, A4, hlavička klienta (název systému, firma, IČO), popis výběru, opakované záhlaví, číslování stran.

**Účetní exporty** (modul Fakturace): ISDOC 6.0.2 pro vydané i přijaté faktury (jeden doklad nebo ZIP za období), podklady DPH (CSV a XLSX, řádky po sazbách a souhrn), a hromadný balík ZIP za období s volitelným ISDOC a podklady DPH.

## Důsledky

- Migrace `0010_dashboards_exports`: tabulky `export_template`, `export_schedule`, `export_run`; úlohy `export.run`, `export.schedule.tick`, `export.cleanup`; worker předává službám exportů `deps.exports`.
- Bez workeru zůstávají velké exporty ve frontě („Ve frontě“ v Moje exporty); po dvou hodinách je úklid označí jako neúspěšné.
- Nová závislost: žádná.
