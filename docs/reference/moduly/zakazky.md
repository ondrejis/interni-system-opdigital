# Modul Zakázky (zakazky)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Zakázky typu web, marketing a systémy: fáze, tým, šablony s úkoly a platbami, stav a termíny; zakládají se z vyhraných obchodů nebo ručně.

- **Identifikátor:** `zakazky`, ikona `briefcase`
- **Závisí na:** [`kontakty`](kontakty.md)
- **Balíček:** `packages/modules/zakazky`
- **Vyprávěcí dokumentace:** [docs/moduly/zakazky.md](../../moduly/zakazky.md)
- **Příkazy:** [25 příkazů](../prikazy/zakazky.md)
- **Entity:** [`job`](../entity/zakazky.md#job), [`job_template`](../entity/zakazky.md#job_template)
- **Databáze:** [tabulky a migrace](../databaze/zakazky.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Zakázky | `/zakazky` | `briefcase` | `zakazky.read` | Realizace |  |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `zakazky.read` | Vidí zakázky |  |
| `zakazky.create` | Zakládá zakázky |  |
| `zakazky.write` | Upravuje zakázky |  |
| `zakazky.delete` | Maže zakázky | Do koše; obnovit smí každý své |
| `zakazky.export` | Exportuje zakázky |  |
| `zakazky.templates` | Spravuje šablony zakázek |  |
| `zakazky.finance` | Vidí hodnotu a finance zakázek | Přechodné oprávnění z původního jádra; ceny zakázek řídí `finance.read` |

## Výchozí data (seed)

Doplní se při seedu klienta, jen když modul běží; co správce změnil v administraci, se nepřepisuje.

### Číselné řady

| Klíč | Vzor | Nulování |
| --- | --- | --- |
| `zakazky.cislo` | `Z-{YYYY}-{NNN}` |  |

## Rozšíření uživatelského rozhraní

Modul doplňuje obecný detail záznamu (viz [ARCHITECTURE](../../ARCHITECTURE.md)). Podmíněné záložky a karty se ukazují jen u záznamů, pro které funkce `visible` vrátí `true`.

### Záložky na detailu záznamu

| Entita | Záložka | Název | Oprávnění | Skupina | Pořadí | Podmíněná |
| --- | --- | --- | --- | --- | --- | --- |
| `job` | `ukoly` | Úkoly |  |  | 10 |  |
| `job` | `historie` | Historie |  |  | 700 |  |

### Akce v hlavičce detailu

| Entita | Akce | Název | Oprávnění | Hlavní | Okno |
| --- | --- | --- | --- | --- | --- |
| `job` | `complete-job` | Dokončit zakázku | `zakazky.write` |  | ano |
| `job` | `cancel-job` | Zrušit zakázku | `zakazky.write` |  | ano |
| `job` | `save-as-template` | Uložit jako šablonu | `zakazky.templates` |  | ano |

### Karty na přehledu záznamu

| Entita | Karta | Sloupec | Pořadí | Oprávnění | Podmíněná |
| --- | --- | --- | --- | --- | --- |
| `job` | `phases` | main | 10 |  |  |
| `job` | `deal` | main | 20 |  |  |
| `job` | `team` | side | 10 |  |  |
| `job` | `participants` | side | 20 |  |  |

Vlastní hlavičku detailu (pás pod názvem) mají entity: `job`.

Základní záložky, které modul u entity skrývá: `job`: `tasks`, `activity`.

### paletteActions

_Tato část UI modulu zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| id | label | keywords | icon | permission | href |
| --- | --- | --- | --- | --- | --- |
| `zakazky.new` | `Nová zakázka` | `zakázka vytvořit založit projekt` | `briefcase` | `zakazky.create` | `/zakazky?novy=1` |
| `zakazky.board` | `Board zakázek podle stavu` | `kanban zakázky` | `briefcase` | `zakazky.read` | `/zakazky?pohled=stav` |
| `zakazky.phases` | `Board zakázek podle fází` | `kanban fáze zakázky` | `briefcase` | `zakazky.read` | `/zakazky/faze` |
| `zakazky.templates` | `Šablony zakázek` | `šablona nastavení` | `briefcase` | `zakazky.read` | `/zakazky/sablony` |

## Serverová část

### Blokace smazání

| Blokace | Mazaná entita | Navázané záznamy (1 / 2–4 / 5+) | Doporučení |
| --- | --- | --- | --- |
| `zakazky.company-jobs` | `company` | zakázku / zakázky / zakázek | výchozí |

### Vrstvy kalendáře

| Klíč | Název | Barva |
| --- | --- | --- |
| `zakazky.deadlines` | Termíny zakázek | `orange` |

### Poskytovatelé dat

Poskytovatelé jsou funkce, jejichž výstup (položky, dlaždice, hodnoty) závisí na datech a oprávnění uživatele, proto se z kódu nedají vyjmenovat. Počty: položky „Vyžaduje pozornost“: 1 poskytovatelů; dlaždice přehledu: 1 poskytovatelů.

### dashboardMetrics

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| key | label | description | format | shape | permissions | compute |
| --- | --- | --- | --- | --- | --- | --- |
| `zakazky.slipping` | `Zakázky ve skluzu` | `Živé zakázky po termínu nebo s úkoly po termínu.` | `number` | `scalar` | `zakazky.read` | funkce |
| `zakazky.by_status` | `Zakázky podle stavu` | `Počet zakázek v každém stavu.` | `number` | `series` | `zakazky.read` | funkce |

### ensure

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 1. `ensureDefaultTemplates`

### contributions

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 2. `pole (1)`, `pole (1)`

### privatePaths

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| name | run |
| --- | --- |
| `zakazky.metric.slipping` | funkce |
| `zakazky.metric.by_status` | funkce |
| `zakazky.widgets` | funkce |
| `zakazky.attention` | funkce |
| `zakazky.calendar.deadlines` | funkce |
| `zakazky.board` | funkce |
| `zakazky.clientCard` | funkce |
| `zakazky.emailVars` | funkce |
| `zakazky.api.briefs` | funkce |

## Tabulky entit

| Entita | Tabulka |
| --- | --- |
| `job` | `job` |
| `job_template` | `job_template` |
