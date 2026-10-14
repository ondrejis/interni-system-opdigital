# Příkazy modulu Realizace

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [Realizace](../moduly/realizace.md). Počet příkazů: 24.

### realizace.defects.open

Otevřené vady zakázky pro kartu na Přehledu (nejdřív po termínu, pak podle stáří).

- **Oprávnění:** `realizace.read` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/defects.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### realizace.diary.delete

- **Oprávnění:** `realizace.write` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/diary.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### realizace.diary.list

- **Oprávnění:** `realizace.read` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/diary.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### realizace.diary.prefill

Předvyplnění zápisu z docházky, strojů a skladu toho dne (dodávají je ostatní moduly, pokud běží).

- **Oprávnění:** `realizace.read` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/diary.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `date` | datum | ano |  |  |  |

### realizace.diary.print

Všechny zápisy v období pro tisk deníku (bez cen).

- **Oprávnění:** `realizace.read` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/diary.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `from` | datum (nebo null) | ne |  |  |  |
| `to` | datum (nebo null) | ne |  |  |  |

### realizace.diary.save

- **Oprávnění:** `realizace.read` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/diary.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `date` | datum | ano |  |  |  |
| `weather` | text (nebo null) | ne |  | délka ≤ 60 |  |
| `temperature` | celé číslo (nebo null) | ne |  | hodnota -60–60 |  |
| `weatherData` | objekt (nebo null) | ne |  |  |  |
| `weatherData.code` | celé číslo (nebo null) | ne |  | hodnota 0–99 |  |
| `weatherData.label` | text | ano |  | délka 1–60 |  |
| `weatherData.tempMin` | číslo (nebo null) | ne |  | hodnota -60–60 |  |
| `weatherData.tempMax` | číslo (nebo null) | ne |  | hodnota -60–60 |  |
| `weatherData.precipMm` | číslo (nebo null) | ne |  | hodnota 0–1000 |  |
| `weatherData.windKmh` | číslo (nebo null) | ne |  | hodnota 0–400 |  |
| `weatherData.source` | enum | ne | `open-meteo`, `manual` | výchozí `"manual"` |  |
| `weatherData.fetchedAt` | text | ne |  | délka ≤ 40 |  |
| `autoWeather` | ano/ne | ne |  |  |  |
| `people` | text (nebo null) | ne |  | délka ≤ 2000 |  |
| `work` | text (nebo null) | ne |  | délka ≤ 5000 |  |
| `machines` | text (nebo null) | ne |  | délka ≤ 2000 |  |
| `materials` | text (nebo null) | ne |  | délka ≤ 2000 |  |
| `events` | text (nebo null) | ne |  | délka ≤ 5000 |  |
| `workers` | pole objektů | ne |  | počet ≤ 60 |  |
| `workers[].userId` | uuid (nebo null) | ne |  |  |  |
| `workers[].name` | text | ano |  | délka 1–120 |  |
| `workers[].hours` | číslo (nebo null) | ne |  | hodnota 0–24 |  |
| `workers[].source` | enum | ne | `attendance`, `manual` | výchozí `"manual"` |  |
| `materialRows` | pole objektů | ne |  | počet ≤ 100 |  |
| `materialRows[].id` | text | ano |  | délka 8–64 |  |
| `materialRows[].name` | text | ano |  | délka 1–160 |  |
| `materialRows[].qty` | text | ano |  |  |  |
| `materialRows[].unit` | text | ano |  | délka 1–20 |  |
| `materialRows[].supplier` | text (nebo null) | ne |  | délka ≤ 120 |  |
| `materialRows[].unitPriceMinor` | celé číslo (nebo null) | ne |  | hodnota 0–1000000000000 |  |
| `materialRows[].source` | enum | ne | `manual`, `sklad` | výchozí `"manual"` |  |
| `machineRows` | pole objektů | ne |  | počet ≤ 40 |  |
| `machineRows[].name` | text | ano |  | délka 1–120 |  |
| `machineRows[].hours` | číslo (nebo null) | ne |  | hodnota 0–24 |  |
| `machineRows[].note` | text (nebo null) | ne |  | délka ≤ 300 |  |
| `machineRows[].source` | enum | ne | `manual`, `stroje` | výchozí `"manual"` |  |
| `incidents` | pole objektů | ne |  | počet ≤ 30 |  |
| `incidents[].id` | text | ano |  | délka 8–64 |  |
| `incidents[].kind` | enum | ano | `incident`, `defect` |  |  |
| `incidents[].text` | text | ano |  | délka 1–2000 |  |
| `incidents[].defectId` | uuid (nebo null) | ne |  |  |  |
| `photoIds` | pole (uuid) | ne |  | počet ≤ 40 |  |
| `forInvestor` | ano/ne | ne |  |  |  |

### realizace.diary.sign

Podpis zápisu: soubor s podpisem (ručně, nebo podpis z předání) musí být připojený k téže zakázce.

- **Oprávnění:** `realizace.read` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/diary.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `signatureFileId` | uuid | ano |  |  |  |
| `name` | text | ano |  | délka 2–120 |  |

### realizace.diary.unsign

- **Oprávnění:** `realizace.write` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/diary.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### realizace.diary.weather

- **Oprávnění:** `realizace.read` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/diary.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `date` | datum | ano |  |  |  |

### realizace.handover.delete

- **Oprávnění:** `realizace.write` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### realizace.handover.list

- **Oprávnění:** `realizace.read` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### realizace.handover.save

- **Oprávnění:** `realizace.write` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `id` | uuid | ne |  |  |  |
| `date` | datum | ano |  |  |  |
| `note` | text (nebo null) | ne |  | délka ≤ 3000 |  |
| `acceptedBy` | text (nebo null) | ne |  | délka ≤ 120 |  |
| `items` | pole objektů | ano |  | počet ≤ 100 |  |
| `items[].text` | text | ano |  | délka 1–300 |  |
| `items[].ok` | ano/ne | ano |  |  |  |
| `items[].note` | text (nebo null) | ne |  | délka ≤ 500 |  |

### realizace.handover.sign

Podpis zákazníka: soubor s podpisem musí být připojený k téže zakázce. Podepsaný protokol je neměnný.

- **Oprávnění:** `realizace.write` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `signatureFileId` | uuid | ano |  |  |  |
| `acceptedBy` | text | ano |  | délka 2–120 |  |

### realizace.investor.view

Data Realizace pro veřejnou stránku investora (odkaz jen ke čtení). Příkaz smí volat jen systémový kontext aplikace, který předtím ověřil token odkazu; přihlášený uživatel ho přes `runCommand` volat nesmí, jinak by si mohl vyžádat cizí zakázku. Vrací jen to, co rozsah dovolí, a nikdy ceny, hodiny ani osobní údaje nad rámec jmen.

- **Oprávnění:** stačí přihlášení; přístup k datům hlídá vrstva dat (viz [ADR 007](../../adr/007-opravneni-v-datove-vrstve.md))
- **Definice:** `packages/modules/realizace/src/investor.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `scope` | objekt | ano |  |  |  |
| `scope.schedule` | ano/ne | ano |  |  |  |
| `scope.diary` | enum | ano | `none`, `flagged`, `all` |  |  |

### realizace.overview

Přehled všech zakázek s harmonogramem (v rozsahu, který aktér vidí): průběh, zpoždění, nejbližší fáze.

- **Oprávnění:** `realizace.read` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/server.ts`

_Bez vstupních polí._

### realizace.phases.delete

- **Oprávnění:** `realizace.read` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### realizace.phases.list

- **Oprávnění:** `realizace.read` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### realizace.phases.move

Přetažení pruhu v Ganttu: nové datum začátku a konce, volitelně s posunem navazujících.

- **Oprávnění:** `realizace.read` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `id` | uuid | ano |  |  |  |
| `startDate` | datum | ano |  |  |  |
| `endDate` | datum | ano |  |  |  |
| `shift` | ano/ne | ne |  | výchozí `true` |  |

### realizace.phases.save

- **Oprávnění:** `realizace.read` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `id` | uuid | ne |  |  |  |
| `name` | text | ano |  | délka 2–120 |  |
| `startDate` | datum | ano |  |  |  |
| `endDate` | datum | ano |  |  |  |
| `actualStart` | datum (nebo null) | ne |  |  |  |
| `actualEnd` | datum (nebo null) | ne |  |  |  |
| `progress` | celé číslo | ne |  | hodnota 0–100; výchozí `0` |  |
| `plannedHours` | celé číslo (nebo null) | ne |  | hodnota 0–100000 |  |
| `responsibleId` | uuid (nebo null) | ne |  |  |  |
| `dependsOnId` | uuid (nebo null) | ne |  |  |  |
| `milestone` | ano/ne | ne |  | výchozí `false` |  |
| `note` | text (nebo null) | ne |  | délka ≤ 1000 |  |
| `shift` | ano/ne | ne |  | výchozí `true` |  |

### realizace.phases.setBaseline

Aktuální plán se stane novým výchozím (např. po dohodě se zákazníkem o posunu).

- **Oprávnění:** `realizace.read` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### realizace.phases.setProgress

- **Oprávnění:** `realizace.read` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `id` | uuid | ano |  |  |  |
| `progress` | celé číslo | ano |  | hodnota 0–100 |  |

### realizace.terminal.defect

Nahlášení závady z terminálu: založí vadu zakázky (stejně jako záložka Vady; tým zakázky dostane upozornění).

- **Oprávnění:** `realizace.write` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/terminal.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `title` | text | ano |  | délka 3–200 |  |
| `description` | text (nebo null) | ne |  | délka ≤ 2000 |  |
| `severity` | enum | ne | `minor`, `normal`, `major` | výchozí `"normal"` |  |
| `at` | datum a čas (nebo null) | ne |  |  |  |

### realizace.terminal.note

Přidá řádek do dnešního zápisu stavebního deníku (při prvním zápisu dne ho založí). Řádek se vždy připojuje na konec, takže zápisy kolegů téhož dne se nepřepíšou. Podepsaný zápis se nemění (česká hláška).

- **Oprávnění:** `realizace.write` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/terminal.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `text` | text | ano |  | délka 1–2000 |  |
| `section` | enum | ne | `work`, `events` | výchozí `"work"` |  |
| `at` | datum a čas (nebo null) | ne |  |  |  |

### realizace.terminal.today

Co se na stavbách řemeslníka dnes dělá: fáze harmonogramu, které dnes běží nebo v nejbližších dnech začnou (jen nedokončené), a zda je za dnešek zapsaný deník. Jen zakázky, které aktér smí vidět; žádné ceny.

- **Oprávnění:** `realizace.read` (stačí kterékoli)
- **Definice:** `packages/modules/realizace/src/terminal.ts`

_Bez vstupních polí._
