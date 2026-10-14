# Modul Sklad (sklad)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Materiál na několika umístěních (sklad, dílna, vozidlo, stavba), příjem, výdej na zakázku, převody, vratky, objednávky u dodavatelů, minimální zásoby a inventura.

- **Identifikátor:** `sklad`, ikona `package`
- **Závisí na:** [`kontakty`](kontakty.md)
- **Balíček:** `packages/modules/sklad`
- **Vyprávěcí dokumentace:** [docs/moduly/sklad.md](../../moduly/sklad.md)
- **Příkazy:** [17 příkazů](../prikazy/sklad.md)
- **Entity:** [`stock_item`](../entity/sklad.md#stock_item), [`warehouse`](../entity/sklad.md#warehouse), [`stock_doc`](../entity/sklad.md#stock_doc), [`purchase_order`](../entity/sklad.md#purchase_order), [`stock_count`](../entity/sklad.md#stock_count)
- **Databáze:** [tabulky a migrace](../databaze/sklad.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Sklad | `/sklad` | `package` | `sklad.read` | Provoz |  |
| Skladové karty | `/sklad/karty` | `tag` | `sklad.read` |  | `/sklad` |
| Skladové doklady | `/sklad/doklady` | `file-stack` | `sklad.read` |  | `/sklad` |
| Objednávky | `/sklad/objednavky` | `shopping-cart` | `sklad.read` |  | `/sklad` |
| Inventury | `/sklad/inventury` | `clipboard-list` | `sklad.read` |  | `/sklad` |
| Umístění | `/sklad/umisteni` | `map-pin` | `sklad.read` |  | `/sklad` |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/sklad` | Sklad | `sklad.read` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `sklad.read` | Vidí sklad |  |
| `sklad.issue` | Vydává materiál na zakázky | Výdejky a vratky |
| `sklad.write` | Spravuje sklad | Karty, umístění, příjem, převody, objednávky |
| `sklad.inventory` | Provádí inventuru |  |

## Výchozí data (seed)

Doplní se při seedu klienta, jen když modul běží; co správce změnil v administraci, se nepřepisuje.

### Číselníky

| Klíč | Název | Hodnoty |
| --- | --- | --- |
| `sklad.category` | Kategorie materiálu | `zdivo` (Zdivo a tvárnice), `suche-smesi` (Suché směsi a omítky), `izolace` (Izolace), `obklady` (Obklady a dlažby), `chemie` (Stavební chemie), `instalace` (Instalatérský materiál), `elektro` (Elektroinstalace), `sadrokarton` (Sádrokarton), `rezivo` (Řezivo a deskový materiál), `spojovaci` (Spojovací materiál), `barvy` (Barvy a nátěry), `bozp` (Ochranné pomůcky), `spotrebni` (Spotřební materiál) |
| `sklad.unit` | Jednotky materiálu | `ks` (ks), `m` (m), `m²` (m²), `m³` (m³), `kg` (kg), `t` (t), `l` (l), `bal` (bal), `pal` (pal), `sada` (sada), `role` (role), `pytel` (pytel) |

### Číselné řady

| Klíč | Vzor | Nulování |
| --- | --- | --- |
| `sklad.prijemka` | `PR-{YYYY}-{NNNN}` |  |
| `sklad.vydejka` | `VY-{YYYY}-{NNNN}` |  |
| `sklad.prevodka` | `PV-{YYYY}-{NNNN}` |  |
| `sklad.vratka` | `VR-{YYYY}-{NNNN}` |  |
| `sklad.inventurni-rozdil` | `IN-{YYYY}-{NNNN}` |  |
| `sklad.objednavka` | `OB-{YYYY}-{NNN}` |  |
| `sklad.inventura` | `INV-{YYYY}-{NNN}` |  |

## Dlaždice mobilního terminálu

| Klíč | Název | Oprávnění | Příkazy | Celá obrazovka | Výchozí zapnuto |
| --- | --- | --- | --- | --- | --- |
| `sklad.issue` | Materiál | `sklad.issue` | `sklad.post` | ano | ano |

## Rozšíření uživatelského rozhraní

Modul doplňuje obecný detail záznamu (viz [ARCHITECTURE](../../ARCHITECTURE.md)). Podmíněné záložky a karty se ukazují jen u záznamů, pro které funkce `visible` vrátí `true`.

### Záložky na detailu záznamu

| Entita | Záložka | Název | Oprávnění | Skupina | Pořadí | Podmíněná |
| --- | --- | --- | --- | --- | --- | --- |
| `job` | `material` | Materiál | `sklad.read` | `naklady` | 20 |  |
| `purchase_order` | `polozky` | Položky | `sklad.read` |  |  |  |
| `stock_count` | `pocitani` | Počítání | `sklad.read` |  |  |  |
| `stock_doc` | `polozky` | Položky | `sklad.read` |  |  |  |
| `stock_item` | `stav` | Stav a pohyby | `sklad.read` |  |  |  |
| `warehouse` | `zasoby` | Zásoby | `sklad.read` |  |  |  |

### Akce v hlavičce detailu

| Entita | Akce | Název | Oprávnění | Hlavní | Okno |
| --- | --- | --- | --- | --- | --- |
| `job` | `issue` | Vydat materiál | `sklad.issue` |  | ano |
| `purchase_order` | `receive` | Přijmout zboží | `sklad.write` | ano | ano |
| `purchase_order` | `send` | Označit jako odeslanou | `sklad.write` |  | ano |
| `purchase_order` | `cancel` | Zrušit objednávku | `sklad.write` |  | ano |
| `stock_count` | `close` | Uzavřít inventuru | `sklad.inventory` | ano | ano |

Vykreslení dlaždic mobilního terminálu (viz tabulka dlaždic výše): `sklad.issue`.

## Serverová část

### Blokace smazání

| Blokace | Mazaná entita | Navázané záznamy (1 / 2–4 / 5+) | Doporučení |
| --- | --- | --- | --- |
| `sklad.company-orders` | `company` | skladovou objednávku / skladové objednávky / skladových objednávek | výchozí |
| `sklad.company-docs` | `company` | skladový doklad / skladové doklady / skladových dokladů | výchozí |
| `sklad.company-items` | `company` | skladovou kartu / skladové karty / skladových karet | výchozí |
| `sklad.job-docs` | `job` | skladový doklad / skladové doklady / skladových dokladů | výchozí |
| `sklad.job-orders` | `job` | skladovou objednávku / skladové objednávky / skladových objednávek | výchozí |

### Vrstvy kalendáře

| Klíč | Název | Barva |
| --- | --- | --- |
| `sklad.dodavky` | Dodávky materiálu | `teal` |

### Poskytovatelé nákladů zakázky

- `sklad.material`

### Poskytovatelé dat

Poskytovatelé jsou funkce, jejichž výstup (položky, dlaždice, hodnoty) závisí na datech a oprávnění uživatele, proto se z kódu nedají vyjmenovat. Počty: položky „Vyžaduje pozornost“: 1 poskytovatelů; dlaždice přehledu: 1 poskytovatelů; předvyplnění stavebního deníku: 1.

### dashboardMetrics

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| key | label | description | format | shape | permissions | compute |
| --- | --- | --- | --- | --- | --- | --- |
| `sklad.stock_value` | `Hodnota skladu` | `Součet hodnoty zásob aktivních skladových karet (množství × vážená nákupní cena bez DPH). Vyžaduje právo spravovat sklad, protože nákupní ceny ostatní nevidí.` | `money` | `scalar` | `sklad.read`, `sklad.write` | funkce |

## Další vlastnosti manifestu

### notifications

| key | label | description | group | severity | recipients | entity | dedupe |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sklad.low` | `Materiál pod minimem` | `Po výdeji, převodu nebo inventuře klesla zásoba skladové karty pod minimum. Nejvýš jednou denně za kartu.` | `Sklad` | `normal` | `perm:sklad.write` | `stock_item` | `day` |

## Tabulky entit

| Entita | Tabulka |
| --- | --- |
| `stock_item` | `stock_item` |
| `warehouse` | `warehouse` |
| `stock_doc` | `stock_doc` |
| `purchase_order` | `purchase_order` |
| `stock_count` | `stock_count` |
