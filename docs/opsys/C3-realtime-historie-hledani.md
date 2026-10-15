# C3: realtime, historie změn, paleta Cmd+K, seznamy

Autor: agent C3. Kontrakt je D §5.3; tady je stav implementace a to, co moduly potřebují vědět.

## Realtime (SPOL-18)
- **Zdroj signálu:** `notifyChange` (`@rebar/core/realtime`) volá `pg_notify('opsys_change', …)` v transakci změny, takže se doručí až při commitu. Volá ho `recordAudit` (každá auditovaná změna, ne `security`) a `emitDomain`. Zpráva nese jen `{e: typ, i: id, a: akce, p: soukromé, x/y: nadřazený záznam}`, nikdy data.
- **Server:** `GET /api/realtime` (SSE, přihlášený) → `createRealtimeStream` nad `RealtimeHub` (jedno `LISTEN` spojení na proces, `sql.listen` obnoví spojení a hub rozešle `resync`). Heartbeat 20 s, spojení se po 30 min zavře a klient se připojí znovu. Filtr `realtimeFor`: soukromá změna se tomu, kdo nesmí vidět soukromé, neposílá (výjimka `visibility_changed`: partner dostane jen typ+id+akci, aby mu záznam zmizel ze seznamu); typy bez oprávnění `…read` se neposílají.
- **Klient:** `RealtimeBridge` (v `AppFrame`) → `startRealtimeClient`: změny sloučí (120 ms), zneplatní `["entity", typ]` (i nadřazený typ), `["command"]`, `["trash"]`, `["history"]`; po obnovení spojení, `resync` a návratu na záložku zneplatní vše; po 2 chybách bez `ready` přejde na polling (15 s) a po obnovení ho vypne. Serverově vykreslený Přehled se obnoví `router.refresh()`.
- Moduly nemusí nic dělat: stačí zapisovat přes engine/`recordAudit`. Dotazy modulů (`useCommandQuery`) se zneplatňují při jakékoli změně.

## Historie `/historie` (HIS-02, 06)
`queryHistory(ctx, registry, filters)` (`@rebar/core/history`) čte **jen přes `auditReadScope`**; filtry kdo (uživatel / druh aktéra n8n, Google, Meta, úloha), typ, akce, kategorie, období (Europe/Prague), hledání (název, shrnutí, popisek zdroje, hodnoty před→po). Skrytá pole a částky podle oprávnění se vynechají (`visibleAudit`). Smazaný záznam má odkaz do `/kos`. `exportHistoryCsv` vyžaduje `activity.export` (výchozí jen vlastník), používá stejné filtry a viditelnost a zapíše se do historie jako `export` (kategorie `security`). Filtry jsou v adrese (`?q=&kdo=&typ=&akce=&kategorie=&od=&do=`). Časová osa záznamu (`getRecordActivity`) používá stejný `auditReadScope`.

## Paleta Cmd+K (HLE-01…07, MOB-02)
- `searchAll` (`entities/search.ts`): bez diakritiky, telefon přes `phoneQueryKey` (ignoruje předvolbu a mezery) proti klíčům z `phoneKeysInText` v `search_text`; `indexRecord` doplní `searchLoad` (z registru entit) a klíče všech telefonů v textu. Predikát viditelnosti z C1 beze změny. Nález nese `phone`, `email`, `driveFolderId` (sloupce `primaryPhone|phone`, `primaryEmail|email`, `driveFolderId`), tvoří z nich akce Zavolat / Zkopírovat / Napsat / Otevřít Disk.
- „Naposledy otevřené“: `recent_record` (zapisuje `getEntityRecord`, drží 8, `listRecent` jen viditelné); „Nejčastější příkazy“: počty použití v prohlížeči.
- Příkazy: `paletteActions` zapnutých modulů (podle oprávnění) + obecné „Nový obchod/klient/kontakt/zakázka/úkol/poznámka“ pro entity bez deklarace + Přejít na… + Přepnout téma + Klávesové zkratky. Kód: `packages/ui/src/palette/`, `components/command-palette.tsx`.

## Seznamy a klávesy
`EntityDescriptor.quickFilters` (vyhodnocené `EntityDef.quickFilters` + „Soukromé“ pro vlastníka) jako chipy v `EntityList`; filtr a hledání se zapisují do adresy (`?f=` base64url JSON, `?q=`) a čtou se při otevření, tlačítko „Kopírovat odkaz“; „Připnout do levého panelu“ = `view_favorite` (+ `saved_view.pinned` u vlastního pohledu), panel „Pohledy“ staví `shell.ts`. Klávesy: `C` nový záznam, `/` hledání, Cmd/Ctrl+K, Cmd/Ctrl+Z (poslední vratná akce do 10 s, `runLastUndo`), `g p/o/k/z/u/f/h` přechod.

## Testy
`tests/c3.int.test.ts` (realtime latence a soukromí, historie, hledání a telefon, nedávné, předvolby), `packages/ui/src/{realtime,palette}/*.test.ts`, `data/list-url.test.ts`, `core/entities/phone-index.test.ts`, e2e `apps/web/e2e/c3.spec.ts` (napsáno, neběželo). Spouštět s `REBAR_TEST_DB_NAME=rebar_test_c3`.
