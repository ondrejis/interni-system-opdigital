# Databáze

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek (Drizzle) a žurnály migrací jádra a modulů). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Jedna databáze PostgreSQL. Každý balíček (jádro, každý modul) vlastní své tabulky a svou složku migrací s vlastní tabulkou záznamu o migracích ([ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Tabulky vypnutého modulu se nemažou.

| Balíček | Tabulek | Migrací | Dokument |
| --- | --- | --- | --- |
| Jádro | 40 | 12 | [jadro.md](jadro.md) |
| Modul Kontakty | 3 | 3 | [kontakty.md](kontakty.md) |
| Modul Zakázky | 21 | 13 | [zakazky.md](zakazky.md) |
| Modul CRM | 7 | 3 | [poptavky.md](poptavky.md) |
| Modul Realizace | 5 | 2 | [realizace.md](realizace.md) |
| Modul Fakturace | 6 | 6 | [fakturace.md](fakturace.md) |
| Modul Docházka | 2 | 2 | [dochazka.md](dochazka.md) |
| Modul Sklad | 9 | 2 | [sklad.md](sklad.md) |
| Modul Stroje a vozidla | 7 | 1 | [stroje.md](stroje.md) |
| Modul Kalendář | 6 | 1 | [kalendar.md](kalendar.md) |

Celkem tabulek: 106, 45 migrací.

Tabulky fronty úloh (pg-boss) zakládá krok migrací (`installQueues`) ve schématu knihovny; v tomto přehledu nejsou.
