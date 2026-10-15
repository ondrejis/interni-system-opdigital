# Reklama

> Vyprávěcí dokumentace modulu `reklama`. Přesné seznamy (pole entit, oprávnění, příkazy a jejich vstupy, tabulky, úlohy, trasy) se tu **neopisují**: jsou v referenci, která vzniká z kódu a nezastará. Tady je to, co z kódu vyčíst nejde: jak věci fungují za sebou, proč jsou tak, jak jsou, a kde jsou hrany.

Referenční stránky vzniklé z kódu: [modul](../reference/moduly/reklama.md), [databáze](../reference/databaze/reklama.md).

<!--
Jak psát (podrobně v docs/DOCS-PROCES.md):
- Každá věta musí platit pro aktuální kód. Co se mění s kódem a jde to vyčíst z kódu, patří do reference, ne sem.
- Odkazuj na kód ve tvaru `cesta/soubor.ts#symbol` (cesta od kořene repozitáře, symbol je deklarace v souboru).
  Test tests/docs.test.ts ověří, že soubor i symbol existují.
- Sekci, kterou jsi zatím nenapsal, nech s řádkem „TODO: doplnit vyprávění“; pnpm docs:status je vypíše.
- Blok „Souhrn z kódu“ nepiš ručně, doplňuje ho pnpm docs:generate.
-->

## Souhrn z kódu

<!-- docs:generated:start -->

_Tento blok vzniká z kódu (`pnpm docs:generate`); neupravuj ho ručně. Vyprávění píš pod ním._

- **Popis z manifestu:** Reklamní účty Meta, kampaně a denní výkon, příchozí leady z formulářů (přes n8n) a jejich převod na obchody.
- **Závisí na:** [`kontakty`](kontakty.md), [`obchody`](obchody.md)
- **Entity:** žádné
- **Příkazy:** žádné
- **Referenční stránky:** [modul](../reference/moduly/reklama.md), [databáze](../reference/databaze/reklama.md)

**Oprávnění a jejich výchozí přidělení rolím:**

| Oprávnění        | Název                               | Výchozí: owner |
| ---------------- | ----------------------------------- | -------------- |
| `reklama.read`   | Vidí reklamní účty, kampaně a výkon | vše            |
| `reklama.write`  | Upravuje reklamu                    | vše            |
| `reklama.manage` | Spravuje napojení na Meta           | vše            |

<!-- docs:generated:end -->

## Účel

<!-- Co modul řeší, pro koho, proč existuje a co do něj naopak nepatří. Tři až šest vět. -->

Modul `reklama` přivádí do OPSYS dvě věci z Meta (Facebook, Instagram): **leady z formulářů** (z nich vznikne kontakt, případně firma, a obchod ve fázi „Nová poptávka“) a **denní výkon reklam** (útrata, zobrazení, kliky, leady) po účtech, kampaních, sadách a reklamách. Ze spojení obou dat plyne to, co agentura chce vědět: cena za lead, kolik leadů Meta napočítala, ale do OPSYS nedorazilo, a kolik stojí vyhraný obchod. Modul reklamy nespravuje a nic do Mety nezapisuje, jen čte. Leady neprochází žádným „Leads Inboxem“: rovnou jsou to obchody na boardu.

## Kdo to používá (role)

<!-- Které výchozí role modul používají, co v něm každá dělá a jaký mají rozsah (vše / moje). Matice oprávnění je v souhrnu výše. -->

Vlastník (Ondřej) má všechna tři oprávnění. Partner (Patrik) má podle R-22 jen `reklama.read`: vidí účty, kampaně a čísla, ale nepřiřazuje kampaně zakázkám a nespravuje napojení. Přiřazení kampaně zakázce a vlastníka účtu vyžaduje `reklama.write`; napojení, mapování formulářů a ruční synchronizaci `reklama.manage`. Uložení tokenu Meta navíc vyžaduje `settings.integrations` (jádro).

## Hlavní toky krok za krokem

<!-- Každý tok zvlášť: spouštěč, očíslované kroky z pohledu uživatele i systému (co se zapíše, spočítá, odešle), výsledek a co se stane při chybě. -->

**Lead z formuláře (REK-01 až REK-05, AS-08)**

1. Meta pošle n8n událost „nový lead“; scénář n8n stáhne lead z Graph API a pošle ho podepsaným `POST /api/ingest/leads` (viz Nastavení → Integrace a návod níže).
2. Jádro (`packages/core/src/ingest/process.ts#processIngest`) ověří podpis, zkontroluje tělo proti `leadIngestPayload` a zapíše řádek do `inbound_event` (dvojice `leads` + `leadgenId`). Už zpracovaný lead vrátí `200 {duplicate:true}` a nic dalšího nedělá.
3. `processLead` najde cíl: mapování formuláře (pipeline, fáze, vlastník, služby), a když mapování chybí nebo je zastaralé (smazaná fáze, neaktivní vlastník), první fázi výchozí pipeline „Obchody“ a vlastníka Ondřeje (R-44).
4. Kontakt a firma: `upsertContactFromLead` z modulu kontakty. Osoba se páruje podle e-mailu nebo telefonu, firma podle IČO, jinak podle názvu; nenalezená se založí. **Firma z leadu nedostane stav klienta** (R-15), proto se nezakládá složka na Disku.
5. Obchod: `createDealFromLead` z modulu obchody. Má zdroj Meta, název kampaně jako detail zdroje, ID kampaně, sady a reklamy a `meta_leadgen_id`; je „neotevřený“ (zvýrazněný na boardu). Je idempotentní i samostatně.
6. Vše je jedna transakce. Selže-li cokoli, vrátí se a zůstane jen řádek `inbound_event` se stavem `failed` a důvodem; ingest odpoví 500, takže n8n lead zopakuje, nebo ho správce zopakuje tlačítkem v Nastavení.

**Denní stažení dat (REK-06, REK-07)**

1. Úloha `reklama.sync.daily` běží každý den v 6:00 (Europe/Prague); stejné dělá příkaz `reklama.sync` (tlačítko „Synchronizovat teď“).
2. `syncMeta` načte účty dostupné tokenu (nové vzniknou jako účty agentury) a pro každý aktivní účet kampaně, sady, reklamy a denní statistiky na třech úrovních.
3. Statistiky se **přepisují za dnešek a posledních 7 dní** (Meta zpětně koriguje útratu a leady): řádky v okně se smažou a nahradí čerstvými, starší zůstanou. Účet bez statistik (první běh) dostane navíc 90 dní historie.
4. Chyba jednoho účtu se zapíše k účtu (`last_sync_error`) a nezastaví ostatní. Neplatný token označí přístup jako „vyžaduje nové přihlášení“.

**Přiřazení kampaně zakázce (REK-06)**: `reklama.campaign.assignJob`. Zakázka musí být marketingová; u účtu klienta musí patřit témuž klientovi. Čísla pak vidí záložka „Reklama“ u zakázky a na kartě klienta (`reklama.forJob`, `reklama.forClient`).

**Obrazovky (REK-B: REK-08, REK-09, REK-11, KLI-08)**

1. **Seznam účtů** (`/reklama`, statická trasa `apps/web/src/app/(app)/reklama`, protože generický seznam entity neumí útratu za měsíc): název, komu účet patří (OP Digital, nebo klient s odkazem na kartu klienta), počet kampaní, útrata tento měsíc a stav posledního stažení dat. Chyba poslední synchronizace je vidět červeně přímo u účtu a nad tabulkou. „Změnit“ otevře dialog vlastníka (`reklama.account.setOwner`; u klienta je firma povinná). Tlačítko „Obnovit z Meta“ (`reklama.sync`, jen s `reklama.manage`) ukáže po doběhnutí počet načtených kampaní a řádků, nebo chyby jednotlivých účtů. Neaktivní účty se ukážou po zaškrtnutí. Pod 768 px jsou místo tabulky karty.
2. **Detail účtu** (`/reklama/<id>`, generický záznam entity, do jehož Přehledu modul přidává karty): přepínač období (7, 30, 90 dní, měsíc, vlastní dvě data; výchozí 30 dní), dlaždice (útrata, zobrazení s kliky a CTR, leady Meta, leady OPSYS s rozdílem, cena za lead, cena za lead v OPSYS, vyhrané obchody, náklad na vyhraný obchod), dva grafy po dnech (útrata a leady) a tabulka kampaní s řádkem Celkem a přiřazenou zakázkou. Vpravo karta s vlastníkem, stavem synchronizace a tlačítkem Obnovit jen pro tento účet.
3. **Detail kampaně** (`/reklama/kampane/<id>`): totéž za kampaň, k tomu tabulka reklamních sad s reklamami pod nimi, miniatura kreativy (klik ji zvětší; adresa se vykreslí jen pro `http(s)`), seznam leadů (obchodů se zdrojem Meta) s odkazem na obchod a výsledkem a nahoře upozornění, když Meta napočítala víc leadů, než dorazilo do OPSYS. Vpravo přiřazení kampaně marketingové zakázce: u účtu klienta se nabízejí jen zakázky téhož klienta, přiřazení jde zrušit; server navíc ověřuje typ a klienta.
4. **Záložka Reklama** na kartě klienta (`CLIENT_TABS.reklama`) a v marketingové zakázce (`visible` jen pro typ marketing): za 3, 6 nebo 12 měsíců dlaždice, tabulka po měsících (útrata, leady Meta a OPSYS, cena za lead), graf po dnech a kampaně; u klienta navíc jeho reklamní účty. Prázdnou záložku na kartě klienta skryje `tabCounts` z REK-A.

**Rozdíl leadů Meta × OPSYS** se ukazuje vždy textem, ne jen barvou: „−3 ztraceno“ (Meta napočítala víc), „+2 navíc“ (v OPSYS je víc, např. ručně zapsané obchody), „souhlasí“. Bez leadů na obou stranách je pomlčka. Hodnota, kterou nejde spočítat (bez dělitele), je pomlčka, nikdy nula. Peníze se v UI zaokrouhlují na celé koruny; grafy jsou dva (Kč a ks mají jinou jednotku, jedna osa by jednu řadu zploštila) a mají tabulku pro čtečky obrazovky z grafů jádra.

## Stavy a přechody

<!-- Stavové automaty (pipeline, fáze, stavy dokladů): z čeho kam se smí, za jakých podmínek, co přechod automaticky udělá. Hodí se tabulka nebo diagram Mermaid. -->

Modul nemá vlastní stavový automat. Příchozí lead v `inbound_event` má stavy `received` (rozpracovaný), `processed` a `failed`; `failed` jde zpracovat znovu (opakovaný požadavek z n8n, nebo `reprocessInbound` z Nastavení), `processed` se podruhé nezpracuje. Obchod z leadu začíná ve fázi z mapování; dál ho vede modul obchody.

## Pravidla a výpočty

<!-- Vzorce, zaokrouhlování, sazby, meze, priority pravidel a příklad s čísly. U každého pravidla odkaz na funkci, která ho provádí. -->

Všechny výpočty jsou čisté funkce v `packages/modules/reklama/src/meta/logic.ts` s unit testy.

- **CPL** = útrata / leady Meta (`cplMinor`). **CPL OPSYS** = útrata / obchody se zdrojem Meta. **Náklad na vyhraný obchod** = útrata / vyhrané obchody z leadů kampaně (`buildMetrics`). Bez dělitele je výsledek `null`, ne nula. Zaokrouhlení na celé haléře.
- **Leady Meta** jsou součet denních statistik; **leady OPSYS** jsou obchody se zdrojem Meta založené v období (podle data založení v pražském čase) s ID kampaně, sady nebo reklamy. **Ztracené leady** = Meta mínus OPSYS (může být záporné).
- **Vyhrané** jsou obchody těchto leadů (kohorta období) s výsledkem „vyhráno“, takže výhra se započítá do období, kdy lead přišel.
- **CTR** = kliky / zobrazení v procentech na dvě desetinná místa (`ctrPct`).
- **Okno přepisu** = dnešek a 7 předchozích dní (`rewriteWindow`); předvolby období 7, 30, 90 dní a měsíc skládá `periodFromPreset`.
- Útrata z Meta (`"123.45"`) se převádí na haléře bez chyb pohyblivé čárky (`toMinor`); leady z `actions` se berou z prvního nalezeného typu (`leadsFromActions`), aby se nedvojily.
- Měna je měna účtu; součty přes účty s různými měnami se nepřevádějí (u agentury je vše CZK).

## Oprávnění

<!-- Jak se oprávnění projevují v chování: kdo co vidí a smí, co je skryté (například peníze), jak funguje rozsah „jen moje“. Seznam oprávnění je v souhrnu. -->

Obchody v počtech leadů respektují soukromí: soukromý obchod se aktérovi bez `private.read` nezapočítá ani se neukáže v seznamu leadů kampaně (`privateScope`). Počty leadů se berou ze všech viditelných obchodů bez ohledu na rozsah „jen moje“, protože jde o souhrn reklamy agentury. Čísla (útrata) jsou dostupná každému s `reklama.read`. Všechna čtení mají záznam v `privatePaths` pro canary test.

## Nastavení

<!-- Co se nastavuje v administraci a v konfiguraci klienta, co která volba mění a jaké jsou výchozí hodnoty. -->

Nastavení → Integrace → panel **Meta** (slot `settings.integrations`):

- **Napojení**: přístupový token Meta (šifrovaně v `integration_credential`, poskytovatel `meta`; nikdy se nezobrazí ani nezapíše do logu), zkouška spojení, ruční synchronizace, odpojení.
- **Reklamní účty**: komu účet patří (agentuře, nebo klientovi) se nastavuje v seznamu účtů na stránce Reklama; výchozí je agentura.
- **Lead formuláře**: pro každý formulář pipeline, fáze, vlastník leadů a výchozí služby. Formulář, ze kterého už lead přišel a nemá mapování, je v nabídce. Nemapovaný formulář padá do první fáze pipeline „Obchody“ k vlastníkovi Ondřejovi.
- **Poslední leady** včetně selhaných s důvodem.

**Návod pro n8n**

1. V Nastavení → Integrace vytvořte tajemství příchozích požadavků (jedno pro všechny zdroje) a vložte ho do n8n jako přihlašovací údaj.
2. Scénář: spouštěč Meta „Lead Ads“ → uzel stažení leadu z Graph API (`/{leadgen_id}?fields=created_time,field_data,form_id,ad_id,adset_id,campaign_id,ad_name,adset_name,campaign_name`) → HTTP Request `POST https://<adresa-opsys>/api/ingest/leads`.
3. Tělo (JSON): `leadgenId` a `formId` jsou povinné, ostatní pole volitelná:

```json
{
  "leadgenId": "444444444444",
  "formId": "555555555555",
  "formName": "Poptávka webu",
  "createdTime": "2026-10-14T10:00:00+0200",
  "campaignId": "120000000001",
  "campaignName": "Weby – podzim",
  "adsetId": "120000000002",
  "adId": "120000000003",
  "fieldData": [
    { "name": "full_name", "values": ["Jan Novák"] },
    { "name": "email", "values": ["jan@firma.cz"] },
    { "name": "phone_number", "values": ["+420777123456"] },
    { "name": "company_name", "values": ["Firma s.r.o."] }
  ]
}
```

Pole formuláře se poznají podle názvu bez diakritiky (`full_name`, `jmeno_a_prijmeni`, `email`, `telefon`, `company_name`, `firma`, `ico` a další); místo `fieldData` jde poslat plochou mapu `fields` nebo přímá pole `fullName`, `email`, `phone`, `companyName`, `ico`. ID smí být čísla. 4. Hlavička `X-Opsys-Signature: t=<unix sekundy>,v1=<hex>`, kde `v1` je HMAC-SHA256 tajemství z textu `<t>.<tělo přesně tak, jak se posílá>`; tolerance ±5 minut. V uzlu Code:

```js
const crypto = require("crypto");
const body = JSON.stringify($json); // přesně toto tělo pošlete
const t = Math.floor(Date.now() / 1000);
const v1 = crypto
  .createHmac("sha256", $env.OPSYS_INGEST_SECRET)
  .update(`${t}.${body}`)
  .digest("hex");
return [{ json: { body, signature: `t=${t},v1=${v1}` } }];
```

5. Odpovědi: `200` zpracováno (`duplicate:true` = už přijato dřív), `401` špatný podpis, `422` neplatné tělo, `500` zpracování selhalo (n8n má požadavek zopakovat; lead je v `inbound_event` jako `failed`).

## Události a upozornění

<!-- Kdy a komu přijde upozornění, jaké události modul oznamuje rozšířením klienta, které plánované úlohy běží a co dělají. -->

Modul neposílá žádná upozornění. Doménové události do webhooků vysílá obchody (`deal.created` při založení obchodu z leadu nese zdroj Meta); vlastní události `lead.*` katalog událostí zatím neobsahuje (žádost v `ZADOSTI.md`), příchozí lead je dohledatelný v `inbound_event` a v historii obchodu. Úloha na pozadí: `reklama.sync.daily` (6:00).

## Exporty

<!-- Co a jak se exportuje (XLSX, CSV, PDF, ISDOC, kalendářový kanál), kdo to smí a co je v souboru. -->

Modul nic neexportuje.

## Integrace s jinými moduly

<!-- Závislosti, poskytovatelé dat, sloty, události; kdo od modulu data bere a komu je modul dává; co se stane po vypnutí modulu. -->

Závisí na `kontakty` (`upsertContactFromLead`) a `obchody` (`createDealFromLead`, čtení obchodů se zdrojem Meta). Zakázky a klienti jsou měkké odkazy: `ad_campaign.job_id` a `ad_account.company_id` jsou sloupce bez cizího klíče; chybí-li modul zakázek, kampaně se jen nepřiřadí. Modul přispívá do `contributions.clientCard` (počet kampaní pro záložku „Reklama“), do `dashboardMetrics` (`reklama.leads_cpl`, `reklama.leads`, `reklama.cpl`, `reklama.spend`, `reklama.cost_per_won`) a widgetem přehledu; panel Meta je ve slotu `settings.integrations`. Pro UI (REK-B) a ostatní moduly exportuje `@rebar/reklama/api` typy výstupů, čisté výpočty a `adsOverview(ctx, {companyId}|{jobId}, period)`. Po vypnutí modulu leady z n8n přestanou procházet (zdroj `leads` zmizí, n8n dostane 404) a data zůstanou v tabulkách.

## Hrany a známá omezení

<!-- Co funguje jinak, než by uživatel čekal, co zatím chybí, a odkazy na otevřené otázky. -->

- Lead bez firmy vytvoří obchod bez firmy (`deal.company_id` je prázdné); typ `createDealFromLead` to zatím nepovoluje, volání proto přetypovává (žádost pro OBC-A v `ZADOSTI.md`).
- Vlastník „Ondřej“ pro nemapované formuláře je první aktivní uživatel s rolí `owner`, jinak s libovolnou systémovou rolí.
- Statistiky jsou v čase účtu Meta, leady OPSYS v pražském čase; kolem půlnoci se mohou o den rozejít.
- Token Meta je dlouhodobý (systémový uživatel Business Manageru); automatická obnova tokenu se nestaví. Neplatný token ukáže panel jako „Vyžaduje nové přihlášení“.
- Součty přes účty v různých měnách se nepřevádějí.
- Reklamy se v OPSYS nevytvářejí ani neupravují.
- Detail účtu a kampaně je generický záznam entity, takže v panelu „Údaje“ jdou vlastník účtu a klient přepsat i napřímo (mimo kontrolu `reklama.account.setOwner`, že účet klienta má klienta); správný způsob je tlačítko „Změnit“ u vlastníka (žádost pro REK-A v `ZADOSTI.md`).
- Období v detailu účtu a kampaně se po otevření vrací na 30 dní (není v adrese); záložka Reklama u klienta a zakázky nabízí jen 3, 6 a 12 měsíců.
- Náhled kreativy je odkaz na CDN Meta, takže po vypršení odkazu se ukáže jen prázdná miniatura; po další synchronizaci se obnoví.

## Odkazy na kód a testy

<!-- Hlavní místa v kódu a testy, které chování zajišťují, ve tvaru `cesta/soubor.ts#symbol`. -->

- Příjem leadů: `packages/modules/reklama/src/meta/ingest.ts#processLead`, `packages/modules/reklama/src/meta/ingest.ts#leadsIngest`, `packages/modules/reklama/src/meta/ingest.ts#resolveLeadTarget`
- Rozbor těla: `packages/modules/reklama/src/meta/logic.ts#parseLead`, `packages/modules/reklama/src/contract.ts#leadIngestPayload`
- Synchronizace: `packages/modules/reklama/src/meta/sync.ts#syncMeta`, `packages/modules/reklama/src/meta/jobs.ts#syncDailyJob`
- Adaptér: `packages/modules/reklama/src/meta/client.ts#MetaAdsClient`, `packages/modules/reklama/src/meta/real-client.ts#createRealMetaClient`, `packages/modules/reklama/src/meta/fake-meta.ts#createFakeMetaClient`
- Výpočty: `packages/modules/reklama/src/meta/logic.ts#buildMetrics`, `packages/modules/reklama/src/meta/logic.ts#rewriteWindow`
- Čtení: `packages/modules/reklama/src/meta/queries.ts#campaignDetail`, `packages/modules/reklama/src/meta/queries.ts#metricsFor`
- UI: `packages/modules/reklama/src/ui/accounts-page.tsx#AccountsPage`, `packages/modules/reklama/src/ui/account-overview.tsx#AccountPerformance`, `packages/modules/reklama/src/ui/campaign-overview.tsx#CampaignPerformance`, `packages/modules/reklama/src/ui/campaign-overview.tsx#JobAssign`, `packages/modules/reklama/src/ui/ads-tab.tsx#ClientAdsTab`, `packages/modules/reklama/src/ui/format.ts#lostInfo`, `packages/modules/reklama/src/ui/format.ts#aggregateMonthly`
- Testy UI: `packages/modules/reklama/src/ui/format.test.ts` (formát čísel, rozdíl leadů, stav synchronizace, měsíce), `apps/web/e2e/reklama.spec.ts` (seznam, detail účtu a kampaně, náhled, vlastník, záložka klienta, Obnovit, mobil)
- Testy: `tests/reklama.int.test.ts` (AS-08: idempotence, selhání, 7denní přepis, výpočty, soukromí), `packages/modules/reklama/src/meta/logic.test.ts`, `packages/modules/reklama/src/meta/real-client.test.ts`
