# Kalendář

> Vyprávěcí dokumentace modulu `kalendar`. Přesné seznamy (pole entit, oprávnění, příkazy a jejich vstupy, tabulky, úlohy, trasy) se tu **neopisují**: jsou v referenci, která vzniká z kódu a nezastará. Tady je to, co z kódu vyčíst nejde: jak věci fungují za sebou, proč jsou tak, jak jsou, a kde jsou hrany.

Referenční stránky vzniklé z kódu: [modul](../reference/moduly/kalendar.md), [entity](../reference/entity/kalendar.md), [příkazy](../reference/prikazy/kalendar.md), [databáze](../reference/databaze/kalendar.md).

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

- **Popis z manifestu:** Události s účastníky, opakováním a připomenutím, zdroje (zasedačky, vybavení) s kontrolou kolizí, vrstvy z ostatních modulů, odběr kalendáře v Google, Apple a Outlooku a import cizích kalendářů jako „obsazeno“.
- **Závisí na:** žádném modulu
- **Entity:** [`event`](../reference/entity/kalendar.md#event), [`calendar_resource`](../reference/entity/kalendar.md#calendar_resource)
- **Příkazy:** [11 příkazů](../reference/prikazy/kalendar.md)
- **Úlohy na pozadí:** `kalendar.reminders` (`*/5 * * * *`), `kalendar.sync` (`10 * * * *`)
- **Referenční stránky:** [modul](../reference/moduly/kalendar.md), [entity](../reference/entity/kalendar.md), [příkazy](../reference/prikazy/kalendar.md), [databáze](../reference/databaze/kalendar.md)

**Oprávnění a jejich výchozí přidělení rolím:**

| Oprávnění            | Název                     | Výchozí: owner |
| -------------------- | ------------------------- | -------------- |
| `kalendar.read`      | Vidí kalendář             | vše            |
| `kalendar.write`     | Upravuje události         | vše            |
| `kalendar.resources` | Spravuje zdroje kalendáře | vše            |

<!-- docs:generated:end -->

## Účel

Kalendář je plocha, na které má každý z partnerů pohromadě své události z Google Kalendáře, schůzky a hovory z OPSYS a (s oprávněním „vše“) kalendáře druhého. Zdrojem pravdy je Google: OPSYS si události zrcadlí a změny jdou oběma směry do minuty. Co vznikne v OPSYS (schůzka tažením, hovor nebo schůzka s časem u úkolu), se zapíše do Google Kalendáře řešitele; co se přetáhne v Googlu, se propíše zpět do úkolu. Bez připojeného Googlu kalendář ukazuje jen vrstvy ostatních modulů (úkoly a schůzky z OPSYS) a svátky. Nepatří sem připomínky ani upozornění (spec je nechce) a import ani odběr iCal (zrušeny).

## Kdo to používá (role)

Každý uživatel s oprávněním `kalendar.read` / `kalendar.write` si připojí **svůj** Google účet. Rozsah „jen moje“ znamená jen vlastní účet a vlastní události; rozsah „vše“ (owner i partner v seedu) přidává kalendáře druhého, jejichž soukromé události se ukážou jen jako „Obsazeno“. Role `external` kalendář nemá. Nastavení OAuth klienta (`kalendar.settings.*`) smí jen správce s `settings.manage` (owner).

## Hlavní toky krok za krokem

**Připojení účtu.** Uživatel v Nastavení → Google Kalendář zvolí „Připojit“ (`kalendar.connect.start`). Dostane adresu souhlasu Googlu; `state` je zašifrovaný (uživatel, platnost 10 minut, cesta návratu). Google ho vrátí na `/api/kalendar/google/callback`; trasa ověří přihlášení a `state`, vymění kód za tokeny, uloží je šifrovaně do `calendar_account.tokens_enc`, načte seznam kalendářů (zobrazený a cíl zápisu je jen primární, ostatní si uživatel zapne), spustí první synchronizaci a založí push kanály. Selhání nebo odmítnutí vrátí uživatele s `?google=error|denied`.

**Synchronizace Google → OPSYS.** První běh načte okno −60 / +365 dní (výskyty opakovaných událostí rozbaluje Google, `singleEvents`), uloží `syncToken` a zapamatuje konec okna. Další běhy čtou jen přírůstky podle tokenu. Úplná synchronizace proběhne znovu, když token vyprší (410) nebo zbývá do konce okna méně než 45 dní; co v okně v Googlu zmizelo, zmizí i z zrcadla. Spouští ji: push kanál (Google zavolá `/api/kalendar/google/webhook`, trasa ověří kanál a tajný token a zařadí úlohu `kalendar.sync.calendar`), minutová úloha `kalendar.sync` (kalendář s živým push kanálem se čte jednou za 5 minut jako záloha, bez něj každou minutu), ruční „Synchronizovat teď“. Každá změna po prvním běhu se zapíše do historie s aktérem `google` („Google Kalendář“).

**Zápis OPSYS → Google.** Modul `ukoly` při změně úkolu (vznik, čas, řešitel, typ, účastníci, smazání) vysílá `task.changed`. Obsluha (`onTaskChanged`) v téže transakci vloží řádek do fronty `calendar_push`; úloha `kalendar.push` (minutová, a hned po změně) načte aktuální úkol a srovná s ním událost: založí ji, změní, přesune do kalendáře nového řešitele, nebo smaže (úkol zrušený, smazaný, bez času, jiného typu než „v kalendáři“, bez řešitele s připojeným účtem). Zapisují se jen hovory a schůzky s časem (nebo výslovně celodenní); samotné datum zůstává ve vrstvě úkolů. Událost nese `extendedProperties.private.opsysTaskId` a deterministické id, takže opakovaný zápis nic nezdvojí. Zápis, který by nic nezměnil, se vynechá (proto ozvěna Googlu nevyvolá smyčku).

**Schůzka z kalendáře.** `kalendar.createMeeting`: s modulem `ukoly` vznikne úkol typu Schůzka (služba `tasks.createMeeting`) a zápis do Googlu proběhne hned; bez něj vznikne událost jen v Googlu. „Poslat pozvánky“ je výchozí vypnuto: bez přepínače se účastníci do Googlu nezapisují vůbec a Google nikomu nic nepošle (`sendUpdates=none`). Volitelně odkaz na Google Meet.

**Přetažení a změna délky.** `kalendar.move`: u události z úkolu změní čas úkolu a ten se zapíše do Googlu, jinak jde změna přímo do Googlu podmíněně podle `etag` (mezitím změněná událost vrátí srozumitelnou chybu a obnoví se).

**Vazby.** `kalendar.link` navazuje událost na klienta, obchod a kontakt jedním krokem; `kalendar.suggestLinks` nabídne kontakt (a jeho firmu a otevřené obchody) podle shody e-mailu účastníka. Vazba na obchod u události bez úkolu ji povýší na schůzku v modulu úkolů, takže je v historii obchodu a počítá se jako jeho další aktivita. `kalendar.forRecord` vrací události navázané na záznam.

## Stavy a přechody

Účet: `ok` → `reauth` (souhlas odvolán nebo token nejde obnovit; čtení i zápis se zastaví, uživatel účet připojí znovu) → `ok`; `error` = poslední volání selhalo (dočasné, další úspěšná synchronizace ho vrátí na `ok`). Řádek fronty zápisu: čeká → hotovo, nebo opakování s prodlevou (2^n minut, nejvýš hodina) a po 10 pokusech vzdáno s chybou v `last_error`. Událost z OPSYS smazaná v Googlu zůstane jako náhrobek (`remote_deleted`): úkol se nemaže a událost se znovu založí až novější změnou úkolu.

## Pravidla a výpočty

- **Konflikt = novější změna vyhrává** (`resolveConflict`): čekající zápis z OPSYS (čas vzniku změny) se porovná s časem `updated` události v Googlu. Vyhraje-li Google, zahodí se čekající zápis a změna se propíše do úkolu; vyhraje-li OPSYS, ze změny z Googlu se vezme jen etag a odkaz a událost se přepíše při zápisu.
- **Obsazeno** (`projectEvent`): cizí událost, která je v Googlu soukromá nebo důvěrná (nebo patří k soukromému úkolu, který divák nesmí vidět), se ukáže jen jako čas a „Obsazeno“: bez názvu, místa, popisu, účastníků, odkazu a vazeb. Vlastní události majitel vidí celé. Soukromá schůzka z OPSYS se do Googlu zapisuje s `visibility: private` (R-14); přepínač „Zapisovat soukromé schůzky do Googlu“ v nastavení to umí vypnout (pak se do Googlu nezapisují vůbec). Pozor: událost s výchozí viditelností je pro tento účel sdílená; soukromí se řídí jen výslovným příznakem v Googlu.
- **Časová pásma:** vše se zapisuje a čte v Europe/Prague (letní čas se drží místním časem, `toPragueIso`); celodenní události mají v Googlu výlučný konec, v OPSYS jsou od místní půlnoci po půlnoc.
- **Opakované události:** zrcadlí se jednotlivé výskyty (řádek na výskyt, `recurring_event_id`); přesun nebo smazání se týká jen daného výskytu (Google vytvoří výjimku). Změna celé řady se dělá v Googlu.
- **Duplicity:** kopie události v Googlu, která nese id úkolu, se k úkolu nepřipojí podruhé.

## Oprávnění

`kalendar.read` (vidí kalendář; rozsah „vše“ i kalendáře ostatních), `kalendar.write` (připojení vlastního účtu, schůzky, přesuny, vazby; rozsah „vše“ smí upravit i cizí neprivátní událost). Nastavení OAuth klienta vyžaduje `settings.manage`. Cizí soukromé události nejde otevřít, přesunout ani smazat. Vazbu lze dát jen na záznam, který uživatel vidí.

## Nastavení

Nastavení → Google Kalendář (stránku dělá KAL-B nad příkazy `kalendar.settings.get/save`): Client ID, Client Secret (uložený šifrovaně, nikdy se nevrací), přepínač soukromých schůzek, výpis adres `redirectUri` a `webhookUrl`.

**Jak založit OAuth klienta v Google Cloud Console** (jednorázově, správce; žádné klíče se nikdy nedávají do repozitáře ani do `.env`):

1. V Google Cloud Console vytvořte projekt (např. „OPSYS“) a v _APIs & Services → Library_ zapněte **Google Calendar API**.
2. _OAuth consent screen_: u Google Workspace zvolte typ **Internal** (tokeny nevypršují); u běžného účtu **External** a stav publikujte do _In production_ (ve stavu _Testing_ vyprší obnovovací token po 7 dnech a účet by se musel připojovat znovu). Přidejte rozsahy `.../auth/calendar.events` a `.../auth/calendar.calendarlist.readonly` (nic víc OPSYS nechce).
3. _Credentials → Create credentials → OAuth client ID_, typ **Web application**. Do _Authorized redirect URIs_ zadejte adresu `redirectUri` z Nastavení (tvar `https://<adresa-opsys>/api/kalendar/google/callback`; pro vývoj lze `http://localhost:3100/...`).
4. Zkopírujte Client ID a Client Secret do Nastavení → Google Kalendář a uložte. Každý uživatel pak v téže stránce zvolí „Připojit“ a udělí souhlas.
5. Push (změna z Googlu do minuty): `events.watch` vyžaduje veřejnou **https** adresu a **ověřenou doménu** (_APIs & Services → Domain verification_, doména OPSYS). Bez toho (a vždy ve vývoji) běží jen pravidelné čtení každou minutu; stav „push“ je vidět u každého kalendáře.

## Události a upozornění

Žádná upozornění (e-mail, push, zvonek): spec je nechce, modul neregistruje žádnou událost upozornění ani připomínky. Doménové události nevysílá (katalog D §2.2 žádné `calendar.*` neobsahuje); naslouchá `task.changed`. Úlohy: `kalendar.sync` (každou minutu), `kalendar.sync.calendar` (po webhooku), `kalendar.push` (každou minutu a hned po změně úkolu), `kalendar.watch.renew` (hodinově obnoví kanály, kterým do 24 hodin končí platnost). Veřejná je jediná trasa `/api/kalendar/google/webhook` (ověření kanálu a tajného tokenu, omezení počtu požadavků); návrat OAuth `/api/kalendar/google/callback` vyžaduje přihlášení.

## Exporty

Žádné. Odběr kalendáře a import iCal ze starého modulu zanikly.

## Integrace s jinými moduly

Modul nemá hard závislost. S `ukoly`: obsluha `task.changed`, služba `tasks.createMeeting`, čtení a zápis úkolu přes registr entit (`task`, `task_type`), účastníci úkolu a e-maily kontaktů čtecími dotazy chráněnými `to_regclass` (vypnutý modul = nic se nezapíše; viz ZADOSTI o službě). Vrstvy ostatních modulů (`calendarLayers`) se v `kalendar.range` přidávají k událostem; položka vrstvy úkolů, jejíž úkol už je v kalendáři jako událost, se neukazuje podruhé. Vlastní vrstva „Kalendář (Google)“ nabízí události přihlášeného ostatním konzumentům. Vypnutí modulu nezanechá stopu (tabulky `calendar*` zůstanou prázdné).

## Hrany a známá omezení

- Rozsah okna je −60 / +365 dní; starší a vzdálenější události se nezrcadlí.
- Přesun celé opakované řady z OPSYS není (jen výskytu).
- Událost přeřazená v Googlu do jiného kalendáře se chápe jako smazání a vznik nové.
- Viditelnost v Googlu řídí OPSYS jen u zapisovaných schůzek: změní-li uživatel soukromí v Googlu ručně, další změna úkolu ho přepíše podle úkolu.
- Hovor a schůzka bez času se do Googlu nezapisují (zůstávají ve vrstvě úkolů).
- Přihlašovací údaje k Googlu jsou jen v šifrované podobě (`tokens_enc`, `setting.google_calendar`); bez `APP_ENCRYPTION_KEY` modul nefunguje.
- Testy běží proti `fake-google` (`@rebar/kalendar/testing`); skutečný Google se ověřuje ručně (smoke test s reálnými účty, D §7).

## Odkazy na kód a testy

- Rozhraní adaptéru: `packages/modules/kalendar/src/google/client.ts#GoogleCalendarClient`; skutečný klient `packages/modules/kalendar/src/google/real-client.ts#createGoogleClient`; fake `packages/modules/kalendar/src/google/fake-google.ts#createFakeGoogle`.
- Připojení a tokeny: `packages/modules/kalendar/src/google/accounts.ts#startConnect`, `packages/modules/kalendar/src/google/connect.ts#completeConnect`, `packages/modules/kalendar/src/google/accounts.ts#accessTokenFor`.
- Synchronizace: `packages/modules/kalendar/src/google/sync.ts#syncCalendar`, `packages/modules/kalendar/src/google/sync.ts#applyRemoteEvent`, `packages/modules/kalendar/src/google/conflict.ts#resolveConflict`.
- Zápis: `packages/modules/kalendar/src/google/push.ts#reconcileTask`, `packages/modules/kalendar/src/google/push.ts#processPushQueue`, `packages/modules/kalendar/src/google/events.ts#onTaskChanged`.
- Push kanály: `packages/modules/kalendar/src/google/watch.ts#ensureWatch`, `packages/modules/kalendar/src/google/watch.ts#handleGoogleWebhook`; trasy `apps/web/src/app/api/kalendar/google/webhook/route.ts`, `apps/web/src/app/api/kalendar/google/callback/route.ts`.
- „Obsazeno“ a čtení: `packages/modules/kalendar/src/google/range.ts#projectEvent`.
- Mapování a časová pásma: `packages/modules/kalendar/src/google/mapping.ts#fromGoogleEvent`.
- Testy: `packages/modules/kalendar/src/google/mapping.test.ts`, `packages/modules/kalendar/src/google/range.test.ts`, `packages/modules/kalendar/src/google/real-client.test.ts`, integrační `tests/kalendar-google.int.test.ts` (AS-13).
