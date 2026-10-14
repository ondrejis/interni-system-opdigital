# ADR 010: Registr entit a data-driven UI

- Stav: přijato (2026-10-08)
- Kontext: `docs/AUDIT.md` (největší nová práce je registr atributů, ne moduly), ADR 004, ADR 007

## Kontext

Tabulka, filtry, řazení, seskupení, součty, inline editace, vlastní pole, pohledy, kanban, detail záznamu a Cmd+K jsou pro každou entitu (firma, zakázka, faktura, stroj…) stejné.
Psát je pro každý modul znovu by znamenalo desítky téměř shodných stránek a nekonzistentní chování.

## Rozhodnutí

- Entita se popíše **jednou** (`defineEntity`): atributy s typem (`text`, `currency`, `status`, `user`, `record`…), název, stav pro kanban, oprávnění, rozsah „jen moje“, adresa seznamu.
- Z popisu vznikne všechno ostatní:
  - **server**: SQL bez joinů (`makeExprs`) pro nativní i vlastní atributy (`jsonb`), strom filtrů s typovanými operátory a validací, řazení, seskupení, součty, inline úprava s kontrolou kolize (`expectedUpdatedAt`), lidsky čitelný audit, hledání přes `search_document` (bez diakritiky, trigramy) s dofiltrováním podle oprávnění;
  - **klient**: `EntityDescriptor` (jen to, co smí prohlížeč znát) → tabulka, filtry, editory podle typu, kanban, detail.
- Oprávnění se vždy vynucují v datové vrstvě (ADR 007). UI skrývá akce podle `descriptor.can`, ale to je jen pohodlí; server odmítne vše, co aktér nesmí.
- UI knihovna (`@rebar/ui`) nezná Next.js ani server actions. Dostane `EntityApi` (kontext React); aplikace ho implementuje nad server actions. Díky tomu jde UI testovat a skládat samostatně.
- Data drží TanStack Query (ADR 004): seznam jako nekonečný dotaz po 100 řádcích, součty a skupiny jako samostatné dotazy (nezávisí na načtených řádcích), inline úprava je optimistická s návratem při chybě.
- Stránky seznamu a detailu jsou jedna trasa `(app)/[...path]`, která adresu přiřadí entitě podle `listPath`. Modul tak nepřidává stránky; přidává jen entity a případně obsah karty Přehled.
- Uložené pohledy (osobní/sdílené, oblíbené v postranním panelu) ukládají jen konfiguraci (filtry, řazení, sloupce, seskupení, typ zobrazení); entita a atributy se při uložení ověřují.

## Důsledky

- Nová entita = jeden popis + migrace tabulky; seznam, kanban, filtry, hledání a detail dostane zdarma.
- Omezení: filtry v UI jsou jedna úroveň (a/nebo); hlubší strom z uložených pohledů se zachová, ale UI ho jen zobrazí jako „skupinu“. Seskupení jde jen podle `status`, `select`, `user`, `record`, `checkbox`.
- Kanban nemá ruční pořadí karet uvnitř sloupce (není pro něj atribut pořadí); řadí se podle pohledu.
