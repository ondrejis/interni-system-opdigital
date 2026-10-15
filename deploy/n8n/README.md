# n8n workflow pro OPSYS

Dvě šablony, které se importují do vlastního n8n agentury. OPSYS sám žádnou automatizaci nespouští: posílá události ven (webhooky) a přijímá podepsané požadavky zpět (`/api/ingest/<zdroj>`).

| Soubor               | Co dělá                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drive-folders.json` | přijme webhook `drive.*`, ověří podpis, hned odpoví 200, založí / přejmenuje / přesune složky na sdíleném Google Disku a pošle podepsaný callback `POST /api/ingest/drive` |
| `meta-leads.json`    | nový lead z Meta Lead Ads → normalizace → podepsaný `POST /api/ingest/leads` (OPSYS z něj udělá kontakt, firmu a obchod)                                                   |

V šablonách **nejsou žádné klíče ani ID účtů**. Tajemství se berou z proměnných prostředí n8n, ID složek se doplní a přihlášení ke Googlu a Meta se přiřadí po importu. Všechna místa k doplnění jsou označená `<<DOPLNIT …>>` a vysvětlená poznámkami přímo v uzlech.

> **Co je ověřeno.** Logika všech Code uzlů (ověření podpisu, plán složek po úrovních, najít/založit složku služby, chyby, podpis callbacku, normalizace leadu) je pokrytá testem `tests/deploy-n8n.test.ts`, který uzly spouští s napodobeninou prostředí n8n a výstup kontroluje schématy OPSYS. **Import a běh v živém n8n a volání skutečného Google Disku a Meta se zatím nezkoušely**: první zapnutí proto udělej s testovacím klientem a testovací složkou (krok 6).

## 1. Předpoklady

- n8n (self-hosted, verze 1.x nebo novější) dostupné z internetu přes HTTPS (OPSYS na něj posílá webhooky) a schopné volat OPSYS.
- V prostředí n8n musí být nastaveno:

  | Proměnná                        | Hodnota                                                                                                                |
  | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
  | `NODE_FUNCTION_ALLOW_BUILTIN`   | `crypto` (Code uzly počítají HMAC podpis)                                                                              |
  | `N8N_BLOCK_ENV_ACCESS_IN_NODE`  | `false` (Code uzly čtou tajemství z proměnných prostředí; od n8n 2.0 je výchozí `true`)                                |
  | `OPSYS_WEBHOOK_SECRET`          | tajemství podpisu webhooku (z OPSYS, krok 2), začíná `whsec_`                                                          |
  | `OPSYS_INGEST_SECRET`           | tajemství příchozích požadavků (z OPSYS, krok 2)                                                                       |
  | `OPSYS_BASE_URL`                | adresa OPSYS bez lomítka na konci, např. `https://opsys.opdigital.cz` (jen `meta-leads`; Drive bere adresu z události) |
  | `OPSYS_DRIVE_CLIENTS_FOLDER_ID` | ID složky „Klienti“ na sdíleném Disku (krok 4); místo proměnné jde vyplnit přímo v uzlu Konfigurace                    |
  | `OPSYS_DRIVE_ARCHIVE_FOLDER_ID` | ID složky „Archiv“ (stejně)                                                                                            |

  Příklad pro Docker Compose n8n: sekce `environment:` služby `n8n`. Hodnoty patří do `.env` serveru n8n, ne do workflow ani do gitu.

## 2. Tajemství v OPSYS

1. **Nastavení → Integrace → Příchozí požadavky → Vygenerovat (Vyměnit) tajemství.** Zobrazí se jen jednou: zkopíruj ho do `OPSYS_INGEST_SECRET` v n8n.
2. Tajemství webhooku dostaneš při založení webhooku v kroku 4 (Integrace → Webhooky). Zkopíruj ho do `OPSYS_WEBHOOK_SECRET`.
3. Po změně proměnných prostředí n8n restartuj.

## 3. Import

V n8n: **Workflows → Add workflow → Import from file** a vyber `drive-folders.json`, pak totéž s `meta-leads.json`. Obě se importují **vypnutá**. Po importu otevři každé workflow a projdi červeně označené uzly (chybí přihlášení).

## 4. Google Disk (`drive-folders.json`)

1. Na sdíleném Disku „OP Digital – Klienti“ ověř, že existují složky **Klienti** a **Archiv** (jména odpovídají Nastavení → Google Disk). ID složky je v adrese: `https://drive.google.com/drive/folders/<ID>`.
2. V uzlu **Konfigurace** vyplň `clientsRootFolderId` a `archiveRootFolderId` (nebo nastav proměnné z kroku 1).
3. V n8n vytvoř přihlášení **Google Drive OAuth2 API** (účet, který má na sdíleném Disku právo zakládat složky) a přiřaď ho u všech uzlů „Google Disk: …“ (založit složku, najít složku služby, přejmenovat, přesunout). Redirect URI pro OAuth klienta v Google Cloud Console ukazuje n8n při zakládání přihlášení.
4. Workflow **aktivuj**. U uzlu **Webhook z OPSYS** zkopíruj _Production URL_ (končí `/webhook/opsys-drive`).
5. V OPSYS: **Nastavení → Integrace → Webhooky → Přidat**: název „n8n – Disk“, adresa = Production URL, události = skupina **Google Disk (`drive.*`)**. Zobrazené tajemství patří do `OPSYS_WEBHOOK_SECRET` (krok 2). „Doručovat i soukromé“ zapni jen tehdy, když mají vznikat složky i pro soukromé klienty a zakázky vlastníka.
6. **Odeslat test** u webhooku: n8n musí odpovědět 2xx. Test posílá událost `webhook.test`: workflow ji přijme (odpoví 200) a bez akce skončí, protože to není `drive.*`.
7. **Nastavení → Google Disk → Otestovat napojení** zkontroluje, že je webhook aktivní a adresa pro odpověď je správná.

Jak to funguje: webhook nese podpis `X-Opsys-Signature: t=<unix>,v1=<HMAC-SHA256(tajemství, t + "." + tělo)>`. Workflow ho ověří nad **syrovým** tělem, při chybě odpoví 401 a nic neudělá. Při platném podpisu odpoví hned 200 (OPSYS čeká 10 s) a na pozadí:

- `drive.client.create`: založí složku klienta pod „Klienti“ a celý strom z Nastavení → Google Disk (po úrovních),
- `drive.client.add_service`: založí složky služeb ve složce klienta,
- `drive.project.create`: složku zakázky založí ve složce služby (kterou **najde, nebo založí**, když OPSYS její ID ještě nezná),
- `drive.client.rename`: přejmenuje složku podle ID,
- `drive.client.archive` / `drive.client.restore`: přesune složku do „Archiv“ a zpět. **Nic se nemaže.**

Nakonec pošle podepsaný callback `POST <callbackUrl>` s ID složek (`root`, `services`, `project`) nebo s `status: "error"` a důvodem. Callback podepisuje `OPSYS_INGEST_SECRET`.

## 5. Meta leady (`meta-leads.json`)

1. V Meta for Developers měj aplikaci s oprávněními `leads_retrieval`, `pages_show_list`, `pages_manage_metadata` (pro ostré leady musí projít kontrolou aplikace, pro testovací účty stačí režim vývoje).
2. V n8n vytvoř přihlášení **Facebook Lead Ads OAuth2 API** a přiřaď ho uzlu **Nový lead z Meta**. V uzlu vyber aplikaci, stránku a (volitelně) formulář.
3. V OPSYS: **Nastavení → Integrace → Meta** namapuj formuláře na pipeline, fázi a vlastníka (bez mapování lead padá do výchozí pipeline „Obchody“ k Ondřejovi).
4. Nastav `OPSYS_BASE_URL` a `OPSYS_INGEST_SECRET` (krok 1) a n8n restartuj.
5. **Zkouška bez Meta:** spusť ručně větev „Ruční test (ukázkový lead)“. V OPSYS musí vzniknout obchod „Test Testovič – TEST formulář“ a v Nastavení → Integrace → Příchozí požadavky řádek `leads` se stavem zpracováno. Obchod po zkoušce smaž (jde do Koše).
6. Workflow aktivuj.

Požadavek se podepisuje stejně jako callback Disku. OPSYS lead zpracuje idempotentně podle `leadgenId`: opakované odeslání téhož leadu (retry n8n, ruční zopakování) obchod nezdvojí.

## 6. První zapnutí bezpečně

1. V OPSYS založ **testovacího klienta** (stav Lead) a zkontroluj, že v n8n proběhla execution `drive-folders`, na Disku vznikla složka klienta se stromem a v OPSYS se u klienta objevilo tlačítko **Otevřít Disk**.
2. Přejmenuj klienta, pak ho dej do stavu Bývalý a zpět: složka se musí přejmenovat, přesunout do Archivu a vrátit.
3. Založ testovací zakázku: vznikne složka zakázky ve složce služby.
4. Testovacího klienta smaž v OPSYS (koš) a složku ručně na Disku.

## 7. Když něco nejde

| Příznak                                                 | Příčina a postup                                                                                                                                                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| webhook v OPSYS má chybná doručení (Nastavení → Systém) | n8n je nedostupné nebo odpovědělo 4xx/5xx. Oprav n8n a v Systému použij **Opakovat všechna**. Čas serverů musí souhlasit (podpis platí ±5 min).                                  |
| n8n odpovídá 401 `invalid_signature`                    | `OPSYS_WEBHOOK_SECRET` neodpovídá tajemství webhooku (po výměně tajemství v OPSYS zapomeň aktualizovat proměnnou), nebo n8n změnilo tělo (reverzní proxy, která přepisuje JSON). |
| tlačítko Disk dlouho „Vytváří se…“, pak „Zkusit znovu“  | callback nedorazil: v n8n je execution s chybou (typicky chybí přihlášení Google nebo ID složek). Oprav a v OPSYS stiskni **Zkusit znovu**; pozdní odpověď n8n OPSYS přijme.     |
| callback vrací 401                                      | `OPSYS_INGEST_SECRET` je jiné než v OPSYS (Nastavení → Integrace → Příchozí požadavky) nebo se liší čas. Po výměně tajemství platí staré ještě 24 h.                             |
| callback vrací 422                                      | tělo neodpovídá schématu: ID složky smí mít jen `A-Z a-z 0-9 _ -`; zkontroluj `folders` v execution.                                                                             |
| leady z Meta nechodí                                    | v n8n je execution s chybou (vypršelé přihlášení Meta), nebo n8n nedostává události (aplikace není v režimu Live). Selhané příchozí požadavky jsou v Systému a Integracích.      |
| lead přišel, ale spadl do výchozí pipeline              | formulář nemá mapování (Nastavení → Integrace → Meta).                                                                                                                           |

**Chyby v samotném n8n:** nastav v obou workflow **Settings → Error workflow** na vlastní workflow, které ti chybu pošle (Slack, e-mail z n8n…). OPSYS žádná upozornění neposílá: stav a chybná doručení vidíš v **Nastavení → Systém**, když stránku otevřeš.

## 8. Změny a rotace

- **Rotace tajemství** (podezření na únik, odchod člověka): postup v [RUNBOOK](../../docs/RUNBOOK.md), část „Tajemství n8n a webhooků“.
- **Změna struktury složek:** Nastavení → Google Disk (workflow se nemění, strom přichází v události). Přejmenování zakázky složku zakázky nepřejmenuje.
- **Aktualizace šablon:** po změně souboru v repozitáři workflow znovu naimportuj jako nové, ověř a staré vypni. Přihlášení a proměnné prostředí zůstávají.
