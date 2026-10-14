# ADR 004: Klientská cache dat (TanStack Query)

- Stav: přijato (2026-10-08, schválil Ondřej Dvořák; audit Q3)
- Kontext: `docs/AUDIT.md` P5, R2

## Kontext

Demo po každé změně znovu vykresluje stránku na serveru (84× `revalidatePath`) a nemá klientskou cache ani optimistické aktualizace.
Cíl „odezva do 100 ms“ s pocitem aplikace typu Attio to nesplní.

## Rozhodnutí

- První načtení řeší Server Components (data se předvyplní do cache).
- Data tabulek, detailů a pohledů se na klientovi drží v **TanStack Query**. Mutace jdou přes server actions s optimistickým zápisem do cache a vrácením při chybě („Zpět“ v toastu).
- `revalidatePath("/", "layout")` se nepoužívá.
- Závislost se přidá ve fázi 3 (design system a app shell), ne dříve.

## Důsledky

- Nová závislost mimo původně zadaný stack (schváleno).
- Registr entit (fáze 3) generuje klíče cache a invalidaci ze stejného popisu entity.
