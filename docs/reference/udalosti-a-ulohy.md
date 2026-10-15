# Události, upozornění a plánované úlohy

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (úlohy jádra (`coreJobs`) a modulů (`ModuleServer.jobs`), volání `createNotifications` a rozhraní `EventMap` ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Úlohy běží ve workeru (samostatný proces téže image, fronta pg-boss v PostgreSQL, [ADR 009](../adr/009-fronta-uloh-a-migrace.md)). Plán je cron v časové zóně Europe/Prague; úloha bez plánu se jen posílá do fronty z aplikace.

## Plánované úlohy (cron)

| Úloha | Vlastník | Plán (cron) | Opakování po chybě | Uchování dokončených (s) | Data úlohy | Popis |
| --- | --- | --- | --- | --- | --- | --- |
| `core.trash.purge` | jádro | `40 3 * * *` | 2 | 600 |  | Denně v noci: trvale smaže záznamy, které jsou v koši déle než 30 dní (nejdřív podřízené). |
| `core.webhooks.cleanup` | jádro | `40 3 * * *` | 1 | 600 |  | Denně v noci: smaže stará vyřízená doručení a příchozí události. |
| `core.webhooks.deliver` | jádro | `* * * * *` | 1 | 120 |  | Každou minutu a navíc hned po `NOTIFY` (worker poslouchá `WEBHOOK_NOTIFY_CHANNEL`): odešle čekající webhooky. |
| `disk.timeout` | disk | `* * * * *` | 1 | 300 |  | Každou minutu: stavy požadavků na složky (viz `maintainRequests`). |
| `export.cleanup` | jádro | `50 3 * * *` | 1 | 600 |  |  |
| `export.schedule.tick` | jádro | `*/5 * * * *` | 0 | 300 |  |  |
| `files.purge` | jádro | `30 3 * * *` | 2 | výchozí |  | Denně v noci: úklid souborů, které nikdo nepřipojil k záznamu. |
| `finance.retainer.catchup` | finance | `30 5 * * *` | 3 | výchozí |  | Denní záloha téže úlohy: dožene zameškaný měsíc (výpadek, pozdní spuštění). Výsledek je stejný, nic se nezdvojí. |
| `finance.retainer.generate` | finance | `0 5 1 * *` | 5 | výchozí |  | Měsíční úloha: každý 1. v 5:00 založí plánované platby „Retainer MM/RRRR“ (ZAK-15); idempotentní. |
| `health.heartbeat` | jádro | `0 * * * *` | 3 | 600 |  | Každou hodinu: stav instance agentuře (jen verze a stav, bez osobních údajů). |
| `kalendar.push` | kalendar | `* * * * *` | 0 | výchozí |  |  |
| `kalendar.sync` | kalendar | `* * * * *` | 0 | výchozí |  |  |
| `kalendar.watch.renew` | kalendar | `17 * * * *` | 0 | výchozí |  |  |
| `muj-prostor.invoices.prepare` | muj-prostor | `30 5 * * *` | 2 | výchozí |  |  |
| `notification.cleanup` | jádro | `20 3 * * *` | 1 | 600 |  | Denně v noci: smaže stará upozornění a jejich protokol doručení. |
| `notification.dispatch` | jádro | `* * * * *` | 1 | 120 |  | Každou minutu a navíc hned po vzniku upozornění (worker poslouchá NOTIFY): odešle upozornění, jejichž čas nadešel (push, e-mail), opakuje selhaná doručení s prodlevou a uvolňuje zdržená po tichých hodinách a shrnutí. |
| `reklama.sync.daily` | reklama | `0 6 * * *` | 3 | výchozí | `accountId` | Úloha na pozadí: denní synchronizace s Meta Ads. |

## Úlohy ve frontě bez plánu

| Úloha | Vlastník | Opakování po chybě | Uchování dokončených (s) | Data úlohy | Popis |
| --- | --- | --- | --- | --- | --- |
| `export.run` | jádro | 1 | 600 | `runId` |  |
| `file.thumbnail` | jádro | výchozí | 600 | `fileId` |  |
| `kalendar.sync.calendar` | kalendar | 2 | výchozí | `calendarId`, `full` |  |
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
| `zakazky.created` | `{ id: string }` |  | `packages/modules/zakazky/src/entities.ts` |
| `poptavky.converted` | `{ id: string; jobId: string }` | Poptávka byla převedena na zakázku. | zatím nikde |

## Další katalogy nalezené v kódu

Exportované konstanty, jejichž název odpovídá katalogu událostí, upozornění nebo metrik. Objevují se tu automaticky; vlastní podrobnější sekci lze přidat do generátoru (viz [DOCS-PROCES](../DOCS-PROCES.md)).

### CORE_NOTIFICATION_EVENTS

Export `@rebar/core/notifications`.

| key | label | description | group | severity | recipients | mandatory | internal | ttlSeconds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `comment.mention` | `Zmínka v komentáři` | `Někdo vás v komentáři označil pomocí @.` | `Komentáře` | `normal` | `mentioned` |  |  |  |
| `system.test` | `Zkušební upozornění` | `Zkouška, že upozornění v tomto zařízení funguje.` | `Systém` | `urgent` | `self` | `true` | `true` | `300` |
