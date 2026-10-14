# Události, upozornění a plánované úlohy

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (úlohy jádra (`coreJobs`) a modulů (`ModuleServer.jobs`), volání `createNotifications` a rozhraní `EventMap` ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Úlohy běží ve workeru (samostatný proces téže image, fronta pg-boss v PostgreSQL, [ADR 009](../adr/009-fronta-uloh-a-migrace.md)). Plán je cron v časové zóně Europe/Prague; úloha bez plánu se jen posílá do fronty z aplikace.

## Plánované úlohy (cron)

| Úloha | Vlastník | Plán (cron) | Opakování po chybě | Uchování dokončených (s) | Data úlohy | Popis |
| --- | --- | --- | --- | --- | --- | --- |
| `crm.activities.digest` | poptavky | `10 7 * * 1-5` | 2 | 600 |  | Pracovní dny v 7:10: přehled aktivit na dnešek a po termínu. |
| `crm.deals.attention` | poptavky | `15 7 * * 1-5` | 2 | 600 |  | Pracovní dny v 7:15: obchody bez další aktivity. |
| `crm.rotting.refresh` | poptavky | `30 5 * * *` | 2 | 600 |  | Denně v 5:30: přepočet hnití všech zakázek (`crmApi.recomputeAllJobsCrm`) a upozornění na nově zhnilé. |
| `dochazka.forgot_clock_out` | dochazka | `*/30 6-21 * * *` | 1 | výchozí |  |  |
| `dochazka.missing_clock_in` | dochazka | `30 8 * * 1-5` | 1 | výchozí |  |  |
| `dochazka.reminder` | dochazka | `30 17 * * 1-5` | 1 | výchozí |  |  |
| `export.cleanup` | jádro | `50 3 * * *` | 1 | 600 |  |  |
| `export.schedule.tick` | jádro | `*/5 * * * *` | 0 | 300 |  |  |
| `fakturace.dispatch.sync` | fakturace | `* * * * *` | 0 | 120 |  | Každou minutu: stav odeslaných e-mailů z fronty se přenese do evidence u faktur (a při selhání upozorní autora). |
| `fakturace.due_soon` | fakturace | `0 7 * * 1-5` | 2 | výchozí |  | Pracovní dny ráno: vystavené neuhrazené faktury, kterým splatnost nastává do tří dnů. |
| `fakturace.overdue` | fakturace | `30 5 * * *` | 2 | výchozí |  | Denně ráno: faktury, kterým včera uplynula splatnost, se označí a fakturanti dostanou upozornění. |
| `fakturace.received.overdue` | fakturace | `40 5 * * *` | 2 | výchozí |  |  |
| `files.purge` | jádro | `30 3 * * *` | 2 | výchozí |  | Denně v noci: úklid souborů, které nikdo nepřipojil k záznamu. |
| `health.heartbeat` | jádro | `0 * * * *` | 3 | 600 |  | Každou hodinu: stav instance agentuře (jen verze a stav, bez osobních údajů). |
| `kalendar.reminders` | kalendar | `*/5 * * * *` | 1 | výchozí |  |  |
| `kalendar.sync` | kalendar | `10 * * * *` | 1 | výchozí |  |  |
| `notification.cleanup` | jádro | `20 3 * * *` | 1 | 600 |  | Denně v noci: smaže stará upozornění a jejich protokol doručení. |
| `notification.dispatch` | jádro | `* * * * *` | 1 | 120 |  | Každou minutu a navíc hned po vzniku upozornění (worker poslouchá NOTIFY): odešle upozornění, jejichž čas nadešel (push, e-mail), opakuje selhaná doručení s prodlevou a uvolňuje zdržená po tichých hodinách a shrnutí. |
| `notification.taskDigest` | jádro | `0 7 * * 1-5` | 2 | 600 |  | Pracovní dny v 7:00 (Europe/Prague): ranní přehled úkolů. |
| `realizace.diary` | realizace | `0 16 * * 1-5` | 1 | výchozí |  |  |
| `realizace.phases` | realizace | `10 6 * * 1-5` | 1 | výchozí |  |  |
| `realizace.today` | realizace | `0 6 * * 1-5` | 1 | výchozí |  |  |
| `stroje.deadlines` | stroje | `30 6 * * *` | 1 | výchozí |  |  |
| `stroje.reservations` | stroje | `0 15 * * *` | 1 | výchozí |  |  |
| `zakazky.starts_today` | zakazky | `30 6 * * 1-5` | 2 | výchozí |  | Cron běží v Europe/Prague (pg-boss), takže se přechod letního času řeší sám. |
| `zakazky.summary.refresh` | zakazky | `20 3 * * *` | 1 | výchozí |  |  |

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
| `poptavky.converted` | `{ id: string; jobId: string }` | Poptávka byla převedena na zakázku. | `packages/modules/poptavky/src/server.ts` |

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

### ZAKAZKY_NOTIFICATIONS

Export `@rebar/zakazky`.

| key | label | description | group | severity | recipients | entity | access | snooze | dedupe | scheduled |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `job.team` | `Přidání do týmu zakázky` | `Někdo vás přidal do týmu zakázky.` | `Zakázky` | `normal` | `member` | `job` |  |  |  |  |
| `approval.request` | `Doklad čeká na schválení` | `Někdo poslal ke schválení změnu (vícepráci), soupis prací, objednávku nebo přijatou fakturu a vy o ní smíte rozhodnout.` | `Zakázky` | `normal` | `approvers` |  | `zakazky.approve`, `zakazky.approve_all` | `true` |  |  |
| `approval.approved` | `Váš doklad byl schválen` | `Doklad, který jste poslali ke schválení, někdo schválil.` | `Zakázky` | `normal` | `requester` | `job` |  |  |  |  |
| `approval.rejected` | `Váš doklad byl zamítnut` | `Doklad, který jste poslali ke schválení, někdo zamítl (s důvodem).` | `Zakázky` | `normal` | `requester` | `job` |  |  |  |  |
| `job.statement.approved` | `Soupis prací schválen` | `Soupis prací zakázky byl schválen. Dostane ho vedoucí a tým zakázky a ti, kdo fakturují (částku vidí jen s právem na ekonomiku).` | `Zakázky` | `normal` | `team`, `perm:fakturace.write` | `job` |  |  |  |  |
| `job.statement.rejected` | `Soupis prací zamítnut` | `Soupis prací zakázky byl zamítnut. Dostane ho vedoucí a tým zakázky.` | `Zakázky` | `normal` | `team`, `extra` | `job` |  |  |  |  |
| `job.change.approved` | `Vícepráce schválena` | `Změna zakázky (vícepráce nebo méněpráce) byla schválena. Dostane ji vedoucí a tým zakázky a ti, kdo fakturují (částku vidí jen s právem na ekonomiku).` | `Zakázky` | `normal` | `team`, `perm:fakturace.write` | `job` |  |  |  |  |
| `job.change.rejected` | `Vícepráce zamítnuta` | `Změna zakázky (vícepráce nebo méněpráce) byla zamítnuta. Dostane ji vedoucí a tým zakázky.` | `Zakázky` | `normal` | `team`, `extra` | `job` |  |  |  |  |
| `zakazky.starts_today` | `Zakázka dnes začíná` | `V pracovní dny ráno: zakázka v přípravě nebo realizaci má dnes plánovaný začátek. Dostane ji vedoucí a tým zakázky.` | `Zakázky` | `normal` | `team` | `job` |  | `true` | `day` | `true` |
