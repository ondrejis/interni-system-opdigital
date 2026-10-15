# Moduly

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifesty a serverové části modulů). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Referenční stránka každého modulu: co modul v kódu deklaruje (navigace, oprávnění, entity, výchozí data, záložky a akce na detailu, úlohy, nastavení). Vyprávěcí popis (jak modul funguje, toky, pravidla) je v `docs/moduly/`.

| Modul | Popis | Závisí na | Oprávnění | Entity | Příkazy | Úlohy |
| --- | --- | --- | --- | --- | --- | --- |
| [Organizace a kontakty](kontakty.md) | Organizace (klient je organizace se stavem klienta) a kontaktní osoby: více telefonů a e-mailů, doplnění z ARES, kontrola duplicit a jejich sloučení. |  | 7 | 2 | 13 | 0 |
| [Klienti](klienti.md) | Klienti agentury: stav (lead, aktivní, pozastavený, bývalý), služby, kontext a karta klienta složená z příspěvků ostatních modulů. | `kontakty` | 2 | 0 | 6 | 0 |
| [Google Disk](disk.md) | Složky klientů a zakázek na sdíleném Google Disku: požadavky na založení přes n8n, stav složek a strom složek v Nastavení. |  | 3 | 0 | 8 | 1 |
| [Zakázky](zakazky.md) | Zakázky typu web, marketing a systémy: fáze, tým, šablony s úkoly a platbami, stav a termíny; zakládají se z vyhraných obchodů nebo ručně. | `kontakty` | 7 | 2 | 25 | 0 |
| [Obchody](obchody.md) | Obchodní příležitosti: pipeline s pravděpodobnostmi, board se součty, výhra (založení zakázek) a prohra s důvodem. | `kontakty`, `zakazky` | 6 | 1 | 24 | 0 |
| [Úkoly a poznámky](ukoly.md) | Úkoly (včetně hovorů, schůzek a termínů) s rychlým zadáním, podúkoly a poznámky s formátovaným textem navázané na obchody, klienty, kontakty a zakázky. |  | 5 | 3 | 26 | 0 |
| [Kalendář](kalendar.md) | Kalendář propojený s Google Kalendářem každého uživatele (obousměrná synchronizace do minuty): pohledy Den, Týden, Měsíc a Agenda, schůzky a hovory z úkolů zapsané do Googlu, vrstvy z ostatních modulů (úkoly s termínem, termíny zakázek), vazby událostí na obchody, klienty a kontakty, cizí soukromé události jako „Obsazeno“. |  | 2 | 0 | 17 | 4 |
| [Hodiny](hodiny.md) | Zápis odpracovaného času k zakázkám a úkolům: týdenní mřížka, formáty 1,5 a 1:30, souhrny podle zakázky. | `zakazky` | 3 | 1 | 9 | 0 |
| [Finance](finance.md) | Platby zakázek a jejich rozdělení mezi dvě IČO, retainery, vyrovnání mezi partnery (saldo) a přehledy příjmů. | `zakazky` | 6 | 2 | 25 | 2 |
| [Reklama](reklama.md) | Reklamní účty Meta, kampaně a denní výkon, příchozí leady z formulářů (přes n8n) a jejich převod na obchody. | `kontakty`, `obchody` | 3 | 2 | 18 | 1 |
| [Šablony e-mailů](sablony-emailu.md) | Šablony e-mailů s proměnnými z klienta, kontaktu, obchodu a zakázky; otevření připraveného e-mailu v Gmailu nebo kopie do schránky. | `kontakty` | 4 | 1 | 8 | 0 |
| [Můj prostor](muj-prostor.md) | Soukromá sekce vlastníka: hosting a údržba webů, domény s expirací, soukromá e-mailová knihovna, opakované faktury (Fakturoid) a přehled soukromých záznamů. | `kontakty` | 5 | 4 | 25 | 1 |
| [Přehled](prehled.md) | Úvodní přehled: nástěnky s čísly a seznamy z pohledů, poslední změny a rychlé odkazy. |  | 1 | 0 | 0 | 0 |

Platforma (jádro, ne modul): [jadro.md](jadro.md).
