# Entity modulu Kontakty

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr entit modulu (`ModuleServer.entities`), manifest a schéma tabulek). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Entity modulu [Kontakty](../moduly/kontakty.md). Typy atributů vysvětluje [ARCHITECTURE](../../ARCHITECTURE.md); každý atribut dává tabulce, filtrům, řazení, detailu, hledání a exportu typ a omezení bez dalšího kódu.

## company

**Firma** (množné číslo: Firmy). Firmy: klienti, dodavatelé a subdodavatelé v jedné evidenci.

- **Modul:** [Kontakty](../moduly/kontakty.md)
- **Tabulka:** `company` ([databáze](../databaze/kontakty.md))
- **Seznam:** `/kontakty/firmy`, detail `/kontakty/firmy/<id>`
- **Oprávnění:** read: `kontakty.read`, write: `kontakty.write`
- **Název záznamu:** `name`
- **Rozsah „jen moje“:** sloupce `owner_id`
- **Háčky a rozšíření entity:** `search`, `ownerDefaults`
- **Definice:** `packages/modules/kontakty/src/entities.ts`

### Pole entity `company`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `name` | Název | text | ano |  |  |  |  | `name` |
| `ico` | IČO | text | ne |  |  |  |  | `ico` |
| `roles` | Role | multiselect | ne | `client`, `supplier`, `subcontractor` |  |  |  | `roles` |
| `city` | Město | text | ne |  |  |  |  | `city` |
| `email` | E-mail | email | ne |  |  |  |  | `email` |
| `phone` | Telefon | phone | ne |  |  |  |  | `phone` |
| `owner` | Vlastník | user | ne |  |  |  |  | `owner_id` |
| `type` | Typ kontaktu | select | ne | číselník `company.type` |  |  |  | `type` |
| `parent` | Mateřská firma | record | ne | vazba na [`company`](kontakty.md#company) |  |  |  | `parent_company_id` |
| `tags` | Štítky | multiselect | ne | číselník `contact.tag` |  |  |  | `tags` |
| `dic` | DIČ | text | ne |  |  |  |  | `dic` |
| `street` | Ulice | text | ne |  |  |  |  | `street` |
| `zip` | PSČ | text | ne |  |  |  |  | `zip` |
| `web` | Web | url | ne |  |  |  |  | `web` |
| `note` | Poznámka | longtext | ne |  |  |  |  | `note` |

## person

**Osoba** (množné číslo: Osoby). Kontaktní osoby, volitelně u firmy.

- **Modul:** [Kontakty](../moduly/kontakty.md)
- **Tabulka:** `person` ([databáze](../databaze/kontakty.md))
- **Seznam:** `/kontakty/osoby`, detail `/kontakty/osoby/<id>`
- **Oprávnění:** read: `kontakty.read`, write: `kontakty.write`
- **Název záznamu:** `name`
- **Rozsah „jen moje“:** sloupce `owner_id`
- **Háčky a rozšíření entity:** `search`, `ownerDefaults`
- **Definice:** `packages/modules/kontakty/src/entities.ts`

### Pole entity `person`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `name` | Jméno | text | ano |  |  |  |  | `name` |
| `company` | Firma | record | ne | vazba na [`company`](kontakty.md#company) |  |  |  | `company_id` |
| `position` | Funkce | text | ne |  |  |  |  | `position` |
| `role` | Role | select | ne | číselník `person.role` |  |  |  | `role` |
| `tags` | Štítky | multiselect | ne | číselník `contact.tag` |  |  |  | `tags` |
| `emailType` | Typ e-mailu | select | ne | číselník `contact.point_type` |  |  |  | `email_type` |
| `phoneType` | Typ telefonu | select | ne | číselník `contact.point_type` |  |  |  | `phone_type` |
| `email` | E-mail | email | ne |  |  |  |  | `email` |
| `phone` | Telefon | phone | ne |  |  |  |  | `phone` |
| `owner` | Vlastník | user | ne |  |  |  |  | `owner_id` |
| `note` | Poznámka | longtext | ne |  |  |  |  | `note` |
