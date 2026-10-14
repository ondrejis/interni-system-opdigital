# Platforma (jádro)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (`packages/core`: oprávnění platformy, úlohy jádra, nastavení, upozornění). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Jádro není modul: nemá manifest ani vypnutí. Poskytuje databázi, přihlášení, oprávnění, audit, entity, soubory, frontu úloh, nastavení a rozšíření. Podrobnosti o funkcích jádra jsou v [API referenci](../api/README.md).

## Oprávnění platformy

| Klíč | Název | Popis |
| --- | --- | --- |
| `users.manage` | Spravuje uživatele | Pozvánky, role, deaktivace |
| `roles.manage` | Spravuje role a oprávnění |  |
| `settings.manage` | Mění nastavení systému | Moduly, pipeline, číselníky, číselné řady, branding |
| `audit.read` | Vidí historii změn |  |
| `dashboards.write` | Skládá vlastní nástěnky | Osobní nástěnky z widgetů, jejich klonování a sdílení |
| `dashboards.manage` | Spravuje nástěnky | Výchozí nástěnky pro role, cizí a sdílené nástěnky (Nastavení → Nástěnky) |
| `exports.schedule` | Plánuje exporty a sdílí šablony exportů | Plány (denně, týdně, měsíčně) a sdílené šablony; export samotný vyžaduje čtení dat |
| `exports.manage` | Spravuje exporty všech | Vidí historii exportů všech, zastavuje cizí plány a mění nastavení exportů |
| `tasks.read` | Vidí úkoly | Rozsah „vše“ = úkoly všech, jinak jen vlastní a zadané |
| `tasks.assign` | Přiděluje úkoly ostatním |  |
| `comments.moderate` | Maže cizí komentáře |  |
| `files.manage` | Spravuje cizí soubory |  |
| `employees.read` | Vidí údaje zaměstnanců | Včetně hodinového nákladu |
| `employees.write` | Upravuje údaje zaměstnanců |  |
| `agency.access` | Servisní přístup agentury | Jen když ho klient povolí |

## Úlohy jádra

| Úloha | Plán (cron) | Opakování po chybě | Popis |
| --- | --- | --- | --- |
| `mail.send` | jen na požádání | 5 | Úloha „odeslat e-mail“. Opakuje se s prodlevou; stav a poslední chyba jsou v `email_log` (bez těla zprávy). |
| `file.thumbnail` | jen na požádání | výchozí |  |
| `files.purge` | `30 3 * * *` | 2 | Denně v noci: úklid souborů, které nikdo nepřipojil k záznamu. |
| `health.heartbeat` | `0 * * * *` | 3 | Každou hodinu: stav instance agentuře (jen verze a stav, bez osobních údajů). |
| `notification.dispatch` | `* * * * *` | 1 | Každou minutu a navíc hned po vzniku upozornění (worker poslouchá NOTIFY): odešle upozornění, jejichž čas nadešel (push, e-mail), opakuje selhaná doručení s prodlevou a uvolňuje zdržená po tichých hodinách a shrnutí. |
| `notification.taskDigest` | `0 7 * * 1-5` | 2 | Pracovní dny v 7:00 (Europe/Prague): ranní přehled úkolů. |
| `notification.cleanup` | `20 3 * * *` | 1 | Denně v noci: smaže stará upozornění a jejich protokol doručení. |
| `export.run` | jen na požádání | 1 |  |
| `export.cleanup` | `50 3 * * *` | 1 |  |
| `export.schedule.tick` | `*/5 * * * *` | 0 |  |

## Nastavení

Nastavení uložená v tabulce `setting` (klíč → JSON), která správce mění v administraci. Tajná pole se ukládají šifrovaně.

### branding

Branding upravitelný v administraci; přepisuje hodnoty z konfigurace klienta. Definice: `packages/core/src/settings/defs.ts`.

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis | Výchozí hodnota v kódu |
| --- | --- | --- | --- | --- | --- | --- |
| `name` | text (nebo null) | ano |  | délka ≥ 2 |  | `null` |
| `accentColor` | text (nebo null) | ano |  | vzor `^#[0-9a-fA-F]{6}$` |  | `null` |
| `logoFileId` | uuid (nebo null) | ano |  |  |  | `null` |

### company

Údaje o firmě klienta (na dokladech, v PDF a e-mailech). Definice: `packages/core/src/settings/defs.ts`.

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis | Výchozí hodnota v kódu |
| --- | --- | --- | --- | --- | --- | --- |
| `name` | text | ano |  |  |  | `""` |
| `ico` | text (nebo null) | ano |  | vzor `^\d{8}$` |  | `null` |
| `dic` | string \| null | ano |  |  |  | `null` |
| `street` | string \| null | ano |  |  |  | `null` |
| `city` | string \| null | ano |  |  |  | `null` |
| `zip` | string \| null | ano |  |  |  | `null` |
| `email` | e-mail (nebo null) | ano |  |  |  | `null` |
| `phone` | string \| null | ano |  |  |  | `null` |
| `web` | string \| null | ano |  |  |  | `null` |
| `bankAccount` | string \| null | ano |  |  |  | `null` |

### exports

Nastavení exportů v administraci; `null` = platí hodnota z konfigurace klienta. Definice: `packages/core/src/export/runtime.ts`.

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis | Výchozí hodnota v kódu |
| --- | --- | --- | --- | --- | --- | --- |
| `csvDelimiter` | enum (nebo null) | ano | `;`, `,` |  |  | `null` |

### notification_rules

Úpravy správce klienta (Nastavení → Pravidla upozornění). Čte je jádro přímo z tabulky `setting`, bez šifrování. Definice: `packages/core/src/notifications/store.ts`.

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis | Výchozí hodnota v kódu |
| --- | --- | --- | --- | --- | --- | --- |
| `events` | slovník (klíč → hodnota) | ne |  | výchozí `{}` |  | `{}` |
| `events.*` | objekt | ne |  |  |  |  |
| `events.*.enabled` | ano/ne | ne |  |  |  |  |
| `events.*.mandatory` | ano/ne | ne |  |  |  |  |
| `events.*.severity` | enum | ne | `normal`, `urgent` |  |  |  |
| `events.*.channels` | objekt | ne |  |  |  |  |
| `events.*.channels.push` | ano/ne | ne |  |  |  |  |
| `events.*.channels.bell` | ano/ne | ne |  |  |  |  |
| `events.*.channels.email` | ano/ne | ne |  |  |  |  |
| `events.*.recipients` | pole (text) | ne |  | počet ≤ 20 |  |  |
| `events.*.title` | text | ne |  | délka 1–160 |  |  |
| `events.*.body` | text | ne |  | délka ≤ 400 |  |  |
| `quietHours` | objekt | ne |  |  |  |  |
| `quietHours.enabled` | ano/ne | ano |  |  |  |  |
| `quietHours.start` | text | ano |  | vzor `^([01]\d\|2[0-3]):[0-5]\d$` |  |  |
| `quietHours.end` | text | ano |  | vzor `^([01]\d\|2[0-3]):[0-5]\d$` |  |  |
| `digestTimes` | pole (text) | ne |  | počet 1–4 |  |  |

### smtp

Odesílání e-mailů (SMTP). Heslo je v DB zašifrované. Definice: `packages/core/src/settings/defs.ts`. Tajná pole: `password`.

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis | Výchozí hodnota v kódu |
| --- | --- | --- | --- | --- | --- | --- |
| `enabled` | ano/ne | ano |  |  |  | `false` |
| `host` | text | ano |  |  |  | `""` |
| `port` | celé číslo | ano |  | hodnota 1–65535 |  | `587` |
| `secure` | ano/ne | ano |  |  |  | `false` |
| `user` | text | ano |  |  |  | `""` |
| `password` | string \| null | ano |  |  |  | `null` |
| `from` | text | ano |  |  |  | `""` |

### terminal

Nastavení terminálu v tabulce `setting` (klíč `terminal`). Tvar hlídá `terminalSettingsSchema` a převod starších verzí `migrateTerminalSettings`; samotná definice je volná, aby si čtení mohlo poradit i se starším tvarem. Definice: `packages/core/src/terminal/settings.ts`.

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis | Výchozí hodnota v kódu |
| --- | --- | --- | --- | --- | --- | --- |
| `(vstup)` | slovník (klíč → hodnota) | ano |  |  |  |  |
| `*` | libovolné | ne |  |  |  |  |

## Upozornění

| Druh | Vzniká v |
| --- | --- |
| `export_failed` | `packages/core/src/export/runs.ts` |
| `export_ready` | `packages/core/src/export/runs.ts` |

Databázové tabulky jádra: [databaze/jadro.md](../databaze/jadro.md). Příkazy platformy: [prikazy/jadro.md](../prikazy/jadro.md) (44).
