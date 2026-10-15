# Databáze

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek (Drizzle) a žurnály migrací jádra a modulů). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Jedna databáze PostgreSQL. Každý balíček (jádro, každý modul) vlastní své tabulky a svou složku migrací s vlastní tabulkou záznamu o migracích ([ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Tabulky vypnutého modulu se nemažou.

| Balíček | Tabulek | Migrací | Dokument |
| --- | --- | --- | --- |
| Jádro | 44 | 15 | [jadro.md](jadro.md) |
| Modul Organizace a kontakty | 5 | 2 | [kontakty.md](kontakty.md) |
| Modul Klienti | 0 | 0 | [klienti.md](klienti.md) |
| Modul Google Disk | 2 | 2 | [disk.md](disk.md) |
| Modul Zakázky | 5 | 1 | [zakazky.md](zakazky.md) |
| Modul Obchody | 3 | 1 | [obchody.md](obchody.md) |
| Modul Úkoly a poznámky | 4 | 2 | [ukoly.md](ukoly.md) |
| Modul Kalendář | 4 | 1 | [kalendar.md](kalendar.md) |
| Modul Hodiny | 1 | 1 | [hodiny.md](hodiny.md) |
| Modul Finance | 5 | 1 | [finance.md](finance.md) |
| Modul Reklama | 6 | 1 | [reklama.md](reklama.md) |
| Modul Šablony e-mailů | 1 | 1 | [sablony-emailu.md](sablony-emailu.md) |
| Modul Můj prostor | 4 | 2 | [muj-prostor.md](muj-prostor.md) |
| Modul Přehled | 0 | 0 | [prehled.md](prehled.md) |

Celkem tabulek: 84, 30 migrací.

Tabulky fronty úloh (pg-boss) zakládá krok migrací (`installQueues`) ve schématu knihovny; v tomto přehledu nejsou.
