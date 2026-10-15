# Entity modulu Organizace a kontakty

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr entit modulu (`ModuleServer.entities`), manifest a schéma tabulek). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Entity modulu [Organizace a kontakty](../moduly/kontakty.md). Typy atributů vysvětluje [ARCHITECTURE](../../ARCHITECTURE.md); každý atribut dává tabulce, filtrům, řazení, detailu, hledání a exportu typ a omezení bez dalšího kódu.

## company

**Organizace** (množné číslo: Organizace). Organizace: klienti, potenciální klienti, dodavatelé a ostatní firmy v jedné evidenci (klient = `client_status`).

- **Modul:** [Organizace a kontakty](../moduly/kontakty.md)
- **Tabulka:** `company` ([databáze](../databaze/kontakty.md))
- **Seznam:** `/kontakty/firmy`, detail `/kontakty/firmy/<id>`
- **Oprávnění:** read: `kontakty.read`, write: `kontakty.write`, create: `kontakty.create`, delete: `kontakty.delete`, export: `kontakty.export`
- **Název záznamu:** `name`
- **Rozsah „jen moje“:** sloupce `owner_id`
- **Háčky a rozšíření entity:** `beforeCreate`, `beforeUpdate`, `search`, `ownerDefaults`
- **Definice:** `packages/modules/kontakty/src/entities.ts`

### Pole entity `company`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `name` | Název | text | ano |  |  |  |  | `name` |
| `ico` | IČO | text | ne |  |  |  |  | `ico` |
| `city` | Město | text | ne |  |  |  |  | `city` |
| `clientStatus` | Stav klienta | select | ne | `lead`, `active`, `paused`, `former` |  |  |  | `client_status` |
| `services` | Služby | multiselect | ne | `web`, `marketing`, `systemy` |  |  |  | `services` |
| `owner` | Vlastník | user | ne |  |  |  |  | `owner_id` |
| `lastActivityAt` | Poslední aktivita | date | ne |  |  |  | jen pro čtení | `last_activity_at` |
| `tags` | Štítky | multiselect | ne | číselník `tag` |  |  |  | `tags` |
| `officialName` | Oficiální název | text | ne |  |  |  |  | `official_name` |
| `dic` | DIČ | text | ne |  |  |  |  | `dic` |
| `legalForm` | Právní forma | text | ne |  |  |  |  | `legal_form` |
| `street` | Ulice | text | ne |  |  |  |  | `street` |
| `zip` | PSČ | text | ne |  |  |  |  | `zip` |
| `country` | Země | text | ne |  |  |  |  | `country` |
| `web` | Web | url | ne |  |  |  |  | `web` |
| `email` | E-mail | email | ne |  |  |  |  | `email` |
| `phone` | Telefon | phone | ne |  |  |  |  | `phone` |
| `industry` | Obor | text | ne |  |  |  |  | `industry` |
| `clientSince` | Klient od | date | ne |  |  |  |  | `client_since` |
| `clientUntil` | Klient do | date | ne |  |  |  |  | `client_until` |
| `clientEndReason` | Důvod ukončení | longtext | ne |  |  |  |  | `client_end_reason` |
| `driveStatus` | Složka na Disku | select | ne | `none`, `pending`, `ready`, `error`, `timeout` |  |  | jen pro čtení | `drive_status` |
| `aresSyncedAt` | ARES aktualizováno | date | ne |  |  |  | jen pro čtení | `ares_synced_at` |
| `webDomain` | Doména webu | text | ne |  |  |  | jen pro čtení | `web_domain` |

## person

**Kontakt** (množné číslo: Kontakty). Kontaktní osoby, volitelně u organizace; e-maily a telefony jsou v `person_contact_point`.

- **Modul:** [Organizace a kontakty](../moduly/kontakty.md)
- **Tabulka:** `person` ([databáze](../databaze/kontakty.md))
- **Seznam:** `/kontakty/osoby`, detail `/kontakty/osoby/<id>`
- **Oprávnění:** read: `kontakty.read`, write: `kontakty.write`, create: `kontakty.create`, delete: `kontakty.delete`, export: `kontakty.export`
- **Název záznamu:** `fullName`
- **Rozsah „jen moje“:** sloupce `owner_id`
- **Háčky a rozšíření entity:** `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `search`, `ownerDefaults`
- **Definice:** `packages/modules/kontakty/src/entities.ts`

### Pole entity `person`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fullName` | Jméno | text | ne |  |  |  | jen pro čtení | `full_name` |
| `firstName` | Křestní jméno | text | ne |  |  |  |  | `first_name` |
| `lastName` | Příjmení | text | ano |  |  |  |  | `last_name` |
| `company` | Organizace | record | ne | vazba na [`company`](kontakty.md#company) |  |  |  | `primary_company_id` |
| `position` | Pozice | text | ne |  |  |  |  | `position` |
| `phone` | Telefon | phone | ne |  |  |  |  | `primary_phone` |
| `email` | E-mail | email | ne |  |  |  |  | `primary_email` |
| `isDecisionMaker` | Rozhoduje | checkbox | ne |  |  |  |  | `is_decision_maker` |
| `owner` | Vlastník | user | ne |  |  |  |  | `owner_id` |
| `lastActivityAt` | Poslední aktivita | date | ne |  |  |  | jen pro čtení | `last_activity_at` |
| `tags` | Štítky | multiselect | ne | číselník `tag` |  |  |  | `tags` |
| `linkedin` | LinkedIn | url | ne |  |  |  |  | `linkedin` |
