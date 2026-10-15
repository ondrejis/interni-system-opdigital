# ADR 027: CRM nad zakázkou (nástěnka ve stylu Pipedrive)

- Stav: nahrazeno ADR 028 (modul `obchody`); původně přijato (2026-10-13)
- Kontext: ADR 010 (registr entit a UI), ADR 012 (moduly a příkazy), ADR 015–016 (zakázka jako kořen, životní cyklus), ADR 024 (upozornění), [docs/_archiv/CRM.md](../_archiv/CRM.md) (smlouva oblastí)

## Kontext

Specifikace dema chtěla CRM „jako Pipedrive“. Při přenosu do jádra z něj zbyla tenká entita `inquiry` s vlastní pipeline; obchodní práce (další krok, hnití, prognóza, aktivity, kontakty) chyběla a nástěnku neměl smysl stavět vedle zakázky, která už obchodní fáze (`inquiry`, `offer`) má.

## Rozhodnutí

**Deal je zakázka.** Žádný nový kořenový objekt: nástěnka je pohled na zakázky ve fázích Poptávka a Nabídka, výhra je přechod do Přípravy (hooky přechodu), ztráta fáze `lost` s důvodem. Data se nikam nekopírují.
Obchodní stav (otevřený / vyhraný / ztracený) je odvozený z fáze a `won_at`, nezávislý na stavu pipeline; vyhrát i prohrát jde z kteréhokoli stavu, uzavřenou zakázku jde znovu otevřít (kromě té, která už má rozpočet realizace zkopírovaný z nabídky).

**`inquiry` je schránka poptávek** (Nová / Kvalifikovaná / Zamítnutá). Kvalifikace (`poptavky.convert`) vytvoří firmu a osobu s kontrolou duplicit (IČO, e-mail, telefon) a zakázku v prvním stavu fáze Poptávka; volitelně první aktivitu.

**Stavy nesou pravděpodobnost a hnití** (`pipeline_stage.probability_pct`, `rotting_days`, jádro). Vážená hodnota = hodnota × pravděpodobnost stavu, s ručním přepsáním na zakázce. Počítaná pole zakázky (`crm_*`: další a poslední aktivita, počty, hnití, vstup do stavu, vážená hodnota) se **ukládají** a přepočítávají při změně aktivity nebo stavu (`crmApi.recomputeJobCrm`) a denní úlohou.

**Aktivita je vlastní entita** `crm_activity` (typ, čas, délka, výsledek, vazby na zakázku, firmu i osobu zároveň), ne `core.task`: úkol jádra nemá typ, čas ani víc vazeb. Poznámky (`crm_note`, s připnutím), typy aktivit (`crm_activity_type`) a sledující (`crm_follower`) jsou tabulky modulu. Aktivity jsou ve vrstvě kalendáře a v ICS odběru, ne v Inboxu „Moje úkoly“.

**Historie stavů** (`job_stage_history`) žije v modulu Zakázky (zapisuje ji změna stavu; Zakázky na CRM nezávisí). Z ní jsou dny ve stavu na pásu fází.

**Pravidla kvality polí** (`crm.fieldRules` v nastavení klienta): pole povinné nebo důležité od zvoleného stavu; přechod bez povinného pole selže českou větou a UI nabídne doplnění přímo v detailu (`crm.deal.moveCheck`).

**UI.** Detail zakázky je **pop-up** nad nástěnkou s adresou `?record=<id>` (ne stránka, ne boční panel), nahoře pás fází jako šipky (`PipelineStepper`). Obecné prvky jsou v `packages/ui` a neznají zakázky: `PipelineStepper`, `RecordDialog`, rozšíření karty a hlavičky sloupce kanbanu z modulu (`kanbanCard`, `kanbanColumnHeader`), cílové sloupce Vyhráno/Prohráno (`dropTargets`) a vlastní hlavička pop-upu (`recordDialog`), aby stránka `/zakazky/<id>` zůstala beze změny. Pohledy Nástěnka, Seznam, Prognóza a Archiv sdílejí filtr vlastníka v adrese.

**Modul.** Zobrazený název je „CRM“, interní id zůstává `poptavky` (balíček `@rebar/poptavky`), adresy jsou `/crm`, `/crm/dnes` a `/poptavky` (schránka); modul nově závisí na `zakazky`. Kód je po oblastech ve složkách `crm/<oblast>/` se skládáním přes `mergeServers` a `mergeModuleUi`.

## Důsledky

- Stávající instance se na novou sadu stavů dostanou idempotentní funkcí `ensureCrmDefaults` (seed), ne přepisem migrací; vlastní stavy správce zůstanou.
- Přechod z poptávky do nabídky stále vyžaduje adresu stavby (hook životního cyklu); UI to vysvětlí a nabídne pole vyplnit.
- Přejmenování id modulu na `crm` (balíček, oprávnění `poptavky.*`) je odložené; test navigace proto povoluje `/crm` jako výslovnou výjimku.
- Sloučení duplicit firem a osob hledá odkazy v katalogu databáze (cizí klíče, sloupce `company_id`/`person_id`, polymorfní vazby); nepřepisuje audit, snímek odběratele na vystavené faktuře ani vlastní pole typu odkaz v `custom` JSON.
- Mimo rozsah (fáze 2): reporty a cíle, synchronizace e-mailu a Smart BCC, Meta Lead Ads, Google/Outlook kalendář, import z Pipedrive, sekvence e-mailů.
