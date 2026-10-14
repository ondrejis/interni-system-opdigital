# Modul Realizace (realizace)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Harmonogram v pracovních dnech s Ganttem, stavební deník s předvyplněním, předávací protokol s podpisem a vady.

- **Identifikátor:** `realizace`, ikona `hard-hat`
- **Závisí na:** [`zakazky`](zakazky.md)
- **Balíček:** `packages/modules/realizace`
- **Vyprávěcí dokumentace:** [docs/moduly/realizace.md](../../moduly/realizace.md)
- **Příkazy:** [24 příkazů](../prikazy/realizace.md)
- **Entity:** [`defect`](../entity/realizace.md#defect)
- **Databáze:** [tabulky a migrace](../databaze/realizace.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Průběh zakázek | `/realizace` | `gantt` | `realizace.read` |  | `/zakazky` |
| Vady | `/realizace/vady` | `alert-triangle` | `realizace.read` |  | `/zakazky` |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/realizace` | Průběh zakázek | `realizace.read` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `realizace.read` | Vidí realizaci |  |
| `realizace.write` | Zapisuje realizaci | Deník, předávací protokol, vady |

## Výchozí data (seed)

Doplní se při seedu klienta, jen když modul běží; co správce změnil v administraci, se nepřepisuje.

### Pipeline

| Entita | Klíč | Název | Stavy (v pořadí) |
| --- | --- | --- | --- |
| `defect` | `default` | Vady | Nahlášená → V řešení → Opraveno → Uznáno bez opravy → Zamítnuto |

### Číselníky

| Klíč | Název | Hodnoty |
| --- | --- | --- |
| `defect.severity` | Závažnost vady | `minor` (Drobná), `normal` (Běžná), `major` (Závažná) |

### Číselné řady

| Klíč | Vzor | Nulování |
| --- | --- | --- |
| `realizace.predani` | `PP-{YYYY}-{NNN}` |  |

## Dlaždice mobilního terminálu

| Klíč | Název | Oprávnění | Příkazy | Celá obrazovka | Výchozí zapnuto |
| --- | --- | --- | --- | --- | --- |
| `realizace.diary` | Deník | `realizace.write` | `realizace.terminal.note` | ano | ano |
| `realizace.report` | Závada a poznámka | `realizace.write` | `realizace.terminal.defect`, `realizace.terminal.note` | ano | ano |

## Rozšíření uživatelského rozhraní

Modul doplňuje obecný detail záznamu (viz [ARCHITECTURE](../../ARCHITECTURE.md)). Podmíněné záložky a karty se ukazují jen u záznamů, pro které funkce `visible` vrátí `true`.

### Záložky na detailu záznamu

| Entita | Záložka | Název | Oprávnění | Skupina | Pořadí | Podmíněná |
| --- | --- | --- | --- | --- | --- | --- |
| `job` | `harmonogram` | Harmonogram | `realizace.read` | `realizace` | 10 | ano (podle záznamu) |
| `job` | `denik` | Deník | `realizace.read` | `realizace` | 20 | ano (podle záznamu) |
| `job` | `predani` | Předání | `realizace.read` | `realizace` | 30 | ano (podle záznamu) |
| `job` | `vady` | Vady | `realizace.read` | `realizace` | 40 | ano (podle záznamu) |

### Karty na přehledu záznamu

| Entita | Karta | Sloupec | Pořadí | Oprávnění | Podmíněná |
| --- | --- | --- | --- | --- | --- |
| `job` | `schedule` | main | 30 | `realizace.read` | ano (podle záznamu) |
| `job` | `last-diary` | main | 40 | `realizace.read` | ano (podle záznamu) |
| `job` | `open-defects` | main | 45 | `realizace.read` | ano (podle záznamu) |

Vykreslení dlaždic mobilního terminálu (viz tabulka dlaždic výše): `realizace.diary`, `realizace.report`.

## Serverová část

### Úlohy na pozadí

| Úloha | Plán (cron) | Opakování po chybě | Popis |
| --- | --- | --- | --- |
| `realizace.today` | `0 6 * * 1-5` | 1 |  |
| `realizace.phases` | `10 6 * * 1-5` | 1 |  |
| `realizace.diary` | `0 16 * * 1-5` | 1 |  |

Souhrn všech úloh: [udalosti-a-ulohy.md](../udalosti-a-ulohy.md).

### Háčky přechodu fáze

| Háček | Entita | Z fáze | Do fáze | Kontrola | Akce před | Akce po |
| --- | --- | --- | --- | --- | --- | --- |
| `realizace.open-diary` | `job` | `*` | `execution` | ano |  | ano |
| `realizace.handover-check` | `job` | `execution` | `handover` | ano |  |  |
| `realizace.handover-protocol` | `job` | `*` | `handover` |  |  | ano |
| `realizace.signed-protocol` | `job` | `*` | `warranty`, `closed` | ano |  |  |
| `realizace.no-open-defects` | `job` | `*` | `closed` | ano |  |  |

### Vrstvy kalendáře

| Klíč | Název | Barva |
| --- | --- | --- |
| `realizace.phases` | Fáze zakázek | `blue` |

### Poskytovatelé dat

Poskytovatelé jsou funkce, jejichž výstup (položky, dlaždice, hodnoty) závisí na datech a oprávnění uživatele, proto se z kódu nedají vyjmenovat. Počty: položky „Vyžaduje pozornost“: 2 poskytovatelů; dlaždice přehledu: 1 poskytovatelů.

## Další vlastnosti manifestu

### notifications

| key | label | description | group | severity | recipients | entity | mergeWindowSeconds | debounceSeconds | dedupe | access | scheduled | snooze | ttlSeconds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `job.schedule` | `Změna harmonogramu` | `Někdo změnil termíny fáze zakázky (i přetažením v Ganttu) nebo se posunuly navazující fáze. Vedoucí a tým zakázky a odpovědný za fázi. Rychlé změny se sloučí do jednoho upozornění.` | `Realizace` | `normal` | `team`, `extra` | `job` | `900` | `45` |  |  |  |  |  |
| `realizace.phase_added` | `Nová fáze harmonogramu` | `Do harmonogramu zakázky přibyla fáze. Vedoucí a tým zakázky a odpovědný za fázi.` | `Realizace` | `normal` | `team`, `extra` | `job` | `900` | `45` |  |  |  |  |  |
| `realizace.phase_done` | `Fáze dokončena` | `Fáze harmonogramu je hotová (100 %). Vedoucí a tým zakázky a odpovědný za fázi.` | `Realizace` | `normal` | `team`, `extra` | `job` |  |  |  |  |  |  |  |
| `job.diary` | `Zahájena realizace` | `Zakázka přešla do realizace a stavební deník je otevřený. Vedoucí a tým zakázky.` | `Realizace` | `normal` | `team`, `extra` | `job` |  |  |  |  |  |  |  |
| `job.handover` | `Předáno zákazníkovi` | `Předávací protokol zakázky byl podepsán. Vedoucí a tým zakázky.` | `Realizace` | `normal` | `team`, `extra` | `job` |  |  |  |  |  |  |  |
| `defect.new` | `Nová vada` | `Na zakázce byla nahlášena vada. Vedoucí a tým zakázky a ten, kdo má vadu řešit.` | `Vady` | `normal` | `team`, `responsible` | `defect` |  |  | `record` |  |  |  |  |
| `defect.assigned` | `Přidělena vada k řešení` | `Někdo vám přidělil vadu k vyřešení.` | `Vady` | `normal` | `responsible` | `defect` |  |  |  |  |  |  |  |
| `realizace.today` | `Dnes na stavbě` | `Ráno v pracovní den přehled zakázek a fází, které dnes běží a týkají se vás (vedete zakázku, jste v týmu nebo máte fázi na starosti).` | `Realizace` | `normal` | `person` |  |  |  | `day` | `realizace.read` | `true` | `true` | `28800` |
| `realizace.phase_starts` | `Fáze začíná` | `V pracovní den ráno, kdy podle harmonogramu začíná fáze, která ještě nezačala. Odpovědný za fázi a vedoucí a tým zakázky.` | `Realizace` | `normal` | `responsible`, `team` | `job` |  |  | `record` |  | `true` |  | `28800` |
| `realizace.phase_deadline` | `Blíží se konec fáze` | `Fáze podle harmonogramu končí dnes nebo v nejbližší pracovní den a ještě není hotová. Odpovědný za fázi a vedoucí zakázky.` | `Realizace` | `normal` | `responsible`, `manager` | `job` |  |  | `record` |  | `true` | `true` | `28800` |
| `realizace.phase_overdue` | `Fáze po termínu` | `Fáze měla podle harmonogramu skončit a není hotová. Přijde jednou, první pracovní den po termínu. Odpovědný za fázi a vedoucí zakázky.` | `Realizace` | `urgent` | `responsible`, `manager` | `job` |  |  | `record` |  | `true` | `true` | `43200` |
| `realizace.diary_missing` | `Chybí zápis do deníku` | `Odpoledne v pracovní den, když zakázka v realizaci, na které se dnes pracuje, nemá zápis ve stavebním deníku. Vedoucí a tým zakázky.` | `Realizace` | `normal` | `team` | `job` |  |  | `day` | `realizace.read` | `true` | `true` | `14400` |

## Tabulky entit

| Entita | Tabulka |
| --- | --- |
| `defect` | `defect` |
