# Modul Klienti (klienti)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Klienti agentury: stav (lead, aktivní, pozastavený, bývalý), služby, kontext a karta klienta složená z příspěvků ostatních modulů.

- **Identifikátor:** `klienti`, ikona `handshake`
- **Závisí na:** [`kontakty`](kontakty.md)
- **Balíček:** `packages/modules/klienti`
- **Vyprávěcí dokumentace:** [docs/moduly/klienti.md](../../moduly/klienti.md)
- **Příkazy:** [6 příkazů](../prikazy/klienti.md)
- **Entity:** žádné
- **Databáze:** [tabulky a migrace](../databaze/klienti.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Klienti | `/klienti` | `handshake` | `klienti.read` | CRM |  |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/klienti` | Klienti | `klienti.read` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `klienti.read` | Vidí klienty a jejich karty |  |
| `klienti.write` | Upravuje klienty | Stav klienta, služby a kontext |

## Rozšíření uživatelského rozhraní

Modul doplňuje obecný detail záznamu (viz [ARCHITECTURE](../../ARCHITECTURE.md)). Podmíněné záložky a karty se ukazují jen u záznamů, pro které funkce `visible` vrátí `true`.

### Záložky na detailu záznamu

| Entita | Záložka | Název | Oprávnění | Skupina | Pořadí | Podmíněná |
| --- | --- | --- | --- | --- | --- | --- |
| `company` | `kontext` | Kontext | `klienti.read` |  | 10 | ano (podle záznamu) |
| `company` | `zakazky` | Zakázky | `zakazky.read` |  | 30 | ano (podle záznamu) |
| `company` | `obchody` | Obchody | `obchody.read` |  | 40 | ano (podle záznamu) |

### Karty na přehledu záznamu

| Entita | Karta | Sloupec | Pořadí | Oprávnění | Podmíněná |
| --- | --- | --- | --- | --- | --- |
| `company` | `klient-mobil` | main | 1 | `klienti.read` | ano (podle záznamu) |
| `company` | `klient-kontext` | main | 5 | `klienti.read` | ano (podle záznamu) |
| `company` | `klient-zakazky` | main | 20 | `zakazky.read` | ano (podle záznamu) |
| `company` | `klient-obchody` | main | 30 | `obchody.read` | ano (podle záznamu) |
| `company` | `klient-poznamky` | main | 45 | `ukoly.read` | ano (podle záznamu) |
| `company` | `klient-finance` | main | 50 | `finance.read` | ano (podle záznamu) |
| `company` | `klient-udalosti` | main | 90 | `klienti.read` | ano (podle záznamu) |

Vlastní hlavičku detailu (pás pod názvem) mají entity: `company`.

### paletteActions

_Tato část UI modulu zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| id | label | keywords | icon | permission | href |
| --- | --- | --- | --- | --- | --- |
| `klienti.list` | `Klienti` | `klienti klient seznam firmy zákazníci` | `handshake` | `klienti.read` | `/klienti` |
| `klienti.new` | `Nový klient` | `klient firma organizace nový přidat lead` | `handshake` | `kontakty.create` | `/kontakty/firmy/nova` |

## Serverová část

### services

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 1. `clients`

### privatePaths

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| name | run |
| --- | --- |
| `klienti.list` | funkce |
| `klienti.summary+tabCounts` | funkce |
