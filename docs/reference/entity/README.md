# Entity

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registry entit všech modulů). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Entity jsou záznamy, které engine umí zobrazit, filtrovat, řadit, exportovat a hlídat oprávněními. Každý modul má svůj soubor.

| Klíč | Název | Modul | Tabulka | Počet polí |
| --- | --- | --- | --- | --- |
| [`company`](kontakty.md#company) | Organizace | kontakty | `company` | 24 |
| [`person`](kontakty.md#person) | Kontakt | kontakty | `person` | 12 |
| [`job`](zakazky.md#job) | Zakázka | zakazky | `job` | 14 |
| [`job_template`](zakazky.md#job_template) | Šablona zakázky | zakazky | `job_template` | 6 |
| [`deal`](obchody.md#deal) | Obchod | obchody | `deal` | 21 |
| [`task`](ukoly.md#task) | Úkol | ukoly | `task` | 23 |
| [`note`](ukoly.md#note) | Poznámka | ukoly | `note` | 7 |
| [`task_type`](ukoly.md#task_type) | Typ úkolu | ukoly | `task_type` | 7 |
| [`time_entry`](hodiny.md#time_entry) | Záznam hodin | hodiny | `time_entry` | 6 |
| [`payment`](finance.md#payment) | Platba | finance | `payment` | 15 |
| [`settlement`](finance.md#settlement) | Vyrovnání | finance | `settlement` | 8 |
| [`ad_account`](reklama.md#ad_account) | Reklamní účet | reklama | `ad_account` | 8 |
| [`ad_campaign`](reklama.md#ad_campaign) | Kampaň | reklama | `ad_campaign` | 6 |
| [`email_template`](sablony-emailu.md#email_template) | Šablona e-mailu | sablony-emailu | `email_template` | 7 |
| [`recurring_service`](muj-prostor.md#recurring_service) | Hosting / údržba | muj-prostor | `recurring_service` | 14 |
| [`web_domain`](muj-prostor.md#web_domain) | Doména | muj-prostor | `web_domain` | 11 |
| [`email_library_item`](muj-prostor.md#email_library_item) | Položka knihovny | muj-prostor | `email_library_item` | 5 |
| [`recurring_invoice`](muj-prostor.md#recurring_invoice) | Opakovaná faktura | muj-prostor | `recurring_invoice` | 8 |
