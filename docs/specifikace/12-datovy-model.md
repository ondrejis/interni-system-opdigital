# OPSIS 02 – Datový model

Oct 7, 2026 · @Ondřej Dvořák

## Společná pravidla

Model má zhruba 45 tabulek v PostgreSQL. Popis níže je závazný co do entit, vztahů a pravidel. Agent může přidat technické sloupce a indexy, ale nemění význam. Zápis tabulek: `název_sloupce  typ  poznámka`; `→ tabulka` = cizí klíč.

**Sloupce, které má každá hlavní entita**

```
id              uuid pk           UUID v7 generované aplikací
created_at      timestamptz       default now()
updated_at      timestamptz       aktualizuje servisní vrstva
created_by      → users           kdo záznam vytvořil
deleted_at      timestamptz null  měkké mazání, koš 30 dní
```

Hlavní entity navíc: `visibility` enum `shared | private` (default `shared`) a `visibility_source` enum `own | inherited`. Týká se: `organizations`, `persons`, `deals`, `projects`, `tasks`, `notes`, `email_templates`.

**Typy a konvence**

- Peníze: `bigint` v haléřích, sloupec končí `_halere`. Měna jen CZK (sloupec `currency` se nezakládá).
- Procenta: `numeric(7,4)` (např. `50.0000`); součet podílů se kontroluje v servisní vrstvě, ne v DB.
- Telefony ukládat dvakrát: `phone` (jak uživatel zadal) a `phone_e164` (normalizovaný, pro hledání a párování).
- E-maily `citext`.
- Enumy jako PostgreSQL `enum`, kde je množina pevná; jinak číselníková tabulka (fáze, typy aktivit, důvody prohry), aby je šlo měnit v UI.
- Pořadí v seznamech: sloupec `sort_order` typu `text` s frakčním indexováním (přesun bez přečíslování).
- Vlastní pole: `custom_fields jsonb` na entitě, definice v `custom_field_definitions`.
- Plain-text kopie rich textu (`body_text`) pro fulltext.

**Indexy, které musí existovat**

- Každý cizí klíč.
- `(visibility, deleted_at)` na hlavních entitách.
- Pole používaná ve filtrech a řazení: stavy, fáze, `owner_user_id`, `due_date`, `expected_close_date`, `stage_entered_at`.
- Fulltext: generovaný sloupec `search_text` (název + IČO + e-maily + telefony bez mezer, převedené přes `unaccent` a `lower`) s GIN `gin_trgm_ops` na `organizations`, `persons`, `deals`, `projects`, `tasks`, `notes`.

## Hlavní entity a vztahy

Všechno pracovní visí na organizaci. Obchod vede k zakázce, zakázka nese pravidla rozdělení a platby, z plateb vznikají alokace a z nich saldo mezi vámi.

&#91;embedded content: hlavní entity a vztahy · 11 entit\]

Úkoly a poznámky mají volitelné vazby na obchod, organizaci, kontakt i zakázku. Vztahy v diagramu jsou zjednodušené; úplné sloupce jsou v sekcích níže.

## Uživatelé a oprávnění

Tabulky relací, účtů a 2FA zakládá Better Auth podle své dokumentace; níže jsou jen tabulky OPSIS.

```
users
  id, created_at, updated_at
  email                citext unique
  name                 text            "Ondřej Dvořák"
  short_name           text            "Ondřej" (avatary, zmínky)
  role                 enum owner | partner | external
  avatar_color         text            token z palety štítků
  ico                  text null       IČO, na které fakturuje
  billing_tool         text null       "Fakturoid" | volný text
  is_active            boolean
  two_factor_enabled   boolean         spravuje Better Auth
  preferences          jsonb           téma, hustota, výchozí pohledy

user_permissions
  user_id              → users
  feature_key          text            např. "deals.edit" (seznam v packages/permissions)
  granted              boolean
  granted_by           → users
  updated_at
  pk (user_id, feature_key)

invitations
  id, email, role, token_hash, expires_at, accepted_at, created_by
```

Owner nemá řádky v `user_permissions`; jeho práva jsou implicitní. Seed vytvoří Ondřeje (owner) a Patrika (partner) s výchozí sadou práv z dokumentu 01.

## CRM: organizace, kontakty, pipeline, obchody

Klient není samostatná tabulka. Je to organizace s vyplněným `client_status`; lead, aktivní i bývalý klient je tak stejný záznam s celou historií.

```
organizations                       (+ společné sloupce, visibility)
  name                 text
  legal_name           text null       oficiální název z ARES
  ico                  text null unique (8 číslic)
  dic                  text null
  legal_form           text null
  street, city, zip    text null
  country              text default 'CZ'
  website              text null
  email                citext null     obecný e-mail firmy
  phone, phone_e164    text null
  industry             text null       obor (volný text + našeptávač)
  client_status        enum null: lead | active | paused | former
                       null = jen firma v CRM, nikdy nebyla klientem
  client_since         date null       první vyhraný obchod
  client_until         date null       přechod na former
  former_reason        text null       proč spolupráce skončila
  owner_user_id        → users         hlavní odpovědná osoba
  context              jsonb           strukturovaný kontext: {decisionMaker,
                                       howToCommunicate, history, notes} (rich text)
  drive_folder_id      text null       kořenová složka klienta
  drive_status         enum none | pending | ready | error
  ares_synced_at       timestamptz null
  custom_fields        jsonb
  search_text          generovaný

organization_services               služby klienta (podle nich se tvoří složky)
  organization_id      → organizations
  service_type         enum web | marketing | systems
  status               enum active | ended
  started_on, ended_on date
  drive_folder_id      text null
  unique (organization_id, service_type)

persons                             (+ společné sloupce, visibility)
  first_name, last_name text
  organization_id      → organizations null   primární firma
  job_title            text null       "jednatel", "office manažerka"
  emails               jsonb           [{value, label, primary}]
  phones               jsonb           [{value, e164, label, primary}]
  linkedin_url         text null
  is_decision_maker    boolean
  owner_user_id        → users
  custom_fields        jsonb
  search_text          generovaný (všechny e-maily a telefony)

person_organizations                další firmy kontaktu (M:N)
  person_id, organization_id, role text

pipelines
  id, name, sort_order, is_default boolean, archived_at

pipeline_stages
  pipeline_id          → pipelines
  name                 text            "Nová poptávka"
  sort_order           text
  probability          smallint 0–100  pro vážený součet
  rotting_days         smallint null   po kolika dnech bez aktivity zvýraznit

lost_reasons
  id, name, sort_order, is_active

deals                               (+ společné sloupce, visibility)
  title                text
  pipeline_id          → pipelines
  stage_id             → pipeline_stages
  stage_entered_at     timestamptz     pro „hnití“ a statistiky
  status               enum open | won | lost
  organization_id      → organizations null
  person_id            → persons null   hlavní kontakt
  value_halere         bigint null
  service_types        enum[]          web / marketing / systems (pro zakázky po výhře)
  expected_close_date  date null
  owner_user_id        → users
  source               enum manual | meta | web_form | referral | other
  source_detail        text null
  meta_campaign_id, meta_adset_id, meta_ad_id, meta_leadgen_id  text null
  won_at, lost_at      timestamptz null
  lost_reason_id       → lost_reasons null
  lost_note            text null
  last_activity_at     timestamptz null denormalizace pro „hnití“ a řazení
  next_task_id         → tasks null     nejbližší otevřená aktivita (denormalizace)
  custom_fields        jsonb
  search_text          generovaný

deal_participants                   další kontakty u obchodu
  deal_id, person_id

deal_stage_history
  deal_id, from_stage_id, to_stage_id, changed_by, changed_at, time_in_stage interval
```

Seed: pipeline „Obchody“ s fázemi z dokumentu 03, důvody prohry (Cena, Vybrali konkurenci, Nereaguje, Odloženo, Nevhodný klient, Jiné).

## Úkoly a aktivity, poznámky, kalendář

Úkoly a CRM aktivity jsou jedna tabulka `tasks` s typem. Hovor naplánovaný k obchodu a úkol „nahrát texty“ v zakázce se tak objeví ve stejném seznamu „Dnes“ i v kalendáři.

```
task_types                          číselník, editovatelný v Nastavení
  id, name, icon, color_token, sort_order, is_calendar_event boolean, is_system boolean
  seed: Úkol, Hovor, Schůzka (is_calendar_event), E-mail, Termín

tasks                               (+ společné sloupce, visibility)
  title                text
  description          jsonb null      Tiptap JSON
  description_text     text null
  type_id              → task_types
  status               enum todo | in_progress | done | canceled
  priority             enum none | low | medium | high | urgent
  assignee_user_id     → users null
  due_date             date null
  due_time             time null       u hovoru a schůzky
  duration_minutes     int null
  location             text null
  completed_at         timestamptz null
  parent_task_id       → tasks null     podúkoly (1 úroveň)
  deal_id              → deals null
  organization_id      → organizations null
  person_id            → persons null
  project_id           → projects null
  project_phase_id     → project_phases null
  estimate_minutes     int null
  sort_order           text
  template_task_id     → template_tasks null   původ ze šablony
  outcome              text null       výsledek hovoru/schůzky
  send_invites         boolean default false
  search_text          generovaný

task_attendees                      účastníci schůzky
  task_id, user_id null, person_id null, email citext null

task_comments                       krátká diskuse k úkolu mezi vámi dvěma
  id, task_id, author_user_id, body jsonb, body_text, created_at, edited_at, deleted_at

notes                               (+ společné sloupce, visibility)
  title                text null
  body                 jsonb           Tiptap JSON
  body_text            text
  is_pinned            boolean
  deal_id, organization_id, person_id, project_id   → null (max. jeden rodič; žádný = samostatná poznámka)
  search_text          generovaný

calendar_accounts                   (v2) Google účet uživatele
  user_id → users, google_email, access_token_enc, refresh_token_enc, scopes, status, connected_at

calendars                           (v2)
  account_id, google_calendar_id, name, color, is_visible boolean, is_default_write boolean,
  sync_token text null, watch_channel_id, watch_resource_id, watch_expires_at

calendar_events                     (v2) zrcadlo událostí z Googlu
  calendar_id, google_event_id, etag, status, title, starts_at, ends_at, all_day,
  location, attendees jsonb, html_link, updated_remote_at,
  task_id → tasks null                vazba na úkol vytvořený v OPSIS
  deal_id, organization_id, person_id → null   ruční nebo automatická vazba
  unique (calendar_id, google_event_id)
```

Pravidlo: `deals.next_task_id` a `deals.last_activity_at` přepočítá servisní vrstva při každé změně úkolu navázaného na obchod. Úkol s rodičovským záznamem `private` dědí viditelnost (dokument 00, Pravidla viditelnosti).

## Zakázky, fáze, šablony, hodiny

Zakázka patří vždy jednomu klientovi a má jeden typ. Fáze a úkoly se při založení zkopírují ze šablony, takže pozdější úprava šablony neovlivní běžící zakázky.

```
projects                            (+ společné sloupce, visibility)
  code                 text unique     "Z-2026-014" (rok + pořadí, generuje DB sekvence)
  name                 text
  organization_id      → organizations
  type                 enum web | marketing | systems
  status               enum planned | active | paused | completed | canceled
  billing_model        enum one_off | intro_then_retainer | retainer | hourly
  marketing_stage      enum null: intro | decision | retainer | ended   (jen marketing)
  current_phase_id     → project_phases null
  template_id          → project_templates null
  deal_id              → deals null     obchod, ze kterého vznikla
  owner_user_id        → users
  start_date           date null
  due_date             date null
  completed_at         timestamptz null
  budget_halere        bigint null     dohodnutá cena (jednorázová)
  description          jsonb null
  drive_folder_id      text null
  drive_status         enum none | pending | ready | error
  custom_fields        jsonb
  search_text          generovaný

project_members
  project_id, user_id, role enum lead | member, pk (project_id, user_id)

project_phases
  project_id           → projects
  name                 text
  sort_order           text
  status               enum not_started | in_progress | done | skipped
  start_date, due_date date null
  completed_at         timestamptz null

project_templates
  id, name, type enum web | marketing | systems, description,
  default_billing_model, is_default boolean, is_active boolean, sort_order

template_phases
  template_id, name, sort_order, offset_start_days int, duration_days int null

template_tasks
  template_id, template_phase_id null, title, description jsonb null,
  type_id → task_types, priority,
  assignee_rule enum project_owner | project_lead | specific_user | unassigned,
  assignee_user_id → users null,
  due_offset_days int null            od start_date zakázky
  estimate_minutes int null, sort_order

template_payments                   plánované platby ze šablony (např. úvodní fáze marketingu)
  template_id, label, amount_halere, issuer_user_id → users null,
  due_offset_days int, sort_order

time_entries                        (v2) ruční výkaz hodin
  id, user_id → users, project_id → projects, task_id → tasks null,
  work_date date, minutes int > 0, note text null, created_at, updated_at, deleted_at
```

Viditelnost `time_entries` se odvozuje ze zakázky. Hodinová sazba se neeviduje; efektivní sazba = podíl uživatele na příjmech zakázky / jeho hodiny (počítá se v reportu).

## Finance: platby, rozdělení, vyrovnání, retainery

OPSIS faktury nevystavuje. Eviduje platby: kdo fakturoval, kolik a s jakým číslem faktury. U každé platby uloží, komu z vás kolik patří. Rozdíl mezi „komu patří“ a „kdo přijal peníze“ dává saldo „kdo komu dluží“.

```
project_split_rules                 pravidla rozdělení na zakázce
  project_id           → projects
  user_id              → users
  mode                 enum percent | fixed_per_payment | fixed_total
  percent              numeric(7,4) null      mode = percent
  fixed_halere         bigint null            mode = fixed_*
  applies_to           enum all | one_off | intro | retainer | extra
  valid_from           date null              změna pravidla v čase (retainery)
  valid_to             date null
  sort_order           text

project_payments                    platby / fakturace (evidence)
  project_id           → projects
  label                text            "Úvodní fáze 1/2", "Retainer 10/2026"
  kind                 enum one_off | intro | retainer | extra
  period_month         date null       první den měsíce (retainer)
  amount_halere        bigint > 0
  issuer_user_id       → users         kdo fakturuje / fakturoval klientovi
  status               enum planned | issued | paid | canceled
  invoice_number       text null
  issue_date           date null
  due_date             date null
  paid_date            date null
  allocation_mode      enum rules | manual
  note                 text null
  unique (project_id, kind, period_month) where kind = 'retainer'

payment_allocations                 komu kolik z platby patří
  payment_id           → project_payments
  user_id              → users
  amount_halere        bigint >= 0
  pk (payment_id, user_id)
  invariant: součet = amount_halere platby

project_retainers
  project_id           → projects
  amount_halere        bigint
  start_month          date
  end_month            date null
  issue_day            smallint 1–28
  issuer_mode          enum fixed | alternate
  issuer_user_id       → users null     fixed
  alternate_first_user_id → users null  alternate: kdo začíná
  is_active            boolean

settlements                         vyrovnání mezi vámi
  id, from_user_id → users, to_user_id → users, amount_halere,
  settled_on date, method enum invoice | transfer | offset,
  reference text null (číslo faktury mezi IČO), note, created_by, created_at, deleted_at
```

**Algoritmus rozdělení platby** (čistá funkce v `packages/shared/finance.ts`)

1. Pokud `allocation_mode = manual`, použij uložené alokace a jen ověř součet.
2. Vyber pravidla zakázky platná k datu `period_month` (retainer) nebo `issue_date` (jinak dnes). Pravidla s konkrétním `applies_to` mají přednost před `all`.
3. Nejsou-li pravidla, celá částka patří fakturujícímu.
4. Nejdřív fixní částky: `fixed_per_payment` celou hodnotou; `fixed_total` jen zbytkem, který ještě nebyl alokován v dřívějších platbách (podle `issue_date`, pak `created_at`). Fixní částka nikdy nepřesáhne zbytek platby.
5. Zbytek se rozdělí podle `percent`; procenta se normalizují na 100 %.
6. Každý podíl se zaokrouhlí dolů na haléře, zbylé haléře jdou fakturujícímu.
7. Alokace se přepočítají při změně částky, fakturujícího, pravidel nebo data. U plateb ve stavu `paid` se přepočet nejdřív potvrzuje v UI.

**Saldo**

- Základ výpočtu je nastavitelný: platby `paid` (výchozí), nebo už `issued`.
- Pro každou alokaci, kde příjemce ≠ fakturující: fakturující dluží příjemci částku alokace.
- Saldo dvojice = dluhy jedním směrem − dluhy druhým směrem − zapsaná vyrovnání. Výsledek je jedna částka a směr („Patrik dluží Ondřejovi 12 400 Kč“).
- Soukromé zakázky Ownera se do salda nepočítají (nemají podíl Partnera).

**Testovací scénáře (povinné unit testy)**

| # | Situace | Pravidla | Očekávané alokace | Saldo |
| --- | --- | --- | --- | --- |
| 1 | Web 50 000 Kč, fakturuje Ondřej | Ondřej 60 %, Patrik 40 % | O 30 000, P 20 000 | O dluží P 20 000 |
| 2 | Úvodní fáze 2 × 7 000 Kč, 1. fakturuje Patrik, 2. Ondřej | 50 / 50 | každá platba O 3 500, P 3 500 | 0 (vzájemně se vyruší) |
| 3 | Systém 80 000 Kč, fakturuje Patrik | Ondřej fixně 10 000 / platba, Patrik 100 % zbytku | O 10 000, P 70 000 | P dluží O 10 000 |
| 4 | 333,33 Kč, fakturuje Ondřej | 50 / 50 | P 166,66, O 166,67 | O dluží P 166,66 |
| 5 | Scénář 1 + vyrovnání O → P 20 000 Kč | – | – | 0 |
| 6 | Retainer 15 000 Kč, za 12/2026 a 01/2027 | do 12/2026 O 70 / P 30, od 01/2027 50 / 50 | 12/2026: O 10 500, P 4 500; 01/2027: O 7 500, P 7 500 | podle fakturujícího |
| 7 | Fixně celkem 10 000 Kč pro Patrika, dvě platby 6 000 Kč | P `fixed_total` 10 000, O 100 % zbytku | 1.: P 6 000, O 0; 2.: P 4 000, O 2 000 | podle fakturujícího |
| 8 | Platba bez pravidel | žádná | 100 % fakturujícímu | 0 |

## Reklama: Meta účty, kampaně, denní data (v2)

Reklamní účet patří buď OP Digital (vaše akvizice), nebo klientovi. Kampaň jde navíc přiřadit konkrétní zakázce. Leady se s kampaní párují přes Meta ID uložená u obchodu.

```
ad_accounts
  id, meta_account_id text unique, name, timezone, currency,
  owner_kind           enum agency | client
  organization_id      → organizations null   owner_kind = client
  is_active            boolean
  last_synced_at       timestamptz null

ad_campaigns
  id, ad_account_id → ad_accounts, meta_campaign_id text unique,
  name, objective, status, created_remote_at,
  project_id           → projects null     marketingová zakázka klienta
  pipeline_id          → pipelines null    kam padají leady z vašich kampaní

ad_sets
  id, campaign_id → ad_campaigns, meta_adset_id unique, name, status

ads
  id, adset_id → ad_sets, meta_ad_id unique, name, status, creative_thumbnail_url null

ad_insights_daily
  date                 date
  level                enum campaign | adset | ad
  object_id            uuid            id kampaně, sady nebo reklamy
  spend_halere         bigint
  impressions          int
  clicks               int
  leads                int             výsledky typu lead podle Meta
  pk (date, level, object_id)

lead_form_mappings                  kam padají leady z konkrétního formuláře
  meta_form_id text unique, name, pipeline_id → pipelines, stage_id → pipeline_stages null,
  owner_user_id → users null, default_service_types enum[]

ingest_events                       záznam každého příchozího webhooku (i leadů)
  id, source text, external_id text, payload jsonb, status enum received | processed | failed,
  error text null, created_entity_type, created_entity_id, received_at, processed_at
  unique (source, external_id)
```

Metriky (počítat dotazem, neukládat): CPL = spend / leady z Meta; CPL podle OPSIS = spend / obchody se zdrojem `meta` dané kampaně; náklad na vyhraný obchod = spend / vyhrané obchody kampaně. Rozdíl mezi leady podle Meta a podle OPSIS ukazuje ztracené leady (např. výpadek n8n).

## Jen pro Ondřeje

Tyto tabulky čte a zapisuje jen uživatel s příslušným klíčem `owner.*` (výchozí jen Owner). Do žádného sdíleného součtu, hledání Partnera ani SSE události Partnera se nepropisují.

```
recurring_services                  hosting a údržba webů (v2)
  id, organization_id → organizations, project_id → projects null
  kind                 enum hosting | maintenance
  name                 text            "Hosting WP – Basic", "Roční údržba"
  website_url          text null
  price_halere         bigint          cena za období
  billing_period       enum yearly | monthly
  started_on           date
  next_renewal_on      date
  status               enum active | paused | canceled
  auto_prepare_invoice boolean         (v3) připravit návrh faktury
  invoice_lead_days    smallint default 14
  fakturoid_subject_id text null       (v3)
  hosting_provider     text null       kde web reálně běží
  note                 text null
  created_at, updated_at, deleted_at

domains                             (v2)
  id, domain citext unique, organization_id → organizations null
  registrar            text null
  expires_on           date
  paid_by              enum agency | client
  auto_renew           boolean
  dns_provider         text null
  recurring_service_id → recurring_services null
  renewal_price_halere bigint null
  warn_days            smallint default 30
  note, created_at, updated_at, deleted_at

recurring_invoice_drafts            (v3) návrhy faktur
  id, recurring_service_id → recurring_services, period_from date, period_to date,
  amount_halere, status enum draft | approved | sent_to_fakturoid | canceled,
  fakturoid_invoice_id text null, fakturoid_number text null, fakturoid_url text null,
  approved_at timestamptz null, error text null, created_at
  unique (recurring_service_id, period_from)
```

E-mailová knihovna nemá vlastní tabulku: jsou to řádky `email_templates` se `scope = owner_library` (viz Průřezové). Soukromé zakázky, poznámky a úkoly Ondřeje jsou běžné záznamy s `visibility = private`.

## Průřezové tabulky

Tyto tabulky obsluhují víc modulů najednou: vlastní pole, štítky, uložené pohledy, dashboardy, šablony e-mailů, activity log, Disk a webhooky.

```
custom_field_definitions
  id, entity enum organization | person | deal | project | task
  key                  text            stabilní klíč v custom_fields jsonb
  label                text
  type                 enum text | long_text | number | money | date | select | multi_select
                            | user | url | email | phone | checkbox
  options              jsonb null      [{id, label, color_token}] pro select
  is_required          boolean
  show_in_create_form  boolean
  show_in_list_default boolean
  sort_order           text
  archived_at          timestamptz null   archiv místo smazání (data zůstávají)

tags
  id, name, color_token, scope enum all | organization | person | deal | project | task

taggings
  tag_id → tags, entity_type, entity_id, pk (tag_id, entity_type, entity_id)

saved_views
  id, user_id → users, entity enum deals | organizations | persons | clients | projects | tasks | payments
  name, layout enum list | board | calendar
  filters jsonb, sort jsonb, columns jsonb, group_by text null
  is_shared boolean, is_default boolean, sort_order

dashboards
  id, user_id → users, name, is_default boolean
  layout jsonb          [{widgetId, x, y, w, h}] pro react-grid-layout, zvlášť pro breakpointy lg/md/sm

dashboard_widgets
  id, dashboard_id → dashboards, widget_type text, config jsonb (filtry, období, uložený pohled)

email_templates                     (+ společné sloupce, visibility)
  scope                enum shared | owner_library
  name, category text null
  subject              text
  body                 jsonb + body_text   proměnné {{kontakt.krestni_jmeno}}, {{firma.nazev}},
                                           {{obchod.nazev}}, {{zakazka.nazev}}, {{uzivatel.jmeno}}
  language             enum cs | sk | en
  usage_count          int

activity_log                        jen INSERT, bez UPDATE a DELETE
  id                   bigserial
  created_at           timestamptz
  actor_user_id        → users null
  actor_system         enum null: job | n8n | google | meta | system
  action               text
  category             enum data | security | integration
  entity_type          text
  entity_id            uuid
  visibility           enum shared | private   kopie z entity v době zápisu
  changes              jsonb           {pole: [před, po]}
  context              jsonb           {dealId, projectId, organizationId, …} pro timeline rodiče
  ip, user_agent       text null
  index (entity_type, entity_id, created_at desc), index (actor_user_id, created_at desc),
  GIN index na context

drive_requests                      sledování webhooků pro Disk
  id (= eventId), event text, organization_id, project_id null, payload jsonb,
  status enum sent | done | error | timeout, attempts int, error text null, sent_at, done_at

webhook_endpoints
  id, name, url, secret_enc, events text[], include_private boolean, is_active

webhook_deliveries
  id, endpoint_id, event, payload jsonb, status enum pending | delivered | failed,
  attempts int, last_status_code int null, last_error text null, next_attempt_at, delivered_at

integration_credentials
  id, provider enum google | meta | fakturoid, user_id → users null, data_enc bytea, status, updated_at

settings                            klíč–hodnota pro globální nastavení
  key text pk, value jsonb, updated_by, updated_at
  např. drive.structure, finance.balance_basis, meta.default_pipeline
```

**Hledání**: jeden endpoint `GET /api/search?q=` spustí paralelně dotaz nad `search_text` šesti entit (trigram similarity + prefix), každá max. 8 výsledků, seřazeno podle shody a `updated_at`. Dotaz se před hledáním převede přes `unaccent(lower())`; čísla se porovnávají bez mezer, takže „777 12“ najde „+420 777 123 456“.
