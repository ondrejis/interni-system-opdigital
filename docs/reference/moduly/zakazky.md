# Modul Zakázky (zakazky)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Pipeline zakázek, rozpočet a položky, termíny, tým, dokumenty, ekonomika.

- **Identifikátor:** `zakazky`, ikona `briefcase`
- **Závisí na:** [`kontakty`](kontakty.md)
- **Balíček:** `packages/modules/zakazky`
- **Vyprávěcí dokumentace:** [docs/moduly/zakazky.md](../../moduly/zakazky.md)
- **Příkazy:** [80 příkazů](../prikazy/zakazky.md)
- **Entity:** [`job`](../entity/zakazky.md#job), [`job_order`](../entity/zakazky.md#job_order)
- **Databáze:** [tabulky a migrace](../databaze/zakazky.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Zakázky | `/zakazky` | `briefcase` | `zakazky.read` | Obchod |  |
| Objednávky | `/zakazky/objednavky` | `shopping-cart` | `zakazky.economics` |  | `/zakazky` |
| Ke schválení | `/zakazky/schvalovani` | `check-square` | `zakazky.approve` nebo `zakazky.approve_all` |  | `/zakazky` |
| Šablony | `/zakazky/sablony` | `clipboard-list` | `zakazky.read` |  | `/zakazky` |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/zakazky/sablony` | Šablony zakázek | `zakazky.read` | ano |
| `/zakazky/schvalovani` | Ke schválení | `zakazky.approve` nebo `zakazky.approve_all` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `zakazky.read` | Vidí zakázky |  |
| `zakazky.write` | Upravuje zakázky |  |
| `zakazky.economics` | Vidí ekonomiku zakázek | Rozpočet, náklady, marže |
| `zakazky.budget` | Upravuje rozpočet a náklady zakázek | Položky rozpočtu, ceny, ruční náklady, objednávky, párování nákladů |
| `zakazky.approve` | Schvaluje doklady zakázek do svého limitu | Změny (ZBV), soupisy prací, objednávky a přijaté faktury podle pravidel schvalování |
| `zakazky.approve_all` | Schvaluje doklady bez limitu a nastavuje pravidla schvalování |  |
| `zakazky.share` | Sdílí zakázku s investorem (odkaz jen ke čtení) |  |

## Výchozí data (seed)

Doplní se při seedu klienta, jen když modul běží; co správce změnil v administraci, se nepřepisuje.

### Pipeline

| Entita | Klíč | Název | Stavy (v pořadí) |
| --- | --- | --- | --- |
| `job` | `default` | Zakázky | Nová poptávka → Kontaktováno → Obhlídka → Nabídka v přípravě → Nabídka odeslána → Jednání → Příprava → Realizace → Předání → Záruka → Uzavřeno → Prohráno → Pozastaveno |

### Číselníky

| Klíč | Název | Hodnoty |
| --- | --- | --- |
| `job.lost_reason` | Důvod prohry zakázky | `price` (Cena), `timing` (Termín), `competitor` (Vybrali konkurenci), `no_response` (Bez odezvy), `cancelled` (Zákazník zrušil záměr), `other` (Jiný důvod) |
| `job.source` | Zdroj obchodu | `web` (Web), `phone` (Telefon), `email` (E-mail), `referral` (Doporučení), `personal` (Osobně), `other` (Jiný) |

### Číselné řady

| Klíč | Vzor | Nulování |
| --- | --- | --- |
| `zakazky.cislo` | `Z-{YYYY}-{NNN}` |  |
| `zakazky.objednavka` | `OBJ-{YYYY}-{NNN}` |  |

### Výchozí pohledy

| Entita | Název | Pořadí |
| --- | --- | --- |
| `job` | Moje zakázky | 10 |
| `job` | Nabídky čekající na odpověď | 20 |
| `job` | V realizaci | 30 |
| `job` | Po termínu | 40 |
| `job` | V záruce | 50 |
| `job` | Kanban podle stavu | 60 |

## Dlaždice mobilního terminálu

| Klíč | Název | Oprávnění | Příkazy | Celá obrazovka | Výchozí zapnuto |
| --- | --- | --- | --- | --- | --- |
| `zakazky.today` | Dnes na stavbě | `zakazky.read` |  | ano | ano |

## Rozšíření uživatelského rozhraní

Modul doplňuje obecný detail záznamu (viz [ARCHITECTURE](../../ARCHITECTURE.md)). Podmíněné záložky a karty se ukazují jen u záznamů, pro které funkce `visible` vrátí `true`.

### Záložky na detailu záznamu

| Entita | Záložka | Název | Oprávnění | Skupina | Pořadí | Podmíněná |
| --- | --- | --- | --- | --- | --- | --- |
| `company` | `zakazky` | Zakázky | `zakazky.read` |  |  |  |
| `job` | `rozpocet` | Rozpočet | `zakazky.economics` | `rozpocet` | 10 | ano (podle záznamu) |
| `job` | `prehled-nakladu` | Přehled nákladů | `zakazky.economics` | `naklady` | 5 | ano (podle záznamu) |
| `job` | `naklady` | Náklady | `zakazky.economics` | `naklady` | 10 | ano (podle záznamu) |
| `job` | `objednavky` | Objednávky | `zakazky.economics` | `naklady` | 40 | ano (podle záznamu) |
| `job` | `zmeny` | Změny | `zakazky.economics` | `zmeny` | 10 | ano (podle záznamu) |
| `job` | `soupisy` | Soupisy prací | `zakazky.write` nebo `zakazky.economics` | `fakturace` | 5 | ano (podle záznamu) |
| `job_order` | `objednavka` | Objednávka | `zakazky.economics` |  | 1 |  |
| `person` | `zakazky` | Zakázky | `zakazky.read` |  |  |  |

### Skupiny záložek

| Entita | Skupina | Název | Oprávnění | Pořadí |
| --- | --- | --- | --- | --- |
| `job` | `rozpocet` | Rozpočet | `zakazky.economics` | 10 |
| `job` | `zmeny` | Změny | `zakazky.economics` | 20 |
| `job` | `naklady` | Náklady | `zakazky.economics` | 30 |
| `job` | `fakturace` | Fakturace |  | 40 |
| `job` | `realizace` | Realizace |  | 50 |

### Akce v hlavičce detailu

| Entita | Akce | Název | Oprávnění | Hlavní | Okno |
| --- | --- | --- | --- | --- | --- |
| `job` | `change-phase` | Změnit fázi | `zakazky.write` |  | ano |
| `job` | `save-as-template` | Uložit jako šablonu | `zakazky.budget` |  | ano |

### Karty na přehledu záznamu

| Entita | Karta | Sloupec | Pořadí | Oprávnění | Podmíněná |
| --- | --- | --- | --- | --- | --- |
| `job` | `invoicing` | main | 60 | `zakazky.economics` | ano (podle záznamu) |
| `job` | `source-inquiry` | main | 90 |  |  |
| `job` | `team` | side | 10 |  |  |
| `job` | `share` | side | 50 | `zakazky.share` |  |
| `job` | `unpaired-costs` | main | 70 | `zakazky.economics` |  |
| `job` | `changes` | main | 66 | `zakazky.economics` |  |
| `job` | `pending-approvals` | main | 65 | `zakazky.approve` nebo `zakazky.approve_all` |  |

Vlastní hlavičku detailu (pás pod názvem) mají entity: `job`.

Základní záložky, které modul u entity skrývá: `job`: `activity`.

Vykreslení dlaždic mobilního terminálu (viz tabulka dlaždic výše): `zakazky.today`.

## Serverová část

### Úlohy na pozadí

| Úloha | Plán (cron) | Opakování po chybě | Popis |
| --- | --- | --- | --- |
| `zakazky.summary.refresh` | `20 3 * * *` | 1 |  |
| `zakazky.starts_today` | `30 6 * * 1-5` | 2 | Cron běží v Europe/Prague (pg-boss), takže se přechod letního času řeší sám. |

Souhrn všech úloh: [udalosti-a-ulohy.md](../udalosti-a-ulohy.md).

### Háčky přechodu fáze

| Háček | Entita | Z fáze | Do fáze | Kontrola | Akce před | Akce po |
| --- | --- | --- | --- | --- | --- | --- |
| `lifecycle.offer-requirements` | `job` | `*` | `offer` | ano |  |  |
| `lifecycle.execution-requirements` | `job` | `*` | `execution` | ano |  |  |
| `lifecycle.warranty-requirements` | `job` | `*` | `warranty` | ano |  | ano |
| `lifecycle.skip-warranty` | `job` | `handover` | `closed` | ano |  |  |
| `budget.offer-entry` | `job` | `*` | `offer` |  |  | ano |
| `budget.won` | `job` | `offer` | `preparation`, `execution`, `handover`, `warranty`, `closed` | ano |  | ano |
| `budget.realization-entry` | `job` | (bez fáze), `inquiry`, `paused`, `lost`, `preparation`, `execution`, `handover`, `warranty`, `closed` | `preparation`, `execution`, `handover`, `warranty`, `closed` |  |  | ano |

### Blokace smazání

| Blokace | Mazaná entita | Navázané záznamy (1 / 2–4 / 5+) | Doporučení |
| --- | --- | --- | --- |
| `zakazky.company-jobs` | `company` | zakázku / zakázky / zakázek | výchozí |
| `zakazky.company-orders` | `company` | objednávku / objednávky / objednávek | výchozí |
| `zakazky.company-costs` | `company` | náklad zakázky / náklady zakázek / nákladů zakázek | výchozí |
| `zakazky.person-jobs` | `person` | zakázku / zakázky / zakázek | výchozí |
| `zakazky.job-locked` | `job` | zamčený doklad / zamčené doklady / zamčených dokladů | takovou zakázku nejde smazat, uzavřete ji nebo ji označte jako prohranou |
| `zakazky.job-orders` | `job` | objednávku / objednávky / objednávek | výchozí |

### Vrstvy kalendáře

| Klíč | Název | Barva |
| --- | --- | --- |
| `zakazky.warranty-end` | Konec záruky | `indigo` |

### Poskytovatelé dat

Poskytovatelé jsou funkce, jejichž výstup (položky, dlaždice, hodnoty) závisí na datech a oprávnění uživatele, proto se z kódu nedají vyjmenovat. Počty: položky „Vyžaduje pozornost“: 5 poskytovatelů.

### dashboardMetrics

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| key | label | description | format | shape | permissions | params | compute |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `zakazky.margin` | `Marže zakázek` | `Marže v Kč po zakázkách (smluvní cena − náklady) u zakázek v realizaci, předání, záruce a uzavřených. Řazení od nejvyšší nebo nejnižší marže.` | `money` | `series` | `zakazky.read`, `zakazky.economics` | pole (1) | funkce |
| `zakazky.margin_total` | `Marže zakázek celkem` | `Součet marží (smluvní cena − náklady) zakázek v realizaci, předání, záruce a uzavřených v Kč.` | `money` | `scalar` | `zakazky.read`, `zakazky.economics` |  | funkce |
| `zakazky.margin_pct` | `Marže zakázek (%)` | `Vážená marže v procentech: součet marží děleno součtem smluvních cen zakázek v realizaci, předání, záruce a uzavřených.` | `percent` | `scalar` | `zakazky.read`, `zakazky.economics` |  | funkce |
| `zakazky.unbilled` | `Nevyfakturováno` | `Součet toho, co ještě nebylo vyfakturováno (smluvní cena − fakturováno, nejméně nula za zakázku) u zakázek v realizaci a dál. Bez DPH.` | `money` | `scalar` | `zakazky.read`, `zakazky.economics` |  | funkce |
| `zakazky.unbilled_by_job` | `Nevyfakturováno po zakázkách` | `Zakázky v realizaci a dál s největší nevyfakturovanou částkou (smluvní cena − fakturováno, bez DPH).` | `money` | `series` | `zakazky.read`, `zakazky.economics` |  | funkce |

## Nastavení

Nastavení uložená v tabulce `setting` (klíč → JSON), která správce mění v administraci. Tajná pole se ukládají šifrovaně.

### nabidka

Šablona PDF nabídky: úvod, podmínky, patička a platnost. Mění ji správce v Nastavení → Fakturace a dokumenty. Definice: `packages/modules/zakazky/src/budget/offer-template.ts`.

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis | Výchozí hodnota v kódu |
| --- | --- | --- | --- | --- | --- | --- |
| `introText` | text | ano |  | délka ≤ 1000 |  | `""` |
| `termsText` | text | ano |  | délka ≤ 2000 |  | `""` |
| `footerText` | text | ano |  | délka ≤ 300 |  | `""` |
| `footerContact` | ano/ne | ano |  |  |  | `false` |
| `validityDays` | celé číslo | ano |  | hodnota 0–365 |  | `30` |

## Další vlastnosti manifestu

### notifications

| key | label | description | group | severity | recipients | entity | access | snooze | dedupe | scheduled |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `job.team` | `Přidání do týmu zakázky` | `Někdo vás přidal do týmu zakázky.` | `Zakázky` | `normal` | `member` | `job` |  |  |  |  |
| `approval.request` | `Doklad čeká na schválení` | `Někdo poslal ke schválení změnu (vícepráci), soupis prací, objednávku nebo přijatou fakturu a vy o ní smíte rozhodnout.` | `Zakázky` | `normal` | `approvers` |  | `zakazky.approve`, `zakazky.approve_all` | `true` |  |  |
| `approval.approved` | `Váš doklad byl schválen` | `Doklad, který jste poslali ke schválení, někdo schválil.` | `Zakázky` | `normal` | `requester` | `job` |  |  |  |  |
| `approval.rejected` | `Váš doklad byl zamítnut` | `Doklad, který jste poslali ke schválení, někdo zamítl (s důvodem).` | `Zakázky` | `normal` | `requester` | `job` |  |  |  |  |
| `job.statement.approved` | `Soupis prací schválen` | `Soupis prací zakázky byl schválen. Dostane ho vedoucí a tým zakázky a ti, kdo fakturují (částku vidí jen s právem na ekonomiku).` | `Zakázky` | `normal` | `team`, `perm:fakturace.write` | `job` |  |  |  |  |
| `job.statement.rejected` | `Soupis prací zamítnut` | `Soupis prací zakázky byl zamítnut. Dostane ho vedoucí a tým zakázky.` | `Zakázky` | `normal` | `team`, `extra` | `job` |  |  |  |  |
| `job.change.approved` | `Vícepráce schválena` | `Změna zakázky (vícepráce nebo méněpráce) byla schválena. Dostane ji vedoucí a tým zakázky a ti, kdo fakturují (částku vidí jen s právem na ekonomiku).` | `Zakázky` | `normal` | `team`, `perm:fakturace.write` | `job` |  |  |  |  |
| `job.change.rejected` | `Vícepráce zamítnuta` | `Změna zakázky (vícepráce nebo méněpráce) byla zamítnuta. Dostane ji vedoucí a tým zakázky.` | `Zakázky` | `normal` | `team`, `extra` | `job` |  |  |  |  |
| `zakazky.starts_today` | `Zakázka dnes začíná` | `V pracovní dny ráno: zakázka v přípravě nebo realizaci má dnes plánovaný začátek. Dostane ji vedoucí a tým zakázky.` | `Zakázky` | `normal` | `team` | `job` |  | `true` | `day` | `true` |

## Tabulky entit

| Entita | Tabulka |
| --- | --- |
| `job` | `job` |
| `job_order` | `job_order` |
