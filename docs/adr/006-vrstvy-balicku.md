# ADR 006: Vrstvy balíčků a nezávislost modulů

- Stav: přijato (2026-10-08)
- Kontext: zadání 4.3 — vypnutý modul nesmí zanechat stopu; `docs/AUDIT.md` §7.4

## Rozhodnutí

- `@rebar/core` nezná nic jiného. `@rebar/ui` zná jen core. Moduly (`packages/modules/*`) znají jen core a ui. Aplikace (`apps/web`) skládá všechno.
- **Modul nesmí importovat jiný modul.** Spolupráce (ekonomika zakázky ze skladu a strojů, záložky na detailu, upozornění na přehledu, vrstvy kalendáře) jde přes sloty a události, které modul deklaruje v manifestu.
- Vynucení: ESLint `no-restricted-imports` (`eslint.config.mjs`), test sestavy modulů (`apps/web/src/modules.test.ts`) a `tests/guards.test.ts`.
- Navigace a katalog oprávnění se skládají jen ze **zapnutých** modulů (`resolveModules`, `collectNav`, `collectPermissions`).
