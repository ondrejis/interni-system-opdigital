# Příkazy modulu Fakturace

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [Fakturace](../moduly/fakturace.md). Počet příkazů: 29.

### fakturace.addPayment

- **Oprávnění:** `fakturace.write` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `invoiceId` | uuid | ano |  |  |  |
| `date` | datum | ano |  |  |  |
| `amountMinor` | celé číslo | ano |  | hodnota ≥ 0 |  |
| `method` | text (nebo null) | ne |  | délka ≤ 40 |  |
| `note` | text (nebo null) | ne |  | délka ≤ 300 |  |

### fakturace.createCreditNote

- **Oprávnění:** `fakturace.write` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `invoiceId` | uuid | ano |  |  |  |

### fakturace.createFromJob

Záloha, dílčí a konečná faktura z rozpočtu zakázky.

- **Oprávnění:** `fakturace.write` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/billing/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `kind` | enum | ano | `proforma`, `partial`, `final` |  |  |
| `percent` | číslo | ne |  | hodnota 0.01–100 |  |
| `amountMinor` | celé číslo | ne |  | hodnota 0–9000000000000 |  |

### fakturace.createFromStatement

- **Oprávnění:** `fakturace.write` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/billing/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `statementId` | uuid | ano |  |  |  |

### fakturace.export

- **Oprávnění:** `fakturace.export` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `adapter` | text | ano |  | délka ≤ 30 |  |
| `from` | datum | ano |  |  |  |
| `to` | datum | ano |  |  |  |

### fakturace.exportAdapters

- **Oprávnění:** `fakturace.export` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/server.ts`

_Bez vstupních polí._

### fakturace.finalSettlement

Podklady konečné faktury (rekapitulace s odečty); nic nezakládá.

- **Oprávnění:** `fakturace.read` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/billing/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### fakturace.get

- **Oprávnění:** `fakturace.read` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### fakturace.issue

- **Oprávnění:** `fakturace.write` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `issueDate` | datum | ne |  |  |  |
| `taxableDate` | datum | ne |  |  |  |
| `dueDate` | datum | ne |  |  |  |

### fakturace.jobSummary

Přehled fakturace zakázky: čísla, zádržné, zálohy, soupisy k fakturaci (pro záložku Faktury).

- **Oprávnění:** `fakturace.read` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/billing/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### fakturace.mail.bulk

- **Oprávnění:** `fakturace.write` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/dispatch/index.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `invoiceIds` | pole (uuid) | ano |  | počet 1–50 |  |
| `kind` | enum | ano | `invoice`, `reminder` |  |  |

### fakturace.mail.bulkPreview

- **Oprávnění:** `fakturace.write` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/dispatch/index.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `invoiceIds` | pole (uuid) | ano |  | počet 1–50 |  |
| `kind` | enum | ano | `invoice`, `reminder` |  |  |

### fakturace.mail.list

- **Oprávnění:** `fakturace.read` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/dispatch/index.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `invoiceId` | uuid | ano |  |  |  |

### fakturace.mail.prepare

- **Oprávnění:** `fakturace.write` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/dispatch/index.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `invoiceId` | uuid | ano |  |  |  |
| `kind` | enum | ano | `invoice`, `reminder` |  |  |
| `retryOf` | uuid | ne |  |  |  |

### fakturace.mail.send

- **Oprávnění:** `fakturace.write` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/dispatch/index.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `invoiceId` | uuid | ano |  |  |  |
| `kind` | enum | ano | `invoice`, `reminder` |  |  |
| `to` | e-mail | ano |  |  |  |
| `cc` | pole (e-mail) | ne |  | počet ≤ 5; výchozí `[]` |  |
| `subject` | text | ano |  | délka 1–200 |  |
| `body` | text | ano |  | délka 1–5000 |  |

### fakturace.received.create

- **Oprávnění:** `fakturace.write` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/received/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `number` | text | ano |  | délka 1–60 |  |
| `supplierId` | uuid | ano |  |  |  |
| `jobId` | uuid (nebo null) | ne |  |  |  |
| `orderId` | uuid (nebo null) | ne |  |  |  |
| `variableSymbol` | text (nebo null) | ne |  | délka ≤ 20 |  |
| `constantSymbol` | text (nebo null) | ne |  | délka ≤ 10 |  |
| `issueDate` | datum (nebo null) | ne |  |  |  |
| `taxableDate` | datum (nebo null) | ne |  |  |  |
| `dueDate` | datum (nebo null) | ne |  |  |  |
| `receivedDate` | datum (nebo null) | ne |  |  |  |
| `vatMode` | enum | ne | `standard`, `reverse_charge` | výchozí `"standard"` |  |
| `netMinor` | celé číslo | ano |  | hodnota -9000000000000–9000000000000 |  |
| `grossMinor` | celé číslo | ano |  | hodnota -9000000000000–9000000000000 |  |
| `note` | text (nebo null) | ne |  | délka ≤ 2000 |  |
| `lines` | pole objektů | ne |  | počet ≤ 200 |  |
| `lines[].description` | text | ano |  | délka 1–300 |  |
| `lines[].sectionId` | uuid (nebo null) | ne |  |  |  |
| `lines[].itemId` | uuid (nebo null) | ne |  |  |  |
| `lines[].category` | enum | ano | `labour`, `material`, `machines`, `subcontract`, `other` |  |  |
| `lines[].netMinor` | celé číslo | ano |  | hodnota -9000000000000–9000000000000 |  |
| `lines[].vatRateBp` | celé číslo | ano |  | hodnota 0–10000 |  |

### fakturace.received.delete

- **Oprávnění:** `fakturace.write` (stačí kterékoli)

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### fakturace.received.get

- **Oprávnění:** `fakturace.read` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/received/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### fakturace.received.list

Přijaté faktury (všechny, nebo jedné zakázky) pro záložku a přehledy.

- **Oprávnění:** `fakturace.read` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/received/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ne |  |  |  |

### fakturace.received.pay

- **Oprávnění:** `fakturace.write` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/received/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `paidDate` | datum | ano |  |  |  |

### fakturace.received.save

- **Oprávnění:** `fakturace.write` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/received/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `number` | text | ano |  | délka 1–60 |  |
| `supplierId` | uuid | ano |  |  |  |
| `jobId` | uuid (nebo null) | ne |  |  |  |
| `orderId` | uuid (nebo null) | ne |  |  |  |
| `variableSymbol` | text (nebo null) | ne |  | délka ≤ 20 |  |
| `constantSymbol` | text (nebo null) | ne |  | délka ≤ 10 |  |
| `issueDate` | datum (nebo null) | ne |  |  |  |
| `taxableDate` | datum (nebo null) | ne |  |  |  |
| `dueDate` | datum (nebo null) | ne |  |  |  |
| `receivedDate` | datum (nebo null) | ne |  |  |  |
| `vatMode` | enum | ne | `standard`, `reverse_charge` | výchozí `"standard"` |  |
| `netMinor` | celé číslo | ano |  | hodnota -9000000000000–9000000000000 |  |
| `grossMinor` | celé číslo | ano |  | hodnota -9000000000000–9000000000000 |  |
| `note` | text (nebo null) | ne |  | délka ≤ 2000 |  |
| `lines` | pole objektů | ne |  | počet ≤ 200 |  |
| `lines[].description` | text | ano |  | délka 1–300 |  |
| `lines[].sectionId` | uuid (nebo null) | ne |  |  |  |
| `lines[].itemId` | uuid (nebo null) | ne |  |  |  |
| `lines[].category` | enum | ano | `labour`, `material`, `machines`, `subcontract`, `other` |  |  |
| `lines[].netMinor` | celé číslo | ano |  | hodnota -9000000000000–9000000000000 |  |
| `lines[].vatRateBp` | celé číslo | ano |  | hodnota 0–10000 |  |

### fakturace.received.submit

- **Oprávnění:** `fakturace.write` (stačí kterékoli)

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### fakturace.received.unpay

- **Oprávnění:** `fakturace.write` (stačí kterékoli)

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### fakturace.releaseRetention

- **Oprávnění:** `fakturace.write` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/billing/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `amountMinor` | celé číslo | ne |  | hodnota 0–9000000000000 |  |

### fakturace.removePayment

- **Oprávnění:** `fakturace.write` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### fakturace.reopen

Výjimečné vrácení vystaveného dokladu do konceptu (oprava hned po vystavení). Smí to držitel oprávnění „schvaluje doklady bez limitu“, doklad nesmí mít úhrady ani dobropis a nesmí být odečtený jinde. Číslo z řady zůstává dokladu (v řadě nevzniká díra) a zapíše se do auditu i s důvodem. Běžná oprava je dobropis.

- **Oprávnění:** `fakturace.write` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/billing/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `reason` | text | ano |  | délka 3–500 |  |

### fakturace.saveDraft

- **Oprávnění:** `fakturace.write` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `title` | text | ne |  | délka ≤ 200 |  |
| `companyId` | uuid | ne |  |  |  |
| `personId` | uuid (nebo null) | ne |  |  |  |
| `issueDate` | datum (nebo null) | ne |  |  |  |
| `taxableDate` | datum (nebo null) | ne |  |  |  |
| `dueDate` | datum (nebo null) | ne |  |  |  |
| `note` | text (nebo null) | ne |  | délka ≤ 2000 |  |
| `vatMode` | enum | ne | `standard`, `reverse_charge` |  |  |
| `lines` | pole objektů | ano |  | počet ≤ 200 |  |
| `lines[].description` | text | ano |  | délka 1–300 |  |
| `lines[].quantity` | text | ano |  | vzor `^-?\d{1,11}([.,]\d{1,3})?$` |  |
| `lines[].unit` | text | ano |  | délka 1–12 |  |
| `lines[].unitPriceMinor` | celé číslo | ano |  | hodnota -9000000000000–9000000000000 |  |
| `lines[].vatRateBp` | celé číslo | ano |  | hodnota 0–10000 |  |
| `lines[].role` | enum | ne | `work`, `previous`, `advance`, `retention`, `release` |  |  |
| `lines[].budgetItemId` | uuid (nebo null) | ne |  |  |  |
| `lines[].refInvoiceId` | uuid (nebo null) | ne |  |  |  |

### fakturace.settings.get

- **Oprávnění:** `settings.manage` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/server.ts`

_Bez vstupních polí._

### fakturace.settings.save

- **Oprávnění:** `settings.manage` (stačí kterékoli)
- **Definice:** `packages/modules/fakturace/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `dueDays` | celé číslo | ano |  | hodnota 0–365 |  |
| `introText` | text | ano |  | délka ≤ 1000 |  |
| `footerText` | text | ano |  | délka ≤ 300 |  |
| `showQr` | ano/ne | ano |  |  |  |
| `vatPayer` | boolean \| null | ano |  |  |  |
| `reverseChargeCpa` | text | ano |  | délka ≤ 20 |  |
| `termsText` | text | ano |  | délka ≤ 1000 |  |
| `notesText` | text | ano |  | délka ≤ 1000 |  |
| `footerContact` | ano/ne | ano |  |  |  |
| `mailCc` | text | ano |  | délka ≤ 300 |  |
| `mailInvoiceSubject` | text | ano |  | délka 1–200 |  |
| `mailInvoiceBody` | text | ano |  | délka 1–5000 |  |
| `mailReminderSubject` | text | ano |  | délka 1–200 |  |
| `mailReminderBody` | text | ano |  | délka 1–5000 |  |
| `offer` | objekt | ano |  |  |  |
| `offer.introText` | text | ano |  | délka ≤ 1000 |  |
| `offer.termsText` | text | ano |  | délka ≤ 2000 |  |
| `offer.footerText` | text | ano |  | délka ≤ 300 |  |
| `offer.footerContact` | ano/ne | ano |  |  |  |
| `offer.validityDays` | celé číslo | ano |  | hodnota 0–365 |  |
