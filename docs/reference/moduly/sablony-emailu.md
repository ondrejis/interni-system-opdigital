# Modul Šablony e-mailů (sablony-emailu)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Šablony e-mailů s proměnnými z klienta, kontaktu, obchodu a zakázky; otevření připraveného e-mailu v Gmailu nebo kopie do schránky.

- **Identifikátor:** `sablony-emailu`, ikona `mail-template`
- **Závisí na:** [`kontakty`](kontakty.md)
- **Balíček:** `packages/modules/sablony-emailu`
- **Vyprávěcí dokumentace:** [docs/moduly/sablony-emailu.md](../../moduly/sablony-emailu.md)
- **Příkazy:** [8 příkazů](../prikazy/sablony-emailu.md)
- **Entity:** [`email_template`](../entity/sablony-emailu.md#email_template)
- **Databáze:** [tabulky a migrace](../databaze/sablony-emailu.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Šablony e-mailů | `/sablony-emailu` | `mail-template` | `sablony-emailu.read` | Marketing |  |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `sablony-emailu.read` | Vidí šablony e-mailů |  |
| `sablony-emailu.create` | Zakládá šablony e-mailů |  |
| `sablony-emailu.write` | Upravuje šablony e-mailů |  |
| `sablony-emailu.delete` | Maže šablony e-mailů |  |

## Rozšíření uživatelského rozhraní

Modul doplňuje obecný detail záznamu (viz [ARCHITECTURE](../../ARCHITECTURE.md)). Podmíněné záložky a karty se ukazují jen u záznamů, pro které funkce `visible` vrátí `true`.

### Záložky na detailu záznamu

| Entita | Záložka | Název | Oprávnění | Skupina | Pořadí | Podmíněná |
| --- | --- | --- | --- | --- | --- | --- |
| `email_template` | `text` | Text e-mailu | `sablony-emailu.read` |  | 5 |  |

### Akce v hlavičce detailu

| Entita | Akce | Název | Oprávnění | Hlavní | Okno |
| --- | --- | --- | --- | --- | --- |
| `company` | `sablony-emailu.email` | E-mail ze šablony | `sablony-emailu.read` |  | ano |
| `deal` | `sablony-emailu.email` | E-mail ze šablony | `sablony-emailu.read` |  | ano |
| `job` | `sablony-emailu.email` | E-mail ze šablony | `sablony-emailu.read` |  | ano |
| `person` | `sablony-emailu.email` | E-mail ze šablony | `sablony-emailu.read` |  | ano |

### paletteActions

_Tato část UI modulu zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| id | label | keywords | icon | permission | href |
| --- | --- | --- | --- | --- | --- |
| `sablony-emailu.list` | `Šablony e-mailů` | `email e-mail šablona sablony follow-up nabídka gmail` | `mail-template` | `sablony-emailu.read` | `/sablony-emailu` |

## Serverová část

### services

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 1. `emailTemplatesService`

### privatePaths

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| name | run |
| --- | --- |
| `sablony-emailu.templates` | funkce |
| `sablony-emailu.render` | funkce |
| `sablony-emailu.preview` | funkce |

## Tabulky entit

| Entita | Tabulka |
| --- | --- |
| `email_template` | `email_template` |
