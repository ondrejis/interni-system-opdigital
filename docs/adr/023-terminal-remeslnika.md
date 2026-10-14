# ADR 023: Mobilní terminál řemeslníka

- Stav: nahrazeno (2026-10-14): terminál řemeslníka byl při rozběhu OPSYS odstraněn (viz docs/opsys/E-rozbehovy-log.md); původně přijato 2026-10-10
- Kontext: [ADR 006](006-vrstvy-balicku.md) (moduly se neznají), [ADR 007](007-opravneni-v-datove-vrstve.md) (oprávnění v datové vrstvě),
  [ADR 012](012-moduly-prikazy-a-poskytovatele.md) (příkazy a poskytovatelé), [ADR 013](013-push-a-pwa.md) (PWA, fotky z terénu),
  [ADR 019](019-konfigurace-v-administraci.md) (konfigurace v administraci), [ADR 021](021-kontrola-roli-mobilu-a-pristupnosti.md) (role a mobil).
  Popis a návod (`TERMINAL.md`) byl odstraněn spolu s terminálem.

## Kontext

Kancelářské rozhraní je pro lidi na stavbě moc velké: navigace celého ERP, tabulky, malé cíle, psaní. Řemeslník potřebuje několik věcí
(příchod a odchod, svoje úkoly, kam a k čemu jede, deník s fotkou, výdej materiálu, hlášení závady) velkými prvky, jednou rukou, a musí fungovat
i tam, kde chybí signál. Každý klient chce v terminálu něco jiného a moduly nesmějí znát jeden druhého.

## Rozhodnutí

**Samostatné rozhraní na `/t`.** Vlastní route group `(terminal)` s vlastním rámem (`TerminalShell`), ne zjednodušená varianta kancelářského. Důvod: jiná
navigace (lišta nejvýš pěti položek), jiné stavební kameny (cíle aspoň 48 px, karty a seznamy bez tabulek) a jiná pravidla (fronta zápisů). Krátká adresa
je pro instalaci na plochu (`start_url`) a pro ruční zadání. Terminál má vlastní manifest PWA (`/t/manifest.webmanifest`), hlavní manifest zůstává.

**Role jen pro terminál.** `terminal.roles` v konfiguraci klienta (výchozí `worker`; správce ji může změnit v Nastavení). Takový uživatel je po přihlášení
přesměrován na `/t`. Kancelářské stránky ho přesměrují na serveru: `requireCtx` (každá stránka a rozložení v `(app)`) vrací `redirect("/t")`; výjimka `allowTerminalOnly`
je jen u stránek vlastního účtu. Jedna kontrola v jednom místě je jednodušší než seznam adres a nejde na stránku zapomenout (hlídá to test, který projde všechny
stránky). Guard omezuje rozhraní, ne data: oprávnění k datům dál vynucuje datová vrstva (ADR 007). Role `owner` a role se správou systému nesmí být jen v terminálu, aby se správce
nezamkl; mistr, kancelář a vedení terminál otevřou jako náhled. Mistra jsme záměrně nezamkli: schvaluje docházku a spravuje tým, což terminál nenabízí.

**Dlaždice jako registr, jádro moduly nezná.** Modul deklaruje v manifestu `terminalWidgets` (klíč `<modul>.<název>`, název, ikona, oprávnění, příkazy, zda má celou
obrazovku) a dodá UI (`ModuleUi.terminalWidgets`). Jádro (`packages/core/src/terminal`) skládá dlaždice zapnutých modulů a filtruje je oprávněními role
čistými funkcemi, které používá stránka i server. Vypnutý modul nezanechá stopu. Dlaždice platformy (úkoly) je v jádru (`core.*`), protože úkoly nepatří modulu.

**Konfigurace ve třech vrstvách.** Typovaný `TerminalConfig` (zod) v `config.ts` klienta jsou výchozí hodnoty; Nastavení → Terminál řemeslníka je přepisuje
v tabulce `setting` (klíč `terminal`, verze, audit); hodnota shodná s výchozí se neukládá (`null`), takže změna konfigurace se projeví tam, kde správce nic nepřepsal.
Čtení nastavení se migruje (`migrateTerminalSettings`) a poškození nikdy nesrazí terminál. Volby jsou jen ty, které dávají smysl: pořadí, název a zapnutí dlaždic,
role, povinná zakázka a změna zakázky při příchodu, zobrazení hodin, povinná fotka u deníku.

**Server odmítne příkaz, který nepatří viditelné dlaždici.** Zápisy z terminálu jdou jedním vstupním bodem (`submitTerminalOp` → `submitTerminalCommand`), který přijme
jen příkazy deklarované dlaždicemi, jež uživatel v terminálu vidí. Dlaždice vypnutého modulu, bez oprávnění nebo vypnutá správcem je pro server stejná jako neexistující.
Pak platí oprávnění příkazu a validace jako u každého příkazu. Čtení dat dlaždic jde běžným `runCommand` s oprávněním příkazu.

**Žádné ceny.** Dlaždice čtou vlastní příkazy `<modul>.terminal.*`, které vracejí jen provozní údaje (adresa, kontakt, tým, dnešní práce, hodiny v minutách, množství na skladě bez cen).
Seznam zakázek pro výběr jde entitním dotazem, který atributy s oprávněním ekonomiky montérovi nevrací. Příkazy jsou v matici rolí (`tests/security-matrix.int.test.ts`).

**Zápisová fronta v telefonu s jednorázovým provedením.** Zápis se nejdřív uloží do IndexedDB a pak se odesílá. Zařízení vytváří `opId`; server ho zapíše do `terminal_op`
ve stejné transakci jako zápis (`runTerminalOp`), takže opakované odeslání vrátí původní výsledek a nic nezduplikuje (i při souběhu). Zápis odmítnutý serverem je trvalý
konflikt s českou větou a zůstane ve frontě, dokud ho člověk nezahodí; dočasné chyby se opakují. Zápisy téže skupiny se odesílají v pořadí. Fronta patří uživateli (sdílený telefon).
Příkazy dostávají čas ťuknutí `at`, takže odložený příchod nese správný čas (docházka max. 72 h zpětně).

**Service worker jen pro stránku „Jste offline“.** `sw.js` už slouží push upozorněním a nekešuje data (ADR 013). Terminál k němu přidává oddělený blok, který při otevření
terminálu bez spojení ukáže veřejnou statickou stránku. Nekešuje se HTML s daty uživatele ani jeho odpovědi: sdílené telefony a odhlášení by jinak musely zahazovat cache.
Cena: „studený start“ bez signálu terminál nenačte; už otevřený terminál běží dál.

## Důsledky

- Nová tabulka `terminal_op` (migrace `0008_terminal_op`), čištění starších než 60 dní probíhá příležitostně při zápisu.
- Přibývají příkazy `core.tasks.*`, `dochazka.terminal.summary`, `zakazky.terminal.sites`, `realizace.terminal.*`, `sklad.terminal.items`; předpona `core` je povolená v testu modulů.
- Příkazy docházky přijímají volitelné `at`.
- Nová dlaždice = manifest + UI + (případně) příkaz modulu, bez zásahu do jádra (`docs/TERMINAL.md` (odstraněno), kapitola 4).
- Kontaktní osoba zakázky (jméno a telefon) a kolegové z týmu se řemeslníkovi na zakázce ukazují i bez oprávnění `kontakty.read`; je to zadání terminálu, viz otevřená otázka T2.
