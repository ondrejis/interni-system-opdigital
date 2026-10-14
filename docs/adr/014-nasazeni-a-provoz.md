# ADR 014: Nasazení a provoz

- Stav: přijato (2026-10-08)
- Kontext: zadání §10, ADR 001 (image per klient), ADR 009 (migrace a fronta úloh), OPEN-QUESTIONS Q24

## Kontext

Systém běží u každého klienta na vlastním malém VPS (1 vCPU / 4 GB). Provoz zajišťuje agentura, ne klient. Instalace musí jít z čistého
serveru jedním příkazem, aktualizace bez ručního zásahu a zálohy se musí pravidelně dokazovat obnovou.

## Rozhodnutí

- **Jedna image na klienta** obsahuje aplikaci (Next standalone), worker i nástroje; co se spustí, určuje příkaz v compose. Worker a nástroje běží přes
  `tsx` nad zdrojovými balíčky (workspace s produkční sadou závislostí), protože sdílí kód s aplikací; aplikace jede z minimálního standalone výstupu.
- **Sestavení jen v CI.** Každý PR ověří, že se image sestaví a obsahuje, co má. Tag `vX.Y.Z` vyrobí image všech klientů a zálohovací image do GHCR.
- **Síť:** databáze je jen ve vnitřní síti bez přístupu ven; do světa vede jen Caddy. Caddy **přepisuje** `X-Forwarded-For` adresou připojení
  (omezení počtu přihlášení podle IP, Q24) a nastavuje HSTS, CSP, `X-Frame-Options`, `Referrer-Policy`.
- **Tajemství** jsou v `.env` (práva 600) a každý kontejner dostane jen své (aplikace nezná heslo k záloze).
- **Zálohy:** `pg_dump` (vlastní formát) + soubory do restic repozitáře v úložišti klienta, šifrovaně. Retence 30 denních + 12 měsíčních.
  Měsíční **zkouška obnovy** do dočasné databáze porovná počty záznamů; výsledek je součástí stavu systému.
- **Aktualizace** s automatickým návratem; migrace jsou dopředné a zpětně kompatibilní (expand → contract).
- **Skripty se testují**: zálohovací nástroj proti skutečnému PostgreSQL (včetně celého schématu pod rolemi jako v provozu) a s napodobeninou resticu,
  statické kontroly compose, Caddyfile a skriptů. Instalace na čistém Ubuntu a skutečný restic zkouší člověk při prvním nasazení.

## Důsledky

- Image jsou jen pro `linux/amd64` (běžné VPS); ARM by vyžadoval další matici v CI.
- Výpadek při aktualizaci trvá desítky sekund (restart `app` a `worker`); zero-downtime nasazení se nedělá.
- Zkouška obnovy ověřuje databázi a seznam souborů, ne spustitelnost celé aplikace nad obnovenými daty.
