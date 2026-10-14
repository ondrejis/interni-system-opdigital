# Modul Docházka (dochazka)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Píchačka (příchod, odchod, přestávka), týdenní výkazy hodin na zakázky, schvalování, uzávěrka měsíce, přehledy a připomínka.

- **Identifikátor:** `dochazka`, ikona `clock`
- **Závisí na:** žádném modulu
- **Balíček:** `packages/modules/dochazka`
- **Vyprávěcí dokumentace:** [docs/moduly/dochazka.md](../../moduly/dochazka.md)
- **Příkazy:** [16 příkazů](../prikazy/dochazka.md)
- **Entity:** [`time_entry`](../entity/dochazka.md#time_entry)
- **Databáze:** [tabulky a migrace](../databaze/dochazka.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Docházka | `/dochazka` | `clock` | `dochazka.own` nebo `dochazka.read` | Provoz |  |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/dochazka` | Docházka | `dochazka.own` nebo `dochazka.read` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `dochazka.own` | Zapisuje svou docházku |  |
| `dochazka.read` | Vidí docházku | Rozsah „vše“ = docházka všech, „jen moje“ = vlastní záznamy v seznamech |
| `dochazka.approve` | Schvaluje docházku | Také zapisuje za ostatní |
| `dochazka.close_month` | Uzavírá měsíc |  |

## Serverová část

### Úlohy na pozadí

| Úloha | Plán (cron) | Opakování po chybě | Popis |
| --- | --- | --- | --- |
| `dochazka.reminder` | `30 17 * * 1-5` | 1 |  |
| `dochazka.missing_clock_in` | `30 8 * * 1-5` | 1 |  |
| `dochazka.forgot_clock_out` | `*/30 6-21 * * *` | 1 |  |

Souhrn všech úloh: [udalosti-a-ulohy.md](../udalosti-a-ulohy.md).

### Vrstvy kalendáře

| Klíč | Název | Barva |
| --- | --- | --- |
| `dochazka.absence` | Absence | `yellow` |

### Poskytovatelé dat

Poskytovatelé jsou funkce, jejichž výstup (položky, dlaždice, hodnoty) závisí na datech a oprávnění uživatele, proto se z kódu nedají vyjmenovat. Počty: položky „Vyžaduje pozornost“: 1 poskytovatelů; dlaždice přehledu: 1 poskytovatelů.

### dashboardMetrics

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| key | label | description | format | shape | permissions | params | compute |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `dochazka.hours` | `Odpracované hodiny` | `Odpracovaná doba v období (práce, cesty, dílna, administrativa; bez dovolené a nemoci). Lze zúžit na zakázku nebo osobu.` | `minutes` | `scalar` | `dochazka.read` | pole (1) | funkce |
| `dochazka.hours_by` | `Odpracované hodiny podle…` | `Odpracovaná doba rozdělená podle osoby, zakázky nebo času (den, týden, měsíc). Zakázky mimo váš rozsah jsou sloučené do „Jiné zakázky“. Bez peněz.` | `minutes` | `series` | `dochazka.read` | pole (2) | funkce |
| `dochazka.utilization` | `Využití lidí` | `Po osobách: odpracovaná doba děleno fondem pracovní doby v období (pracovní dny bez svátků × hodin denně × úvazek). Fond se počítá jen do dneška. Bez zvoleného období se bere tento měsíc.` | `percent` | `series` | `dochazka.read` | pole (1) | funkce |
| `dochazka.labour_cost` | `Náklady na práci` | `Odpracované hodiny × hodinový náklad zaměstnance v době zápisu (bez dovolené a nemoci). Vyžaduje právo vidět údaje zaměstnanců.` | `money` | `scalar` | `dochazka.read`, `employees.read` | pole (1) | funkce |

## Nastavení

Nastavení uložená v tabulce `setting` (klíč → JSON), která správce mění v administraci. Tajná pole se ukládají šifrovaně.

### dochazka

Pravidla docházky: pracovní doba, schvalování, výchozí náklad hodiny, připomínka. Definice: `packages/modules/dochazka/src/settings.ts`.

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis | Výchozí hodnota v kódu |
| --- | --- | --- | --- | --- | --- | --- |
| `hoursPerDay` | číslo | ano |  | hodnota 1–24 |  | `8` |
| `workDays` | pole (celé číslo) | ano |  | počet 1–7 |  | `[1,2,3,4,5]` |
| `requireApproval` | ano/ne | ano |  |  |  | `true` |
| `defaultHourlyCostMinor` | celé číslo | ano |  | hodnota 0–10000000 |  | `25000` |
| `reminder` | ano/ne | ano |  |  |  | `true` |

## Další vlastnosti manifestu

### notifications

| key | label | description | group | severity | recipients | access | dedupe | scheduled | snooze |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `time.submitted` | `Docházka ke schválení` | `Někdo odeslal týdenní výkaz hodin ke schválení.` | `Docházka` | `normal` | `perm:dochazka.approve` | `dochazka.approve` |  |  |  |
| `time.approved` | `Docházka schválena` | `Vedoucí schválil váš týdenní výkaz hodin.` | `Docházka` | `normal` | `person` | `dochazka.own`, `dochazka.approve` |  |  |  |
| `time.returned` | `Docházka vrácena k opravě` | `Vedoucí vám vrátil týdenní výkaz hodin s poznámkou, co opravit.` | `Docházka` | `normal` | `person` | `dochazka.own`, `dochazka.approve` |  |  |  |
| `time.reminder` | `Připomínka docházky` | `Odpoledne vám přijde připomínka, když jste dnes ještě nezapsali žádnou docházku.` | `Docházka` | `normal` | `person` | `dochazka.own` | `day` | `true` | `true` |
| `dochazka.missing_clock_in` | `Chybějící příchod` | `V pracovní den kolem půl deváté ráno vám přijde upozornění, když nemáte zapsaný příchod ani absenci.` | `Docházka` | `normal` | `person` | `dochazka.own` | `day` | `true` | `true` |
| `dochazka.forgot_clock_out` | `Zapomenutý odchod` | `Píchačka vám běží od dřívějška, přes noc nebo příliš dlouho: upozornění, ať zaznamenáte odchod.` | `Docházka` | `urgent` | `person` | `dochazka.own` | `day` | `true` | `true` |
| `dochazka.forgot_clock_out_team` | `Zapomenutý odchod (vedoucí)` | `Někomu běží píchačka od předchozího dne. Dostanou ho schvalovatelé, kteří vidí docházku všech.` | `Docházka` | `normal` | `approver` | `dochazka.approve` | `day` | `true` |  |

## Tabulky entit

| Entita | Tabulka |
| --- | --- |
| `time_entry` | `time_entry` |
