# Google Disk

> Vyprávěcí dokumentace modulu `disk`. Přesné seznamy (pole entit, oprávnění, příkazy a jejich vstupy, tabulky, úlohy, trasy) se tu **neopisují**: jsou v referenci, která vzniká z kódu a nezastará. Tady je to, co z kódu vyčíst nejde: jak věci fungují za sebou, proč jsou tak, jak jsou, a kde jsou hrany.

Referenční stránky vzniklé z kódu: [modul](../reference/moduly/disk.md), [databáze](../reference/databaze/disk.md).

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

- **Popis z manifestu:** Složky klientů a zakázek na sdíleném Google Disku: požadavky na založení přes n8n, stav složek a strom složek v Nastavení.
- **Závisí na:** žádném modulu
- **Entity:** žádné
- **Příkazy:** žádné
- **Referenční stránky:** [modul](../reference/moduly/disk.md), [databáze](../reference/databaze/disk.md)

**Oprávnění a jejich výchozí přidělení rolím:**

| Oprávnění     | Název                            | Výchozí: owner |
| ------------- | -------------------------------- | -------------- |
| `disk.read`   | Vidí stav složek na Google Disku | vše            |
| `disk.write`  | Zakládá složky na Disku          | vše            |
| `disk.manage` | Spravuje strukturu složek        | vše            |

<!-- docs:generated:end -->

## Účel

Modul zajišťuje, aby každý klient a každá zakázka měly svou složku na sdíleném Google Disku „OP Digital – Klienti“ (struktura ze specifikace: `Klienti/{Klient}/00 Klient`, `10 Web`, `20 Marketing`, `30 Systémy`, v nich `{RRRR-MM} {Název zakázky}/…`, bývalí klienti v `Archiv/`). Složky **nezakládá OPSYS, ale n8n**: OPSYS mu pošle událost `drive.*` s požadovanou strukturou a přijme callback s ID složek. Systém si pamatuje ID složky, ne cestu, takže přejmenování nebo přesun na Disku nic nerozbije. Smazání čehokoli v OPSYS nikdy nic na Disku nemění (žádný handler mazání neexistuje).

## Kdo to používá (role)

- **Vlastník (Ondřej):** vše, včetně Nastavení → Google Disk (`disk.manage`) a složek soukromých záznamů.
- **Partner (Patrik):** `disk.read` a `disk.write`: vidí tlačítko, zakládá a opakuje složky u záznamů, které vidí. Soukromé záznamy a jejich složky pro něj v OPSYS neexistují.

## Hlavní toky krok za krokem

1. **Klient dostane stav Lead nebo Aktivní** (`client.status_changed`, vysílá modul klienti): handler (`src/handlers.ts`) podle `planClientFolder` (`src/state.ts`) založí požadavek `client.create`. Bývalý → `client.archive`, návrat z Bývalého → `client.restore`, Pozastavený nic. Firma bez stavu klienta (z Meta leadu, R-15) složku nedostane, dokud stav nedostane (R-14).
2. **Přibude služba** (`client.service_added`): existuje-li složka klienta, `client.add_service` s jen chybějícími službami. Přibude-li služba, zatímco se složka teprve zakládá, doplní ji `reconcileServices` po callbacku.
3. **Přejmenování klienta** (`client.renamed`): `client.rename` (n8n přejmenuje podle ID složky).
4. **Vznikne zakázka** (`project.created`): `project.create`; nemá-li klient složku, nejdřív `client.create`.
5. **Fronta po klientovi:** požadavky téhož klienta odcházejí po jednom. Další čeká (`blocked_by`) a po dokončení předchozího se znovu sestaví (už se známými ID složek) a odešle. Tím se při výhře obchodu (složka klienta i zakázek najednou) nezakládají stejné složky dvakrát.
6. **Odeslání:** `emitDomain("drive.*")` v téže transakci jako změna; outbox jádra (C2) založí doručení webhooku. Požadavek je `pending`; úloha `disk.timeout` ho po doručení převede na `sent`.
7. **Callback n8n** `POST /api/ingest/drive` (podpis a idempotenci řeší jádro, handler `driveIngest` v `src/ingest.ts`): uloží ID složek (`drive_folder`), nastaví `drive_folder_id` a `drive_status` na klientovi či zakázce (systémová pole) a požadavek dokončí.
8. **Tlačítko Otevřít Disk** (`DriveButton`, příkaz `disk.folderState`): „Otevřít Disk“ (nová karta), „Vytváří se…“, „Zkusit znovu“ (chyba nebo 10 minut bez odpovědi), „Vytvořit složku“ (záznam složku nemá). Je na kartě „Složka na Disku“ na Přehledu klienta i zakázky a v hlavičce (viz hrany).

## Stavy a přechody

Požadavek (`applyRequestSignal`): `pending → sent → done`, `pending|sent → error|timeout`, `error|timeout → done|error` (pozdní odpověď n8n platí), `done` je konečný (pozdní chyba hotovou složku nepřepíše). Stav složky záznamu (`deriveFolderState`): existující složka je vždy `ready`; jinak podle posledního požadavku na založení `none` / `pending` / `error` / `timeout`. Neúspěšná úprava existující složky (přejmenování…) tlačítko „Otevřít Disk“ nemění, jen vedle něj nabídne „Zkusit znovu“.

## Pravidla a výpočty

- **Lhůta 10 minut** se počítá od odeslání události (`isOverdue`); čekající ve frontě nevyprší. Úloha `disk.timeout` (každou minutu) navíc označí chybou požadavek, kterému se nic nedoručilo (není aktivní webhook `drive.*`, u soukromého záznamu žádný s „Doručovat i soukromé“) a selhané doručení po všech pokusech.
- **Soukromí (R-13):** soukromý klient nebo zakázka (a zakázka soukromého klienta bez složky) složku sama nezakládá. Tlačítko nabídne „Vytvořit složku“ s varováním, že složka na sdíleném Disku bude pro Patrika viditelná; až po potvrzení (`force`) vznikne požadavek, jehož událost má `entity.isPrivate = true` (dostanou ji jen webhooky s „Doručovat i soukromé“). Existující složku soukromého klienta archivuje a obnovuje dál. Převedení záznamu na sdílený (`visibility.changed`) složku založí, jako by byl nový.
- **Pojmenování:** složka klienta = název firmy bez lomítek; složka zakázky podle vzoru `{RRRR-MM} {Název zakázky}` (rok a měsíc ze zahájení, jinak dnešek v Praze) – `src/naming.ts`.
- **Strom složek** (`drive.structure`, výchozí `defaultStructure`): strom pod složkou klienta a podsložky zakázky zvlášť pro Web, Marketing a Systémy; složky služeb (`10 Web`…) nejdou smazat ani zanořit. Platí jen pro nově zakládané složky: struktura se bere v okamžiku odeslání události.

## Oprávnění

`disk.read` (stav složky, tlačítko), `disk.write` (Vytvořit složku, Zkusit znovu), `disk.manage` (Nastavení → Google Disk: strom, zapnutí, test; uložení vyžaduje i `settings.manage`). Čtení vždy prochází `visibleEntityIds` (oprávnění entity, rozsah „jen moje“, soukromé záznamy).

## Nastavení

Nastavení → Google Disk (`/nastaveni/google-disk`): stav napojení (aktivní webhooky `drive.*`, adresa pro odpověď, počty za 7 dní), **test napojení** (`disk.test`: kontroluje nastavení a poslední výsledky, nic nezakládá; doručení webhooku zkouší „Test webhooku“ v Integrace), vypínač `drive.enabled` (výchozí zapnuto), editor stromu (přidat, přejmenovat, smazat, přeskládat nahoru/dolů, zanořit/vynořit; na mobilu jen čtení) a výpis posledních požadavků s chybami.

## Události a upozornění

Žádná upozornění. Obsluhuje `client.status_changed`, `client.renamed`, `client.service_added`, `project.created`, `visibility.changed` a vlastní `drive.*` (zapíše ID obálky události k požadavku). Vysílá `drive.client.create|add_service|rename|archive|restore`, `drive.project.create` (webhooky jen endpointům se skupinou `drive.*`). Úloha `disk.timeout`. Chyba handleru Disku nikdy nezruší uložení klienta ani zakázky (vnořená transakce, NFR-13).

### Podklad pro workflow v n8n

Webhook (HMAC, hlavičky `X-Opsys-Event`, `X-Opsys-Delivery`, `X-Opsys-Signature`) nese tělo `{id, event, occurredAt, actor, entity: {type, id, isPrivate}, data}`. `data`:

```json
{
  "requestId": "uuid",
  "client": { "id": "uuid", "name": "Novák s.r.o.", "ico": "12345678", "folderId": "ID složky klienta nebo null" },
  "project": { "id": "uuid", "code": "Z-2026-004", "name": "Nový web", "type": "web|marketing|systemy", "startDate": "2026-10-14", "folderId": null },
  "structure": { "…": "podle události, viz níže" },
  "callbackUrl": "https://…/api/ingest/drive"
}
```

`project` je jen u `drive.project.create`. `structure` vždy obsahuje `version`, `kind` (název události), `clientsRoot` (`Klienti`), `archiveRoot` (`Archiv`) a `known` (`clientFolderId`, `serviceFolderIds`, `archived`). Dále:

| Událost | Co má n8n udělat | `structure` navíc |
|---|---|---|
| `drive.client.create` | pod `clientsRoot` založit `clientFolder.name` a všechny `children` (rekurzivně; `service` u složky služby) | `clientFolder: {name, children: [{name, service?, children}]}` |
| `drive.client.add_service` | v klientské složce (`client.folderId`) založit složky služeb | `clientFolder`, `services: [{service, name, children}]` |
| `drive.client.rename` | složku `client.folderId` přejmenovat na `clientFolder.name` | `clientFolder: {name}` |
| `drive.client.archive` | složku `client.folderId` přesunout do `archiveRoot` | `clientFolder` |
| `drive.client.restore` | složku `client.folderId` přesunout z `archiveRoot` do `clientsRoot` | `clientFolder` |
| `drive.project.create` | ve složce služby (`serviceFolder.folderId`, jinak ji najít/založit podle `serviceFolder.name` v klientské složce) založit `jobFolder.name` s `children` | `clientFolder`, `serviceFolder: {service, name, folderId}`, `jobFolder: {name, children}` |

Událost pro tentýž klient nikdy nepřijde souběžně s jinou (fronta po klientovi), takže „najít, nebo založit“ je bezpečné. **Callback:** `POST callbackUrl` podepsaný stejně (`INGEST_SECRET`), tělo

```json
{ "eventId": "data.requestId (nebo id obálky)", "status": "ok|error",
  "folders": { "root": "ID složky klienta", "services": { "web": "…", "marketing": "…", "systemy": "…" }, "project": "ID složky zakázky", "archive": "ID přesunuté složky" },
  "error": "text chyby (u status error)" }
```

Povinné u `ok`: `root` u `client.create`, `project` u `project.create`; u `archive` stačí vynechat `folders` (použije se známá složka). ID jsou jen znaky `A-Z a-z 0-9 _ -`. Duplicitní stejná odpověď se ignoruje; po chybě smí n8n poslat opravnou odpověď `ok` (a stejně tak pozdní po vypršení 10 minut).

## Exporty

Žádné.

## Integrace s jinými moduly

`dependsOn` je prázdné. Čte entity `company` a `job` přes registr entit (název, služby, soukromí) a píše jim `drive_folder_id` a `drive_status` přes `writeSystemFields`. Nabízí službu `disk` (`requestFolder`, `folderState`) a příspěvek `clientCard` (stav složky na Přehledu a ve sloupci seznamu klientů). Když je modul vypnutý, události Disku se neposílají a tlačítko není.

## Hrany a známá omezení

- Hlavička jádra kreslí akce statickým tlačítkem: do hlavičky proto jde nouzová podoba „Otevřít Disk“ (po kliknutí zjistí stav a otevře, počká, zopakuje nebo založí); tlačítko s popiskem podle stavu je na kartě „Složka na Disku“ (ZADOSTI: `RecordAction.render`).
- Přejmenování zakázky složku zakázky nepřejmenuje (spec to nechce).
- Zakázka klienta, který je v Archivu, složku nedostane; nejdřív je třeba vrátit klienta ze stavu Bývalý.
- Test napojení nic neposílá do n8n.

## Odkazy na kód a testy

`packages/modules/disk/src/state.ts#applyRequestSignal`, `#planClientFolder`, `#driveButtonModel`, `src/tree.ts#validateStructure`, `src/handlers.ts#eventHandlers`, `src/requests.ts#createRequest`, `src/ingest.ts#handleDriveCallback`, `src/jobs.ts#maintainRequests`. Testy: `packages/modules/disk/src/*.test.ts` (strom, pojmenování, stavový automat, model tlačítka), `tests/disk.int.test.ts` (AS-09 s falešným n8n, fronta, R-13, R-14, doručení, strom), `apps/web/e2e/disk.spec.ts`.
