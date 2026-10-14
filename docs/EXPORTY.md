# Exporty

Každý seznam (tabulka entity) má **Export**: CSV, XLSX a PDF, s volbou aktuálního pohledu nebo všech záznamů, výběru sloupců a názvu souboru. Velké exporty jedou přes frontu, každý export se eviduje a auditují se.
Dále šablony exportů, plánované exporty, exporty z nástěnek a účetní formáty (ISDOC, podklady DPH, balík dokladů). Rozhodnutí v [ADR 026](adr/026-exporty-fronta-plany.md) a [ADR 020](adr/020-exporty-a-odesilani-faktur.md), nástěnky v [DASHBOARDY](DASHBOARDY.md).

## 1. Export seznamu

V seznamu: **Export** → rychlé CSV / Excel / PDF (celá filtrovaná sada, zobrazené sloupce) nebo **Export s nastavením…** (dialog):

| Volba         | Co dělá                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Formát        | CSV (UTF-8 s BOM, oddělovač podle klienta), Excel (typované buňky, řádek součtů), PDF (A4, hlavička klienta, opakované záhlaví) |
| Co exportovat | **aktuální pohled** (filtry, řazení, hledání) nebo **vše**, co uživatel smí vidět                                               |
| Sloupce       | libovolné z entity včetně vlastních polí; citlivé sloupce bez oprávnění server odmítne                                          |
| Název souboru | bez přípony, `{datum}` se nahradí dnešním datem                                                                                 |
| Na pozadí     | zpracuje se ve frontě a soubor čeká v Nastavení → Exporty                                                                       |
| Šablona       | uložit sadu pod jménem, sdílet v týmu (smí `exports.schedule`)                                                                  |

Co smí uživatel exportovat, určuje datová vrstva: oprávnění k entitě (`permissions.export`, jinak čtení), rozsah „jen moje“, skryté atributy. **Soubor nikdy neobsahuje víc, než vidí seznam v aplikaci.**
Limity: 50 000 řádků (CSV, XLSX), 5 000 (PDF). Export s nulou řádků se zapíše také.

### Formát čísel a dat, ochrana před vzorci

- **CSV:** střednik (česká verze Excelu) nebo čárka podle klienta (`exports.csvDelimiter`, přepsatelné v Nastavení → Exporty; s čárkou se desetinná čísla píšou s tečkou). BOM, CRLF. Texty začínající `=`, `+`, `-`, `@`, tabulátorem nebo CR dostanou apostrof (**CSV/Excel formula injection**); čísla se nepřepisují. Platí i pro rychlý export vybraných řádků z tabulky.
- **XLSX:** texty jsou `inlineStr` (nikdy vzorec), čísla číselně, **částky v Kč jako čísla s formátem měny**, data jako data (formát `dd.mm.rrrr`), procenta jako zlomek s formátem „%“, zamražená hlavička, automatický filtr.
- **PDF:** částky `12 345 Kč`, česká data.
- Testy: `packages/core/src/export/*.test.ts`, `tests/exports-center.int.test.ts`, `apps/web/e2e-crawl/exporty-seznamy.crawl.spec.ts` (stažený soubor se rozbalí a obsah se zkontroluje).

## 2. Fronta, Moje exporty, expirace

Nad `exports.syncMaxRows` (5 000; PDF 1 500) nebo na vyžádání se export zařadí (úloha `export.run`, odpověď 202). Worker ho provede **s aktuálními oprávněními uživatele** (kdo přišel o právo, dostane chybu),
uloží soubor (`exports/<id>.<přípona>` v úložišti), pošle upozornění a v **Nastavení → Exporty → Moje exporty** je ke stažení do `exports.retentionDays` dní (7). Denní úklid (`export.cleanup`) soubor smaže a záznam označí „Vypršelo“;
záznamy o exportech (kdo, co, kolik řádků, filtry) zůstávají. Soubor stáhne jen autor. Správce exportů (`exports.manage`) vidí historii všech, ne cizí data. Bez workeru zůstává export „Ve frontě“ a po 2 hodinách se označí jako neúspěšný.

## 3. Šablony a plánované exporty

**Šablona** = formát, rozsah, sloupce, filtry/řazení, název souboru; osobní nebo sdílená. V seznamu ji vybereš v exportním dialogu, nebo z Nastavení → Exporty → Šablony („Použít“).
**Plán** (`exports.schedule`): denně / týdně / měsíčně (den 1–28 nebo poslední) v zadaný čas v **Europe/Prague**, příjemci, doručení (e-mailem / do Moje exporty / obojí).

- **Příjemci jen interní uživatelé s právem na data** (kontrola při uložení i při každém spuštění; kdo právo ztratí, se přeskočí a plán to zapíše do stavu). **Každý příjemce dostane export podle svých oprávnění**, ne podle práv autora plánu.
- **Idempotence:** worker (`export.schedule.tick`, každých 5 min) bere splatné plány s `FOR UPDATE SKIP LOCKED`, posune `next_run_at` ve stejné transakci a běh má klíč (plán, příjemce, perioda `2026-10-09` / `2026-W41` / `2026-10`) s unikátním indexem: opakování ani souběh workerů export nezdvojí. Po výpadku se zameškané periody nedohánějí.
- **E-mail:** příloha do 8 MB, jinak odkaz; v zápatí odkaz „Odhlásit se z tohoto plánovaného exportu“ (`/nastaveni/exporty?plan=<id>`). Plán zastaví autor nebo správce; příjemce se odhlásí sám.
- **Log běhů:** záznamy `export_run` (zdroj „plán“) a `last_status` plánu.

## 4. Exporty z nástěnek

- **Widget → CSV / XLSX:** nabídka ⋯ widgetu; stahují se přesně data, která widget ukazuje (částky jako částky, data jako data).
- **Nástěnka → PDF** (snímek pro poradu: hlavička klienta, filtry, widgety; KPI v řadě, grafy jako tabulky s pruhy) a **PNG** (v prohlížeči). Bez těžkých závislostí (pdfmake už v repu je, PNG přes SVG `foreignObject`).
- Obsah se vždy počítá znovu s oprávněními přihlášeného; export se eviduje (`export_run`, audit `export`).

## 5. Účetní exporty (Fakturace → Export pro účetní)

Oprávnění `fakturace.export`, rozsah „jen moje“ se respektuje.

| Export            | Co obsahuje                                                                                                       | Cesta                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **ISDOC 6.0.2**   | jeden doklad (vydaný i přijatý) jako `.isdoc`                                                                     | `GET /api/fakturace/<id>/isdoc`                                                |
| ISDOC za období   | ZIP s `.isdoc` vydaných (a přijatých) faktur                                                                      | `POST /api/fakturace/isdoc` (`kind`: issued/received/all, `basis`: issue/duzp) |
| **Podklady DPH**  | řádky vydaných i přijatých dokladů po sazbách (základ, DPH, celkem; PDP zvlášť), souhrn po sazbách; CSV nebo XLSX | `POST /api/fakturace/dph` (`format`, `basis`)                                  |
| **Balík dokladů** | ZIP: PDF vydaných, skeny přijatých, souhrn (XLSX nebo CSV) a volitelně `isdoc/` a `dph-podklady`                  | `POST /api/fakturace/export` (`isdoc`, `vatReport`, `receivedFiles`, `basis`)  |

ISDOC: kořen `Invoice` (`xmlns` `http://isdoc.cz/namespace/2013`, `version="6.0.2"`), `DocumentType` 1 faktura / 2 opravný doklad (dobropis) / 4 zálohová, řádky z dokladu, DPH po sazbách, částky v Kč s tečkou,
platební údaje (účet, IBAN, VS), přenesená daňová povinnost (`LocalReverseChargeFlag`, sazba 0, text § 92a v poznámce). Generátor je čistý string builder s escapováním XML; testy kontrolují pořadí a povinnost prvků, součty a dobře utvářenost
(`packages/modules/fakturace/src/export/isdoc.test.ts`). **Proti oficiálnímu XSD ISDOC nebyl ověřen** (soubor v repu není, bez sítě); nejistá místa (`TaxCategory`, `Details`, adresa `BuildingNumber`) jsou v [OPEN-QUESTIONS](OPEN-QUESTIONS.md).
Cizí měna se nepřepočítává (kurz systém nezná). Zálohové faktury nejsou v podkladech DPH. Stropy: 500 dokladů na druh.

## 6. Nastavení klienta

```ts
exports: { enabled: true, csvDelimiter: ";", scheduled: true, syncMaxRows: 5000, retentionDays: 7 },
```

`enabled: false` vypne exportní dialog, Moje exporty a plány; `scheduled: false` jen plány. Oddělovač CSV lze přepsat v Nastavení → Exporty (`settings.manage`).
Oprávnění: `exports.schedule` (plány, sdílení šablon), `exports.manage` (historie všech, zastavení cizích plánů).
