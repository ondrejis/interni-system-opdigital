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
| `seed/index.ts` | seed klienta (role)                                                                               |
| `seed/roles.ts` | role `owner` (systémová), `partner` (Patrik, výchozí matice podle NAS-02) a `external` (prázdná)  |
| `extensions/`   | rozšíření klienta (zatím jen příklad)                                                             |

## Lokální vývoj

```sh
pnpm db:up            # cluster OPSYS: port 5434, data ~/.local/share/opsys-pg17
pnpm db:migrate       # schéma (prázdné kostry modulů se přeskočí)
pnpm db:seed          # role, pipeline, číselníky, řady a vlastník z OWNER_* v .env.local
PORT=3100 pnpm dev    # http://localhost:3100 (otevře /prehled)
```

Skutečný vlastník se zakládá z `OWNER_EMAIL` / `OWNER_PASSWORD` příkazem `pnpm db:seed`. Vývojová data (uživatelé, klienti, obchody,
zakázky, platby včetně soukromých) doplní později agent SEED.
