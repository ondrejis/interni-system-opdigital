# Modul Stroje a vozidla (stroje)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Evidence strojů a vozidel, kniha jízd a motohodiny, tankování se spotřebou, servis a servisní intervaly, termíny STK a pojištění, rezervace s kontrolou kolizí a závady z terénu.

- **Identifikátor:** `stroje`, ikona `truck`
- **Závisí na:** žádném modulu
- **Balíček:** `packages/modules/stroje`
- **Vyprávěcí dokumentace:** [docs/moduly/stroje.md](../../moduly/stroje.md)
- **Příkazy:** [20 příkazů](../prikazy/stroje.md)
- **Entity:** [`asset`](../entity/stroje.md#asset), [`asset_defect`](../entity/stroje.md#asset_defect)
- **Databáze:** [tabulky a migrace](../databaze/stroje.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Stroje a vozidla | `/stroje` | `truck` | `stroje.read` | Provoz |  |
| Evidence strojů | `/stroje/evidence` | `wrench` | `stroje.read` |  | `/stroje` |
| Závady strojů | `/stroje/zavady` | `alert-triangle` | `stroje.read` |  | `/stroje` |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/stroje` | Stroje a vozidla | `stroje.read` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `stroje.read` | Vidí stroje a vozidla | Rozsah „jen moje“ = stroje, za které odpovídá |
| `stroje.log` | Zapisuje jízdy a tankování | Také nahlašuje závady |
| `stroje.write` | Spravuje vozový park | Karty, servis, rezervace, zápisy za ostatní, závady |

## Dlaždice mobilního terminálu

| Klíč | Název | Oprávnění | Příkazy | Celá obrazovka | Výchozí zapnuto |
| --- | --- | --- | --- | --- | --- |
| `stroje.fleet` | Stroje | `stroje.log` nebo `stroje.read` | `stroje.log.save`, `stroje.defect.report` | ano | ano |

## Rozšíření uživatelského rozhraní

Modul doplňuje obecný detail záznamu (viz [ARCHITECTURE](../../ARCHITECTURE.md)). Podmíněné záložky a karty se ukazují jen u záznamů, pro které funkce `visible` vrátí `true`.

### Záložky na detailu záznamu

| Entita | Záložka | Název | Oprávnění | Skupina | Pořadí | Podmíněná |
| --- | --- | --- | --- | --- | --- | --- |
| `asset` | `kniha` | Kniha jízd | `stroje.read` |  |  |  |
| `asset` | `tankovani` | Tankování | `stroje.read` |  |  |  |
| `asset` | `servis` | Servis | `stroje.read` |  |  |  |
| `asset` | `rezervace` | Rezervace | `stroje.read` |  |  |  |
| `asset` | `naklady` | Náklady | `stroje.write` |  |  |  |
| `job` | `stroje` | Stroje | `stroje.read` | `naklady` | 30 |  |

### Akce v hlavičce detailu

| Entita | Akce | Název | Oprávnění | Hlavní | Okno |
| --- | --- | --- | --- | --- | --- |
| `asset` | `log` | Zapsat jízdu | `stroje.log` nebo `stroje.write` | ano | ano |
| `asset` | `defect` | Nahlásit závadu | `stroje.log` nebo `stroje.write` |  | ano |
| `asset_defect` | `resolve` | Vyřešit závadu | `stroje.write` | ano | ano |

Vykreslení dlaždic mobilního terminálu (viz tabulka dlaždic výše): `stroje.fleet`.

## Serverová část

### Úlohy na pozadí

| Úloha | Plán (cron) | Opakování po chybě | Popis |
| --- | --- | --- | --- |
| `stroje.deadlines` | `30 6 * * *` | 1 |  |
| `stroje.reservations` | `0 15 * * *` | 1 |  |

Souhrn všech úloh: [udalosti-a-ulohy.md](../udalosti-a-ulohy.md).

### Vrstvy kalendáře

| Klíč | Název | Barva |
| --- | --- | --- |
| `stroje.rezervace` | Rezervace strojů | `orange` |
| `stroje.terminy` | STK, pojištění a známky | `red` |

### Poskytovatelé nákladů zakázky

- `stroje.machines`

### Poskytovatelé dat

Poskytovatelé jsou funkce, jejichž výstup (položky, dlaždice, hodnoty) závisí na datech a oprávnění uživatele, proto se z kódu nedají vyjmenovat. Počty: položky „Vyžaduje pozornost“: 1 poskytovatelů; dlaždice přehledu: 1 poskytovatelů; předvyplnění stavebního deníku: 1.

### dashboardMetrics

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| key | label | description | format | shape | permissions | compute |
| --- | --- | --- | --- | --- | --- | --- |
| `stroje.utilization` | `Využití strojů` | `Po strojích: motohodiny z knihy provozu děleno dostupnými pracovními hodinami v období (pracovní dny bez svátků × 8 h, jen do dneška). Počítají se stroje měřené v motohodinách; vozidla měřená v km nemají hodiny nasazení. Bez zvoleného období se bere tento měsíc.` | `percent` | `series` | `stroje.read` | funkce |
| `stroje.service_due` | `Stroje s blížícím se termínem` | `Počet strojů a vozidel (bez vyřazených), které mají STK, pojištění, dálniční známku nebo servisní interval po termínu či do 30 dní.` | `number` | `scalar` | `stroje.read` | funkce |

## Další vlastnosti manifestu

### notifications

| key | label | description | group | severity | recipients | entity | scheduled | snooze |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `stroje.deadline` | `Blíží se termín stroje` | `Za 30 dní vyprší STK, ručení nebo známka, nebo se blíží servisní interval. Dostane ho odpovědná osoba a správci vozového parku.` | `Stroje a vozidla` | `normal` | `responsible`, `perm:stroje.write` | `asset` | `true` |  |
| `stroje.deadline_urgent` | `Termín stroje je za dveřmi` | `STK, ručení nebo známka vyprší do týdne nebo už vypršely, nebo je překročený servisní interval. Dostane ho odpovědná osoba a správci vozového parku.` | `Stroje a vozidla` | `urgent` | `responsible`, `perm:stroje.write` | `asset` | `true` | `true` |
| `stroje.fuel` | `Neobvyklá spotřeba` | `Tankování ukázalo spotřebu aspoň o 30 % nad průměrem stroje. Dostanou ho správci vozového parku.` | `Stroje a vozidla` | `normal` | `perm:stroje.write` | `asset` |  |  |
| `stroje.reservation` | `Stroj je pro vás rezervovaný` | `Někdo vám rezervoval stroj nebo vozidlo (nebo rezervaci upravil).` | `Stroje a vozidla` | `normal` | `driver` | `asset` |  |  |
| `stroje.reservation_tomorrow` | `Zítra máte rezervovaný stroj` | `Odpoledne před začátkem rezervace vám připomene, že zítra máte stroj nebo vozidlo.` | `Stroje a vozidla` | `normal` | `driver` | `asset` | `true` |  |
| `stroje.defect` | `Nahlášena závada` | `Někdo z terénu nahlásil závadu stroje. Dostane ji řešitel a odpovědná osoba.` | `Stroje a vozidla` | `normal` | `assignee`, `responsible` | `asset_defect` |  |  |
| `stroje.defect_blocking` | `Stroj mimo provoz` | `Nahlášená závada stroj odstavila z provozu. Dostane ji řešitel, odpovědná osoba a všichni správci vozového parku.` | `Stroje a vozidla` | `urgent` | `assignee`, `responsible`, `perm:stroje.write` | `asset_defect` |  |  |
| `stroje.defect_resolved` | `Závada opravena` | `Závada, kterou jste nahlásili, je vyřešená.` | `Stroje a vozidla` | `normal` | `reporter` | `asset_defect` |  |  |

## Tabulky entit

| Entita | Tabulka |
| --- | --- |
| `asset` | `asset` |
| `asset_defect` | `asset_defect` |
