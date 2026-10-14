# ADR 024: Katalog událostí upozornění a spolehlivé doručování

- Stav: přijato (2026-10-10)
- Kontext: [ADR 013](013-push-a-pwa.md) (základ push a PWA), [ADR 009](009-fronta-uloh-a-migrace.md) (fronta), [ADR 007](007-opravneni-v-datove-vrstve.md) (oprávnění), [ADR 012](012-moduly-prikazy-a-poskytovatele.md) (moduly)

## Kontext

Základ z ADR 013 posílal upozornění z tabulky `notification` jednou za minutu a každý modul volal `createNotifications` s volným textem a volným druhem. Chybělo: seznam toho, co systém vlastně hlásí,
nastavení příjemců a kanálů na straně firmy i uživatele, tiché hodiny, shrnutí, opakování po chybě, ochrana před zdvojením a bouřkou, a hlavně záruka, že obsah nepřijde člověku, který na něj nemá právo.
Pro stavební firmy jsou push upozornění klíčová (mistr na stavbě, montér v terminálu, kancelář), takže musí být spolehlivá a předvídatelná.

## Rozhodnutí

- **Katalog událostí je data, logika je jedna.** Událost (`defineNotificationEvent`) má klíč, český popis, skupinu, závažnost, výchozí kanály, skupiny příjemců, parametry, šablonu s odkazem a typ záznamu. Moduly ji deklarují
  v manifestu (`notifications`), jádro je nezná. Katalog se při startu ověří (klíče, parametry v šablonách, příjemci), takže překlep aplikaci nenastartuje.
- **Příjemci jsou pravidla, ne kód.** Kód události dodá jen pojmenované skupiny (tým zakázky, řešitel); výchozí příjemce určuje událost (`assignee`, `perm:<oprávnění>`, `role:<klíč>`), firma je mění v konfiguraci klienta
  nebo v Nastavení. **Čtyři vrstvy** (katalog → `config.ts` → úpravy správce → předvolby uživatele) se skládají čistými funkcemi, které jdou testovat bez databáze.
- **Obsah se skládá pro každého příjemce zvlášť** (`notify`): příjemce bez práva číst záznam (politika přístupu typu záznamu) nedostane nic, parametry označené jako citlivé (`money`, nebo oprávnění) se z textu vynechají
  i s oddělovačem a pojistka odstraní zbylé částky. Oprávnění se vyhodnocují při sestavení zprávy, ne při odeslání.
- **Outbox místo odeslání v požadavku.** `notify` jen zapíše `notification` (zvoneček) a `notification_delivery` (fronta a protokol) v transakci změny a pošle `pg_notify`, který se doručí až po potvrzení. Odesílá výhradně worker
  (`notification.dispatch`, pg-boss; probouzí ho `LISTEN`, záloha je minutový plán). Chyba push služby nikdy neovlivní akci uživatele a zrušená transakce nezanechá nic. Alternativa (odeslání po commitu přímo z procesu webu)
  by ztrácela zprávy při pádu mezi commitem a odesláním a dávala by pomalou push službu do cesty požadavku.
- **Spolehlivost je v datech, ne v paměti:** stav doručení (`queued`, `held`, `retry`, `sending`, `sent`, `failed`, `skipped` + důvod), opakování s exponenciální prodlevou (30 s až 6 h, 7 pokusů), zaujímání řádků `FOR UPDATE SKIP LOCKED`,
  návrat zaseknutých řádků po 5 minutách, idempotence unikátním indexem `(user_id, dedupe_key)`, sloučení bouřky aktualizací nepřečteného upozornění (`count`) a zdržením push, souhrnná zpráva při nárazu a limit 20 push / 10 minut.
  Chyby push služby se třídí: 404/410 smaže odběr, 400/401/403/413 jsou trvalé, ostatní se opakují. Protokol neobsahuje adresy odběrů, klíče ani obsah.
- **Tiché hodiny a shrnutí** se počítají v místním čase klienta (Europe/Prague) přes `zonedToUtc`, takže přechod letního času nic neposune; zdržené push se uvolní po skončení tichých hodin jako jedna zpráva. **Naléhavé** (`urgent`) prosadí obojí a má TTL 6 h a vysokou prioritu.
- **Plánované události** jsou úlohy modulů s `cron` (pg-boss v Europe/Prague) a `dedupe` na den, takže opakované spuštění nic nezdvojí.
- **Service worker** vlastní `push`, `notificationclick` a `pushsubscriptionchange`: zobrazí zprávu (záloha bez dat), po klepnutí označí upozornění za přečtené a přejde na odkaz v už otevřeném okně (zpráva s potvrzením, jinak přesměrování), nabídne „Odložit“,
  nastaví odznak a po rotaci odběru se přihlásí znovu. Přečtení v Inboxu zavře push v zařízení podle `tag`. Offline část terminálu v témže souboru zůstává nedotčená.
- **Odběr patří relaci a uživateli:** uloží se s id relace; odhlášení, deaktivace účtu a „odhlásit ze všech zařízení“ odběry zruší. Odběr se **nenavazuje na platnost relace** (vypršení relace po nečinnosti nesmí zabít push montérovi, který aplikaci jen občas otevře).
- Starý `createNotifications` zůstává v jádru jen pro zpětnou kompatibilitu (neznámý druh = běžné upozornění se zvonečkem a push); moduly a aplikace ho nesmí volat (guard test), push se mimo jádro neposílá.

## Důsledky

- Nová událost = definice v modulu + jedno volání `notify`; nastavení klienta i předvolby se objeví samy.
- Všechna upozornění jdou přes workera: **bez běžícího workeru push nechodí** (zvoneček ano). Runbook to uvádí jako první kontrolu.
- Příjemce bez práva na záznam upozornění nedostane. U rolí s `perm:` bez práva číst zakázku (např. účetní) to znamená, že upozornění o zakázce nedostanou, dokud nedostanou `zakazky.read`; je to záměr (soukromí před pohodlím).
- Skutečné doručení na iOS a Android nejde v automatizovaných testech ověřit; je to jednorázová ruční zkouška před nasazením ([NOTIFICATIONS](../NOTIFICATIONS.md#12-testy-a-co-se-nedá-ověřit-automaticky)).
- Sloupec `notification.pushed_at` je zastaralá (nahradil ji protokol doručení); odstraní se v dalším vydání (expand → contract).
- Otevřené otázky (SMS a WhatsApp pro naléhavé, nativní aplikace, e-mailová shrnutí): [OPEN-QUESTIONS](../OPEN-QUESTIONS.md).
