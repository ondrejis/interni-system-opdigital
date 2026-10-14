# Události, upozornění a plánované úlohy

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (úlohy jádra (`coreJobs`) a modulů (`ModuleServer.jobs`), volání `createNotifications` a rozhraní `EventMap` ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Úlohy běží ve workeru (samostatný proces téže image, fronta pg-boss v PostgreSQL, [ADR 009](../adr/009-fronta-uloh-a-migrace.md)). Plán je cron v časové zóně Europe/Prague; úloha bez plánu se jen posílá do fronty z aplikace.

## Plánované úlohy (cron)

| Úloha | Vlastník | Plán (cron) | Opakování po chybě | Uchování dokončených (s) | Data úlohy | Popis |
| --- | --- | --- | --- | --- | --- | --- |
| `export.cleanup` | jádro | `50 3 * * *` | 1 | 600 |  |  |
| `export.schedule.tick` | jádro | `*/5 * * * *` | 0 | 300 |  |  |
| `files.purge` | jádro | `30 3 * * *` | 2 | výchozí |  | Denně v noci: úklid souborů, které nikdo nepřipojil k záznamu. |
| `health.heartbeat` | jádro | `0 * * * *` | 3 | 600 |  | Každou hodinu: stav instance agentuře (jen verze a stav, bez osobních údajů). |
| `kalendar.reminders` | kalendar | `*/5 * * * *` | 1 | výchozí |  |  |
| `kalendar.sync` | kalendar | `10 * * * *` | 1 | výchozí |  |  |
| `notification.cleanup` | jádro | `20 3 * * *` | 1 | 600 |  | Denně v noci: smaže stará upozornění a jejich protokol doručení. |
| `notification.dispatch` | jádro | `* * * * *` | 1 | 120 |  | Každou minutu a navíc hned po vzniku upozornění (worker poslouchá NOTIFY): odešle upozornění, jejichž čas nadešel (push, e-mail), opakuje selhaná doručení s prodlevou a uvolňuje zdržená po tichých hodinách a shrnutí. |
| `notification.taskDigest` | jádro | `0 7 * * 1-5` | 2 | 600 |  | Pracovní dny v 7:00 (Europe/Prague): ranní přehled úkolů. |

## Úlohy ve frontě bez plánu

| Úloha | Vlastník | Opakování po chybě | Uchování dokončených (s) | Data úlohy | Popis |
| --- | --- | --- | --- | --- | --- |
| `export.run` | jádro | 1 | 600 | `runId` |  |
| `file.thumbnail` | jádro | výchozí | 600 | `fileId` |  |
| `mail.send` | jádro | 5 | 600 | `logId`, `to`, `template`, `varsEnc`, `cc`, `replyTo`, `attachments`, `attachments[].key`, `attachments[].name`, `attachments[].mime` | Úloha „odeslat e-mail“. Opakuje se s prodlevou; stav a poslední chyba jsou v `email_log` (bez těla zprávy). |

## Druhy upozornění

Upozornění (zvonek v aplikaci, případně push) vytváří `createNotifications`. Druh (`kind`) je text, podle kterého se upozornění seskupuje a ikonuje. Seznam vychází z míst ve zdrojích, kde se upozornění sestavuje; příjemce, text a odkaz určuje vždy kód v uvedeném souboru. Částky se z textu upozornění vynechají lidem bez oprávnění k penězům (viz [oprávnění](opravneni.md)).

| Druh | Vzniká v |
| --- | --- |
| `export_failed` | `packages/core/src/export/runs.ts` |
| `export_ready` | `packages/core/src/export/runs.ts` |

## Události pro rozšíření klienta

Rozšíření v `clients/<slug>/extensions/` reagují jen na tyto události ([CUSTOMIZATION](../CUSTOMIZATION.md)). Událost se oznamuje uvnitř transakce akce, která ji vyvolala.

| Událost | Data | Popis | Oznamuje se v |
| --- | --- | --- | --- |
| `zakazky.created` | `{ id: string }` |  | `packages/modules/zakazky/src/lifecycle/transitions.ts` |
| `poptavky.converted` | `{ id: string; jobId: string }` | Poptávka byla převedena na zakázku. | `packages/_donor/poptavky/src/server.ts` |

## Další katalogy nalezené v kódu

Exportované konstanty, jejichž název odpovídá katalogu událostí, upozornění nebo metrik. Objevují se tu automaticky; vlastní podrobnější sekci lze přidat do generátoru (viz [DOCS-PROCES](../DOCS-PROCES.md)).

### CORE_NOTIFICATION_EVENTS

Export `@rebar/core/notifications`.

| key | label | description | group | severity | recipients | dedupe | mandatory | mergeWindowSeconds | debounceSeconds | scheduled | snooze | internal | ttlSeconds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `task.assigned` | `Přidělen úkol` | `Někdo vám přidělil úkol (nebo vám ho předal).` | `Úkoly` | `normal` | `assignee` | `none` | `false` |  |  |  |  |  |  |
| `task.due_changed` | `Změna termínu úkolu` | `Někdo změnil termín úkolu, který máte přidělený.` | `Úkoly` | `normal` | `assignee` |  |  | `600` | `30` |  |  |  |  |
| `task.done` | `Úkol splněn` | `Úkol, který jste zadali jinému, je hotový.` | `Úkoly` | `normal` | `author` |  |  |  |  |  |  |  |  |
| `task.due_today` | `Úkoly na dnešek` | `Ráno vám přijde přehled úkolů s dnešním termínem a těch, které jsou po termínu.` | `Úkoly` | `normal` | `assignee` | `day` |  |  |  | `true` | `true` |  |  |
| `comment.mention` | `Zmínka v komentáři` | `Někdo vás v komentáři označil pomocí @.` | `Komentáře` | `normal` | `mentioned` |  |  |  |  |  |  |  |  |
| `system.test` | `Zkušební upozornění` | `Zkouška, že upozornění v tomto zařízení funguje.` | `Systém` | `urgent` | `self` |  | `true` |  |  |  |  | `true` | `300` |
