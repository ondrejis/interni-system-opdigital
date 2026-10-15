# Modul Kalendář (kalendar)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Kalendář propojený s Google Kalendářem každého uživatele (obousměrná synchronizace do minuty): pohledy Den, Týden, Měsíc a Agenda, schůzky a hovory z úkolů zapsané do Googlu, vrstvy z ostatních modulů (úkoly s termínem, termíny zakázek), vazby událostí na obchody, klienty a kontakty, cizí soukromé události jako „Obsazeno“.

- **Identifikátor:** `kalendar`, ikona `calendar`
- **Závisí na:** žádném modulu
- **Balíček:** `packages/modules/kalendar`
- **Vyprávěcí dokumentace:** [docs/moduly/kalendar.md](../../moduly/kalendar.md)
- **Příkazy:** [17 příkazů](../prikazy/kalendar.md)
- **Entity:** žádné
- **Databáze:** [tabulky a migrace](../databaze/kalendar.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Kalendář | `/kalendar` | `calendar` | `kalendar.read` | Práce |  |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/kalendar` | Kalendář | `kalendar.read` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `kalendar.read` | Vidí kalendář | Rozsah „jen moje“ = jen kalendáře mého Google účtu; „vše“ i kalendáře ostatních (jejich soukromé události jako „Obsazeno“) |
| `kalendar.write` | Upravuje události | Připojení vlastního Google účtu, zakládání a přesouvání schůzek, vazby na klienty a obchody; rozsah „jen moje“ = jen vlastní události |

## Rozšíření uživatelského rozhraní

Modul doplňuje obecný detail záznamu (viz [ARCHITECTURE](../../ARCHITECTURE.md)). Podmíněné záložky a karty se ukazují jen u záznamů, pro které funkce `visible` vrátí `true`.

### paletteActions

_Tato část UI modulu zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| id | label | keywords | icon | permission | href |
| --- | --- | --- | --- | --- | --- |
| `kalendar.new-meeting` | `Nová schůzka` | `schuzka kalendar udalost nova meeting` | `calendar` | `kalendar.write` | `/kalendar?nova=1` |

## Serverová část

### Úlohy na pozadí

| Úloha | Plán (cron) | Opakování po chybě | Popis |
| --- | --- | --- | --- |
| `kalendar.sync` | `* * * * *` | 0 |  |
| `kalendar.sync.calendar` | jen na požádání | 2 |  |
| `kalendar.push` | `* * * * *` | 0 |  |
| `kalendar.watch.renew` | `17 * * * *` | 0 |  |

Souhrn všech úloh: [udalosti-a-ulohy.md](../udalosti-a-ulohy.md).

### Vrstvy kalendáře

| Klíč | Název | Barva |
| --- | --- | --- |
| `kalendar` | Kalendář (Google) | `blue` |

### Poskytovatelé dat

Poskytovatelé jsou funkce, jejichž výstup (položky, dlaždice, hodnoty) závisí na datech a oprávnění uživatele, proto se z kódu nedají vyjmenovat. Počty: dlaždice přehledu: 1 poskytovatelů.

### eventHandlers

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 1. `pole (1)`

### privatePaths

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| name | run |
| --- | --- |
| `kalendar.range.others` | funkce |
| `kalendar.layer` | funkce |
| `kalendar.widget.upcoming` | funkce |

## Nastavení

Nastavení uložená v tabulce `setting` (klíč → JSON), která správce mění v administraci. Tajná pole se ukládají šifrovaně.

### google_calendar

Nastavení kalendáře: Google OAuth klient (`clientSecret` je v DB zašifrované) a R-14 — soukromá schůzka se do Googlu zapíše s příznakem „soukromé“ (jinak se do Googlu vůbec nezapisuje). Definice: `packages/modules/kalendar/src/google/env.ts`. Tajná pole: `clientSecret`.

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis | Výchozí hodnota v kódu |
| --- | --- | --- | --- | --- | --- | --- |
| `clientId` | text | ano |  |  |  | `""` |
| `clientSecret` | string \| null | ano |  |  |  | `null` |
| `privateMeetingsToGoogle` | ano/ne | ano |  |  |  | `true` |
