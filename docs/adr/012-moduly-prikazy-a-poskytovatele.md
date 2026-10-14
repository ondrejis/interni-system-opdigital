# ADR 012: Moduly, příkazy a poskytovatelé

- Stav: přijato (2026-10-08)
- Kontext: zadání §6 (moduly), ADR 006 (vrstvy balíčků), ADR 007 (oprávnění v datové vrstvě), ADR 010 (registr entit)

## Kontext

Moduly (poptávky, zakázky, realizace, fakturace, docházka, sklad, stroje, kalendář) jsou na sobě závislé jen volně:
zakázka skládá náklady ze skladu, docházky a strojů, kalendář vrstvy ze všech, přehled upozornění ze všech.
Přitom klient může modul vypnout a vypnutý modul nesmí zanechat stopu ani rozbít ostatní.

## Rozhodnutí

- **Manifest** (`defineModule`) říká, co modul je: navigace, stránky, oprávnění, entity, výchozí data (řady, číselníky, pipeline) a `dependsOn`.
  Pořadí v `MODULE_IDS` je pořadí závislostí. Modul smí importovat jen moduly ze svého `dependsOn`.
- **Serverová část** (`defineModuleServer`) dodává entity, **příkazy** a **poskytovatele**: `costProviders` (náklady zakázky), `attention`
  (přehled), `widgets`, `calendarLayers`, `diaryPrefill` (stavební deník) a `jobs` (úlohy na pozadí).
  Aplikace sbírá jen zapnuté moduly (`collectServers`); modul nikdy nevolá jiný přímo, dostává poskytovatele přes `ModuleDeps`.
- **Příkazy** (`defineCommand`, jméno `<modul>.<akce>`) jsou jediná cesta, kterou UI modulu volá server: jeden vstupní bod
  (`runCommand`) ověří oprávnění příkazu a zod schéma vstupu, handler pak vynucuje oprávnění k datům (ADR 007).
  Handler je čistá funkce `(ctx, input, deps)`; zápis běží v `inTx`, takže změna, číslo z řady, audit i upozornění jsou jedna atomická změna.
- **Odkazy mezi moduly jsou měkké**: zakázka, vozidlo nebo poptávka v cizím modulu je obyčejné uuid bez cizího klíče
  (zápis ve skladu funguje i bez Zakázek; kontrola existence a přístupu jde přes `assertEntityAccess` a registr entit).
  Cizí klíč mají jen závislosti (např. sklad → firma z Kontaktů).
- **UI modulu** (`defineModuleUi`) dodává záložky na detailu cizích entit (Materiál na zakázce), akce, dialogy a stránky.
  Soubor `ui.tsx` nesmí importovat serverový kód (databáze, Node); hlídá to test, protože build to odhalí až pozdě.
- **Čistá logika bez databáze** (vážený průměr, rozbalení opakování, spotřeba, SSRF kontrola) je v samostatných souborech s unit testy;
  databázová část má integrační testy proti skutečnému PostgreSQL, včetně souběhu (zámek řádku položky, `nextNumber`).
- Entita, jejíž záznamy vznikají jen příkazy (doklady, objednávky, docházka), má `noCreate`/`noDelete` s důvodem pro uživatele.
  Atributy mají `default` (dialog ho předvyplní, engine doplní).

## Důsledky

- Nový modul = manifest + schéma + migrace + server + UI + zápis do `modules-server.ts` a `modules-ui.ts`; test `modules.test.ts` pozná zapomenuté zapojení.
- Poskytovatel zakázkového nákladu neověřuje oprávnění k modulu (ekonomiku zakázky hlídá zakázka); detailní řádky ano.
- Zrušení modulu za běhu (vypnutí v administraci) zatím není hotové; zapnuté moduly určuje konfigurace klienta.
