# D – Plán, kontrakty a rozdělení práce OPSYS (ZÁVAZNÉ)

Vznik 2026-10-14. Vychází z `00-ZADANI`, A, B, C a spec 00 (při rozporu pořadí z 00-ZADANI; kde C uvádí PŘEDPOKLAD, platí). Tento dokument čtou všichni agenti: **§1 moduly → §2 kontrakty → §3 soubory → svůj řádek v §4**; §5 čtou všichni, kdo čtou/píší záznamy se zámkem. Změna D = jen architekt (žádost do `docs/opsys/ZADOSTI.md`). Ověřeno v kódu: `ModuleUi.recordTabs/recordActions/recordOverview` jsou už podle klíče entity (karta klienta = příspěvky modulů), `calendarLayers`, `widgets`, `attention`, `dashboardMetrics`, `ModulePage` existují; nové jsou jen věci v §2.1.

## 0. Zásady

1. **Pět druhů vazeb mezi moduly, jiné nejsou:** (a) *soft odkaz* = sloupec `uuid` bez FK (FK jen na core `user`; kvůli „modul stačí nezapnout“); (b) *hard API* `@rebar/<m>/api` (+ `/ui`), smí jen modul s tím `<m>` v `dependsOn`; (c) *služba* `deps.services.optional("<klíč>")` (volitelná, typ v `@rebar/core/contracts`); (d) *doménová událost* `emitDomain` → `eventHandlers` jiných modulů, v téže transakci; (e) *příspěvek* (`recordTabs/Actions/Overview`, `slots`, `contributions`, `calendarLayers`, `widgets`, `navBadges`) — modul přidává, hostitel o něm neví. Sdílené místo = jeden řádek v registru.
2. Hodnoty kódů anglicky snake_case (`systemy`, `intro_then_retainer`), popisky česky. Klíče entit zůstávají `company`, `person` (ne „organization“). Peníze `bigint` haléře, CZK; čas Europe/Prague; ID UUID v7 (`pk()`).
3. Žádné notifikace: moduly nedefinují `notifications`; Nastavení → Upozornění/Pravidla upozornění se skryjí (S0). Upozornění = odznaky (`navBadges`) a červené řádky.
4. **Migrace jsou do squashe (§7) zahazovatelné:** kdo vlastní modul, smí `rm -rf drizzle && pnpm --filter @rebar/<id> db:generate` (nikdy ne souběžně: jen schema-vlastník modulu). Schéma jádra po S1 mění jen C1 (ostatní žádají přes ZADOSTI).
5. Každý modul exportuje: `.` (manifest), `./schema`, `./server`, `./ui`, `./api` (veřejné funkce jiným modulům; tělo smí být zpočátku `throw new NotImplementedError("<modul>.api.<fn>")`).
6. Každý nový export má JSDoc, každý příkaz probe v `tests/support/probes/<modul>.ts`, každý modul `docs/moduly/<id>.md` (viz A §5).

---
## 1. Cílová sestava modulů

### 1.1 Pořadí `MODULE_IDS` (= pořadí migrací; hard závislosti vždy dřív)

| # | id (`@rebar/<id>`) | Zobrazený název | Nav: sekce → položka `href` (order) | `dependsOn` |
|---|---|---|---|---|
| 1 | `kontakty` | Organizace a kontakty | CRM → Organizace `/kontakty/firmy` (30), Kontakty `/kontakty/osoby` (40) | – |
| 2 | `klienti` | Klienti | CRM → Klienti `/klienti` (20) | kontakty |
| 3 | `disk` | Google Disk | bez nav (Nastavení → Google Disk) | – |
| 4 | `zakazky` | Zakázky | Realizace → Zakázky `/zakazky` (10) | kontakty |
| 5 | `obchody` | Obchody | CRM → Obchody `/obchody` (10) | kontakty, zakazky |
| 6 | `ukoly` | Úkoly a poznámky | Práce → Moje úkoly `/ukoly` (10) | – |
| 7 | `kalendar` | Kalendář | Práce → Kalendář `/kalendar` (20) | – |
| 8 | `hodiny` | Hodiny | Realizace → Hodiny `/hodiny` (20) | zakazky |
| 9 | `finance` | Finance | Finance → Platby a rozdělení `/finance` (10), Vyrovnání `/finance/vyrovnani` (20) | zakazky |
| 10 | `reklama` | Reklama | Marketing → Reklama `/reklama` (10) | kontakty, obchody |
| 11 | `sablony-emailu` | Šablony e-mailů | Marketing → Šablony e-mailů `/sablony-emailu` (20) | kontakty |
| 12 | `muj-prostor` | Můj prostor | Můj prostor → Hosting a údržba `/muj-prostor/hosting`, Domény `/muj-prostor/domeny`, E-mailová knihovna `/muj-prostor/knihovna`, Opakované faktury `/muj-prostor/faktury`, Soukromé `/muj-prostor/soukrome` | kontakty |
| 13 | `prehled` | Přehled | Práce → Přehled `/prehled` (0); `/` přesměruje na `/prehled` | – |

`NavItem.order?: number` (nové, S0): pořadí v sekci podle `order`, pak podle `MODULE_IDS`. `GROUP_ORDER = [Práce, CRM, Realizace, Finance, Marketing, Můj prostor]`; dole patička Historie `/historie`, Koš `/kos`, Nastavení (S0). Dochazka → `hodiny`, `poptavky` → `obchody`+`ukoly` (kód z `poptavky`/`dochazka` se přesune do `packages/_donor/`, viz S0). Ověřit v S0, že id s pomlčkou projde migracemi (`__drizzle_migrations_muj-prostor`) a oprávněním `^muj-prostor\.[a-z_]+$`; jinak v `migrations.ts` nahradit `-` za `_` v názvu tabulky (jediný řádek).

**Jádro (mimo moduly)** dodává: viditelnost, koš, štítky, audit, webhooky a ingest, realtime, historii, paletu, role (viz §5). Core oprávnění přidaná do `CORE_PERMISSIONS`: `private.read` (vidí soukromé; jen owner), `activity.read`, `activity.export`, `trash.read`, `trash.purge`, `settings.pipelines`, `settings.custom_fields`, `settings.tags`, `settings.integrations`, `users.manage`, `roles.manage`, `settings.manage`.
**Role** (seed `clients/opsys/seed/roles.ts`): `owner` (vše, systémová), `partner` (Patrik; matice podle NAS-02 z finálních klíčů níže: vše kromě `*.delete`/`*.export`/`*.merge`/`finance.splits_edit`/`finance.settlements_write`/`finance.settings`/`muj-prostor.*`/`private.read`/`users.manage`/`roles.manage`), `external` (prázdná; `job`/`task` mají `scope` pro rozsah `own`).

### 1.2 Moduly podrobně

Formát: **Tabulky** (hlavní sloupce; všude `id, ...audit()`; „V“ = `visibilityColumns()` = `is_private`, `visibility_source`; „T“ = `tags text[]` + GIN; „C“ = `custom jsonb`) · **Entity** (klíč, `listPath`) · **Oprávnění** · **Příkazy** · **Widgety/metriky/vrstvy** · **Události** · **Ostatní**.

**kontakty** (z existujícího, ZACHOVAT) — *Tabulky:* `company`(name, official_name, ico [unik. mezi živými], dic, legal_form, street, city, zip, country, web, web_domain, email, phone, industry, owner_id, **client_status** null|lead|active|paused|former, client_since, client_until, client_end_reason, services text[] (web|marketing|systemy), client_context jsonb {decisionMaker, howToCommunicate, history, notes}, drive_folder_id, drive_status, ares_synced_at, V, T, C) · `person`(first_name, last_name, position, primary_company_id, linkedin, is_decision_maker, owner_id, V, T, C) · `person_contact_point`(person_id, kind email|phone, value, value_norm [E.164 / lowercase], label work|mobile|private, is_primary) · `person_company`(person_id, company_id, role, position, is_primary) · `ares_cache`(ico pk, payload, fetched_at). *Entity:* `company` `/kontakty/firmy`, `person` `/kontakty/osoby` (V root; `searchLoad` doplní telefony/e-maily). *Oprávnění:* `kontakty.read/create/write/delete/export/merge/ares`. *Příkazy:* `kontakty.search`, `kontakty.ares` (preview+apply), `kontakty.company.checkDuplicates`, `kontakty.person.checkDuplicates`, `kontakty.person.quickCreate`, `kontakty.merge.preview/apply`. *Ostatní:* `recordTabs.company` „Kontakty“; `ClientTabProvider.tabCounts.contacts`; akce kontaktu volat/SMS/WhatsApp/e-mail/kopírovat; `@rebar/kontakty/api`; `ares-fake` pro testy; `company.drive_*` se píší jen přes `writeSystemFields` (disk).

**klienti** (nový, bez tabulek) — *Entity:* žádná (klient = `company` s `client_status`). *Oprávnění:* `klienti.read`, `klienti.write`. *Příkazy:* `klienti.list` (tabulka klientů s `listMetrics` od příspěvků: aktivní zakázky, příjem 12 m, poslední aktivita, Disk), `klienti.setStatus` (R-17: `client_since` jen při prvním `active`; `former` vyžaduje důvod+datum), `klienti.setServices`, `klienti.saveContext`, `klienti.summary`, `klienti.tabCounts`. *Služba* `clients`. *UI:* stránka `/klienti` (vlastní tabulka, přepínač „včetně bývalých“, seskupení), `recordHeader.company` (hlavička karty, tlačítka podle `CLIENT_ACTIONS`), `recordOverview.company` (Přehled ze `summary`), záložka „Kontext“ (4 pole podle R-27), tlačítko Web. *Události:* `client.status_changed`, `client.renamed`, `client.service_added` (renamed/added vzniknou při změně `name`/`services` u `company` přes `afterUpdate` v klienti rozšíření — viz §2.4). Detail klienta = `/kontakty/firmy/<id>`.

**disk** (nový) — *Tabulky:* `drive_request`(id = eventId, event, entity_type, entity_id, payload, state pending|sent|done|error|timeout, attempts, error, requested_by, requested_at, done_at) · `drive_folder`(entity_type, entity_id, subkey ''|web|marketing|systemy|archive, folder_id; unik. entity+subkey). *Nastavení:* `drive.structure` (strom klient + 3 typy, výchozí ze spec), `drive.enabled`. *Oprávnění:* `disk.read`, `disk.write` (vytvořit/zkusit znovu), `disk.manage` (strom, test). *Příkazy:* `disk.folderState`, `disk.requestFolder`, `disk.retry`, `disk.structure.get/set`, `disk.test`. *Handlery událostí:* `client.status_changed`, `client.service_added`, `client.renamed`, `project.created` → řádek `drive_request` + `drive.*` událost do outboxu. *Ingest:* `drive`. *Job:* `disk.timeout` (každou minutu: pending > 10 min → `timeout`). *UI:* `recordActions.company/job` „Otevřít Disk“ (stavy dle DRV-05), editor stromu v `/nastaveni/google-disk` (na mobilu jen čtení). *Pravidlo R-13:* soukromý klient/zakázka složku sám nezakládá (handler vrátí `skipped:"private"`; ruční „Vytvořit složku“ s varováním). `drive_folder_id`/`drive_status` na `company`/`job` zapisuje jen disk přes `writeSystemFields`.

**zakazky** (PŘEPRACOVAT, ~2,5 tis. ř. se zachová) — *Tabulky:* `job`(number [řada `zakazky.cislo` `Z-{YYYY}-{NNN}`], title, company_id, type web|marketing|systemy, status planned|active|paused|done|cancelled [pipeline `job/status`], current_phase_id, billing_model, marketing_stage null|intro|decision|retainer|ended, owner_id, start_date, due_date, completed_at, price_minor, description, deal_id, template_id, drive_folder_id, drive_status, V (rodič: žádný — root), T, C) · `job_phase`(job_id, name, position, role null|intro_evaluation|retainer, status not_started|in_progress|done|skipped, planned_start, planned_end, completed_at; V dítě `job_id`) · `job_member`(job_id, user_id, role lead|member) · `job_participant`(job_id, person_id, role) · `job_template`(name, type, description, default_billing_model, is_default, archived_at, payload jsonb v1 — fáze `{name, role, offsetDays, durationDays}`, úkoly `{phaseIndex, title, typeKey, priority, assignee:{rule owner|lead|user|none, userId?}, dueOffsetDays, estimateMin, description}`, platby `{description, kind, amountMinor, issuer:{rule owner|other|user, userId?}, dueOffsetDays}`). *Entity:* `job` `/zakazky` (scope: owner_id nebo `job_member`), `job_template` `/zakazky/sablony`. *Oprávnění:* `zakazky.read/create/write/delete/export/templates`. *Příkazy:* `zakazky.create`, `.createFromTemplate`, `.setPhase`, `.setStatus`, `.complete`, `.team.add/remove`, `.phases.edit`, `.template.duplicate/archive/saveFromJob/setDefault`. *Metriky/vrstvy:* `zakazky.slipping` (+ `zakazky.by_status`), vrstva „Termíny zakázek“. *Události:* `project.created`, `project.phase_changed`, `project.phase_completed`, `project.completed`. *Ostatní:* pás fází (klik: předchozí fáze `done` po dotazu na otevřené úkoly — R-38), vlastní stránka `/zakazky/faze?typ=` (board podle fází jednoho typu), `slots`: `job.header.extra`, `job.create.extras`; **mazání starého:** `PhaseKey`, `PHASE_LIST`, `crm_*`, `job_stage_history`, hooky `lifecycle.*`; seed 3 výchozích šablon + „Marketing – úvodní fáze“ (2× 7 000 Kč, issuer owner → other, `billing_model=intro_then_retainer`, fáze s `role`).

**obchody** (nový z `poptavky/crm`, ~45 %) — *Tabulky:* `deal`(title, company_id, person_id, stage_id [pipeline `deal/default`, atribut `status`], stage_entered_at, result open|won|lost, value_minor, weighted_minor, services text[], expected_close_date, owner_id, source manual|meta|web_form|referral|other, source_detail, meta_campaign_id/adset_id/ad_id, meta_leadgen_id [unik.], won_at, lost_at, lost_reason, lost_note, first_opened_at, opened_by, **next_activity_at, last_activity_at, next_task_id** [systémová pole, píše ukoly], V root, T, C) · `deal_participant`(deal_id, person_id) · `deal_stage_history`(deal_id, from_stage_id, to_stage_id, entered_at, left_at, duration_sec, by_user_id). Důvody prohry = číselník `deal.lost_reason` (core lookups). Pipeline „Obchody“ 10/20/40/60/80 % a 1/5/7/7/10 dní; `kind` fází jen `open` (Vyhráno/Prohráno = `result`). *Entity:* `deal` `/obchody` (kanban dle `stage_id`). *Oprávnění:* `obchody.read/create/write/delete/export/pipelines`. *Příkazy:* `obchody.moveStage`, `.win` (dialog zakázek), `.lose`, `.reopen`, `.quickAdd` (firma+kontakt+obchod v jedné tx, duplicity z `kontakty/api`), `.markOpened`. *Metriky:* `obchody.pipeline_value` (součet i vážený po fázích), `obchody.my_open`, `obchody.no_activity`. *Události:* `deal.created`, `deal.stage_changed`, `deal.won`, `deal.lost`. *UI:* `kanbanCard/kanbanColumnHeader` (z donoru), zóny Vyhráno/Prohráno při tažení, dialog „Založit zakázky“ = `JobsFromDealDialog` z `@rebar/zakazky/ui`, zvýraznění neotevřeného Meta leadu (OBCH-15), záložka „Obchod“ na `job`, „Obchody“ na `company`/`person`.

**ukoly** (nový z `poptavky/crm/activities`, ~60 %; ruší core `task`) — *Tabulky:* `task`(title, description [plain], type_key, status todo|in_progress|done|canceled, priority none|low|medium|high|urgent, assignee_id, due_date, due_time, duration_min, all_day, place, estimate_min, outcome, completed_at, parent_id [1 úroveň], deal_id, company_id, person_id, job_id, job_phase_id, send_invites, source_template_task, V (rodiče: `deal_id`, `job_id`, `parent_id`; ownLock), T, C) · `task_type`(key, name, icon, color, is_calendar_event, is_system, position; seed Úkol/Hovor/Schůzka/E-mail/Termín) · `task_attendee`(task_id, kind user|person|email, ref) · `note`(title, body_json [Tiptap], body_text, pinned, deal_id, company_id, person_id, job_id, V [rodiče stejné, ownLock], T). Komentáře = core `comment` (`entity_type='task'`). *Entity:* `task` `/ukoly/vse`, `note` `/poznamky` (bez nav), `task_type` `/ukoly/typy`. *Oprávnění:* `ukoly.read/create/write/delete/types`. *Příkazy:* `ukoly.quickAdd`, `.parse` (náhled rozpoznání), `.complete` (výsledek + nabídka dalšího), `.reschedule`, `.assign`, `.publishAndAssign` (VID-06), `.note.save` (autosave 800 ms), `.counts`. *Služba* `tasks`. *Metriky:* `ukoly.today`, `ukoly.overdue`; `navBadges`: po termínu; vrstva „Úkoly s termínem“. *Události:* `task.created`, `task.completed`, `task.changed` (interní). *Ostatní:* po každé změně přepočte `next/last_activity_*` obchodu přes `writeSystemFields("deal", …)` a `company.last_activity_at` (není-li entita v registru, přeskočí); záložky „Úkoly“/„Poznámky“ pro `company`, `person`, `deal`, `job`; čistá `parseQuickTask(text, now, types)` s testy (CZ data: zítra, pozítří, po/út…, „v pátek 14:00“, „za 3 dny“, typy).

**kalendar** (PŘEPRACOVAT, ~65 %) — *Tabulky:* `calendar_account`(user_id unik., google_email, tokens_enc, status ok|reauth|error, last_sync_at, last_error) · `calendar`(account_id, google_id, name, color, visible, is_write_target, sync_token, watch_channel_id, watch_expires_at) · `calendar_event`(calendar_id, google_id, etag, title, starts_at, ends_at, all_day, place, meet_url, attendees jsonb, is_google_private, task_id, deal_id, company_id, person_id, linked_by, remote_deleted). Smazat: `event*`, `calendar_resource`, iCal import/feed (spec nechce). *Oprávnění:* `kalendar.read`, `kalendar.write`. *Příkazy:* `kalendar.range` (události + `calendarLayers` ostatních modulů, soukromé cizí jako „Obsazeno“), `.createMeeting` (→ služba `tasks`, jinak jen Google), `.move`, `.link`, `.suggestLinks` (shoda e-mailu s kontaktem), `.toggleCalendar`, `.setWriteTarget`, `.connect.start/disconnect`. *Handler:* `task.changed` → fronta `kalendar.push`. *Úlohy:* `kalendar.sync` (záloha 5 min, inkrementální `syncToken`), `kalendar.watch.renew`, `kalendar.push`. *Trasy:* `/api/kalendar/google/callback` (přihlášená, OAuth), `/api/kalendar/google/webhook` (veřejná: token kanálu, do `PUBLIC`). *Adaptér:* `GoogleCalendarClient` rozhraní + `fake-google` pro testy; tokeny `cipher`. Sync konflikt = novější vyhrává; ID úkolu v `extendedProperties.private.opsysTaskId`; autor sync změn `google` (`actor_label`). Pohledy Den/Týden/Měsíc/Agenda, pracovní doba 8–18.

**hodiny** (z `dochazka`, ~35 %) — *Tabulky:* `time_entry`(user_id, job_id, task_id, date, minutes>0, note; V dítě `job_id`+`task_id`). *Entity:* `time_entry` `/hodiny/zaznamy`; stránka `/hodiny` (týdenní mřížka). *Oprávnění:* `hodiny.read` (rozsah own/all), `hodiny.write`, `hodiny.delete`. *Příkazy:* `hodiny.week`, `.save`, `.delete`, `.parse` (`1,5` / `1:30`), `.report`. *Metriky:* `hodiny.week`, `hodiny.by_job`. *Ostatní:* `recordTabs.job` „Hodiny“ (odpracováno vs odhad úkolů ze služby `tasks`, efektivní sazba z `finance.allocatedByUser` — oboje volitelné), `slots["task.dialog.extras"]` „Zapsat čas“, `paletteActions` „Zapsat hodiny“. Smazat: píchačka, schvalování, uzávěrka, absence, terminál.

**finance** (nový; vzory z fakturace) — *Tabulky:* `payment`(job_id [nullable: Fakturoid], company_id, description, kind one_off|intro|retainer|extra|recurring, period_month, amount_minor>0, issuer_id, status planned|issued|paid|canceled, invoice_number, invoice_url, issued_on, due_on, paid_on, allocation_mode rules|manual, source manual|template|retainer|fakturoid, retainer_id, note, V [rodič `job_id`; ownLock; `job_id` null ⇒ vždy soukromá]; unik. `(job_id, retainer_id, period_month)`) · `payment_allocation`(payment_id, user_id, amount_minor≥0; PK payment+user) · `split_rule`(job_id, user_id, mode, percent numeric(5,2), fixed_minor, applies_to, valid_from_month, valid_to_month, position) · `retainer`(job_id, amount_minor, from_month, to_month, issue_day 1–28, issuer_mode fixed|alternate, issuer_id, first_issuer_id, active) · `settlement`(from_user_id, to_user_id, amount_minor, settled_on, method invoice|transfer|offset, reference, note, canceled_at). *Nastavení:* `finance.balance_basis` paid|issued, `finance.default_split`. *Entity:* `payment` `/finance`, `settlement` `/finance/vyrovnani/zapisy`. *Oprávnění:* `finance.read`, `.payments_write`, `.splits_edit`, `.settlements_write`, `.export`, `.settings`. *Příkazy:* `finance.payment.create/update/transition/overrideAllocation/recalc`, `.split.get/set/preview`, `.retainer.continue/end/change`, `.settlement.create/cancel`, `.balance`, `.balance.months`, `.reports`. *Služba* `finance`. *Handlery:* `project.phase_completed` (role `intro_evaluation` ⇒ `setMarketingStage(decision)`). *Úloha:* `finance.retainer.generate` (cron `0 5 1 * *` + idempotentní dohnání při startu). *Metriky:* `finance.income_month`, `.balance`, `.unpaid`, `.retainers`, `.income_by_person`, `.income_by_type`, `.top_clients`; `navBadges`: vystavené po splatnosti (R-40). *Události:* `payment.created`, `payment.paid`, `payment.status_changed`. *UI:* `slots["job.header.extra"]` (Pokračovat na retainer / Ukončit), `slots["job.create.extras"]` (SplitEditor s živým náhledem), záložky „Finance“ na `job`/`company`, `ClientTabProvider`.

**reklama** (nový) — *Tabulky:* `ad_account`(meta_id unik., name, timezone, currency, owner_kind agency|client, company_id, active, last_sync_at) · `ad_campaign`(account_id, meta_id, name, objective, status, job_id) · `ad_set`(campaign_id, meta_id, name, status) · `ad`(ad_set_id, meta_id, name, status, creative_url) · `ad_insight_daily`(date, level campaign|adset|ad, object_id, spend_minor, impressions, clicks, leads; unik. level+object_id+date) · `lead_form_mapping`(meta_form_id unik., name, pipeline_id, stage_id, owner_id, default_services). Příchozí leady loguje core `inbound_event`; tokeny core `integration_credential`. *Entity:* `ad_account` `/reklama`, `ad_campaign` `/reklama/kampane`. *Oprávnění:* `reklama.read/write/manage`. *Příkazy:* `reklama.sync` (ručně), `.account.setOwner`, `.campaign.assignJob`, `.mapping.save`, `.accounts.list`, `.campaign.detail`, `.metrics`. *Ingest:* `leads` (idempotence `leadgenId`; kontakt dle e-mailu/telefonu, firma dle IČO/názvu **bez `client_status`** — R-15; obchod přes `@rebar/obchody/api#createDealFromLead`). *Úloha:* `reklama.sync.daily` (6:00, přepis posledních 7 dní). *Metriky:* `reklama.leads_cpl`; záložky „Reklama“ na `company`/`job`(marketing). *Adaptér:* `MetaClient` + `fake-meta`.

**sablony-emailu** (nový; vzor `fakturace/dispatch/templates.ts` z `b709d86`) — *Tabulky:* `email_template`(name, category, language cs|sk|en, subject, body_json, body_text, usage_count, V root, T). *Entity:* `email_template` `/sablony-emailu`. *Oprávnění:* `sablony-emailu.read/create/write/delete`. *Příkazy:* `sablony-emailu.render` ({entityType,id,templateId} → subject, body, to, `gmailUrl` s limitem délky R-46), `.markUsed` (+ nabídka zápisu aktivity přes `tasks.logDoneActivity`). *Ostatní:* `recordActions` „E-mail ze šablony“ na `company/person/deal/job`; proměnné z příspěvků `emailVars`; čistá `renderEmailTemplate` je v core (`contracts/email-vars.ts`).

**muj-prostor** (nový) — *Tabulky:* `recurring_service`(company_id, job_id, kind hosting|maintenance, name, web, price_minor, period yearly|monthly, since, next_renewal, status active|paused|canceled, runs_at, auto_prepare_invoice, invoice_lead_days=14, fakturoid_subject_id, note) · `web_domain`(domain unik., company_id, registrar, expires_on, payer agency|client, auto_renew, renewal_price_minor, dns, recurring_service_id, warn_days=30, note) · `email_library_item`(title, category, subject, body_json, body_text, T) · `recurring_invoice`(recurring_service_id, period_from, period_to, amount_minor, status draft|approved|sent_to_fakturoid|canceled, fakturoid_id, fakturoid_number, fakturoid_url, approved_by/at, error; unik. service+period_from). Vše **bez** `is_private` (přístup jen `muj-prostor.*`, které má jen owner; PŘEDPOKLAD §6). *Entity:* `recurring_service` `/muj-prostor/hosting`, `web_domain` `/muj-prostor/domeny`, `email_library_item` `/muj-prostor/knihovna`, `recurring_invoice` `/muj-prostor/faktury`. *Oprávnění:* `muj-prostor.hosting`, `.domains`, `.email_library`, `.recurring_invoices`, `.private_overview`. *Příkazy:* `muj-prostor.domains.bulkAdd`, `.hosting.markRenewed` (posun o období, R-47), `.library.move` (↔ šablony), `.invoices.prepare/approve/cancel`, `.private.overview`. *Úloha:* `muj-prostor.invoices.prepare` (denně 5:30, v3). *Fakturoid:* `FakturoidClient` v3 (+ `fake-fakturoid`), platba přes službu `finance.createStandalonePayment`. *Metriky:* `muj-prostor.expirations` (60 d); `navBadges`: kritické domény (< `warn_days` nebo po expiraci; barvy: > 2×`warn_days` normální, mezi upozornění — R-19). Stránka Soukromé = přehled soukromých záznamů všech entit s `visibility` (přes registr + `queryRecords`), samostatná soukromá poznámka přes službu `tasks`.

**prehled** (nový, bez tabulek) — *Oprávnění:* `prehled.read`. *Metriky:* `prehled.recent_changes` (jen moje/vše, bez soukromých), `prehled.quick_links`. *Core dashboards (vlastní PRE):* widgety „Číslo z pohledu“, „Seznam z pohledu“ (odkaz na `saved_view`), výchozí nástěnky `clients/opsys/dashboards.ts` (PRE-03), úvod a přepínač; widgety ostatních modulů jsou jejich `dashboardMetrics` (výše). Terminál, `home-clock`, stavební sady se mažou.

---
## 2. Veřejná API mezi moduly

### 2.1 Platforma kontraktů (S0 vytvoří, **zmrazeno**): `@rebar/core/contracts`

```ts
// packages/core/src/contracts/{types,events,services,client-card,slots,email-vars,phone}.ts  (export "./contracts")
export type ServiceType = "web" | "marketing" | "systemy";            export type YearMonth = string; // "2026-12"
export type ClientStatus = "lead" | "active" | "paused" | "former";   export type DriveState = "none"|"pending"|"ready"|"error"|"timeout";
export type JobStatus = "planned"|"active"|"paused"|"done"|"cancelled";
export type BillingModel = "one_off"|"intro_then_retainer"|"retainer"|"hourly";
export type MarketingStage = "intro"|"decision"|"retainer"|"ended";
export type PaymentKind = "one_off"|"intro"|"retainer"|"extra"|"recurring";
export type SplitRuleInput = { userId: string; mode: "percent"|"fixed_per_payment"|"fixed_total"; percent?: number;
  fixedMinor?: number; appliesTo: "all"|PaymentKind; validFrom?: YearMonth|null; validTo?: YearMonth|null };
export type RetainerSetup = { amountMinor: number; fromMonth: YearMonth; issueDay: number; issuerMode: "fixed"|"alternate";
  issuerId: string; firstIssuerId?: string; split: SplitRuleInput[] };
export class NotImplementedError extends Error {}                     export const toE164 = (raw: string, cc = "CZ"): string | null => …;
export const phoneSearchKeys = (raw: string): string[] => …;          // digits, bez předvolby, posledních 9 → "777 12" najde "+420 777 123 456"
```

**`ModuleServer` (rozšíření, `core/modules/server.ts`) a `ModuleDeps`:**
```ts
ModuleServer += {
  services?:      { [K in keyof ServiceMap]?: (deps: ModuleDeps) => ServiceMap[K] };
  contributions?: { [K in keyof ContributionMap]?: readonly ContributionMap[K][] };
  eventHandlers?: { [K in keyof DomainEventMap]?: (ctx: Ctx, e: DomainEvent<K>, deps: ModuleDeps) => Promise<void> }; // v tx emitenta
  ingests?:       readonly IngestDef[];                 // /api/ingest/<source>
  navBadges?:     readonly { href: string; tone: "warning"|"danger"; count: (ctx: Ctx, deps: ModuleDeps) => Promise<number> }[];
  privatePaths?:  readonly { name: string; run: (ctx: Ctx, deps: ModuleDeps) => Promise<unknown> }[];   // jen pro canary test (§5.4)
};
ModuleDeps += { services: { get<K>(k: K): ServiceMap[K];            // vyhodí, když modul není zapnutý
                            optional<K>(k: K): ServiceMap[K] | undefined; all<K extends keyof ContributionMap>(k: K): readonly ContributionMap[K][] } };
ModuleUi += { slots?: { [K in keyof SlotMap]?: ComponentType<SlotMap[K]> }; paletteActions?: readonly PaletteAction[] };  // <Slot name="…" {...props}/> v packages/ui
NavItem += { order?: number };   EntityDef += { visibility?, systemFields?, children?, quickFilters?, searchLoad? } (§5);
SlotMap = { "job.header.extra": {jobId:string; row:RecordRow}; "job.create.extras": {value: SplitRuleInput[]|null; onChange(v): void; type: ServiceType; ownerId: string};
            "task.dialog.extras": {taskId:string}; "settings.integrations": {} };
```
`createStubServices({ clients?, disk?, tasks?, finance? })` v `@rebar/core/testing` (zaznamenávající fake; `deps.services` pro unit/int testy bez druhého modulu).

**Doménové události** (`contracts/events.ts`; `emitDomain` v `@rebar/core/events`):
```ts
emitDomain<K extends keyof DomainEventMap>(ctx: Ctx, name: K, data: DomainEventMap[K],
  meta: { entity: { type: string; id: string; isPrivate: boolean }; previous?: Partial<DomainEventMap[K]> }): Promise<void>;
type DomainEvent<K> = { id: string; name: K; occurredAt: string; actor: { kind: "user"|"system"|"n8n"|"google"|"meta"|"job"; id: string|null; label?: string };
                        entity: { type: string; id: string; isPrivate: boolean }; data: DomainEventMap[K]; previous?: unknown };
```
`emitDomain` v téže tx: (1) zavolá `eventHandlers` zapnutých modulů (chyba ⇒ rollback), (2) je-li událost ve `WEBHOOK_EVENTS`, zapíše řádky `webhook_delivery` pro odpovídající endpointy (C2), (3) `pg_notify('opsys_change')` pro realtime (C3). S0: jen (1).

### 2.2 Katalog událostí (payload `data`; všechny nesou `entity.isPrivate`)

| Událost | Webhook | `data` | Emituje → handlery |
|---|---|---|---|
| `deal.created` | ano | `{deal: DealSnap}` | obchody |
| `deal.stage_changed` | ano | `{deal, fromStageId, toStageId, secondsInPrevious}` | obchody |
| `deal.won` | ano | `{deal, jobIds: string[]}` | obchody |
| `deal.lost` | ano | `{deal, reason, note}` | obchody |
| `client.status_changed` | ano | `{client: ClientSnap{id,name,ico,status,since}, from, to, reason?, endedOn?}` | klienti → disk |
| `client.renamed` / `client.service_added` | ne | `{clientId, from, to}` / `{clientId, service: ServiceType}` | klienti → disk |
| `project.created` | ano | `{project: ProjectSnap{id,number,title,type,companyId,ownerId,startDate,dueDate}}` | zakazky → disk |
| `project.phase_changed` | ano | `{project, fromPhaseId, toPhaseId}` | zakazky |
| `project.phase_completed` | ne | `{jobId, phaseId, name, role: "intro_evaluation"\|"retainer"\|null, type, marketingStage, isLast}` | zakazky → finance |
| `project.completed` | ano | `{project, reason: "finished"\|"retainer_ended"\|"cancelled"}` | zakazky |
| `task.created` / `task.completed` | ano | `{task: TaskSnap{id,title,typeKey,status,assigneeId,dueDate,dueTime,dealId,jobId,companyId}}` | ukoly |
| `task.changed` | ne | `{taskId, before, after}` (hrany: čas, řešitel, typ, smazání) | ukoly → kalendar |
| `payment.created` / `payment.paid` | ano | `{payment: PaymentSnap{id,jobId,companyId,kind,amountMinor,issuerId,status,invoiceNumber,issuedOn,dueOn,paidOn,allocations}}` | finance |
| `payment.status_changed` | ne | `{paymentId, from, to}` | finance |
| `visibility.changed` | ne | `{entityType, id, isPrivate, cascaded: number}` | core C1 |
| `drive.client.create` / `.add_service` / `.rename` / `.archive` / `.restore`, `drive.project.create` | ano (jen endpointy se `drive.*`) | `{requestId, client:{id,name,ico,folderId?}, project?:{id,code,name,type,startDate,folderId?}, structure, callbackUrl}` | disk |

Obálka webhooku: tělo `{id, event, occurredAt, actor, data, previous?}`, hlavičky `X-Opsys-Event`, `X-Opsys-Delivery`, `X-Opsys-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, t + "." + rawBody)>`; tolerance ±5 min; soukromé jen endpointům s `include_private`. Příchozí: `POST /api/ingest/<source>` (`drive`, `leads`) se stejným podpisem; `IngestDef = { source; schema: ZodType; externalId(body): string; handle(ctx, body, deps): Promise<{entity?:{type;id}}|void> }`; duplicita (`source`, `externalId`) ⇒ 200 `{duplicate:true}` bez zpracování; chyba se zaloguje do `inbound_event` (`failed`) a vrátí 500 (n8n opakuje). Drive callback `{eventId, status:"ok"|"error", folders:{root?, services?:{web?,marketing?,systemy?}, project?, archive?}, error?}`.

### 2.3 Služby (`ServiceMap`) — volitelné, vlastník implementuje v `server.ts` pod `services`

| Klíč | Vlastník (soubor) | Signatura | Volá | Stub, dokud není hotovo |
|---|---|---|---|---|
| `clients` | klienti `src/service.ts` | `setStatus(ctx, {companyId, status: ClientStatus, reason?, endedOn?, source: "manual"\|"deal_won"\|"job_ended"}): Promise<{changed: boolean; clientSince: string\|null}>`; `addServices(ctx, companyId, services: ServiceType[]): Promise<void>` | obchody (výhra), zakazky (nová služba, ukončení) | `createStubServices({clients})` |
| `disk` | disk `src/service.ts` | `requestFolder(ctx, {entityType: "company"\|"job", id, force?}): Promise<{requestId: string\|null; skipped?: "private"\|"disabled"}>`; `folderState(ctx, entityType, ids: string[]): Promise<Record<string,{state: DriveState; folderId: string\|null; url: string\|null}>>` | klienti, zakazky (ruční tlačítko; automaticky přes události) | stub vrací `none` |
| `tasks` | ukoly `src/service.ts` | `createFromTemplate(ctx, {jobId, ownerId, leadId?, startDate, phaseIds: string[], items: TemplateTaskInput[]}): Promise<{taskIds: string[]}>`; `overdueJobIds(ctx): Promise<string[]>`; `openCounts(ctx, {jobId?, dealId?}): Promise<{open: number; overdue: number}>`; `logDoneActivity(ctx, {typeKey: "email"\|"call", subject, dealId?, companyId?, personId?, jobId?}): Promise<{id: string}>`; `createMeeting(ctx, CreateMeetingInput): Promise<{taskId: string}>`; `createPrivateNote(ctx, {title, bodyJson}): Promise<{id: string}>` | zakazky, hodiny, kalendar, sablony-emailu, muj-prostor | stub vrací prázdno/0 |
| `finance` | finance `src/service.ts` | `initJobFinance(ctx, {jobId, startDate, ownerId, templatePayments: TemplatePaymentInput[], split?: SplitRuleInput[]}): Promise<{paymentIds: string[]}>`; `defaultSplit(ctx): Promise<SplitRuleInput[]>`; `createStandalonePayment(ctx, {companyId, description, amountMinor, invoiceNumber, invoiceUrl, issuedOn, dueOn?}): Promise<{id: string}>`; `incomeSince(ctx, {companyIds, from}): Promise<Record<string, number>>`; `unpaidCount(ctx, {jobId}): Promise<number>`; `allocatedByUser(ctx, jobId): Promise<Record<string, number>>` | zakazky, klienti, hodiny, muj-prostor | stub |

### 2.4 Hard API (`src/api.ts`; konzument musí mít vlastníka v `dependsOn`; mock `vi.mock("@rebar/<m>/api")`)

```ts
// @rebar/kontakty/api — vlastník KON
findCompanyByIco(ctx, ico): Promise<{id: string; name: string} | null>;   getPrimaryContact(ctx, companyId): Promise<{personId: string; name: string; phone?: string; email?: string} | null>;
findContactDuplicates(ctx, {emails?: string[]; phones?: string[]; excludeId?: string}): Promise<{personId: string; name: string; match: "email"|"phone"}[]>;
upsertContactFromLead(ctx, {name, email?, phone?, companyName?, ico?}): Promise<{personId: string; companyId: string | null; created: {person: boolean; company: boolean}}>;
createCompanyQuick(ctx, {name, ico?, ownerId?}): Promise<{id: string}>;
// @rebar/zakazky/api — vlastník ZAK-A (konzumenti: obchody, finance, hodiny)
type JobFromDealRow = { type: ServiceType; templateId: string|null; title: string; startDate: string; ownerId: string; memberIds: string[];
  billingModel?: BillingModel; split?: SplitRuleInput[]; retainer?: RetainerSetup };
createJobsFromWonDeal(ctx, deps, {dealId, companyId, rows: JobFromDealRow[], dealValueMinor?: number|null}): Promise<{jobs: {id: string; number: string; type: ServiceType}[]}>;
createJob(ctx, deps, input: CreateJobInput): Promise<{id: string; number: string}>;      // ruční/z šablony; uvnitř: fáze, členové, služby `tasks`/`finance`/`clients`, `emitDomain("project.created")`
setCurrentPhase(ctx, deps, {jobId, phaseId, completeOpenTasks?: boolean}): Promise<{completedPhaseIds: string[]}>;
completeJob(ctx, deps, {jobId, reason: "finished"|"retainer_ended"|"cancelled"}): Promise<{openTasks: number; unpaidPayments: number; clientHasOtherActiveJob: boolean}>;
setMarketingStage(ctx, jobId, stage: MarketingStage): Promise<void>;                     // finance po vyhodnocení / rozhodnutí
getJobBrief(ctx, jobId): Promise<{id; number; title; type: ServiceType; companyId; ownerId; status: JobStatus; isPrivate: boolean; startDate; billingModel: BillingModel; marketingStage: MarketingStage|null} | null>;
listTemplates(ctx, type?: ServiceType): Promise<{id: string; name: string; type: ServiceType; isDefault: boolean; defaultBilling: BillingModel}[]>;
// @rebar/zakazky/ui:  JobsFromDealDialog({dealId, companyId, services, value, ownerId, onDone})   — vlastník ZAK-B (konzument obchody)
// @rebar/obchody/api — vlastník OBC-A (konzument reklama)
createDealFromLead(ctx, deps, {title, companyId, personId, source: "meta", meta: {campaignId?, adsetId?, adId?, leadgenId, formId}, formMapping: {pipelineId, stageId, ownerId, services}}): Promise<{dealId: string; created: boolean}>;
```
`client.renamed`/`client.service_added` vznikají v klienti jako `afterUpdate` rozšíření entity `company` registrované klienti (`entities: [extendEntity("company", {afterUpdate})]`, S0 přidá `extendEntity` do core: hook se doplní k cizí entitě, bez změn v `kontakty`).

### 2.5 Příspěvky (UI i serverové)

| Kontrakt | Typ (core) | Kdo přispívá | Kdo čte |
|---|---|---|---|
| **Karta klienta** `ClientTabProvider = { tabCounts?(ctx, companyId): Promise<Partial<Record<ClientTabId, number>>>; summary?(ctx, companyId): Promise<Partial<ClientSummary>>; listMetrics?(ctx, companyIds: string[]): Promise<Record<string, Partial<ClientListMetrics>>> }`, `contributions.clientCard` | `contracts/client-card.ts` | kontakty (kontakty), zakazky (zakázky), obchody (obchody), ukoly (úkoly, poznámky, poslední aktivita), finance (finance, příjem 12 m), reklama (ads), muj-prostor (hosting; jen owner), disk (`drive`) | klienti |
| **Záložky karty** `CLIENT_TABS = {prehled:0, kontext:10, kontakty:20, zakazky:30, obchody:40, ukoly:50, poznamky:60, finance:70, reklama:80, hosting:90, historie:800}` (`id`+`order` konstanty, nutno použít) a `recordTabs.company` | konstanty v `contracts/client-card.ts` | každý modul jen svou záložku; prázdné se skryjí podle `tabCounts` | klienti (skrývání) |
| **Karty Přehledu** `recordOverview.company` s `order`: kontakty 10, zakázky 20, obchody 30, úkoly 40, finance 50, události 90 | stejný soubor `CLIENT_OVERVIEW_ORDER` | moduly výše | core detail |
| **Akce hlavičky** `recordActions.company`, `order` z `CLIENT_ACTIONS = {disk:10, call:20, email:30, web:40, task:50, note:60, job:70, deal:80}` | | disk, kontakty, sablony-emailu, klienti, ukoly, zakazky, obchody | core detail |
| `emailVars: {entityType: "company"\|"person"\|"deal"\|"job"; vars: {key; label}[]; resolve(ctx, id): Promise<Record<string,string>>}` | `contracts/email-vars.ts` | kontakty (`jmeno`,`firma`), obchody (`obchod`), zakazky (`zakazka`), core (`odesilatel`) | sablony-emailu, muj-prostor |
| `calendarLayers` (existuje) | core | ukoly (úkoly s termínem), zakazky (termíny) | kalendar |
| `dashboardMetrics`/`widgets`/`attention` (existují) | core | všechny moduly | core dashboards |
| `navBadges` | S0 | ukoly (po termínu), finance (po splatnosti), muj-prostor (kritické domény) | shell |
| `paletteActions: {id, label, keywords, icon, permission, href\|run}` (Cmd+K: Nový obchod/klient/kontakt/zakázka/úkol/poznámka, Zapsat hodiny/platbu) | `module-ui.tsx` (S0 typ, C3 vykreslení) | každý modul | core paleta |

**Systémová pole** (sloupce, které smí psát jiný modul/job, ne uživatel): `EntityDef.systemFields: string[]` a `writeSystemFields(ctx, registry, entityKey, id, patch): Promise<void>` (`core/entities`; kontrola, že klíč je deklarovaný, audit s `actor_label`, reindex). Použití: disk → `company|job.drive_folder_id/drive_status`; ukoly → `deal.next_activity_at/last_activity_at/next_task_id`, `company.last_activity_at`; finance/zakazky → `job.marketing_stage` (přes `setMarketingStage`). Chybí-li entita v registru, volající přeskočí.

---
## 3. Vlastnictví souborů a Skeleton

### 3.1 Mapa vlastnictví (po S0/S1; co není uvedeno, nesmí nikdo)

| Cesta | Vlastník | Poznámka |
|---|---|---|
| `packages/modules/<m>/**`, `docs/moduly/<m>.md`, `tests/support/probes/<m>.ts`, `tests/<m>*.int.test.ts`, `apps/web/e2e/<m>*.spec.ts` | agent(i) modulu `<m>` (§4); v rozdělených modulech podle podsložek (`src/<oblast>/**`); `src/schema.ts`+`drizzle/`+`src/contract.ts`+`src/api.ts`+`src/server.ts` = „A“ agent (B/N přidávají jen schéma v `src/schema/<část>.ts`) | `src/server.ts` skládá oblasti přes `mergeServers`, `ui.tsx` přes `mergeModuleUi` (S0 založí) |
| `apps/web/src/app/(app)/nastaveni/<slug>/**` | dle sloupce „Nastavení“ v §3.3 | S0 založí placeholder `page.tsx` |
| `apps/web/src/app/api/ingest/[source]/**`, `apps/web/src/app/(app)/nastaveni/integrace/**`, `packages/core/src/{webhooks,ingest,events}/**` | C2 | |
| `apps/web/src/app/api/kalendar/google/**` | KAL-A | |
| `apps/web/src/app/api/reklama/**` | REK-A | Meta OAuth callback |
| `apps/web/src/app/api/muj-prostor/**` | MPR-3 | |
| `apps/web/src/app/api/realtime/**`, `/historie`, `packages/core/src/{realtime,history}/**`, `packages/ui/src/{palette,realtime}/**`, `entities/{search,phone-index}.ts` (hledání/telefony), `entity-list` (rychlé předvolby, URL filtr), `saved_view` pin | C3 | |
| `/kos`, `packages/core/src/{trash,rbac,audit,custom-fields,seed}/**`, `entities/{engine,policy,aggregate,activity,types,shared}.ts`, `db/schema/*`, `packages/core/drizzle/**`, `packages/ui/src/data/record*.tsx` (zámek v hlavičce, přepínač soukromé ve formuláři), `nastaveni/{role,stitky,vlastni-pole,stavy}` | C1 | `search.ts`: C1 smí jen predikát viditelnosti, zbytek C3 (C3 začíná po C1) |
| `packages/core/src/auth/**`, `nastaveni/{uzivatele,ucet,zabezpeceni,vzhled}`, `app/{prihlaseni,overeni,pozvanka,…}` | C4 | |
| `packages/core/src/dashboards/**`, `packages/ui/src/dashboards/**`, `clients/opsys/dashboards.ts` | PRE | |
| `packages/ui/src/{shell,mobile}/**`, `app/(app)/mobile-nav.tsx`, `src/mobile/**` v modulech (W3, jen nové soubory + jeden import v `ui.tsx`) | MOB | |
| `clients/opsys/seed/**`, `scripts/dev-seed.ts`, `tests/dev-seed.int.test.ts` | SEED | roles.ts vzniká v S0 |
| `deploy/**`, `scripts/backup*`, `app/(app)/nastaveni/system/**` | OPS | |
| `tests/private-matrix.int.test.ts`, `tests/private-paths.int.test.ts`, `tests/support/{fixture,canary}.ts` | C1 (matice), QA-SEC (canary, doplnění) | |
| **Zamčeno (jen INT):** `MODULE_IDS`, `apps/web/src/{modules,modules-ui}.ts`, `server/modules-server.ts`, `apps/web/package.json`, `next.config.ts`, `eslint.config.mjs`, `tests/package.json`, `clients/opsys/config.ts`, `pnpm-lock.yaml`, `docs/reference/**`, `docs/INDEX.md`, `docs/NOTIFICATIONS.md`, `CHANGELOG.md`, `README.md`, `docs/jsdoc-baseline.json`, `packages/ui/src/lib/icons.tsx`, `apps/web/src/server/shell.ts`, `nastaveni/sections.ts`, `tests/security-static.test.ts`, `tests/support/probes/index.ts`, `contracts/**` (zmrazeno) | žádosti → `docs/opsys/ZADOSTI.md` (`kdo → komu → co`) |

### 3.2 Skeleton S0 — kroky (mechanicky, po sobě)

**Předpoklad:** agent odstraňování (B kroky 0–7) hotov, `pnpm typecheck && pnpm lint` zelené; koordinátor commitne.
1. `packages/modules/poptavky` a `dochazka` přesunout do `packages/_donor/` (mimo workspace glob; přidat do `globalIgnores` eslintu, `tsconfig` exclude, vitest exclude). Smazat jejich importy v `apps/web`: `app/api/intake/poptavky`, `api/kalendar/feed/[token]`, `home-clock.tsx`, `ROUTE_ALIASES`. `clients/demo`, `scripts/demo-seed.ts`, `scripts/lib/demo-services.ts`, `tests/demo-seed*` smazat.
2. Založit balíčky `klienti disk obchody ukoly hodiny finance reklama sablony-emailu muj-prostor prehled` kopií `kontakty`: `package.json` (jméno `@rebar/<id>`, exporty `.`/`./schema`/`./server`/`./ui`/`./api`, závislosti jádra + `dependsOn` z §1.1), `tsconfig.json`, `drizzle.config.ts` (`schema: ["./src/schema.ts","./src/schema/*.ts"]`), `src/index.ts` = **úplný manifest** (nav + `order`, `permissions` z §1.2 s českými popisky, `entities`, `pages`, `dependsOn`), `src/{schema,entities,commands,api,server,ui,contract}.ts(x)` s prázdnými exporty, v rozdělených modulech složky oblastí (`zakazky/{core,templates,ui}`, `obchody/{deals,ui}`, `ukoly/{tasks,notes,ui}`, `finance/{logic,data,ui}`, `kalendar/{google,ui}`, `reklama/{meta,ui}`, `muj-prostor/{hosting,domains,library,invoices,private}`) s `index.ts`; `docs/moduly/<id>.md` přes `pnpm docs:scaffold`. U `kontakty`, `zakazky`, `kalendar` jen doplnit `api.ts`, `contract.ts`, upravit manifest podle §1.2 (zakazky/kalendar zůstanou se starým kódem do práce ZAK-A/KAL-A; ze `zakazky` odstranit jen exporty `phases`).
3. Zapojit všech 13 modulů do míst skupiny A (A §2): `MODULE_IDS` v pořadí §1.1; `apps/web/src/modules.ts`, `modules-ui.ts`, `server/modules-server.ts` (`SERVERS`, `COMMAND_PREFIXES` prázdné, smazat `PHASE_LIST`/`setPipelinePhases("job")`), `apps/web/package.json`, `next.config.ts` (`transpilePackages`, výchozí `CLIENT=opsys`), `tests/package.json`, `eslint.config.mjs` (`MODULES` = `fs.readdirSync("packages/modules")`); jediný `pnpm install`, commit lockfile. Nové závislosti (jen S0): `libphonenumber-js`, `@tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-task-list @tiptap/extension-task-item`, `rrule` jen pokud ho nové UI kalendáře potřebuje (jinak ne).
4. Kontrakty: vytvořit `packages/core/src/contracts/*` a `events/` podle §2.1–2.2, exporty `./contracts`, `./events`; rozšířit `ModuleServer/ModuleDeps/ModuleUi/NavItem/EntityDef` (typy + `services`/`eventHandlers` registry v `collectServers`, `mergeServers` klíče, `extendEntity`, `writeSystemFields` jako funkce s plnou implementací, `visibility/children/quickFilters/searchLoad` jako **typy bez chování**), `visibilityColumns()` v `core/db`, `createStubServices`, `toE164`/`phoneSearchKeys` s testy, `renderEmailTemplate` (kopie `fakturace/dispatch/templates.ts` z `git show b709d86`), `<Slot>` v `packages/ui`. Doplnit core oprávnění (§1.1). Core `task` S0 nemaže (to dělá C1).
5. Klient `opsys`: `pnpm client:new opsys --name "OPSYS"`; `config.ts` (všech 13 modulů, `branding.name="OPSYS"`, `notifications` prázdné, `security.require2faRoles:["owner","partner"]`, `terminal` pryč, `dashboards.enabled`), `seed/index.ts` + `seed/roles.ts` (§1.1), `branding/`; `scripts`, `.env.example`, CI a `deploy/` default `CLIENT=opsys`.
6. Sdílený shell: ikony do `ICONS` (building, handshake, folder, briefcase, target, check-square, calendar, clock, wallet, scale, megaphone, mail-template, vault, layout-dashboard, history, trash, lock, google-drive), `GROUP_ORDER`, patička Historie/Koš, `sections.ts` (data-driven přes `module`; řádky: Pipeline→`/nastaveni/stavy`, Typy aktivit→`/ukoly/typy`, Štítky `/nastaveni/stitky`, Vlastní pole, Šablony zakázek→`/zakazky/sablony`, Finance `/nastaveni/finance`, Google Disk `/nastaveni/google-disk`, Integrace `/nastaveni/integrace`, Google Kalendář `/nastaveni/google-kalendar`, Vzhled `/nastaveni/vzhled`, Systém `/nastaveni/system`; skrýt Upozornění/Pravidla upozornění/DPH/Terminál/Schvalování), placeholder `page.tsx` pro každou novou cestu a pro `/prehled`, `/historie`, `/kos`; `(app)/page.tsx` → redirect `/prehled`; `mobile-nav.tsx` minimální (Hledat, Klienti, Obchody, Úkoly, Více; jen dostupné moduly).
7. Testy: rozdělit `tests/support/security-probes.ts` na `tests/support/probes/<m>.ts` + `index.ts` (složí `PROBES`); `security-fixture.ts` zredukovat na uživatele `owner`/`partner` + `ctxOf(user)`; `tests/private-matrix.int.test.ts` a `private-paths.int.test.ts` jako skip-kostry; `security-static.test.ts` `PUBLIC` += `/api/ingest/[source]`, `/api/kalendar/google/webhook`; `modules.test.ts` upravit na 13 modulů; založit prázdný `docs/opsys/ZADOSTI.md` a `docs/opsys/ready/`.
8. Ověření: `pnpm docs:generate` (poslední povolené spuštění mimo INT), `pnpm typecheck`, `pnpm lint`, `pnpm exec vitest run tests/modules.test.ts apps/web/src/modules.test.ts`, `pnpm db:migrate` na čisté DB (prázdné moduly se přeskočí). Report koordinátorovi, commit tag `opsys-s0`.

**S1 Schema-freeze** (začíná po kroku 3 S0; paralelně s kroky 4–8): v každém modulu napsat `src/schema.ts` (nebo `src/schema/<část>.ts`) **přesně podle §1.2** (názvy tabulek a sloupců jsou kontrakt; přidávat smí vlastník později, přejmenovat/mazat ne), indexy (trigram `f_unaccent` na hledané texty, GIN na `tags`/`custom`, částečné unikáty), `src/entities.ts` s finálním `key`, `listPath`, atributy, `permissions`, `scope`, `ownerDefaults`, `visibility` (§5) a `search`; `pnpm --filter @rebar/<id> db:generate` → `0000_init`; v **jádru** (§5.5) přidat tabulky/sloupce pro C1–C3 do `db/schema/*` + `packages/core/drizzle` (`0012_opsys`); ověřit `pnpm db:migrate` + `pnpm exec vitest run packages/core` na čisté DB. Žádná logika.

### 3.3 Nastavení: kdo vlastní stránku
`stavy`, `stitky`, `role`, `vlastni-pole`: C1 · `integrace` (shell + Webhooky; panely přes `slots["settings.integrations"]`: ARES test KON, Meta REK-A, Fakturoid MPR-3): C2 · `google-disk`: DSK · `finance`: FIN-C · `google-kalendar`: KAL-B · `system` (stav, zálohy, chyby integrací, koš, chybná doručení webhooků): OPS · `uzivatele`, `ucet`, `zabezpeceni`, `vzhled`: C4 · `/ukoly/typy`: UKO-B · `/zakazky/sablony`: ZAK-B.

---
## 4. Vlny a agenti

Velikost: S ≤ 1,5 tis. ř. · M ≤ 4 · L ≤ 8 · XL > 8 tis. řádků (kód+testy). „M1“ = `schema` + `contract.ts` (zod vstupy/výstupy příkazů) + stub příkazy, hotové do ~první třetiny práce agenta „A“; agenti „B/UI“ startují po M1 (koordinátor oznámí v `docs/opsys/ready/<modul>-M1`). Kritická cesta: **S0 → S1 → ZAK-A(M1) → OBC-A/FIN-B/HOD → UI agenti → W3 → INT**. Požadavky = ID z C.

| ID | Vlna | Co staví (vlastní cesty) | Pokrývá (ID z C) | Závisí na | Vel. | Hotovo, když |
|---|---|---|---|---|---|---|
| **S0** Skeleton | 0 | §3.2 kroky 1–8 | R-01, R-03, R-07, NAS-04, SPOL-01 (nav) | odstraňování B 0–7 | M | `typecheck`+`lint`+modulové testy zelené, 13 modulů se načte, `/prehled` otevře prázdnou stránku |
| **S1** Schema | 0 | `schema`/`entities` všech modulů + core schéma pro C1–C3 | NFR-07, NFR-09 (struktura) | S0 krok 3 | L | `db:migrate` čistě, entity v registru, `docs:check` mimo S0 neřeší |
| **C1** Core-1 | 1 | viz §5 (zámek, koš, štítky, audit, role, `task` pryč, `longtext`) | VID-01–10, SPOL-06 (viditelnost), SPOL-12–17 (zámek, koš, štítky, pole), NAS-01–03, 12, HIS-01, 03–05, 07, NFR-01, 06, 08 (základ) | S1 | XL | `private-matrix` zelená, koš 30 d + obnova s potomky, role Patrik v UI, core `task` odstraněn |
| **C2** Core-2 | 1 | `emitDomain` + outbox + `webhook_*`, `defineIngest` + `/api/ingest/*` + `inbound_event`, `integration_credential`, Nastavení → Integrace (Webhooky, test, chybná doručení) | WEB-01–05, NAS-10 (webhooky), NFR-11, 13 (stav integrací), DRV-08 | S1 | L | HMAC ±5 min, 5× retry (1 m → 1 h), `include_private`, idempotence, testy, `PUBLIC` záznam |
| **C4** Core-4 | 1 | pozvánky 48 h, heslo ≥ 12 + uniklá hesla, důvěryhodné zařízení 30 d, rate limit 5/15 min, bezpečnostní události (`category=security`), uživatel (zkratka, IČO, nástroj), Profil/Vzhled/Uživatelé | AUT-01–08, NAS-05, 06, NFR-11 | S1 | M | AS-07 jako integrační test |
| **FIN-A** Finance logika | 1 | `finance/src/logic/**` (čisté funkce: `allocate`, `previewSplit`, `balance`, `retainerSchedule`, `isOverdue`) + testy | FIN-02–07, 13, 15, 21, 22, R-11, R-35, R-40 | S0 | M | 8 scénářů FIN-22 + AS-04 jako unit testy |
| **C3** Core-3 | 2 | realtime (SSE + `LISTEN`), `/historie` + CSV, paleta (`paletteActions`, Nový…, příkazy, posledních 8), rychlé předvolby, URL filtr, připnuté pohledy, telefonní hledání (`searchLoad`, `phoneSearchKeys`), toast 10 s, klávesy | SPOL-02, 03, 08–10, 13, 18, 19, 20, HLE-01–07, HIS-02, 06, NFR-03, MOB-02 (hledání) | C1 | L | změna u druhého ≤ 2 s (e2e), „777 12“ najde `+420 777 123 456`, soukromé se nenajdou |
| **KON** | 2 | `kontakty/**` | ORG-01–07, 09, KON-01–06, NFR-04 | S1 | L | AS-10, duplicity E.164, `api.ts` implementováno |
| **DSK** | 2 | `disk/**`, `nastaveni/google-disk` | DRV-01–07, NAS-10 (Disk), NFR-05, 13 | S1, C2 (ingest; do té doby stub) | M | AS-09 s fake n8n |
| **ZAK-A** | 2 | `zakazky/src/{core,templates}/**`, `schema`, `api.ts`, `contract.ts`, `server.ts` | ZAK-01–03, 05, 06, 10–12 (vznik), 16, 18, 19, NAS-08 (šablony – data) | S1 | L | M1 do 1/3; `createJobsFromWonDeal` + šablony + `project.*` události |
| **ZAK-B** | 2 | `zakazky/src/ui/**`, `/zakazky/faze`, `/zakazky/sablony`, `JobsFromDealDialog`, pás fází | ZAK-04, 07–09, 12–14 (UI hlavičky se slotem), NAS-08 (editor) | ZAK-A M1 | L | detail, seznam, board stavu/fází, editor šablony, e2e vznik zakázky |
| **OBC-A** | 2 | `obchody/src/deals/**`, `schema`, `api.ts`, `server.ts`, pipeline seed | OBCH-01–03, 07 (data), 09, 12–14, NAS-07 (pipeline) | S1, ZAK-A M1 | L | `win/lose/reopen`, historie fází, `createDealFromLead`, události, testy z donoru `crm.int/board.int/views.int` |
| **OBC-B** | 2 | `obchody/src/ui/**` | OBCH-04–06, 08, 10, 11, 15 (UI), SPOL-07 (board) | OBC-A M1 | L | board se součty, tažení, zóny, detail s pásem fází, win/lose dialogy, AS-12 |
| **UKO-A** | 2 | `ukoly/src/tasks/**`, `schema`, `api.ts`, `service.ts`, `server.ts` | UKO-01–04, 07–10, VID-06, OBCH-14, NAS-07 (typy) | S1 | L | M1; služba `tasks`, systémová pole obchodu, `parseQuickTask` + testy |
| **UKO-B** | 2 | `ukoly/src/ui/**`, `/ukoly/typy` | UKO-04, 05, 07, 10 (UI), SPOL-07 (board úkolů) | UKO-A M1 | L | Moje úkoly (pohledy, seskupení, rychlé přidání s náhledem), dialog úkolu, záložky |
| **UKO-N** | 2 | `ukoly/src/notes/**`, `src/schema/notes.ts` | UKO-11 | UKO-A M1 | M | Tiptap, autosave 800 ms, připnutí, historie |
| **FIN-B** | 2 | `finance/src/data/**`, `schema`, `service.ts`, `api.ts`, `server.ts`, jobs, metriky | FIN-08–13, 15–21, ZAK-12 (data), 14, 15, 17, NAS-09, NFR-08 | FIN-A, ZAK-A M1 | L | AS-02, AS-03, AS-04 (data); `retainer.generate` idempotentní |
| **FIN-C** | 2 | `finance/src/ui/**`, `nastaveni/finance` | FIN-04, 11, 12, 14, 16, 17, 19, KLI-10, ZAK-13/14/17 (UI), SPOL-15 | FIN-B M1 | L | seznam plateb, vyrovnání s rozpisem, SplitEditor, retainer dialogy, přehledy |
| **KAL-A** | 2 | `kalendar/src/google/**`, `schema`, `server.ts`, trasy `api/kalendar/google/**` | KAL-01 (sync), 02, 06, 07 (data), 10, NAS-13, UKO-06 | S1, UKO-A M1 | L | OAuth+sync proti `fake-google`, push+poll, konflikt, tokeny šifrované |
| **KAL-B** | 2 | `kalendar/src/ui/**`, `nastaveni/google-kalendar` | KAL-03–05, 07 (UI), 08, 09, AS-13 | KAL-A M1 | M | Den/Týden/Měsíc/Agenda, vrstvy, tažení, vazby, Obsazeno |
| **HOD** | 2 | `hodiny/**` | HOD-01–04 | S1, ZAK-A M1 | M | týdenní mřížka, formáty `1,5`/`1:30`, záložka u zakázky |
| **SAB** | 2 | `sablony-emailu/**` | SAB-01–05 | S1, KON M1 | M | render + Gmail URL + kopie, proměnné z příspěvků |
| **REK-A** | 2 | `reklama/src/meta/**`, `schema`, ingest `leads`, jobs, `api/reklama/**` | REK-01–07, 10, R-15, R-44, AS-08 | S1, C2, OBC-A M1, KON M1 | L | idempotence, selhání se zaloguje, 7denní přepis, `fake-meta` |
| **REK-B** | 2 | `reklama/src/ui/**` | REK-08, 09, 11, KLI-08, PRE-06 (metrika) | REK-A M1 | M | seznam účtů, kampaně, graf, rozdíl leadů |
| **MPR-1** | 2 | `muj-prostor/src/{hosting,domains}/**`, `schema` | HOST-01–03, DOM-01–04, KLI-09, MPR-01, NAS-03 | S1 | M | barvy expirace, hromadné vložení, badge |
| **MPR-2** | 2 | `muj-prostor/src/{library,private}/**` | KNI-01, 02, SOUK-01 | S1, UKO-A (služba) | S | knihovna s proměnnými, přehled soukromých |
| **MPR-3** | 2 | `muj-prostor/src/invoices/**`, `api/muj-prostor/**` | FAK-01–03, NAS-10 (Fakturoid) | MPR-1, FIN-B (služba) | M | návrh 14 d předem, schválení → `fake-fakturoid`, platba mimo saldo |
| **KLI** | 3 | `klienti/**` | KLI-01–07, 10, 11, ORG-08, MOB-03 (obsah karty) | KON, ZAK-A, OBC-A, UKO-A, FIN-B, DSK | M | AS-01 (část karta), záložky podle `tabCounts`, seznam klientů |
| **PRE** | 3 | `prehled/**`, core/ui dashboards | PRE-01–07 | moduly (metriky) | M | výchozí přehled, Číslo/Seznam z pohledu, role `partner` bez soukromých součtů |
| **MOB** | 3 | `ui/shell`, `ui/mobile`, `mobile-nav`, `src/mobile/**` | MOB-01–10, NFR-14 | KLI, UKO-B, OBC-B | M | 3 ťuknutí k volání, swipe úkolu, „Přesunout do fáze“, PWA čtení |
| **OPS** | 3 | `deploy/**`, zálohy, `nastaveni/system` | NFR-12, NAS-11, NFR-13 | C2 | M | noční šifrovaný dump + test obnovy, stav v Nastavení |
| **SEED** | 3 | `clients/opsys/seed/**`, `scripts/dev-seed.ts` | NFR-09 | moduly | S | `db:seed` doplní uživatele, pipeline, typy, šablony, pravidla; dev data bez reálných dat |
| **QA-SEC** | 3 | `tests/private-paths.int.test.ts`, doplnění matic | NFR-08, VID-04, 08, AS-05, AS-06, AS-15 | všechny moduly | M | canary test všech `privatePaths`, widgetů, vrstev, služeb |
| **E2E-1/2** | 3 | `apps/web/e2e/opsys-*.spec.ts` | AS-01–15 (1: AS-01–07, 2: AS-08–15), SPOL-19 | moduly, MOB | M+M | scénáře zelené na `clients/opsys`; crawl všech tras jako owner i partner |
| **INT** | 4 | zamčené soubory (§3.1) | NFR-02, 10, 14 | vše | L | §7 |

**Souběh:** W1 (C1, C2, C4, FIN-A) běží současně; moduly W2 smějí začít po S1 (proti no-op API zámku a kontraktům), jen **testy soukromí** čekají na C1 (běží v QA-SEC/INT). C3 po C1. UI agenti po M1 svého „A“. Nikdy souběžně dva agenti na jedné složce kromě vyznačených podsložek.

---
## 5. Práce v jádru

### 5.1 Viditelnost shared/private — deklarativní API pro moduly

```ts
// core/db: sloupce (každá entita se zámkem je musí mít; engine to ověří při startu)
export const visibilityColumns = () => ({ isPrivate: boolean("is_private").notNull().default(false),
  visibilitySource: text("visibility_source", { enum: ["own","inherited"] }).notNull().default("own") });  // + částečný index where is_private
// core/entities (EntityDef)
visibility?: {
  parents?: readonly { entityType: string; column: string }[];  // rodiče; platí první nenulový sloupec; bez parents = root (vlastní zámek)
  ownLock?: boolean;          // dítě smí mít i vlastní zámek (úkol, poznámka, platba) — výchozí true
  defaultPrivate?: boolean;   // výchozí pro Ondřeje při vytvoření (false)
};
systemFields?: readonly string[];   children?: readonly { entityType: string; column: string }[];   // děti pro kaskádu koše a obnovy
// core/entities — funkce pro moduly
canSeePrivate(ctx): boolean;                                   // = can(ctx, "private.read")
privateScope(ctx, table: { isPrivate: AnyPgColumn }): SQL | undefined;   // undefined pro ownera, jinak `not is_private` — povinné v každém ručním dotazu (widgety, metriky, vrstvy, attention, služby)
isPrivateRecord(db, entityType, id): Promise<boolean>;         // z tabulky private_record
setVisibility(ctx, registry, entityKey, id, isPrivate: boolean): Promise<{ changed: boolean; cascaded: number }>;  // jen s private.read; audit `visibility_changed`
assertAssignable(ctx, entityKey, id, userId): Promise<void>;   // soukromý záznam + uživatel bez private.read ⇒ vyhodí PrivateAssignmentError (code "private_assign")
```
**Pravidla enginu (C1):** (1) `createRecord`: tvůrce bez `private.read` ⇒ `is_private=false` (pokus o `true` = `UserError`); s `private.read` ⇒ hodnota z formuláře, jinak `defaultPrivate`; dítě soukromého rodiče ⇒ `true`/`inherited`. (2) `is_private` je **efektivní hodnota** (denormalizovaná); `visibility_source`: `own` = zvolil uživatel, `inherited` = odvozeno. (3) `setVisibility(private)` ⇒ děti (z `parents` jiných entit) s `source=inherited` nebo nezamčené se nastaví `true/inherited`; `setVisibility(public)` ⇒ děti s `source=inherited` se zveřejní, děti s `own` zůstanou soukromé; rekurze do hloubky 3; vše v jedné tx, auditováno (R-33: záznam o změně nese hodnotu po změně). (4) R-31: `company`/`person` jsou root bez kaskády do `deal`/`job`; sdílený záznam nesmí odkazovat na soukromého rodiče přes `parents` (validace ve `checkValue`). (5) Tabulka `private_record(entity_type, entity_id, since)` se udržuje v téže tx (insert při `true`, delete při `false`/smazání) pro průřezové dotazy bez znalosti tabulek.

| Místo | Vynucení (C1 implementuje, `tests/private-matrix.int.test.ts` hlídá) |
|---|---|
| `engine.whereOf` → `queryRecords`, `queryGroups`, `visibleIds`, `aggregateRecords`, `buildEntityWhere` (dashboardy), export | `and(privateScope)` vedle `scopeWhere`; součty, počty a skupiny tedy nikdy nezahrnou soukromé |
| `getRecord`, `updateRecord`, `deleteRecord`, `restoreRecord`, `ownersOf`, `visibleRecordTitles`, `recordTitles`, `loadLabels` | soukromý záznam pro partnera = `NotFoundError`; štítky odkazů na soukromé = „Soukromý záznam“ |
| `assertEntityAccess` (`EntityPolicy.owners` vrací i `isPrivate`) → komentáře, soubory, časová osa, úkoly tab | `NotFoundError`; seznamy komentářů/souborů přes `private_record` anti-join |
| `search_document` (+ sloupec `is_private`, nastavuje `indexRecord`, kaskáda `setVisibility`) → `searchAll` obě větve | filtr v kandidátním dotazu (neprozradí ani pořadím) |
| `audit_log` (+ `is_private`, `category`, `actor_label`, `entity_title`, `context`) → `getRecordActivity`, `/historie`, `prehled.recent_changes`, export CSV | skryto, když `audit.is_private` **nebo** záznam je v `private_record` (starý záznam zůstane skrytý i po zveřejnění — R-33); bezpečnostní události partnera jen jeho vlastní |
| `emitDomain` / webhooky / realtime | `entity.isPrivate` se zjistí z řádku; webhook jen endpointům `include_private`; SSE klient bez `private.read` událost nedostane |
| `calendarLayers`, `widgets`, `attention`, `dashboardMetrics`, služby (`ServiceMap`), `ClientTabProvider`, `navBadges` | **ručně** `privateScope` (nebo `visibleIds`/engine funkce); každý má záznam v `privatePaths` |
| Koš `/kos` | partner vidí jen své nesoukromé smazané |
| Kaskáda sdílených dat | `payment`/`time_entry`/`job_phase`/`task` zdědí od `job`; soukromé `payment` (Fakturoid) a soukromé zakázky se nepočítají do `balance` (`privateScope`+`job_id is not null`) |

### 5.2 Core-1 (C1) — rozsah
(a) viditelnost výše + UI: zámek v hlavičce detailu (`recordHeader`, jen `private.read`), přepínač Sdílené/Soukromé v „Nový…“, hromadná změna viditelnosti, předvolba filtru „Soukromé“, dialog „Zveřejnit a přiřadit“; (b) **koš**: `audit()` získá `deleted_by`, `deleted_batch`; `deleteRecord` kaskádně soft-smaže `children`, `restoreRecord` obnoví celou dávku; stránka `/kos` (filtr typ, hledání, obnovit, trvalé smazání s potvrzením), úloha `core.trash.purge` denně (30 dní, nejdřív děti, `removeFromIndex`, soubory), toast „Vrátit“ 10 s, Cmd+Z; (c) **štítky**: `lookup_item.scopes text[]`, číselník `tag` (klíč stabilní, barva), atribut `multiselect` s `lookup:"tag"` + `lookupScope:"<entityKey>"`, stránka `/nastaveni/stitky` (`settings.tags`), moduly mají jen sloupec `tags text[]`; (d) **audit**: `actor_kind` += `n8n|google|meta|job`, sloupce výše, `recordAudit` dostane `category` a `isPrivate`; přihlášení a neúspěšné pokusy (spolu s C4) → `security`; změny nastavení → `integration`/`data`; log nese `entity_title` (R-34); (e) **role/oprávnění**: role `owner`/`partner`/`external`, `private.read`, nová core klíče, `settings.pipelines|custom_fields|tags|integrations` přijímá i Nastavení stavů/polí, `ensureRoles` smí doplňovat nová oprávnění existujícím rolím při `db:seed` (jen přidávat, nikdy neodebírat), změna oprávnění vyžaduje potvrzení + audit; jedna role na uživatele (PŘEDPOKLAD §6); (f) vlastní pole: typ `longtext`, `showInForm`, `required`/`showInTable` už je, archivace beze ztráty dat; (g) **odstranit core `task`** (tabulka, `collab/tasks.ts`, `/ukoly` stránka v `apps/web`, core záložka „Úkoly“, `coreTerminalCommands`, oprávnění `tasks.*`); `comment` zůstává, @zmínka jen zvýrazní (bez notifikace); (h) `tests/private-matrix.int.test.ts`: pro každou entitu s `visibility` projít všechny řádky tabulky výše jako `partner` i `owner`.

### 5.3 Core-2 (C2), Core-3 (C3), Core-4 (C4)
**C2:** `emitDomain` bod (2) z §2.1; `webhook_endpoint(name, url, secret_enc, events text[], include_private, active)`, `webhook_delivery(endpoint_id, event_id, event, payload, status pending|delivered|failed, attempts, next_attempt_at, last_error, delivered_at)`, job `core.webhooks.deliver` (odeslání po commitu + minutový záložní běh; plán 1 min, 5 min, 15 min, 30 min, 1 h = 5×), UI `/nastaveni/integrace` (URL + výběr událostí, „Test webhooku“, chybná doručení), `inbound_event(source, external_id, payload, status received|processed|failed, error, entity_type, entity_id)` unik. `(source, external_id)`, `integration_credential(provider google|meta|fakturoid, user_id?, data_enc, status)` přes `cipher`, `defineIngest` + trasa `/api/ingest/[source]` (podpis, rate limit, limit těla, CSRF výjimka), `.env.example` (`INGEST_SECRET` jako `setting` se `secret`). **C3:** SSE `/api/realtime` + `LISTEN opsys_change` (jedno spojení na proces, heartbeat, odmlčení při reconnectu = invalidace všeho), klientský `useRealtime()` invaliduje `keys.all(entity)` (≤ 2 s), `/historie` (filtry kdo/typ/akce/období/kategorie, hledání, CSV s `activity.export`), `saved_view.pinned` + připnuté v navigaci, `recent_record` (posledních 8), `quickFilters` (Moje, Dnes, Po termínu, Bez aktivity, Soukromé), ad hoc filtr v URL (`?f=` base64 JSON), `searchLoad`+telefon (`search_document.search_text` dostane `phoneSearchKeys`), paleta (příkazy, akce zavolat/kopírovat/otevřít Disk), klávesy C, Cmd+K. **C4:** viz tabulka §4.

### 5.4 Test soukromí (kontrakt pro všechny)
Každý modul v `server.ts` deklaruje `privatePaths` (název + `run(ctx, deps)` pro každé ruční čtení: widget, metrika, vrstva, attention, služba, `ClientTabProvider`). `tests/private-paths.int.test.ts` (QA-SEC) založí fixture se **soukromými záznamy s canary řetězcem** (`PRIVATE-CANARY-<n>` v názvech, poznámkách, částkách, e-mailech), spustí každou cestu jako `partner` a ověří, že serializovaný výsledek canary neobsahuje a že součty/počty se rovnají hodnotě bez soukromých dat; jako `owner` musí canary obsahovat. Nová cesta bez záznamu v `privatePaths` shodí `tests/modules.test.ts` (kontrola: každý `calendarLayers`/`widgets`/`attention`/`dashboardMetrics`/`services`/`contributions` má jméno v `privatePaths`).

### 5.5 Co S1 přidá do schématu jádra
`private_record`; `audit_log` (+`is_private`, `category`, `actor_label`, `entity_title`, `context jsonb`), `audit()` helper (+`deleted_by`, `deleted_batch`), `search_document.is_private`, `lookup_item.scopes`, `custom_field_def.show_in_form`, `saved_view.pinned`, `recent_record`, `webhook_endpoint`, `webhook_delivery`, `inbound_event`, `integration_credential`, `user` (+`short_name`, `ico`, `billing_tool`, `avatar_color`, `prefs jsonb`), `trusted_device` (jen pokud ho Better Auth nemá); smazat `terminal_op` a (v C1) `task`.

---
## 6. Rozhodnutí a PŘEDPOKLADY

**B §10:** (1) notifikace **vypnuty**: platforma (push, SW) zůstane v kódu, žádný modul nedefinuje události, sekce v Nastavení skryté, `config.notifications` prázdné. (2) id modulů podle §1.1. (3) `core.task` **zrušit**, nahradí `task` v `ukoly` (základ `crm_activity`); název tabulky `task` (C1 core tabulku nejdřív smaže). (4) migrace: **squash** na čisté DB (§7). (5) Gantt/harmonogram se nestaví.

**C §4 a R-xx (platí PŘEDPOKLAD z C, doplněno):**

| Bod | Rozhodnutí |
|---|---|
| R-01–R-06, R-08–R-10 | stack Rebar; design `@rebar/ui`; výkonové rozpočty jen cíl (R-05); passkey/PWA fronta nezařazeny |
| R-07 | v kódu `opsys`, hlavičky `X-Opsys-*`, v UI „OPSYS“ |
| R-11 | součet procent > 100 % blokovat; < 100 % upozornit, zbytek fakturujícímu |
| R-12 | `payment.job_id` nullable, `kind=recurring`, vždy soukromá, mimo saldo (**POTŘEBA POTVRDIT** — mění schéma finance v S1) |
| R-13 | soukromý klient/zakázka: složka se sama nezakládá |
| R-14 | soukromá schůzka se do Googlu zapíše s `visibility: private` (partner vidí jen „Obsazeno“); přepínač v nastavení kalendáře |
| R-15 | firma z Meta leadu bez `client_status` |
| R-16, R-17 | výhra u bývalého klienta ⇒ `active` + složka z Archivu; `client_since` při prvním `active` |
| R-18 | `activity.export` samostatné právo |
| R-19 | `warn_days` = hranice „kritická“ (výchozí 30), upozornění do 2×`warn_days` |
| R-20, O-8 | pozvánky výchozí vypnuto |
| R-21 | výchozí Partner: `finance.read`, `finance.payments_write`; bez `splits_edit`; rozdělení při založení zakázky se bere z Nastavení |
| R-22 | Partner `reklama.read` |
| R-23 | poznámky bez položky v navigaci (Cmd+K, karta, Můj prostor → Soukromé) |
| R-24 | „Vrátit“ 10 s |
| R-25 | `hourly` jen příznak, bez automatiky |
| R-26 | opakované služby ročně i měsíčně |
| R-27 | kontext klienta = 4 pojmenovaná pole |
| R-31–R-48 | PŘEDPOKLADY z C beze změny (R-31: soukromá firma nedědí do obchodů/zakázek; R-33; R-34 `entity_title`; R-35 `issue_day` předvyplní plánované vystavení; R-36 retainer dialog při založení „Rovnou retainer“; R-37 kód `Z-RRRR-NNN`; R-38; R-39; R-40; R-41; R-42 `first_opened_at`; R-43; R-44; R-45; R-46; R-47; R-48) |
| O-1…O-7 | přijaty (saldo + ruční vyrovnání; úvodní fáze 2×7 000 50/50; retainer fakturující u zakázky; ad spend obojí; Patrikův nástroj volný text; fáze a strom jsou seed) |
| ostatní | `systemy` jako kód; „Kalendář“ jako typ pohledu seznamu se nestaví (kalendář je modul s vrstvou úkolů); `job_participant` ponechán; Můj prostor bez `is_private` (přístup jen oprávněními `muj-prostor.*`; partner je nemá); `/klienti` je vlastní tabulka (počty a příjmy závisí na zobrazujícím), `Organizace` je generický seznam bez těchto sloupců; detail klienta = `/kontakty/firmy/<id>`; hodnoty `Z-RRRR-NNN` přes core `nextNumber`; popis úkolu plain text, poznámky Tiptap |

**POTŘEBA POTVRDIT** (minimum; stavba pokračuje s uvedeným výchozím, změna by znamenala přepis):
1. **R-12** platba bez zakázky (Fakturoid v3) jako `payment.job_id = null`, `kind=recurring`, soukromá.
2. **Jedna role na uživatele** (Patrik = `partner`, žádné přepisy po uživateli ani druhý partner s jinou maticí): per-user přepisy by znamenaly novou tabulku v C1.
3. **R-31** soukromá organizace nedědí do obchodů/zakázek (jinak by se změnil `visibility.parents` v S1).

---
## 7. Integrace na konci (INT, po W3; jediný agent s právem na zamčené soubory)

1. Sebrat `docs/opsys/ZADOSTI.md`, aplikovat (registry, ikony, sekce, `PUBLIC`, závislosti), `pnpm install`, jediný lockfile.
2. **Squash migrací:** `rm -rf packages/core/drizzle packages/modules/*/drizzle`, `pnpm db:generate` (core, pak moduly v pořadí `MODULE_IDS`), každý `0000_init`; `pnpm db:reset && pnpm db:migrate && pnpm db:seed`; `scripts/fresh-instance-check.sh` (čistá instalace; „check:fresh“).
3. Smazat `packages/_donor`, ADR označit „nahrazeno“ + přidat ADR: deal vs. zakázka, typy zakázek a `job_phase`, soukromé záznamy, služby a události mezi moduly, Google/Meta/Fakturoid adaptéry; `docs/NOTIFICATIONS.md` (prázdný katalog), `README.md`, `CHANGELOG.md`, `docs/ARCHITECTURE.md`.
4. `pnpm docs:scaffold`, doplnit zbylé `TODO: doplnit vyprávění`, `pnpm docs:refresh`, `pnpm docs:coverage --prune`.
5. **`pnpm check`** (format, lint, typecheck, docs, test, `config:check`) zelený; `tests/modules.test.ts`: `dependsOn` = `package.json`, probes pro všechny příkazy, `privatePaths` kompletní, `PUBLIC` seznam.
6. **Bezpečnostní matice soukromých záznamů:** `private-matrix` + `private-paths` (partner/owner), `security-matrix` (role `owner`/`partner`/`external`), `public-surface`, kontrola, že `/api/ingest/*` a Google webhook jsou jediné veřejné trasy.
7. **Demo data klienta `opsys`** (`clients/opsys/seed`, `scripts/dev-seed.ts`): 2 uživatelé (hesla/TOTP jen v `.env.local`, ne v repu), pipeline, typy úkolů, šablony zakázek, výchozí pravidla 50/50, několik fiktivních klientů/obchodů/zakázek/plateb včetně soukromých; žádná reálná data.
8. **E2E:** Playwright AS-01…AS-15 na `clients/opsys` + `e2e-crawl` všech tras jako owner i partner (žádné 500, žádný canary), mobil 375 px (MOB-01–09), `perf-check` (Cmd+K p95 ≤ 150 ms, seznam p95 ≤ 120 ms jako cíl).
9. **Nasazení:** image `CLIENT=opsys`, Caddy, `.env.example` + `DEPLOYMENT.md` (Google OAuth redirect, Meta app, Fakturoid, `INGEST_SECRET`, VAPID), importovatelné n8n flows `deploy/n8n/*.json` (Drive složky, Meta lead → `/api/ingest/leads`), noční zálohy a test obnovy (OPS), smoke test s reálnými účty (Google, Meta, ARES, Fakturoid) mimo CI, tag `opsys-v1`.
