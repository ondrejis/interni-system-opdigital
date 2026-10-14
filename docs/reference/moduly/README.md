# Moduly

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifesty a serverové části modulů). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Referenční stránka každého modulu: co modul v kódu deklaruje (navigace, oprávnění, entity, výchozí data, záložky a akce na detailu, úlohy, nastavení). Vyprávěcí popis (jak modul funguje, toky, pravidla) je v `docs/moduly/`.

| Modul | Popis | Závisí na | Oprávnění | Entity | Příkazy | Úlohy |
| --- | --- | --- | --- | --- | --- | --- |
| [Kontakty](kontakty.md) | Firmy a osoby: typ, hierarchie, štítky, více telefonů a e-mailů, doplnění z ARES, kontrola duplicit a jejich sloučení. |  | 3 | 2 | 6 | 0 |
| [Zakázky](zakazky.md) | Pipeline zakázek, rozpočet a položky, termíny, tým, dokumenty, ekonomika. | `kontakty` | 7 | 2 | 80 | 2 |
| [CRM](poptavky.md) | Obchod nad zakázkou: schránka poptávek (ručně, formulář, webhook), kvalifikace, nástěnka fází, aktivity, prognóza. | `kontakty`, `zakazky` | 4 | 4 | 5 | 3 |
| [Realizace](realizace.md) | Harmonogram v pracovních dnech s Ganttem, stavební deník s předvyplněním, předávací protokol s podpisem a vady. | `zakazky` | 2 | 1 | 24 | 3 |
| [Fakturace](fakturace.md) | Zálohové, průběžné a konečné faktury z položek zakázky, platby, dobropisy, PDF s QR platbou, odesílání e-mailem s upomínkami, export (XLSX, balík pro účetní), šablony dokladů. | `zakazky`, `kontakty` | 3 | 2 | 29 | 4 |
| [Docházka](dochazka.md) | Píchačka (příchod, odchod, přestávka), týdenní výkazy hodin na zakázky, schvalování, uzávěrka měsíce, přehledy a připomínka. |  | 4 | 1 | 17 | 3 |
| [Sklad](sklad.md) | Materiál na několika umístěních (sklad, dílna, vozidlo, stavba), příjem, výdej na zakázku, převody, vratky, objednávky u dodavatelů, minimální zásoby a inventura. | `kontakty` | 4 | 5 | 17 | 0 |
| [Stroje a vozidla](stroje.md) | Evidence strojů a vozidel, kniha jízd a motohodiny, tankování se spotřebou, servis a servisní intervaly, termíny STK a pojištění, rezervace s kontrolou kolizí a závady z terénu. |  | 3 | 2 | 20 | 2 |
| [Kalendář](kalendar.md) | Události s účastníky, opakováním a připomenutím, zdroje (zasedačky, vybavení) s kontrolou kolizí, vrstvy z ostatních modulů, odběr kalendáře v Google, Apple a Outlooku a import cizích kalendářů jako „obsazeno“. |  | 3 | 2 | 11 | 2 |

Platforma (jádro, ne modul): [jadro.md](jadro.md).
