# Klient OPSYS (interní systém agentury OP Digital)

Jediná instance pro agenturu OP Digital: vlastník Ondřej Dvořák a partner Patrik Šilhánek. Viditelný název systému je `OPSYS`
(`branding.name` v `config.ts`). Zapnuté moduly: kontakty, zakázky, poptávky (CRM), docházka, kalendář; další přibývají podle
plánu v `docs/opsys/D-plan-a-kontrakty.md`.

## Soubory

| Soubor          | Obsah                                                                             |
| --------------- | --------------------------------------------------------------------------------- |
| `config.ts`     | moduly, branding, pořadí sekcí navigace, povinné 2FA (vlastník, partner), exporty |
| `dashboards.ts` | výchozí nástěnky rolí (zakládají se jednou při instalaci)                         |
| `seed/index.ts` | role `owner`, `partner`, `externista` s oprávněními zapnutých modulů              |
| `seed/*.ts`     | minimální demo data (`pnpm demo:seed`): uživatelé, ukázkové firmy a osoby         |
| `extensions/`   | rozšíření klienta (zatím jen příklad)                                             |

## Lokální vývoj

```sh
pnpm db:up            # cluster OPSYS: port 5434, data ~/.local/share/opsys-pg17
pnpm db:migrate       # schéma
pnpm db:seed          # role, pipeline, číselníky, řady a vlastník z OWNER_* v .env.local
pnpm demo:seed        # volitelně: demo uživatelé a ukázkové kontakty
PORT=3100 pnpm dev    # http://localhost:3100
```

`demo:seed` bere stejné proměnné prostředí jako `db:seed` (lokálně z `.env.local`). Data vznikají příkazy a entitami modulů.

| Příkaz                      | Co dělá                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm demo:seed`            | Nasadí demo data do databáze bez kontaktů a zakázek. Když už tam data jsou, nic nepřepíše a vysvětlí proč. |
| `pnpm demo:seed --reset`    | Smaže dřívější demo data a nasadí je znovu (odmítne, pokud jsou v databázi záznamy, které nejsou demo).    |
| `pnpm demo:seed --wipe`     | Smaže **všechna** obchodní data (jen lokální vývojová databáze) a nasadí demo data.                        |
| `pnpm demo:seed --keep-2fa` | Ponechá povinné 2FA rolí (jinak se demo uživatelé přihlašují jen heslem).                                  |
| `pnpm demo:seed --quiet`    | Bez průběžného výpisu.                                                                                     |

Mazání (`--reset`, `--wipe`) potřebuje `DATABASE_MIGRATE_URL`. Zůstanou uživatelé, role, nastavení, číselníky, pipeline a číselné řady.
Bezpečnostní pojistky: seed v produkčním režimu (`NODE_ENV=production`) odmítne, `--wipe` odmítne nelokální databázi a klient musí být `opsys`.

## Demo uživatelé

Heslo demo uživatelů je testovací hodnota v `seed/users.ts` (jen pro lokální vývoj a demo data, není tajemství). Role:
Majitel (`owner`, vidí vše), Partner (`partner`, běžná práce bez nastavení systému), Externista (`externista`, jen své zakázky).
Skutečný vlastník se zakládá z `OWNER_EMAIL` / `OWNER_PASSWORD` příkazem `pnpm db:seed`.
