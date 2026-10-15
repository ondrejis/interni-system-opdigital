# Klient OPSYS (interní systém agentury OP Digital)

Jediná instance pro agenturu OP Digital: vlastník Ondřej Dvořák a partner Patrik Šilhánek. Viditelný název systému je `OPSYS`
(`branding.name` v `config.ts`). Zapnuté moduly (13, pořadí z `docs/opsys/D-plan-a-kontrakty.md` §1.1): kontakty, klienti, disk,
zakázky, obchody, úkoly, kalendář, hodiny, finance, reklama, šablony e-mailů, můj prostor, přehled. Moduly bez obsahu zatím ukazují
zástupnou stránku.

## Soubory

| Soubor          | Obsah                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `config.ts`     | moduly, branding, pořadí sekcí navigace, povinné 2FA (vlastník, partner), exporty, bez upozornění |
| `dashboards.ts` | výchozí nástěnky rolí (zakládají se jednou při instalaci)                                         |
| `seed/index.ts` | výchozí data klienta (role, štítek Meta; co zakládají moduly, je vypsáno v komentáři)             |
| `seed/roles.ts` | role `owner` (systémová), `partner` (Patrik, výchozí matice podle NAS-02) a `external` (prázdná)  |
| `seed/dev/`     | vývojová data a vývojové účty pro `pnpm dev:seed` (jen lokální vývoj)                             |
| `extensions/`   | rozšíření klienta (zatím jen příklad)                                                             |

## Role

| Role       | Kdo                | Co smí                                                                                                                                                                                                                                                                   |
| ---------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `owner`    | Ondřej             | všechno včetně nastavení, uživatelů, Můj prostor a soukromých záznamů (systémová role, jediná, která vidí soukromé)                                                                                                                                                      |
| `partner`  | Patrik             | obchody, klienti, kontakty, zakázky, úkoly, poznámky, kalendář, finance (čtení a zápis plateb, bez úpravy rozdělení a vyrovnání), hodiny, šablony e-mailů, historie změn, nastavení pipeline, polí a štítků; bez mazání, exportu, sloučení, Můj prostor a soukromé části |
| `external` | budoucí externista | zatím bez oprávnění a bez uživatele; majitel mu je přidělí (zakázky a úkoly mají rozsah „jen moje“)                                                                                                                                                                      |

Oprávnění `private.read` nemá žádná role v tabulce oprávnění; soukromé záznamy vidí jen systémová role `owner`. Povinné 2FA mají
`owner` i `partner`. Patrika zakládá Ondřej v aplikaci pozvánkou, seed pozvánku nezakládá.

## Spuštění

```sh
pnpm db:up            # cluster OPSYS: port 5434, data ~/.local/share/opsys-pg17
pnpm db:migrate       # schéma všech modulů
pnpm db:seed          # výchozí data (viz níže) a vlastník z OWNER_EMAIL / OWNER_PASSWORD v .env.local
PORT=3100 pnpm dev    # http://localhost:3100 (otevře /prehled)
```

### `pnpm db:seed` (produkce i vývoj)

Idempotentní, bezpečné při každé aktualizaci: doplní jen to, co chybí, nic nepřepisuje. Zakládá:

- role `owner`, `partner`, `external` (viz výše) a prvního uživatele z `OWNER_*` jako `owner`,
- pipeline „Obchody“ (Nová poptávka 10 % / 1 d, Kontaktováno 20 % / 5 d, Schůzka / konzultace 40 % / 7 d, Nabídka odeslaná
  60 % / 7 d, Vyjednávání 80 % / 10 d) a číselník důvodů prohry,
- typy aktivit Úkol, Hovor, Schůzka, E-mail, Termín,
- šablony zakázek Web, Marketing – úvodní fáze (2 × 7 000 Kč: první fakturuje vlastník, druhou druhý partner),
  Marketing – retainer a Systémy (jen když je tabulka šablon prázdná),
- číselnou řadu zakázek `Z-{YYYY}-{NNN}`, štítek Meta, výchozí pohledy modulů a výchozí přehledy rolí `owner` a `partner`,
- výchozí rozdělení nových zakázek 50/50 se nezapisuje: odvodí se z aktivních uživatelů rolí `owner` a `partner` (až se
  Patrik přihlásí), a výchozí strom složek Disku je v kódu modulu `disk`. Obojí se uloží, až když to Ondřej změní v Nastavení.

### `pnpm dev:seed` (jen lokální vývoj)

Smyšlená vývojová data pro prohlížení a testování aplikace; **neběží** mimo `NODE_ENV=development` a lokální databázi
(`localhost`, `127.0.0.1`, `::1`, socket), ani když `APP_URL` míří jinam než na localhost.

```sh
pnpm db:migrate && pnpm db:seed && pnpm dev:seed
# 2FA je v OPSYS povinné pro všechny a nejde vypnout (ani lokálně): vývojový uživatel si při prvním přihlášení nastaví TOTP
```

- **Uživatelé:** dva vývojoví uživatelé, `owner.dev@opsys.test` (role `owner`) a `partner.dev@opsys.test` (role `partner`).
  Hesla se generují náhodně při založení a zapíšou se do gitignorovaného `.data/dev-credentials-<databáze>.txt` (práva 600);
  nikde se nevypisují. Při prvním přihlášení si uživatel nastaví 2FA jako v provozu (QR kód nebo tajemství, kód TOTP); přepínač `--no-2fa` byl zrušen (politika `twoFactorPolicy: "all"` platí vždy).
  Automatizované přihlášení včetně nastavení 2FA je v `apps/web/e2e-crawl/login.ts` a `apps/web/e2e/auth.setup.ts`.
- **Data:** 9 organizací a 7 osob, 10 obchodů ve všech fázích i vyhrané a prohrané, zakázky všech tří typů (web, marketing
  s úvodní fází a retainerem, systémy), dokončená zakázka bývalého klienta, platby (plánované, vystavené, zaplacené),
  vyrovnání, úkoly, hovory, schůzky a termíny, poznámky, hodiny, hosting a domény v Můj prostor. Soukromé záznamy Ondřeje:
  organizace, obchod, zakázka s platbou a hodinami, úkol a poznámka (partner je nevidí).
- **Zjevně fiktivní:** názvy mají příponu „(ukázka)“, e-maily jsou v doméně `.example`, telefony `+420 999 000 0NN`, firmy
  nemají IČO, čísla faktur začínají `UKAZKA`. Žádná reálná data.
- Zakládá se přes příkazy modulů (platí hooky: rozdělení plateb, historie fází a obchodů, viditelnost), v jedné
  transakci. Zakládání složek na Disku je ve vývojových datech vypnuté (bez n8n by požadavky vypršely).
- **Opakování:** data se zakládají jednou; druhé spuštění nic nepřidá. Od začátku:
  `pnpm db:reset && pnpm db:migrate && pnpm db:seed && pnpm dev:seed` (`db:reset` smaže celý lokální cluster včetně ostatních databází; při souběžné práci raději založte novou databázi).
- Test: `tests/dev-seed.int.test.ts` (`pnpm exec vitest run tests/dev-seed.int.test.ts`).
