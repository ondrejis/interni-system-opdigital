# Modul Finance (finance)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Platby zakázek a jejich rozdělení mezi dvě IČO, retainery, vyrovnání mezi partnery (saldo) a přehledy příjmů.

- **Identifikátor:** `finance`, ikona `wallet`
- **Závisí na:** [`zakazky`](zakazky.md)
- **Balíček:** `packages/modules/finance`
- **Vyprávěcí dokumentace:** [docs/moduly/finance.md](../../moduly/finance.md)
- **Příkazy:** [25 příkazů](../prikazy/finance.md)
- **Entity:** [`payment`](../entity/finance.md#payment), [`settlement`](../entity/finance.md#settlement)
- **Databáze:** [tabulky a migrace](../databaze/finance.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Platby a rozdělení | `/finance` | `wallet` | `finance.read` | Finance |  |
| Vyrovnání | `/finance/vyrovnani` | `scale` | `finance.read` | Finance |  |
| Přehledy | `/finance/prehledy` | `chart-column` | `finance.read` | Finance |  |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/finance` | Platby a rozdělení | `finance.read` | ano |
| `/finance/vyrovnani` | Vyrovnání | `finance.read` | ano |
| `/finance/prehledy` | Přehledy | `finance.read` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `finance.read` | Vidí platby a přehledy financí | Partner vidí jen sdílené zakázky |
| `finance.payments_write` | Zapisuje a upravuje platby | Vystavení, úhrada, storno, retainery |
| `finance.splits_edit` | Upravuje rozdělení plateb | Pravidla rozdělení mezi Ondřeje a Patrika |
| `finance.settlements_write` | Zapisuje vyrovnání | Vzájemné vyrovnání (fakturou, převodem, zápočtem) |
| `finance.export` | Exportuje platby a přehledy |  |
| `finance.settings` | Spravuje nastavení financí | Základ salda a výchozí rozdělení |

## Rozšíření uživatelského rozhraní

Modul doplňuje obecný detail záznamu (viz [ARCHITECTURE](../../ARCHITECTURE.md)). Podmíněné záložky a karty se ukazují jen u záznamů, pro které funkce `visible` vrátí `true`.

### Záložky na detailu záznamu

| Entita | Záložka | Název | Oprávnění | Skupina | Pořadí | Podmíněná |
| --- | --- | --- | --- | --- | --- | --- |
| `company` | `finance` | Finance | `finance.read` |  | 70 |  |
| `job` | `finance` | Finance | `finance.read` |  | 70 |  |

### paletteActions

_Tato část UI modulu zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| id | label | keywords | icon | permission | href |
| --- | --- | --- | --- | --- | --- |
| `finance.payment.new` | `Zapsat platbu` | `platba faktura finance zaplaceno` | `wallet` | `finance.payments_write` | `/finance?nova=1` |
| `finance.settlement.new` | `Zapsat vyrovnání` | `vyrovnání saldo dluh finance` | `scale` | `finance.settlements_write` | `/finance/vyrovnani?zapsat=1` |

### slots

_Tato část UI modulu zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 2. `job.header.extra`, `job.create.extras`

## Serverová část

### Úlohy na pozadí

| Úloha | Plán (cron) | Opakování po chybě | Popis |
| --- | --- | --- | --- |
| `finance.retainer.generate` | `0 5 1 * *` | 5 | Měsíční úloha: každý 1. v 5:00 založí plánované platby „Retainer MM/RRRR“ (ZAK-15); idempotentní. |
| `finance.retainer.catchup` | `30 5 * * *` | 3 | Denní záloha téže úlohy: dožene zameškaný měsíc (výpadek, pozdní spuštění). Výsledek je stejný, nic se nezdvojí. |

Souhrn všech úloh: [udalosti-a-ulohy.md](../udalosti-a-ulohy.md).

### Poskytovatelé dat

Poskytovatelé jsou funkce, jejichž výstup (položky, dlaždice, hodnoty) závisí na datech a oprávnění uživatele, proto se z kódu nedají vyjmenovat. Počty: položky „Vyžaduje pozornost“: 1 poskytovatelů; dlaždice přehledu: 1 poskytovatelů.

### dashboardMetrics

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| key | label | description | format | shape | permissions | params | compute |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `finance.income_month` | `Příjmy tento měsíc` | `Součet plateb zaplacených v období (výchozí aktuální měsíc); „můj podíl“ počítá jen podíl přihlášeného.` | `money` | `scalar` | `finance.read` | pole (1) | funkce |
| `finance.income_month_issued` | `Příjmy tento měsíc: vystaveno` | `Podíl přihlášeného na platbách vystavených v období (výchozí aktuální měsíc), ještě nezaplacených.` | `money` | `scalar` | `finance.read` |  | funkce |
| `finance.income_month_planned` | `Příjmy tento měsíc: plánováno` | `Podíl přihlášeného na plánovaných platbách s termínem v období (výchozí aktuální měsíc).` | `money` | `scalar` | `finance.read` |  | funkce |
| `finance.unpaid_soon` | `Platby blízko splatnosti` | `Součet vystavených nezaplacených plateb, které jsou splatné v následujících dnech (výchozí 7).` | `money` | `scalar` | `finance.read` | pole (1) | funkce |
| `finance.balance` | `Saldo vyrovnání` | `Kolik partner dluží vám (kladné), nebo vy partnerovi (záporné); soukromé zakázky se nepočítají.` | `money` | `scalar` | `finance.read` |  | funkce |
| `finance.unpaid` | `Nezaplacené platby` | `Součet vystavených a dosud nezaplacených plateb.` | `money` | `scalar` | `finance.read` |  | funkce |
| `finance.unpaid_count` | `Nezaplacené platby (počet)` | `Počet vystavených a dosud nezaplacených plateb.` | `number` | `scalar` | `finance.read` |  | funkce |
| `finance.overdue_count` | `Platby po splatnosti` | `Počet vystavených plateb po splatnosti.` | `number` | `scalar` | `finance.read` |  | funkce |
| `finance.retainers` | `Retainery (měsíčně)` | `Součet měsíčních částek aktivních retainerů na běžících zakázkách.` | `money` | `scalar` | `finance.read` |  | funkce |
| `finance.retainers_count` | `Aktivní retainery` | `Počet aktivních retainerů.` | `number` | `scalar` | `finance.read` |  | funkce |
| `finance.income_by_person` | `Příjmy podle osoby po měsících` | `Podíly z plateb zaplacených v roce (rok z konce období, výchozí letošní), po měsících.` | `money` | `series` | `finance.read` | pole (1) | funkce |
| `finance.income_by_type` | `Příjmy podle typu zakázky` | `Zaplacené platby v roce podle typu zakázky.` | `money` | `series` | `finance.read` | pole (1) | funkce |
| `finance.top_clients` | `Nejlepší klienti` | `Klienti s nejvyšším zaplaceným objemem v roce.` | `money` | `series` | `finance.read` | pole (1) | funkce |

### services

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 1. `createFinanceService`

### contributions

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 1. `pole (1)`

### eventHandlers

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 1. `pole (1)`

### navBadges

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| href | tone | count |
| --- | --- | --- |
| `/finance` | `danger` | funkce |

### privatePaths

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| name | run |
| --- | --- |
| `finance.income_month` | funkce |
| `finance.income_month_issued` | funkce |
| `finance.income_month_planned` | funkce |
| `finance.unpaid_soon` | funkce |
| `finance.balance` | funkce |
| `finance.unpaid` | funkce |
| `finance.unpaid_count` | funkce |
| `finance.overdue_count` | funkce |
| `finance.retainers` | funkce |
| `finance.retainers_count` | funkce |
| `finance.income_by_person` | funkce |
| `finance.income_by_type` | funkce |
| `finance.top_clients` | funkce |
| `finance.widgets` | funkce |
| `finance.attention` | funkce |
| `finance.navBadge.overdue` | funkce |
| `finance.clientCard.tabCounts` | funkce |
| `finance.balance.view` | funkce |
| `finance.reports` | funkce |

## Nastavení

Nastavení uložená v tabulce `setting` (klíč → JSON), která správce mění v administraci. Tajná pole se ukládají šifrovaně.

### finance.balance_basis

Nastavení „z čeho se počítá saldo“ (`finance.balance_basis`): zaplacené platby (výchozí), nebo už vystavené. Definice: `packages/modules/finance/src/data/settings.ts`.

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis | Výchozí hodnota v kódu |
| --- | --- | --- | --- | --- | --- | --- |
| `basis` | enum | ano | `paid`, `issued` |  |  | `"paid"` |

### finance.default_split

Výchozí rozdělení nových zakázek (`finance.default_split`); `null` = nenastaveno, odvodí se 50/50. Definice: `packages/modules/finance/src/data/settings.ts`.

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis | Výchozí hodnota v kódu |
| --- | --- | --- | --- | --- | --- | --- |
| `rules` | pole objektů (nebo null) | ano |  |  |  | `null` |
| `rules[].userId` | uuid | ano |  |  |  |  |
| `rules[].mode` | enum | ano | `percent`, `fixed_per_payment`, `fixed_total` |  |  |  |
| `rules[].percent` | číslo | ne |  | hodnota 0–100 |  |  |
| `rules[].fixedMinor` | celé číslo | ne |  | hodnota ≥ 0 |  |  |
| `rules[].appliesTo` | konstanta \| enum | ano | `all`, `one_off`, `intro`, `retainer`, `extra`, `recurring` |  |  |  |
| `rules[].validFrom` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |  |
| `rules[].validTo` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |  |

## Tabulky entit

| Entita | Tabulka |
| --- | --- |
| `payment` | `payment` |
| `settlement` | `settlement` |
