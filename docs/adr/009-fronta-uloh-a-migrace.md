# ADR 009: Fronta úloh a migrace pod samostatným uživatelem

- Stav: přijato (2026-10-08)
- Kontext: zadání §5 (pg-boss), §9 (minimální práva), §10 (migrace)

## Rozhodnutí

- **Fronta v Postgresu (pg-boss), bez Redisu.** Úlohy deklaruje jádro i moduly (`defineJob`), data se validují Zodem při odeslání i zpracování. Plánované úlohy (úklid souborů, heartbeat, později připomínky) mají cron v časové zóně `Europe/Prague`.
- **Dva DB uživatelé.** Vlastník schématu (`migrator`) spouští migrace, instaluje schéma fronty a po každé migraci přidělí aplikační roli minimální práva (čtení a zápis dat, žádné DDL, `audit_log` jen `INSERT`/`SELECT`). Aplikace i worker běží pod `app` s právy jen k datům.
- **Kód migrací není v aplikaci.** Je v samostatném vstupu `@rebar/core/migrations`; test hlídá, že ho web neimportuje.
- **Migrace jsou jen dopředné a zpětně kompatibilní** (expand → contract), aby rollback aplikace nerozbil data.
- **Worker** je samostatný proces téže instalace (`pnpm worker`); webová aplikace úlohy jen odesílá.

## Důsledky

- Fronty se zakládají v kroku migrací (`installQueues`). Aplikační role zakládá jen běžná data.
- Při přidání modulu s novými úlohami se spustí migrace, aby se založily jejich fronty a doplnila práva.
