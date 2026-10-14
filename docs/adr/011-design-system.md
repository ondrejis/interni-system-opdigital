# ADR 011: Design system a vzhled

- Stav: přijato (2026-10-08)
- Kontext: zadání §7 (vzhled jako Attio: hustý, rychlý, klidný)

## Rozhodnutí

- **Tokeny** jsou CSS proměnné (`--bg`, `--fg`, `--line`, `--accent`, štítky `--label-*`…) ve `packages/ui/src/styles.css`; Tailwind 4 je mapuje přes `@theme inline`. Světlý, tmavý a systémový režim se přepíná třídou/atributem na `<html>` (inline skript před vykreslením brání probliknutí).
- **Barva akcentu** je z konfigurace klienta (`brandStyle`); název systému také. Žádný název produktu není v komponentách napevno.
- **Hustota**: základní písmo 13,5 px, řádky tabulky 36 px, na úzkém displeji 16 px (iOS nezoomuje do polí). Dotykové cíle a mobilní rozhraní pro terén řeší fáze 4.
- **Komponenty**: Radix (`radix-ui`) pro přístupnost (focus, klávesnice, ARIA), `cmdk` pro paletu a výběry, `react-day-picker` pro datum, `sonner` pro oznámení, `lucide` pro ikony, `@tanstack/react-table` a `@tanstack/react-virtual` pro tabulku, `@dnd-kit` pro kanban a řazení sloupců. Verze jsou zafixované v `package.json`.
- Barva nese význam (stav, role); bez významu je šedá. Prázdné stavy vždy vysvětlí, co tu bude, a nabídnou hlavní akci.
- Vratné akce (smazání) se potvrzují toastem „Zpět“, ne dialogem; dialog jen u nevratných.

## Důsledky

- Změna vzhledu klienta = barva a název v konfiguraci, ne zásah do komponent.
- Přístupnost: klávesnice funguje v tabulce (šipky, Enter, Tab, Esc), v paletě, v dialozích; ARIA role `grid`, `row`, `columnheader`, `tab`.
