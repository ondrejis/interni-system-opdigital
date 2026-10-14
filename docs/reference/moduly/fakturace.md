# Modul Fakturace (fakturace)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Zálohové, průběžné a konečné faktury z položek zakázky, platby, dobropisy, PDF s QR platbou, odesílání e-mailem s upomínkami, export (XLSX, balík pro účetní), šablony dokladů.

- **Identifikátor:** `fakturace`, ikona `receipt`
- **Závisí na:** [`zakazky`](zakazky.md), [`kontakty`](kontakty.md)
- **Balíček:** `packages/modules/fakturace`
- **Vyprávěcí dokumentace:** [docs/moduly/fakturace.md](../../moduly/fakturace.md)
- **Příkazy:** [29 příkazů](../prikazy/fakturace.md)
- **Entity:** [`invoice`](../entity/fakturace.md#invoice), [`received_invoice`](../entity/fakturace.md#received_invoice)
- **Databáze:** [tabulky a migrace](../databaze/fakturace.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Faktury | `/fakturace` | `receipt` | `fakturace.read` | Obchod |  |
| Přijaté faktury | `/fakturace/prijate` | `receipt` | `fakturace.read` |  | `/fakturace` |
| Export pro účetní | `/fakturace/export` | `file-stack` | `fakturace.export` |  | `/fakturace` |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/fakturace/export` | Export faktur | `fakturace.export` | ano |
| `/fakturace/nastaveni` | Nastavení fakturace | `settings.manage` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `fakturace.read` | Vidí faktury |  |
| `fakturace.write` | Vystavuje faktury | Koncepty, vystavení, úhrady, dobropisy |
| `fakturace.export` | Exportuje faktury do účetnictví |  |

## Výchozí data (seed)

Doplní se při seedu klienta, jen když modul běží; co správce změnil v administraci, se nepřepisuje.

### Číselné řady

| Klíč | Vzor | Nulování |
| --- | --- | --- |
| `fakturace.zalohova` | `ZF-{YYYY}-{NNNN}` |  |
| `fakturace.faktura` | `FV-{YYYY}-{NNNN}` |  |
| `fakturace.dobropis` | `DB-{YYYY}-{NNNN}` |  |

## Rozšíření uživatelského rozhraní

Modul doplňuje obecný detail záznamu (viz [ARCHITECTURE](../../ARCHITECTURE.md)). Podmíněné záložky a karty se ukazují jen u záznamů, pro které funkce `visible` vrátí `true`.

### Záložky na detailu záznamu

| Entita | Záložka | Název | Oprávnění | Skupina | Pořadí | Podmíněná |
| --- | --- | --- | --- | --- | --- | --- |
| `company` | `faktury` | Faktury | `fakturace.read` |  |  |  |
| `invoice` | `polozky` | Položky | `fakturace.read` |  |  |  |
| `invoice` | `platby` | Platby | `fakturace.read` |  |  |  |
| `invoice` | `odeslani` | Odeslání | `fakturace.read` |  |  |  |
| `job` | `faktury` | Faktury | `fakturace.read` | `fakturace` | 20 |  |
| `job` | `prijate-faktury` | Přijaté faktury | `fakturace.read` | `naklady` | 50 |  |
| `received_invoice` | `faktura` | Faktura | `fakturace.read` |  | 1 |  |

### Akce v hlavičce detailu

| Entita | Akce | Název | Oprávnění | Hlavní | Okno |
| --- | --- | --- | --- | --- | --- |
| `invoice` | `issue` | Vystavit | `fakturace.write` | ano | ano |
| `invoice` | `pdf` | PDF | `fakturace.read` |  |  |
| `invoice` | `isdoc` | ISDOC | `fakturace.export` |  |  |
| `invoice` | `send-email` | Odeslat e-mailem | `fakturace.write` |  | ano |
| `invoice` | `send-reminder` | Poslat upomínku | `fakturace.write` |  | ano |
| `invoice` | `credit-note` | Dobropis | `fakturace.write` |  |  |
| `received_invoice` | `isdoc` | ISDOC | `fakturace.export` |  |  |

### Hromadné akce v seznamu

| Entita | Akce | Název | Oprávnění |
| --- | --- | --- | --- |
| `invoice` | `send-email` | Odeslat e-mailem | `fakturace.write` |
| `invoice` | `send-reminder` | Poslat upomínky | `fakturace.write` |

## Serverová část

### Úlohy na pozadí

| Úloha | Plán (cron) | Opakování po chybě | Popis |
| --- | --- | --- | --- |
| `fakturace.overdue` | `30 5 * * *` | 2 | Denně ráno: faktury, kterým včera uplynula splatnost, se označí a fakturanti dostanou upozornění. |
| `fakturace.due_soon` | `0 7 * * 1-5` | 2 | Pracovní dny ráno: vystavené neuhrazené faktury, kterým splatnost nastává do tří dnů. |
| `fakturace.received.overdue` | `40 5 * * *` | 2 |  |
| `fakturace.dispatch.sync` | `* * * * *` | 0 | Každou minutu: stav odeslaných e-mailů z fronty se přenese do evidence u faktur (a při selhání upozorní autora). |

Souhrn všech úloh: [udalosti-a-ulohy.md](../udalosti-a-ulohy.md).

### Háčky přechodu fáze

| Háček | Entita | Z fáze | Do fáze | Kontrola | Akce před | Akce po |
| --- | --- | --- | --- | --- | --- | --- |
| `billing.closed-retention` | `job` | `*` | `closed` | ano |  |  |

### Blokace smazání

| Blokace | Mazaná entita | Navázané záznamy (1 / 2–4 / 5+) | Doporučení |
| --- | --- | --- | --- |
| `fakturace.company-invoices` | `company` | fakturu / faktury / faktur | výchozí |
| `fakturace.company-received` | `company` | přijatou fakturu / přijaté faktury / přijatých faktur | výchozí |
| `fakturace.person-invoices` | `person` | fakturu / faktury / faktur | výchozí |
| `fakturace.job-issued` | `job` | vystavenou fakturu / vystavené faktury / vystavených faktur | takovou zakázku nejde smazat, vystavenou fakturu jde jen stornovat dobropisem; zakázku uzavřete |
| `fakturace.job-received-locked` | `job` | schválenou přijatou fakturu / schválené přijaté faktury / schválených přijatých faktur | takovou zakázku nejde smazat, uzavřete ji nebo ji označte jako prohranou |
| `fakturace.job-drafts` | `job` | koncept faktury / koncepty faktur / konceptů faktur | výchozí |
| `fakturace.job-received-open` | `job` | přijatou fakturu / přijaté faktury / přijatých faktur | výchozí |

### Vrstvy kalendáře

| Klíč | Název | Barva |
| --- | --- | --- |
| `fakturace.due` | Splatnosti faktur | `red` |
| `fakturace.received.due` | Splatnosti přijatých faktur | `orange` |

### Poskytovatelé nákladů zakázky

- `fakturace.received`

### Poskytovatelé dat

Poskytovatelé jsou funkce, jejichž výstup (položky, dlaždice, hodnoty) závisí na datech a oprávnění uživatele, proto se z kódu nedají vyjmenovat. Počty: položky „Vyžaduje pozornost“: 3 poskytovatelů; dlaždice přehledu: 1 poskytovatelů; souhrn fakturace zakázky: 1.

### dashboardMetrics

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| key | label | description | format | shape | permissions | compute | params |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `fakturace.overdue` | `Pohledávky po splatnosti` | `Neuhrazený zůstatek vydaných faktur (s DPH), kterým uplynula splatnost. Dobropisy a koncepty se nepočítají.` | `money` | `scalar` | `fakturace.read` | funkce |  |
| `fakturace.overdue_by_customer` | `Pohledávky po splatnosti podle zákazníků` | `Zákazníci s největším neuhrazeným zůstatkem po splatnosti (s DPH). Odkaz vede na zákazníka, pokud smíte číst všechny kontakty.` | `money` | `series` | `fakturace.read` | funkce |  |
| `fakturace.cashflow_plan` | `Plán peněžních toků` | `Po měsících nebo týdnech: plán příjmů (vydané faktury podle splatnosti), skutečné příjmy (úhrady podle data úhrady) a plán výdajů (schválené přijaté faktury podle splatnosti), vše s DPH. Bez zvoleného období se ukáže následujících 6 měsíců.` | `money` | `series` | `fakturace.read` | funkce |  |
| `fakturace.due_soon` | `Pohledávky se splatností v příštích dnech` | `Neuhrazený zůstatek vydaných faktur (s DPH), které budou splatné od dneška do zvoleného počtu dní.` | `money` | `scalar` | `fakturace.read` | funkce | pole (1) |
| `fakturace.received_open` | `Přijaté faktury k úhradě` | `Součet zbývající částky (s DPH) schválených přijatých faktur, které ještě nejsou uhrazené. Podklad pro účetní.` | `money` | `scalar` | `fakturace.read` | funkce |  |
| `fakturace.received_open_count` | `Přijaté faktury k úhradě (počet)` | `Počet schválených přijatých faktur, které ještě nejsou uhrazené.` | `number` | `scalar` | `fakturace.read` | funkce |  |
| `fakturace.issued` | `Vystaveno v období` | `Součet základů (bez DPH) vydaných dokladů s datem vystavení v období; dobropisy jsou záporné. Koncepty se nepočítají.` | `money` | `scalar` | `fakturace.read` | funkce |  |

## Nastavení

Nastavení uložená v tabulce `setting` (klíč → JSON), která správce mění v administraci. Tajná pole se ukládají šifrovaně.

### fakturace

Nastavení fakturace a šablony dokladů (texty na PDF, QR platba, e-maily s fakturou a upomínkou). Mění ho správce v Nastavení, platí pro nově vystavené i tištěné doklady. Definice: `packages/modules/fakturace/src/settings.ts`.

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis | Výchozí hodnota v kódu |
| --- | --- | --- | --- | --- | --- | --- |
| `dueDays` | celé číslo | ano |  | hodnota 0–365 |  | `14` |
| `introText` | text | ano |  | délka ≤ 1000 |  | `""` |
| `footerText` | text | ano |  | délka ≤ 300 |  | `""` |
| `showQr` | ano/ne | ano |  |  |  | `true` |
| `vatPayer` | boolean \| null | ano |  |  |  | `null` |
| `reverseChargeCpa` | text | ano |  | délka ≤ 20 |  | `""` |
| `termsText` | text | ano |  | délka ≤ 1000 |  | `""` |
| `notesText` | text | ano |  | délka ≤ 1000 |  | `""` |
| `footerContact` | ano/ne | ano |  |  |  | `false` |
| `mailCc` | text | ano |  | délka ≤ 300 |  | `""` |
| `mailInvoiceSubject` | text | ano |  | délka 1–200 |  | `"{druh} {cislo} od {dodavatel}"` |
| `mailInvoiceBody` | text | ano |  | délka 1–5000 |  | `"Dobrý den,\n\nv příloze zasíláme doklad {cislo} na částku {castka} se splatnost` |
| `mailReminderSubject` | text | ano |  | délka 1–200 |  | `"Upomínka: {druh} {cislo} po splatnosti"` |
| `mailReminderBody` | text | ano |  | délka 1–5000 |  | `"Dobrý den,\n\ndovolujeme si Vás upozornit, že doklad {cislo} na částku {castka}` |

## Další vlastnosti manifestu

### notifications

| key | label | description | group | severity | recipients | entity | dedupe | scheduled |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `invoice.overdue` | `Faktura po splatnosti` | `Ráno po uplynutí splatnosti vydané faktury, kterou zákazník ještě neuhradil.` | `Fakturace` | `normal` | `perm:fakturace.write` | `invoice` | `record` |  |
| `invoice.due_soon` | `Faktura brzy po splatnosti` | `Pracovní den ráno, nejdéle 3 dny před splatností vydané faktury, která ještě není uhrazená (jednou za fakturu).` | `Fakturace` | `normal` | `perm:fakturace.write` | `invoice` | `record` | `true` |
| `invoice.paid` | `Faktura zaplacena` | `Vydaná faktura byla zaplacena celá. Dostane ji ten, kdo fakturu založil, vedoucí zakázky a všichni, kdo fakturují.` | `Fakturace` | `normal` | `creator`, `manager`, `perm:fakturace.write` | `invoice` | `none` |  |
| `received_invoice.overdue` | `Přijatá faktura po splatnosti` | `Ráno po uplynutí splatnosti schválené přijaté faktury, kterou jste ještě neuhradili.` | `Fakturace` | `normal` | `perm:fakturace.write` | `received_invoice` | `record` |  |
| `invoice.mail_failed` | `E-mail s fakturou se nepodařilo odeslat` | `E-mail s fakturou nebo upomínkou se nepodařilo doručit. Dostane ho ten, kdo e-mail odeslal.` | `Fakturace` | `normal` | `sender` | `invoice` |  |  |

## Tabulky entit

| Entita | Tabulka |
| --- | --- |
| `invoice` | `invoice` |
| `received_invoice` | `received_invoice` |
