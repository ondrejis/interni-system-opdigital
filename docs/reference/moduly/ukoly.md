# Modul Úkoly a poznámky (ukoly)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Úkoly (včetně hovorů, schůzek a termínů) s rychlým zadáním, podúkoly a poznámky s formátovaným textem navázané na obchody, klienty, kontakty a zakázky.

- **Identifikátor:** `ukoly`, ikona `check-square`
- **Závisí na:** žádném modulu
- **Balíček:** `packages/modules/ukoly`
- **Vyprávěcí dokumentace:** [docs/moduly/ukoly.md](../../moduly/ukoly.md)
- **Příkazy:** [26 příkazů](../prikazy/ukoly.md)
- **Entity:** [`task`](../entity/ukoly.md#task), [`note`](../entity/ukoly.md#note), [`task_type`](../entity/ukoly.md#task_type)
- **Databáze:** [tabulky a migrace](../databaze/ukoly.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Moje úkoly | `/ukoly` | `check-square` | `ukoly.read` | Práce |  |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/ukoly` | Moje úkoly | `ukoly.read` | ano |
| `/ukoly/typy` | Typy aktivit | `ukoly.types` | ano |
| `/poznamky/samostatne` | Poznámky | `ukoly.read` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `ukoly.read` | Vidí úkoly a poznámky | Rozsah „jen moje“ = jen přidělené a vlastní |
| `ukoly.create` | Zakládá úkoly a poznámky |  |
| `ukoly.write` | Upravuje úkoly a poznámky |  |
| `ukoly.delete` | Maže úkoly a poznámky | Do koše; obnovit smí každý své |
| `ukoly.types` | Spravuje typy úkolů |  |

## Rozšíření uživatelského rozhraní

Modul doplňuje obecný detail záznamu (viz [ARCHITECTURE](../../ARCHITECTURE.md)). Podmíněné záložky a karty se ukazují jen u záznamů, pro které funkce `visible` vrátí `true`.

### Záložky na detailu záznamu

| Entita | Záložka | Název | Oprávnění | Skupina | Pořadí | Podmíněná |
| --- | --- | --- | --- | --- | --- | --- |
| `company` | `ukoly` | Úkoly a aktivity | `ukoly.read` |  | 50 |  |
| `company` | `poznamky` | Poznámky | `ukoly.read` |  | 60 |  |
| `deal` | `ukoly` | Úkoly a aktivity | `ukoly.read` |  | 50 |  |
| `deal` | `poznamky` | Poznámky | `ukoly.read` |  | 60 |  |
| `job` | `ukoly` | Úkoly a aktivity | `ukoly.read` |  | 50 |  |
| `job` | `poznamky` | Poznámky | `ukoly.read` |  | 60 |  |
| `person` | `ukoly` | Úkoly a aktivity | `ukoly.read` |  | 50 |  |
| `person` | `poznamky` | Poznámky | `ukoly.read` |  | 60 |  |

### Akce v hlavičce detailu

| Entita | Akce | Název | Oprávnění | Hlavní | Okno |
| --- | --- | --- | --- | --- | --- |
| `company` | `ukoly-new` | Nový úkol | `ukoly.create` |  | ano |
| `company` | `note.new` | Nová poznámka | `ukoly.create` |  | ano |
| `deal` | `ukoly-new` | Nový úkol | `ukoly.create` |  | ano |
| `deal` | `note.new` | Nová poznámka | `ukoly.create` |  | ano |
| `job` | `ukoly-new` | Nový úkol | `ukoly.create` |  | ano |
| `job` | `note.new` | Nová poznámka | `ukoly.create` |  | ano |
| `person` | `ukoly-new` | Nový úkol | `ukoly.create` |  | ano |
| `person` | `note.new` | Nová poznámka | `ukoly.create` |  | ano |

### Karty na přehledu záznamu

| Entita | Karta | Sloupec | Pořadí | Oprávnění | Podmíněná |
| --- | --- | --- | --- | --- | --- |
| `company` | `ukoly` | main | 40 | `ukoly.read` |  |
| `deal` | `ukoly` | main | 40 | `ukoly.read` |  |
| `job` | `ukoly` | main | 40 | `ukoly.read` |  |
| `note` | `note-body` | main | 0 | `ukoly.read` |  |
| `person` | `ukoly` | main | 40 | `ukoly.read` |  |

Základní záložky, které modul u entity skrývá: `company`: `tasks`; `deal`: `tasks`; `job`: `tasks`; `person`: `tasks`.

### paletteActions

_Tato část UI modulu zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| id | label | keywords | icon | permission | href |
| --- | --- | --- | --- | --- | --- |
| `ukoly.new` | `Nový úkol` | `přidat úkol hovor schůzka termín` | `check-square` | `ukoly.create` | `/ukoly?novy=1` |
| `ukoly.note.new` | `Nová poznámka` | `poznámka zápis note nová` | `file-text` | `ukoly.create` | `/poznamky/samostatne?nova=1` |
| `ukoly.note.list` | `Poznámky` | `poznámky samostatné zápisy notes` | `file-text` | `ukoly.read` | `/poznamky/samostatne` |

## Serverová část

### Vrstvy kalendáře

| Klíč | Název | Barva |
| --- | --- | --- |
| `ukoly` | Úkoly s termínem | `#6366f1` |

### Poskytovatelé dat

Poskytovatelé jsou funkce, jejichž výstup (položky, dlaždice, hodnoty) závisí na datech a oprávnění uživatele, proto se z kódu nedají vyjmenovat. Počty: položky „Vyžaduje pozornost“: 1 poskytovatelů; dlaždice přehledu: 1 poskytovatelů.

### dashboardMetrics

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| key | label | description | format | shape | permissions | compute |
| --- | --- | --- | --- | --- | --- | --- |
| `ukoly.today` | `Úkoly na dnes` | `Otevřené úkoly přidělené uživateli s termínem dnes.` | `number` | `scalar` | `ukoly.read` | funkce |
| `ukoly.overdue` | `Úkoly po termínu` | `Otevřené úkoly přidělené uživateli, které jsou po termínu.` | `number` | `scalar` | `ukoly.read` | funkce |
| `ukoly.open` | `Otevřené úkoly` | `Všechny otevřené úkoly přidělené uživateli (i bez termínu).` | `number` | `scalar` | `ukoly.read` | funkce |

### ensure

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 1. `ensureTaskTypes`

### services

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 1. `createTasksService`

### contributions

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 1. `pole (2)`

### eventHandlers

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 2. `pole (1)`, `pole (1)`

### navBadges

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| href | tone | count |
| --- | --- | --- |
| `/ukoly` | `danger` | funkce |

### privatePaths

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| name | run |
| --- | --- |
| `ukoly.metric.today` | funkce |
| `ukoly.metric.overdue` | funkce |
| `ukoly.metric.open` | funkce |
| `ukoly.widget.today` | funkce |
| `ukoly.attention` | funkce |
| `ukoly.navBadge` | funkce |
| `ukoly.calendarLayer` | funkce |
| `ukoly.service.overdueJobIds` | funkce |
| `ukoly.clientCard.summary` | funkce |
| `ukoly.dealActivity` | funkce |
| `ukoly.notes.list` | funkce |
| `ukoly.notes.clientCard` | funkce |
| `ukoly.notes.search` | funkce |

## Tabulky entit

| Entita | Tabulka |
| --- | --- |
| `task` | `task` |
| `note` | `note` |
| `task_type` | `task_type` |
