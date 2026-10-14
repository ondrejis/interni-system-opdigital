# Modul Kalendář (kalendar)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Události s účastníky, opakováním a připomenutím, zdroje (zasedačky, vybavení) s kontrolou kolizí, vrstvy z ostatních modulů, odběr kalendáře v Google, Apple a Outlooku a import cizích kalendářů jako „obsazeno“.

- **Identifikátor:** `kalendar`, ikona `calendar`
- **Závisí na:** žádném modulu
- **Balíček:** `packages/modules/kalendar`
- **Vyprávěcí dokumentace:** [docs/moduly/kalendar.md](../../moduly/kalendar.md)
- **Příkazy:** [11 příkazů](../prikazy/kalendar.md)
- **Entity:** [`event`](../entity/kalendar.md#event), [`calendar_resource`](../entity/kalendar.md#calendar_resource)
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
| `kalendar.read` | Vidí kalendář | Rozsah „jen moje“ = události, které vlastním nebo na které jsem pozvaný |
| `kalendar.write` | Upravuje události | Rozsah „jen moje“ = jen vlastní události |
| `kalendar.resources` | Spravuje zdroje kalendáře |  |

## Serverová část

### Úlohy na pozadí

| Úloha | Plán (cron) | Opakování po chybě | Popis |
| --- | --- | --- | --- |
| `kalendar.reminders` | `*/5 * * * *` | 1 |  |
| `kalendar.sync` | `10 * * * *` | 1 |  |

Souhrn všech úloh: [udalosti-a-ulohy.md](../udalosti-a-ulohy.md).

### Poskytovatelé dat

Poskytovatelé jsou funkce, jejichž výstup (položky, dlaždice, hodnoty) závisí na datech a oprávnění uživatele, proto se z kódu nedají vyjmenovat. Počty: dlaždice přehledu: 1 poskytovatelů.

## Další vlastnosti manifestu

### notifications

| key | label | description | group | severity | recipients | entity | mergeWindowSeconds | debounceSeconds | access | ttlSeconds | snooze | scheduled |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `kalendar.invite` | `Pozvánka na událost` | `Někdo vás přidal mezi účastníky události v kalendáři.` | `Kalendář` | `normal` | `attendee` | `event` |  |  |  |  |  |  |
| `kalendar.changed` | `Změna termínu události` | `Organizátor přesunul událost, na kterou jste pozvaní. Opakované úpravy se slučují do jednoho upozornění.` | `Kalendář` | `normal` | `attendee` | `event` | `600` | `30` |  |  |  |  |
| `kalendar.cancelled` | `Zrušená událost` | `Organizátor zrušil událost, na kterou jste byli pozvaní.` | `Kalendář` | `normal` | `attendee` |  |  |  | `kalendar.read` |  |  |  |
| `kalendar.reminder` | `Připomenutí události` | `Před začátkem události (podle připomenutí u události) dostane upozornění organizátor i všichni pozvaní.` | `Kalendář` | `normal` | `participant` | `event` |  |  |  | `600` | `true` | `true` |

## Tabulky entit

| Entita | Tabulka |
| --- | --- |
| `event` | `event` |
| `calendar_resource` | `calendar_resource` |
