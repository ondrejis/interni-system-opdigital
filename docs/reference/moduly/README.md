# Moduly

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifesty a serverové části modulů). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Referenční stránka každého modulu: co modul v kódu deklaruje (navigace, oprávnění, entity, výchozí data, záložky a akce na detailu, úlohy, nastavení). Vyprávěcí popis (jak modul funguje, toky, pravidla) je v `docs/moduly/`.

| Modul | Popis | Závisí na | Oprávnění | Entity | Příkazy | Úlohy |
| --- | --- | --- | --- | --- | --- | --- |
| [Kontakty](kontakty.md) | Firmy a osoby: typ, hierarchie, štítky, více telefonů a e-mailů, doplnění z ARES, kontrola duplicit a jejich sloučení. |  | 3 | 2 | 7 | 0 |
| [Zakázky](zakazky.md) | Zakázky: fáze, termíny, tým, šablony, komentáře a úkoly (kostra, model se přepracovává). | `kontakty` | 3 | 1 | 11 | 0 |
| [CRM](poptavky.md) | Obchod nad zakázkou: schránka poptávek (ručně, formulář, webhook), kvalifikace, nástěnka fází, aktivity, prognóza. | `kontakty`, `zakazky` | 4 | 4 | 5 | 3 |
| [Docházka](dochazka.md) | Píchačka (příchod, odchod, přestávka), týdenní výkazy hodin na zakázky, schvalování, uzávěrka měsíce, přehledy a připomínka. |  | 4 | 1 | 16 | 3 |
| [Kalendář](kalendar.md) | Události s účastníky, opakováním a připomenutím, zdroje (zasedačky, vybavení) s kontrolou kolizí, vrstvy z ostatních modulů, odběr kalendáře v Google, Apple a Outlooku a import cizích kalendářů jako „obsazeno“. |  | 3 | 2 | 11 | 2 |

Platforma (jádro, ne modul): [jadro.md](jadro.md).
