# ADR 022: Dokumentace z kódu, kontrola driftu a povinné popisy exportů

- Stav: přijato (2026-10-09)
- Kontext: ADR 010 (registr entit a UI), ADR 012 (moduly, příkazy, poskytovatelé), ADR 005 (TypeScript 6 API pro nástroje), `docs/DOCS-PROCES.md`

## Kontext

Cílem je dokumentace každé funkce, která je úplná, přesná a nezastarává. Ručně psaný seznam polí, oprávnění nebo příkazů zastará při první změně kódu a od té chvíle lže.
Zároveň z kódu nejde vyčíst, proč pravidla existují a jak věci fungují za sebou. Potřebujeme proto dvě vrstvy s různým způsobem zajištění přesnosti, a infrastrukturu, která drift odhalí automaticky.

## Rozhodnutí

**1. Tři vrstvy.** (a) _Reference z kódu_ (`docs/reference/`): generuje se, nikdy se neupravuje ručně. (b) _API z TSDoc_ (`docs/reference/api/`): generuje se z JSDoc nad exporty. (c) _Vyprávění modulů_ (`docs/moduly/`): píše se ručně podle šablony `docs/moduly/_sablona.md`.
Co jde zjistit z kódu, se nepíše ručně; ruční text se omezuje na to, co z kódu vyčíst nejde.

**2. Generátor `pnpm docs:generate`** (`scripts/docs/`, běží přes `tsx`). Načte skutečné manifesty, serverové části modulů, UI a schémata tak, jak je skládá aplikace (`apps/web/src/server/modules-server.ts`), a doplní je popisy ze zdrojů (AST přes TypeScript compiler API).
Výstup je deterministický: stabilní řazení, žádná časová razítka a absolutní cesty. Nové položky manifestu, `ModuleServer` a `ModuleUi`, které generátor nezná, vypíše v obecné tabulce, takže se v referenci objeví hned; katalogy (konstanty s názvem `*EVENT*`, `*CATALOG*`, `*METRIC*`, `*KPI*`, `*NOTIFICATION*`) objeví automaticky.
Generátor nepotřebuje databázi ani síť a nepřidává žádnou závislost: `zod` a `drizzle-orm` bere z balíčku jádra (`scripts/docs/lib/deps.ts`).

**3. Kontrola driftu `pnpm docs:check`.** Znovu vygeneruje obsah v paměti a porovná ho s commitnutým; rozdíl je chyba s návodem (`pnpm docs:generate`). Je součástí `pnpm check` a CI jobu `check`.
Soubory v `docs/reference/` jsou v `.prettierignore` (vlastní formát, nezávislý na verzi Prettieru) a v `.gitattributes` označené jako generované. `docs/INDEX.md` a bloky „Souhrn z kódu“ v `docs/moduly/*.md` jsou formátované Prettierem uvnitř generátoru.
Rozcestník `docs/INDEX.md` se generuje ze souborů v `docs/`, takže v něm žádný dokument nechybí.

**4. Odkazy.** `tests/docs.test.ts` kontroluje markdownové odkazy a kotvy a wiki odkazy `[[…]]` ve všech dokumentech, a v `docs/moduly/*.md` odkazy na kód ve tvaru `` `cesta/soubor.ts#symbol` ``: soubor musí existovat a symbol musí být v souboru deklarovaný (komentář nestačí; `scripts/docs/lib/symbols.ts`).
Označení nedopsaného vyprávění (`TODO: doplnit vyprávění`) test povoluje; vypíše ho `pnpm docs:status`.

**5. Popisy exportů: vlastní pravidlo ESLintu s ratchetem místo `eslint-plugin-jsdoc`.** Pravidlo `docs/exported-description` (`scripts/docs/eslint-plugin.mjs`) vyžaduje JSDoc s popisem nad každou exportovanou funkcí, třídou, rozhraním, typem a výčtem v `packages/core/src`, `packages/modules/*/src` a `packages/ui/src`.
Důvody proti pluginu: potřebujeme **ratchet na úrovni symbolu** (`docs/jsdoc-baseline.json`: výjimky pro starý kód, které se smí jen zmenšovat) a stejnou definici „má popis“ pro lint i pro statistiku (`pnpm docs:coverage`); `require-jsdoc` a `require-description` z pluginu by baseline neuměly a byla by to nová závislost s dalším lockfile.
Rozsah: testy se nekontrolují; **React komponenty** (PascalCase funkce v `.tsx`) a **konstanty** se jen počítají do statistiky, nevyžadují se (názvy a props jsou zdokumentované typem, vyžadovat větu u každého tlačítka by vedlo k opisům názvu). Funkce, hooky, třídy a typy v `.tsx` se vyžadují.
Ratchet: nový export bez popisu je chyba; popis doplněný k exportu z baseline vyžaduje smazat výjimku (`pnpm docs:coverage --prune`), takže se seznam jen zkracuje.

**6. API reference: vlastní lehký generátor místo TypeDoc.** Nad TypeScript compiler API (`typescript` v kořeni je už kvůli ADR 005 API verze 6) čte exporty vstupních bodů balíčků a jejich JSDoc.
TypeDoc s `typedoc-plugin-markdown` by přidal dvě závislosti svázané s verzí TypeScriptu, jeho výstup má tvar určený knihovnou (stovky souborů po jednotlivých symbolech); vlastní generátor dává krátké stránky po vstupních bodech (`api/<balíček>/<vstup>.md`), index s pokrytím a stabilní výstup. Export dostupný z více vstupních bodů je popsaný jednou.

**7. GitHub Pages zatím nejsou zapnuté.** Připravený workflow je v `.github/workflows/docs-pages.yml.disabled`; zapnutí vyžaduje výslovné povolení majitele a samostatné ADR (viz `docs/DOCS-PROCES.md`, §8).

## Důsledky

- Změna kódu, která mění reference, musí v témže commitu obsahovat přegenerované soubory. Po sloučení větví se spouští `pnpm docs:refresh`; konflikty v `docs/reference/` se neřeší ručně.
- Generátor je kód, který se musí udržovat: nový druh registru se přidá podle `docs/DOCS-PROCES.md`, §7.
- `docs/reference/` zvětší repozitář (jednotky MB markdownu), ale vznikají i mizí automaticky a v pull requestech jsou sbalené jako generované.
- Popisy exportů se doplňují průběžně; stav ukazuje `pnpm docs:coverage`.
- Věcnou správnost ručního vyprávění nelze testem ověřit; hlídá ji recenze změn a týdenní audit (`docs/DOCS-PROCES.md`, §6).
