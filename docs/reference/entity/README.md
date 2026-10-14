# Entity

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registry entit všech modulů). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Entity jsou záznamy, které engine umí zobrazit, filtrovat, řadit, exportovat a hlídat oprávněními. Každý modul má svůj soubor.

| Klíč | Název | Modul | Tabulka | Počet polí |
| --- | --- | --- | --- | --- |
| [`company`](kontakty.md#company) | Firma | kontakty | `company` | 15 |
| [`person`](kontakty.md#person) | Osoba | kontakty | `person` | 11 |
| [`job`](zakazky.md#job) | Zakázka | zakazky | `job` | 39 |
| [`inquiry`](poptavky.md#inquiry) | Poptávka | poptavky | `inquiry` | 19 |
| [`crm_activity`](poptavky.md#crm_activity) | Aktivita | poptavky | `crm_activity` | 15 |
| [`crm_note`](poptavky.md#crm_note) | Poznámka | poptavky | `crm_note` | 4 |
| [`crm_activity_type`](poptavky.md#crm_activity_type) | Typ aktivity | poptavky | `crm_activity_type` | 6 |
| [`time_entry`](dochazka.md#time_entry) | Záznam docházky | dochazka | `time_entry` | 8 |
| [`event`](kalendar.md#event) | Událost | kalendar | `event` | 10 |
| [`calendar_resource`](kalendar.md#calendar_resource) | Zdroj | kalendar | `calendar_resource` | 4 |
