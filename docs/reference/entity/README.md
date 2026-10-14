# Entity

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registry entit všech modulů). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Entity jsou záznamy, které engine umí zobrazit, filtrovat, řadit, exportovat a hlídat oprávněními. Každý modul má svůj soubor.

| Klíč | Název | Modul | Tabulka | Počet polí |
| --- | --- | --- | --- | --- |
| [`company`](kontakty.md#company) | Firma | kontakty | `company` | 15 |
| [`person`](kontakty.md#person) | Osoba | kontakty | `person` | 11 |
| [`job`](zakazky.md#job) | Zakázka | zakazky | `job` | 50 |
| [`job_order`](zakazky.md#job_order) | Objednávka | zakazky | `job_order` | 10 |
| [`inquiry`](poptavky.md#inquiry) | Poptávka | poptavky | `inquiry` | 19 |
| [`crm_activity`](poptavky.md#crm_activity) | Aktivita | poptavky | `crm_activity` | 15 |
| [`crm_note`](poptavky.md#crm_note) | Poznámka | poptavky | `crm_note` | 4 |
| [`crm_activity_type`](poptavky.md#crm_activity_type) | Typ aktivity | poptavky | `crm_activity_type` | 6 |
| [`defect`](realizace.md#defect) | Vada | realizace | `defect` | 9 |
| [`invoice`](fakturace.md#invoice) | Faktura | fakturace | `invoice` | 23 |
| [`received_invoice`](fakturace.md#received_invoice) | Přijatá faktura | fakturace | `received_invoice` | 17 |
| [`time_entry`](dochazka.md#time_entry) | Záznam docházky | dochazka | `time_entry` | 8 |
| [`stock_item`](sklad.md#stock_item) | Skladová karta | sklad | `stock_item` | 15 |
| [`warehouse`](sklad.md#warehouse) | Umístění | sklad | `warehouse` | 7 |
| [`stock_doc`](sklad.md#stock_doc) | Skladový doklad | sklad | `stock_doc` | 11 |
| [`purchase_order`](sklad.md#purchase_order) | Objednávka | sklad | `purchase_order` | 8 |
| [`stock_count`](sklad.md#stock_count) | Inventura | sklad | `stock_count` | 5 |
| [`asset`](stroje.md#asset) | Stroj nebo vozidlo | stroje | `asset` | 21 |
| [`asset_defect`](stroje.md#asset_defect) | Závada | stroje | `asset_defect` | 8 |
| [`event`](kalendar.md#event) | Událost | kalendar | `event` | 10 |
| [`calendar_resource`](kalendar.md#calendar_resource) | Zdroj | kalendar | `calendar_resource` | 4 |
