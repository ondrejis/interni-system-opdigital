# Databáze

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek (Drizzle) a žurnály migrací jádra a modulů). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Jedna databáze PostgreSQL. Každý balíček (jádro, každý modul) vlastní své tabulky a svou složku migrací s vlastní tabulkou záznamu o migracích ([ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Tabulky vypnutého modulu se nemažou.

| Balíček | Tabulek | Migrací | Dokument |
| --- | --- | --- | --- |
| Jádro | 39 | 13 | [jadro.md](jadro.md) |
| Modul Kontakty | 3 | 3 | [kontakty.md](kontakty.md) |
| Modul Zakázky | 5 | 1 | [zakazky.md](zakazky.md) |
| Modul CRM | 7 | 3 | [poptavky.md](poptavky.md) |
| Modul Docházka | 2 | 2 | [dochazka.md](dochazka.md) |
| Modul Kalendář | 6 | 1 | [kalendar.md](kalendar.md) |

Celkem tabulek: 62, 23 migrací.

Tabulky fronty úloh (pg-boss) zakládá krok migrací (`installQueues`) ve schématu knihovny; v tomto přehledu nejsou.
