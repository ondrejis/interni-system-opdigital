# Příkazy modulu Zakázky

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [Zakázky](../moduly/zakazky.md). Počet příkazů: 80.

### zakazky.approval.decide

- **Oprávnění:** `zakazky.approve` nebo `zakazky.approve_all` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/approvals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `approvalId` | uuid | ano |  |  |  |
| `approve` | ano/ne | ano |  |  |  |
| `comment` | text (nebo null) | ne |  | délka ≤ 1000 |  |

### zakazky.approval.queue

- **Oprávnění:** `zakazky.approve` nebo `zakazky.approve_all` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/approvals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `status` | enum | ne | `pending`, `decided` | výchozí `"pending"` |  |

### zakazky.approval.reopen

- **Oprávnění:** stačí přihlášení; přístup k datům hlídá vrstva dat (viz [ADR 007](../../adr/007-opravneni-v-datove-vrstve.md))
- **Definice:** `packages/modules/zakazky/src/approvals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `docType` | enum | ano | `change`, `statement`, `order`, `received_invoice` |  |  |
| `docId` | uuid | ano |  |  |  |
| `reason` | text (nebo null) | ne |  | délka ≤ 500 |  |

### zakazky.approval.rules.delete

- **Oprávnění:** `zakazky.approve_all` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/approvals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.approval.rules.list

- **Oprávnění:** `zakazky.approve_all` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/approvals/commands.ts`

_Bez vstupních polí._

### zakazky.approval.rules.save

- **Oprávnění:** `zakazky.approve_all` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/approvals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ne |  |  |  |
| `docType` | enum | ano | `change`, `statement`, `order`, `received_invoice` |  |  |
| `minAmountMinor` | celé číslo | ano |  | hodnota 0–9000000000000 |  |
| `approverPermission` | enum (nebo null) | ne | `zakazky.approve`, `zakazky.approve_all` |  |  |
| `approverId` | uuid (nebo null) | ne |  |  |  |
| `active` | ano/ne | ne |  | výchozí `true` |  |

### zakazky.approval.state

- **Oprávnění:** stačí přihlášení; přístup k datům hlídá vrstva dat (viz [ADR 007](../../adr/007-opravneni-v-datove-vrstve.md))
- **Definice:** `packages/modules/zakazky/src/approvals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `docType` | enum | ano | `change`, `statement`, `order`, `received_invoice` |  |  |
| `docId` | uuid | ano |  |  |  |

### zakazky.budget.calc.delete

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/budget/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.budget.calc.list

- **Oprávnění:** `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/budget/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `itemId` | uuid | ano |  |  |  |

### zakazky.budget.calc.replace

Nahradí všechny řádky výkazu výměr položky (dialog ukládá celou tabulku najednou).

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/budget/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `itemId` | uuid | ano |  |  |  |
| `lines` | pole objektů | ano |  | počet ≤ 200 |  |
| `lines[].id` | uuid | ne |  |  |  |
| `lines[].variable` | libovolné \| konstanta | ne |  |  |  |
| `lines[].description` | text (nebo null) | ne |  | délka ≤ 200 |  |
| `lines[].formula` | text | ano |  | délka ≤ 300 |  |

### zakazky.budget.calc.save

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/budget/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `itemId` | uuid | ne |  |  |  |
| `id` | uuid | ne |  |  |  |
| `variable` | libovolné \| konstanta | ne |  |  |  |
| `description` | text (nebo null) | ne |  | délka ≤ 200 |  |
| `formula` | text | ano |  | délka ≤ 300 |  |

### zakazky.budget.copyOffer

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/budget/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### zakazky.budget.item.bulk

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/budget/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `ids` | pole (uuid) | ano |  | počet 1–500 |  |
| `patch` | objekt | ano |  |  |  |
| `patch.kind` | enum | ne | `labour`, `material`, `subcontract`, `machines`, `other` |  |  |
| `patch.vatRateBp` | celé číslo | ne |  | hodnota 0–10000 |  |
| `patch.sectionId` | uuid | ne |  |  |  |
| `patch.unitPriceMinor` | celé číslo | ne |  | hodnota -9000000000000–9000000000000 |  |
| `patch.unitCostMinor` | celé číslo | ne |  | hodnota -9000000000000–9000000000000 |  |
| `patch.priceAdjustPct` | číslo | ne |  | hodnota -100–1000 |  |
| `patch.costAdjustPct` | číslo | ne |  | hodnota -100–1000 |  |

### zakazky.budget.item.delete

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/budget/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `ids` | pole (uuid) | ano |  | počet 1–500 |  |

### zakazky.budget.item.duplicate

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/budget/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.budget.item.move

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/budget/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `sectionId` | uuid | ne |  |  |  |
| `index` | celé číslo | ne |  | hodnota ≥ 0 |  |

### zakazky.budget.item.save

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/budget/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ne |  |  |  |
| `sectionId` | uuid | ne |  |  |  |
| `index` | celé číslo | ne |  | hodnota ≥ 0 |  |
| `code` | text (nebo null) | ne |  | délka ≤ 40 |  |
| `title` | text | ne |  | délka 1–300 |  |
| `kind` | enum | ne | `labour`, `material`, `subcontract`, `machines`, `other` |  |  |
| `unit` | text | ne |  | délka 1–12 |  |
| `quantity` | text | ne |  |  |  |
| `unitCostMinor` | celé číslo | ne |  | hodnota -9000000000000–9000000000000 |  |
| `unitPriceMinor` | celé číslo | ne |  | hodnota -9000000000000–9000000000000 |  |
| `vatRateBp` | celé číslo | ne |  | hodnota 0–10000 |  |
| `startDate` | datum (nebo null) | ne |  |  |  |
| `endDate` | datum (nebo null) | ne |  |  |  |
| `spec` | text (nebo null) | ne |  | délka ≤ 4000 |  |
| `note` | text (nebo null) | ne |  | délka ≤ 2000 |  |

### zakazky.budget.object.delete

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/budget/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.budget.object.save

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/budget/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ne |  |  |  |
| `versionId` | uuid | ne |  |  |  |
| `code` | text (nebo null) | ne |  | délka ≤ 40 |  |
| `title` | text | ne |  | délka 1–200 |  |
| `responsibleId` | uuid (nebo null) | ne |  |  |  |

### zakazky.budget.section.delete

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/budget/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `cascade` | ano/ne | ne |  | výchozí `false` |  |

### zakazky.budget.section.move

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/budget/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `parentId` | uuid (nebo null) | ne |  |  |  |
| `objectId` | uuid | ne |  |  |  |
| `index` | celé číslo | ne |  | hodnota ≥ 0 |  |

### zakazky.budget.section.save

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/budget/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ne |  |  |  |
| `versionId` | uuid | ne |  |  |  |
| `objectId` | uuid | ne |  |  |  |
| `parentId` | uuid (nebo null) | ne |  |  |  |
| `code` | text (nebo null) | ne |  | délka ≤ 40 |  |
| `title` | text | ne |  | délka 1–200 |  |
| `costCategory` | enum (nebo null) | ne | `labour`, `material`, `subcontract`, `machines`, `other` |  |  |

### zakazky.budget.tree

- **Oprávnění:** `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/budget/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `versionId` | uuid (nebo null) | ne |  |  |  |

### zakazky.budget.version.create

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/budget/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `kind` | enum | ne | `offer`, `realization` |  |  |
| `title` | text (nebo null) | ne |  | délka ≤ 120 |  |
| `copyFromVersionId` | uuid (nebo null) | ne |  |  |  |

### zakazky.budget.version.list

- **Oprávnění:** `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/budget/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### zakazky.budget.version.lock

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/budget/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `versionId` | uuid | ano |  |  |  |

### zakazky.budget.version.setStatus

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/budget/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `versionId` | uuid | ano |  |  |  |
| `status` | enum | ne | `draft`, `sent` |  |  |
| `title` | text (nebo null) | ne |  | délka ≤ 120 |  |
| `note` | text (nebo null) | ne |  | délka ≤ 2000 |  |

### zakazky.change.create

- **Oprávnění:** `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/changes/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `title` | text | ne |  | délka ≤ 200 |  |
| `itemId` | uuid | ne |  |  |  |

### zakazky.change.decide

Rozhodnutí o změně (obálka nad `approvalsApi.decide`; oprávnění a limit hlídá schvalování).

- **Oprávnění:** `zakazky.approve` nebo `zakazky.approve_all` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/changes/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `approve` | ano/ne | ano |  |  |  |
| `comment` | text (nebo null) | ne |  | délka ≤ 1000 |  |

### zakazky.change.delete

- **Oprávnění:** `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/changes/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.change.get

- **Oprávnění:** `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/changes/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.change.items

Položky a oddíly realizační verze pro výběr v editoru změny.

- **Oprávnění:** `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/changes/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### zakazky.change.line.delete

- **Oprávnění:** `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/changes/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.change.line.save

- **Oprávnění:** `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/changes/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `changeId` | uuid | ano |  |  |  |
| `id` | uuid | ne |  |  |  |
| `kind` | enum | ano | `add`, `qty`, `remove` |  |  |
| `itemId` | uuid (nebo null) | ne |  |  |  |
| `sectionId` | uuid (nebo null) | ne |  |  |  |
| `title` | text | ne |  | délka ≤ 300 |  |
| `unit` | text | ne |  | délka ≤ 12 |  |
| `itemKind` | text | ne |  | délka ≤ 20 |  |
| `quantityAfter` | text | ne |  | vzor `^\d{1,11}([.,]\d{1,3})?$` |  |
| `unitCostMinor` | celé číslo | ne |  | hodnota 0–9000000000000 |  |
| `unitPriceMinor` | celé číslo | ne |  | hodnota 0–9000000000000 |  |
| `vatRateBp` | celé číslo | ne |  | hodnota 0–10000 |  |

### zakazky.change.list

- **Oprávnění:** `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/changes/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### zakazky.change.reopen

- **Oprávnění:** `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/changes/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `reason` | text (nebo null) | ne |  | délka ≤ 500 |  |

### zakazky.change.save

- **Oprávnění:** `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/changes/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `title` | text | ano |  | délka 2–200 |  |
| `description` | text (nebo null) | ne |  | délka ≤ 2000 |  |
| `reason` | text (nebo null) | ne |  | délka ≤ 1000 |  |

### zakazky.change.submit

Odešle změnu ke schválení: srovná řádky s rozpočtem, přepočte částku a požádá o schválení.

- **Oprávnění:** `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/changes/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.changes.createDraft

Stejné jako `create`; název, který volá rozpočet („Nová změna z řádku rozpočtu“).

- **Oprávnění:** `zakazky.economics` nebo `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/changes/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `itemId` | uuid | ne |  |  |  |

### zakazky.costs.allocate

Spáruje náklad na oddíl (a případně položku) rozpočtu. `source` a `ref` jsou z řádku seznamu (`allocSource`, `ref`). Víc částí = rozpad na víc oddílů, součet musí sedět; prázdné `parts` párování zruší.

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/costs/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `source` | text | ano |  | délka 1–40 |  |
| `ref` | text | ano |  | délka 1–200 |  |
| `parts` | pole objektů | ano |  | počet ≤ 20 |  |
| `parts[].sectionId` | uuid | ano |  |  |  |
| `parts[].itemId` | uuid (nebo null) | ne |  |  |  |
| `parts[].amountMinor` | celé číslo (nebo null) | ne |  | hodnota ≤ 9000000000000 |  |

### zakazky.costs.autoAllocate

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/costs/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### zakazky.costs.delete

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/costs/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `id` | uuid | ano |  |  |  |

### zakazky.costs.list

- **Oprávnění:** `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/costs/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `source` | text | ne |  | délka ≤ 40 |  |
| `category` | text | ne |  | délka ≤ 40 |  |
| `sectionId` | uuid | ne |  |  |  |
| `status` | enum | ne | `paired`, `unpaired` |  |  |
| `q` | text | ne |  | délka ≤ 100 |  |
| `from` | datum | ne |  |  |  |
| `to` | datum | ne |  |  |  |

### zakazky.costs.plan

Plán vs skutečnost: strom objekt → oddíl s plánem, náklady, závazky, čerpáním a marží.

- **Oprávnění:** `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/costs/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### zakazky.costs.save

Ruční náklad: nový (bez `id`) nebo úprava. Rozpad a párování automatických nákladů řeší `allocate`.

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/costs/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `date` | datum | ano |  |  |  |
| `category` | enum | ano | `labour`, `material`, `machines`, `subcontract`, `other` |  |  |
| `title` | text | ano |  | délka 2–200 |  |
| `supplierId` | uuid (nebo null) | ne |  |  |  |
| `supplierName` | text (nebo null) | ne |  | délka ≤ 200 |  |
| `amountMinor` | celé číslo | ano |  | hodnota ≤ 9000000000000 |  |
| `sectionId` | uuid (nebo null) | ne |  |  |  |
| `itemId` | uuid (nebo null) | ne |  |  |  |
| `orderId` | uuid (nebo null) | ne |  |  |  |
| `jobId` | uuid | ano |  |  |  |
| `id` | uuid | ne |  |  |  |

### zakazky.costs.targets

Oddíly a položky aktuálního rozpočtu zakázky (výběr při párování a v řádcích přijaté faktury).

- **Oprávnění:** `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/costs/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### zakazky.orders.cancel

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.orders.delete

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.orders.get

- **Oprávnění:** `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/orders/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.orders.list

Objednávky zakázky s otevřeným závazkem (kolik z objednaného ještě nepokrývají náklady).

- **Oprávnění:** `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/orders/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### zakazky.orders.receive

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.orders.save

Nová objednávka (bez `id`) nebo úprava konceptu.

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/orders/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `id` | uuid | ne |  |  |  |
| `title` | text | ano |  | délka 2–200 |  |
| `supplierId` | uuid (nebo null) | ne |  |  |  |
| `supplierName` | text (nebo null) | ne |  | délka ≤ 200 |  |
| `sectionId` | uuid (nebo null) | ne |  |  |  |
| `orderDate` | datum (nebo null) | ne |  |  |  |
| `deliveryDate` | datum (nebo null) | ne |  |  |  |
| `note` | text (nebo null) | ne |  | délka ≤ 2000 |  |
| `lines` | pole objektů | ano |  | počet ≤ 200 |  |
| `lines[].description` | text | ano |  | délka 1–300 |  |
| `lines[].quantity` | text | ano |  | vzor `^-?\d{1,11}([.,]\d{1,3})?$` |  |
| `lines[].unit` | text | ano |  | délka 1–12 |  |
| `lines[].unitPriceMinor` | celé číslo | ano |  | hodnota -9000000000000–9000000000000 |  |
| `lines[].vatRateBp` | celé číslo | ano |  | hodnota 0–10000 |  |
| `lines[].itemId` | uuid (nebo null) | ne |  |  |  |

### zakazky.orders.submit

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.phase.preview

Pro každou možnou další fázi: jde přechod, a když ne, které kontroly nejsou splněné.

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/lifecycle/index.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### zakazky.share.create

- **Oprávnění:** `zakazky.share` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/share/index.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `label` | text | ano |  | délka 1–80 |  |
| `scope` | objekt | ano |  |  |  |
| `scope.schedule` | ano/ne | ne |  | výchozí `true` |  |
| `scope.diary` | enum | ne | `none`, `flagged`, `all` | výchozí `"flagged"` |  |
| `scope.photos` | ano/ne | ne |  | výchozí `false` |  |
| `scope.documentIds` | pole (uuid) | ne |  | počet ≤ 100; výchozí `[]` |  |
| `expiresInDays` | celé číslo (nebo null) | ne |  | hodnota 1–730 |  |

### zakazky.share.list

- **Oprávnění:** `zakazky.share` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/share/index.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### zakazky.share.revoke

- **Oprávnění:** `zakazky.share` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/share/index.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.share.update

- **Oprávnění:** `zakazky.share` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/share/index.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `label` | text | ano |  | délka 1–80 |  |
| `scope` | objekt | ano |  |  |  |
| `scope.schedule` | ano/ne | ne |  | výchozí `true` |  |
| `scope.diary` | enum | ne | `none`, `flagged`, `all` | výchozí `"flagged"` |  |
| `scope.photos` | ano/ne | ne |  | výchozí `false` |  |
| `scope.documentIds` | pole (uuid) | ne |  | počet ≤ 100; výchozí `[]` |  |

### zakazky.statement.create

- **Oprávnění:** `zakazky.write` nebo `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/statements/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `periodFrom` | datum | ano |  |  |  |
| `periodTo` | datum | ano |  |  |  |
| `objectId` | uuid (nebo null) | ne |  |  |  |

### zakazky.statement.decide

- **Oprávnění:** `zakazky.approve` nebo `zakazky.approve_all` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/statements/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `approve` | ano/ne | ano |  |  |  |
| `comment` | text (nebo null) | ne |  | délka ≤ 1000 |  |

### zakazky.statement.delete

- **Oprávnění:** `zakazky.write` nebo `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/statements/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.statement.get

- **Oprávnění:** `zakazky.write` nebo `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/statements/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.statement.line.set

Zadání provedeného množství za období po položkách (dávka, aby šlo uložit celou tabulku najednou).

- **Oprávnění:** `zakazky.write` nebo `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/statements/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `statementId` | uuid | ano |  |  |  |
| `lines` | pole objektů | ano |  | počet 1–500 |  |
| `lines[].itemId` | uuid | ano |  |  |  |
| `lines[].quantityPeriod` | text | ano |  | vzor `^(\d{1,11}([.,]\d{1,3})?)?$` |  |

### zakazky.statement.list

- **Oprávnění:** `zakazky.write` nebo `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/statements/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### zakazky.statement.reopen

- **Oprávnění:** `zakazky.write` nebo `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/statements/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `reason` | text (nebo null) | ne |  | délka ≤ 500 |  |

### zakazky.statement.save

- **Oprávnění:** `zakazky.write` nebo `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/statements/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `periodFrom` | datum | ano |  |  |  |
| `periodTo` | datum | ano |  |  |  |
| `note` | text (nebo null) | ne |  | délka ≤ 2000 |  |

### zakazky.statement.setApproved

Schvalovatel může před schválením snížit schválenou částku (nad nárokovanou nejde).

- **Oprávnění:** `zakazky.approve` nebo `zakazky.approve_all` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/statements/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `approvedMinor` | celé číslo | ano |  | hodnota 0–9000000000000 |  |

### zakazky.statement.submit

- **Oprávnění:** `zakazky.write` nebo `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/statements/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.summary

Souhrn zakázky pro hlavičku, seznam a přehled (jediné místo, kde se čísla počítají).

- **Oprávnění:** `zakazky.economics` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/costs/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### zakazky.team.add

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `userId` | uuid | ano |  |  |  |
| `role` | text (nebo null) | ne |  | délka ≤ 60 |  |

### zakazky.team.list

- **Oprávnění:** stačí přihlášení; přístup k datům hlídá vrstva dat (viz [ADR 007](../../adr/007-opravneni-v-datove-vrstve.md))
- **Definice:** `packages/modules/zakazky/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### zakazky.team.remove

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `userId` | uuid | ano |  |  |  |

### zakazky.template.apply

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/templates/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `templateId` | uuid | ano |  |  |  |
| `versionId` | uuid (nebo null) | ne |  |  |  |

### zakazky.template.createFromJob

Vytvoří šablonu z existující zakázky (nebo přepíše šablonu `replaceId`).

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/templates/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `name` | text | ano |  | délka 2–120 |  |
| `description` | text (nebo null) | ne |  | délka ≤ 1000 |  |
| `versionId` | uuid (nebo null) | ne |  |  |  |
| `withPrices` | ano/ne | ne |  | výchozí `false` |  |
| `includeBudget` | ano/ne | ne |  | výchozí `true` |  |
| `includeTasks` | ano/ne | ne |  | výchozí `true` |  |
| `includeRoles` | ano/ne | ne |  | výchozí `true` |  |
| `replaceId` | uuid | ne |  |  |  |

### zakazky.template.delete

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/templates/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.template.get

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/templates/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.template.list

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/templates/commands.ts`

_Bez vstupních polí._

### zakazky.template.save

- **Oprávnění:** `zakazky.budget` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/templates/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `name` | text | ne |  | délka 2–120 |  |
| `description` | text (nebo null) | ne |  | délka ≤ 1000 |  |

### zakazky.terminal.sites

Zakázky, na kterých řemeslník právě pracuje (realizace a předání): adresa s polohou pro navigaci, kontakt na místě a tým. Jen zakázky, které aktér smí vidět (montér a mistr „jen moje“). Žádné ceny, sazby ani marže.

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/terminal.ts`

_Bez vstupních polí._

### zakazky.transition

Přechod zakázky do fáze. Je to jen pohodlný vstup do téže cesty jako změna stavu v tabulce nebo na kanbanu: vybere stav fáze (první, nebo zadaný) a změní ho přes entitu, takže platí stejné kontroly a hooky.

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/lifecycle/index.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `to` | enum | ano | `inquiry`, `offer`, `preparation`, `execution`, `handover`, `warranty`, `closed`, `lost`, `paused` |  |  |
| `stageId` | uuid | ne |  |  |  |
| `reason` | text | ne |  | délka ≤ 60 |  |
