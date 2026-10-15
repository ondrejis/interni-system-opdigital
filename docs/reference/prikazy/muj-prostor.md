# Příkazy modulu Můj prostor

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [Můj prostor](../moduly/muj-prostor.md). Počet příkazů: 25.

### muj-prostor.client.overview

Hosting, údržba a domény jednoho klienta pro záložku „Hosting a domény“ na kartě klienta (KLI-09).

- **Oprávnění:** `muj-prostor.hosting` nebo `muj-prostor.domains` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/hosting/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `companyId` | uuid | ano |  |  |  |

### muj-prostor.domains.assignClient

Přiřadí (nebo odebere) klienta u vybraných domén; po hromadném vložení se tak doplňují klienti.

- **Oprávnění:** `muj-prostor.domains` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/domains/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `ids` | pole (uuid) | ano |  | počet 1–500 |  |
| `companyId` | uuid (nebo null) | ano |  |  |  |

### muj-prostor.domains.bulkAdd

Hromadné vložení domén (DOM-04): text s jednou doménou na řádek. Neplatné zápisy, opakování v zadání a domény, které už evidované jsou, se přeskočí a vrátí se v odpovědi; ostatní se založí přes engine entity (historie, hledání) v jedné transakci. Klienta, registrátora a další hodnoty jde zadat pro všechny najednou; jinak se doplňují později.

- **Oprávnění:** `muj-prostor.domains` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/domains/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `text` | text | ano |  | délka ≤ 200000 |  |
| `defaults` | objekt | ne |  |  |  |
| `defaults.companyId` | uuid (nebo null) | ne |  |  |  |
| `defaults.registrar` | text (nebo null) | ne |  | délka ≤ 120 |  |
| `defaults.payer` | enum | ne | `agency`, `client` |  |  |
| `defaults.autoRenew` | ano/ne | ne |  |  |  |
| `defaults.warnDays` | celé číslo | ne |  | hodnota 1–365 |  |

### muj-prostor.domains.list

Seznam domén s popisky klienta a hostingu a souhrnem (barvy expirace se dopočítají podle `today`).

- **Oprávnění:** `muj-prostor.domains` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/domains/commands.ts`

_Bez vstupních polí._

### muj-prostor.fakturoid.disconnect

Odpojí Fakturoid.

- **Oprávnění:** `muj-prostor.recurring_invoices` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/invoices/commands.ts`

_Bez vstupních polí._

### muj-prostor.fakturoid.save

Uloží přístup k Fakturoidu (šifrovaně; vyžaduje i `settings.integrations`).

- **Oprávnění:** `muj-prostor.recurring_invoices` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/invoices/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `account` | text | ano |  | délka 1–100 |  |
| `clientId` | text | ano |  | délka 1–200 |  |
| `clientSecret` | text | ne |  | délka ≤ 500 |  |
| `contactEmail` | e-mail | ano |  | délka ≤ 200 |  |

### muj-prostor.fakturoid.status

Stav nastavení Fakturoidu (bez tajemství).

- **Oprávnění:** `muj-prostor.recurring_invoices` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/invoices/commands.ts`

_Bez vstupních polí._

### muj-prostor.fakturoid.test

Test spojení s Fakturoidem.

- **Oprávnění:** `muj-prostor.recurring_invoices` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/invoices/commands.ts`

_Bez vstupních polí._

### muj-prostor.hosting.markRenewed

Označí obnovu jako vyfakturovanou: další obnova se posune o období (HOST-03, R-47). Jen aktivní služba s vyplněným datem. Dvojí kliknutí nebo druhé okno nic nezdvojí: příkaz nese datum, které uživatel viděl, a při neshodě skončí chybou. Změna jde přes engine entity, takže je v historii před → po.

- **Oprávnění:** `muj-prostor.hosting` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/hosting/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `expectedNextRenewal` | datum | ano |  |  |  |

### muj-prostor.hosting.overview

Souhrn hostingu a údržby a nejbližší obnovy (karty nad seznamem a panel „K obnově“).

- **Oprávnění:** `muj-prostor.hosting` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/hosting/commands.ts`

_Bez vstupních polí._

### muj-prostor.hosting.undoRenewed

Vrátí poslední posun obnovy (tlačítko „Zpět“ v oznámení): jen když má služba pořád datum, na které ji posunula `markRenewed`; jinak by přepsala pozdější úpravu.

- **Oprávnění:** `muj-prostor.hosting` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/hosting/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `from` | datum | ano |  |  |  |
| `to` | datum | ano |  |  |  |

### muj-prostor.invoices.approve

Schválit a vytvořit ve Fakturoidu: faktura, posun obnovy, platba vlastníkovi (idempotentní).

- **Oprávnění:** `muj-prostor.recurring_invoices` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/invoices/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `expectedAmountMinor` | celé číslo | ano |  | hodnota ≥ 0 |  |

### muj-prostor.invoices.cancel

Zruší návrh.

- **Oprávnění:** `muj-prostor.recurring_invoices` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/invoices/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### muj-prostor.invoices.overview

Návrhy a hotové faktury, souhrn a stav Fakturoidu (stránka Opakované faktury, sekce na kartě klienta).

- **Oprávnění:** `muj-prostor.recurring_invoices` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/invoices/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `companyId` | uuid | ne |  |  |  |

### muj-prostor.invoices.prepare

Ručně připraví návrhy (totéž co denní úloha); idempotentní.

- **Oprávnění:** `muj-prostor.recurring_invoices` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/invoices/commands.ts`

_Bez vstupních polí._

### muj-prostor.invoices.reopen

Vrátí zrušený návrh do konceptu.

- **Oprávnění:** `muj-prostor.recurring_invoices` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/invoices/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### muj-prostor.invoices.retryPayment

Doplní chybějící platbu u hotové faktury.

- **Oprávnění:** `muj-prostor.recurring_invoices` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/invoices/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### muj-prostor.invoices.update

Upraví částku konceptu.

- **Oprávnění:** `muj-prostor.recurring_invoices` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/invoices/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `amountMinor` | celé číslo | ano |  | hodnota 0–9999999999 |  |

### muj-prostor.library.list

Hledání a seznam e-mailové knihovny s počty kategorií a štítků.

- **Oprávnění:** `muj-prostor.email_library` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/library/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `q` | text | ne |  | délka ≤ 200 |  |
| `category` | text | ne |  | délka ≤ 120 |  |
| `tag` | text | ne |  | délka ≤ 120 |  |
| `sort` | enum | ne | `title`, `updated` |  |  |

### muj-prostor.library.move

Přesun nebo kopie textu mezi knihovnou a sdílenými šablonami.

- **Oprávnění:** `muj-prostor.email_library` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/library/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `(vstup)` | jedna z variant | ano |  |  |  |
| `direction` | konstanta | ne | `toTemplates` |  |  |
| `id` | uuid | ne |  |  |  |
| `language` | enum | ne | `cs`, `sk`, `en` |  |  |
| `keepSource` | ano/ne | ne |  |  |  |

### muj-prostor.library.pick

Hledání záznamů pro výběr v náhledu.

- **Oprávnění:** `muj-prostor.email_library` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/library/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `kind` | enum | ano | `person`, `company`, `deal`, `job` |  |  |
| `q` | text | ne |  | délka ≤ 120 |  |

### muj-prostor.library.preview

Text položky vyplněný daty vybraného kontaktu, organizace, obchodu a zakázky, s odkazy do Gmailu.

- **Oprávnění:** `muj-prostor.email_library` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/library/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `context` | objekt | ne |  |  |  |
| `context.personId` | uuid (nebo null) | ne |  |  |  |
| `context.companyId` | uuid (nebo null) | ne |  |  |  |
| `context.dealId` | uuid (nebo null) | ne |  |  |  |
| `context.jobId` | uuid (nebo null) | ne |  |  |  |

### muj-prostor.library.variables

Katalog proměnných textu (stejný jako u šablon e-mailů).

- **Oprávnění:** `muj-prostor.email_library` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/library/commands.ts`

_Bez vstupních polí._

### muj-prostor.private.createNote

Nová samostatná soukromá poznámka; zakládá ji služba `tasks` (modul Úkoly a poznámky).

- **Oprávnění:** `muj-prostor.private_overview` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/private/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `title` | text | ne |  | délka ≤ 200; výchozí `""` |  |
| `text` | text | ano |  | délka 1–50000 |  |

### muj-prostor.private.overview

Všechny soukromé záznamy na jednom místě, seskupené podle typu.

- **Oprávnění:** `muj-prostor.private_overview` (stačí kterékoli)
- **Definice:** `packages/modules/muj-prostor/src/private/commands.ts`

_Bez vstupních polí._
