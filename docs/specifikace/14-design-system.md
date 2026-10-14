# OPSIS 04 – Design systém

Oct 7, 2026 · @Ondřej Dvořák

## Principy a pravidla proti AI slopu

OPSIS vypadá jako profesionální nástroj, ne jako šablona z generátoru. Vizuální jazyk vychází z Linearu: klid, hustota informací, neutrální plochy, jeden akcent, ovládání klávesnicí. Přebíráme principy a proporce, ne logo, ikony ani brandové prvky Linearu. Brand OPSIS přijde později přes jediný token `--accent`.

**Principy**

1. **Obsah je rozhraní.** Data dostanou prostor, ovládací prvky ustupují. Žádné dekorace, které nenesou informaci.
2. **Barva = význam.** Neutrální šedé plochy; barva jen pro stav, prioritu, štítek, akcent a chybu.
3. **Hustota s rytmem.** Malé písmo (13 px), těsné řádky, ale přísná mřížka 4 px a zarovnání.
4. **Okraje místo stínů.** Plochy oddělují 1px linky a jemné rozdíly pozadí. Stín jen u plovoucích prvků.
5. **Klávesnice první.** Každá častá akce má zkratku a tooltip ji ukazuje.
6. **Okamžitá odezva.** Žádné spinnery na celou stránku; skeletony a optimistické změny.
7. **Konzistence nad originalitou.** Stejná věc vypadá všude stejně.

**Zakázáno (anti-slop)**

- Gradienty v pozadí, na tlačítkách i v textu; glassmorphism, rozmazaná pozadí, záře (glow).
- Emoji v UI, ikona ✨ a „AI“ jiskřičky, ilustrace a 3D obrázky v prázdných stavech.
- Karty se zaoblením 16 px a více a velkými měkkými stíny; karty vnořené do karet.
- Barevné čtverečky s ikonou jako dekorace nadpisů a statistik („icon tiles“).
- Více než jedna akcentová barva na obrazovce; fialovo-modré přechody.
- Velká čísla v „KPI kartách“ přes celou šířku jako výplň dashboardu.
- Centrované „hero“ nadpisy a marketingové texty uvnitř aplikace („Vítejte zpět! 🚀“).
- Text šedý na šedém pod kontrastem WCAG AA (4,5 : 1 pro text, 3 : 1 pro ikony a okraje).
- Plné velké písmo v nadpisech, tučné písmo pro zdůraznění v odstavcích, podtržené odkazy mimo text.
- Animace delší než 200 ms, pružinové (bounce) animace, animace při každém načtení seznamu.
- Placeholder texty a lorem ipsum v hotových obrazovkách.
- Kombinace více ikonových sad; ikony bez popisku tam, kde význam není jasný.

**Kontrolní otázka pro každou obrazovku**: Kdyby se z ní odstranily všechny barvy kromě šedé, bude pořád čitelná a jasně strukturovaná? Pokud ne, struktura stojí na barvě a je třeba ji opravit.

## Barvy

Komponenty používají jen sémantické tokeny, nikdy hex hodnoty. Světlý a tmavý režim mají stejné názvy tokenů s jinými hodnotami. Text musí splnit kontrast WCAG AA (4,5 : 1) vůči ploše, na které leží.

**Plochy, okraje, text**

| Token | Světlý | Tmavý | Použití |
| --- | --- | --- | --- |
| `--bg-app` | #FCFCFD | #0E0F11 | hlavní plocha |
| `--bg-sidebar` | #F7F7F9 | #0A0B0D | levý panel |
| `--bg-panel` | #FFFFFF | #141518 | boční panel detailu, dialog, karta kanbanu |
| `--bg-elevated` | #FFFFFF | #1A1B1F | menu, popover, Cmd+K (se stínem) |
| `--bg-hover` | #F1F1F4 | #1D1E23 | najetí na řádek, položku |
| `--bg-active` | #E9E9EE | #25262C | vybraný řádek, aktivní položka sidebaru |
| `--bg-input` | #FFFFFF | #121316 | pole formulářů |
| `--border-subtle` | #EEEEF1 | #1E1F24 | oddělovače řádků |
| `--border` | #E2E2E7 | #2A2B31 | okraje panelů, polí, karet |
| `--border-strong` | #CFD0D7 | #3A3B43 | hover okraje pole, oddělovač skupin |
| `--text-primary` | #1B1C21 | #ECEDEF | hlavní text |
| `--text-secondary` | #5F616B | #A1A3AB | popisky, sekundární údaje |
| `--text-tertiary` | #757782 | #7C7E87 | meta údaje, placeholder, čas |
| `--text-disabled` | #B4B6BE | #4B4D55 | neaktivní prvky |

**Akcent** (jediná značková barva; brand později mění jen tyto tokeny)

| Token | Světlý | Tmavý | Použití |
| --- | --- | --- | --- |
| `--accent` | #5B5BD6 | #5E60DC | primární tlačítko, aktivní přepínač, výběr |
| `--accent-hover` | #4F4FC8 | #6E70E6 | hover primárního tlačítka |
| `--accent-subtle` | #EEEFFE | #1F2047 | pozadí vybrané položky, zvýraznění |
| `--accent-text` | #4646B8 | #9EA0F5 | odkazy, aktivní záložka |
| `--on-accent` | #FFFFFF | #FFFFFF | text na akcentu |
| `--focus-ring` | #5B5BD6 / 50 % | #6E70E6 / 60 % | 2px fokus kolem prvků |

**Stavy**

| Význam | Text a ikona (světlý / tmavý) | Jemné pozadí (světlý / tmavý) | Použití |
| --- | --- | --- | --- |
| `success` | #1F8A4C / #3DD68C | #E9F6EE / #11261A | vyhráno, zaplaceno, hotovo |
| `warning` | #B35C00 / #F5A524 | #FFF4E5 / #2A1F0B | bez aktivity, blízko splatnosti, probíhá |
| `danger` | #D93036 / #FF6B6E | #FDECEC / #2E1415 | po termínu, prohráno, chyba, mazání |
| `info` | #0B6BCB / #5EB1FF | #E8F2FD / #0F1F33 | informační hlášky, synchronizace |

**Barvy štítků a uživatelů** (tečka 8 px vedle neutrálního textu, nikdy plné barevné pozadí štítku): šedá #8B8D98, červená #E5484D, oranžová #F76B15, žlutá #E2A336, zelená #30A46C, tyrkysová #12A594, modrá #0090FF, fialová #8E4EC6, růžová #D6409F. Stejné hodnoty v obou režimech.

**Grafy**: série v pořadí `--accent`, tyrkysová, žlutá, růžová, modrá; mřížka `--border-subtle`; osy a popisky `--text-tertiary`. Podíl Ondřeje a Patrika má vždy jejich barvu uživatele.

## Typografie

Jedno písmo pro celé UI: **Inter** (variabilní, self-hosted WOFF2, latin + latin-ext kvůli češtině), s OpenType funkcemi `cv11` (jednopatkové a) a `ss01`. Čísla v tabulkách a částkách vždy `tabular-nums`. Kódy a ID (Z-2026-014, IČO) v **JetBrains Mono** 12 px.

| Token | Velikost / řádkování | Řez | Použití |
| --- | --- | --- | --- |
| `text-xs` | 11 / 16 px | 500 | odznaky, čipy, popisky os |
| `text-sm` | 12 / 16 px | 400–500 | meta údaje, tooltip, sekundární text v řádku |
| `text-base` | 13 / 20 px | 400–500 | výchozí text UI, řádky seznamů, formuláře |
| `text-md` | 14 / 22 px | 400 | delší text: popisy, poznámky, komentáře |
| `text-lg` | 16 / 24 px | 600 | nadpis sekce v detailu, název v dialogu |
| `text-xl` | 20 / 28 px | 600 | název záznamu v detailu |
| `text-2xl` | 24 / 32 px | 600 | nadpis stránky (jen Přehled a Nastavení) |
| `text-num` | 13 / 20 px | 500, tabular | částky a počty v tabulkách |
| `text-kpi` | 24 / 32 px | 600, tabular | hlavní číslo ve widgetu |

**Pravidla**

- Řezy jen 400, 500, 600. Žádné 700 a víc.
- Nadpisy větnou velikostí písmen („Otevřené obchody“), nikdy VERZÁLKAMI. Výjimka: popisky skupin v sidebaru 11 px, 500, `--text-tertiary`, prostrkání 0,02 em.
- Odsazení písma −0,01 em pro `text-lg` a větší.
- Text v řádcích se zkracuje třemi tečkami, celé znění v tooltipu; nikdy se nezalamuje do dvou řádků v seznamu.
- Délka řádku delšího textu (poznámky) max. 72 znaků.

## Rozestupy, zaoblení, stíny, pohyb, ikony

Všechny rozměry stojí na mřížce 4 px. Hodnoty mimo škálu jsou chyba.

**Rozestupy**: 0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64 px (tokeny `space-0` … `space-16` podle Tailwind škály). Vnitřní odsazení řádku 12 px vodorovně; mezera mezi sekcemi detailu 24 px; okraj obsahu stránky 24 px desktop, 16 px mobil.

**Výšky ovládacích prvků**

| Velikost | Výška | Použití |
| --- | --- | --- |
| xs | 24 px | tlačítka a výběry v hustých řádcích, čipy filtrů |
| sm | 28 px | výchozí v hlavičkách, toolbarech, panelu vlastností |
| md | 32 px | formuláře v dialozích, primární akce |
| lg | 40 px | mobil (dotyková plocha min. 44 px včetně okolí) |

**Zaoblení**: 4 px (čipy, odznaky, checkbox), 6 px (tlačítka, pole, položky menu), 8 px (karty kanbanu, popover, menu, widgety), 12 px (dialog, Cmd+K, boční panel na mobilu), plné (avatary, tečky). Nic většího.

**Stíny** (jen pro plovoucí vrstvy)

```
--shadow-popover: 0 0 0 1px var(--border), 0 4px 12px rgb(0 0 0 / 0.08), 0 1px 2px rgb(0 0 0 / 0.04);
--shadow-dialog:  0 0 0 1px var(--border), 0 16px 48px rgb(0 0 0 / 0.16);
--shadow-drag:    0 8px 24px rgb(0 0 0 / 0.14);          /* karta při tažení */
/* tmavý režim: stejné, opacity × 2,5 */
```

**Pohyb**

- Délky: 100 ms (hover, stisk), 150 ms (otevření menu, popoveru, tooltipu), 200 ms (dialog, boční panel). Nic delšího.
- Křivka `cubic-bezier(0.2, 0, 0, 1)` pro vstup, `cubic-bezier(0.4, 0, 1, 1)` pro odchod.
- Animuje se jen `opacity` a `transform` (posun max. 4 px, měřítko 0,98 → 1).
- Seznamy se při načtení neanimují; přidaný řádek krátce zvýrazní pozadí `--accent-subtle` (600 ms fade).
- `prefers-reduced-motion`: všechny přechody 0 ms.

**Ikony**: Lucide, velikost 16 px (v hustých řádcích 14 px), tah 1,5 px, barva `--text-secondary`, aktivní `--text-primary`. Žádná jiná sada. Typy aktivit, stavy úkolů a priority mají vlastní malé SVG ikony v jednotném stylu:

- Stav úkolu: prázdný kroužek (K řešení), půlkruh `warning` (Probíhá), kroužek s fajfkou `success` (Hotovo), kroužek s křížkem `--text-tertiary` (Zrušeno).
- Priorita: tři sloupečky s výplní podle úrovně (Nízká 1, Střední 2, Vysoká 3) v `--text-secondary`; Urgentní = čtvereček `danger` s vykřičníkem; Žádná = tři tečky.

## Layout aplikace

Desktop má tři sloupce: sidebar, hlavní seznam a volitelný boční panel s detailem. Detail jde otevřít i na celou plochu.

&#91;embedded content: rozložení desktopu · sidebar, hlavička, seznam, boční panel\]

| Prvek | Rozměr |
| --- | --- |
| Sidebar | 240 px (sbalený 56 px), položky 28 px, popisky skupin 11 px |
| Hlavička stránky | 44 px, odsazení 16 px vodorovně |
| Řádek seznamu | 36 px (kompaktní 32 px) |
| Boční panel detailu | 560 px, překrývá seznam od 1200 px dolů |
| Detail na celou plochu | obsah max. 1080 px; vlevo obsah, vpravo panel vlastností 300 px |
| Dialog | 480 / 640 px |
| Command palette | 640 px, 20 % od horního okraje |
| Minimální šířka desktopu | 1024 px bez horizontálního scrollu celé stránky |

## Komponenty

Každá komponenta existuje jednou v `apps/web/src/components/ui` a má všechny stavy: výchozí, hover, fokus (`--focus-ring` 2 px s odstupem 1 px, jen při ovládání klávesnicí), stisk, neaktivní, načítání, chyba. Komponenty vycházejí z shadcn/ui a Radix, ale vzhled je výhradně z tohoto dokumentu.

| Komponenta | Varianty a pravidla |
| --- | --- |
| Button | `primary` (akcent, max. jeden na obrazovce), `secondary` (`--bg-panel` + `--border`), `ghost` (bez okraje, hover `--bg-hover`), `danger` (jen potvrzení mazání), `icon` (čtverec). Velikosti xs–lg. Ikona vlevo 14–16 px, mezera 6 px. Načítání = malý spinner místo ikony, šířka se nemění. |
| Input, Textarea | výška podle velikosti, okraj `--border`, hover `--border-strong`, fokus okraj `--accent` + ring. Chyba = okraj `danger` a text chyby 12 px pod polem. Popisek nad polem 12 px / 500. |
| Select, Combobox | otevírá popover s hledáním nad 7 položek; vybraná položka s fajfkou vpravo; klávesnice šipky + Enter. |
| Výběr uživatele | avatar 16 px + jméno; klávesa A v detailu. |
| Date picker | popover s kalendářem a rychlými volbami (Dnes, Zítra, Příští týden, Za 2 týdny, Bez termínu); psaní „pá“, „15.10.“, „+3d“ rozpozná datum. |
| Checkbox, Switch, Radio | 14 px checkbox se zaoblením 4 px; switch jen pro okamžitě platná nastavení. |
| Segmented control | přepínač pohledů (Seznam / Board / Kalendář), výška sm, aktivní segment `--bg-panel` + jemný okraj. |
| Tabs | podtržení 2 px `--accent` u aktivní, text `--text-secondary` → `--text-primary`. |
| Badge / Chip | 20 px výška, 11–12 px text, tečka barvy + neutrální text; odstranitelný čip s × při hoveru. |
| Status, Priority ikony | viz Ikony; v seznamu klikatelné s menu možností. |
| Avatar | kruh 16 / 20 / 24 / 32 px, iniciály na barvě uživatele, skupina překrytá o 4 px. |
| Tooltip | `--bg-elevated` v tmavé inverzi, 12 px, zpoždění 400 ms, obsahuje zkratku v `Kbd`. |
| Kbd | 11 px mono, okraj `--border`, zaoblení 4 px. |
| Dropdown / Context menu | položky 28 px, ikona + text + zkratka vpravo; oddělovače; pravý klik na řádek otevře stejné menu jako „…“. |
| Dialog | šířka 480 / 640 px, nadpis `text-lg`, akce vpravo dole (sekundární, primární), Esc zavře, Cmd+Enter potvrdí. |
| Sheet (boční panel) | zprava, šířka 560 px (náhled detailu), přes obsah bez ztmavení; na mobilu zdola na celou šířku. |
| Toast | vpravo dole, 1 řádek + akce („Vrátit“, „Otevřít“), 5 s; chyba zůstává do zavření. |
| Command palette | šířka 640 px, nahoře pole 48 px, skupiny výsledků s popisky 11 px, aktivní řádek `--bg-active`, dole nápověda klávesových zkratek. |
| Řádek seznamu | 36 px (kompaktní 32 px), oddělovač `--border-subtle`, hover `--bg-hover`, vybraný `--bg-active`, checkbox se ukáže při hoveru vlevo. |
| Tabulka | záhlaví 32 px, 12 px / 500 `--text-tertiary`, řazení ikonou šipky, přichycené záhlaví a první sloupec, součty v patičce `text-num`. |
| Karta kanbanu | `--bg-panel`, okraj `--border`, zaoblení 8 px, odsazení 12 px, max. 4 řádky obsahu; při tažení `--shadow-drag` a natočení 1°. |
| Sloupec kanbanu | šířka 280 px, hlavička s názvem, počtem a součtem, pozadí `--bg-app`, mezera 8 px mezi kartami. |
| Panel vlastností | řádky 32 px: popisek 12 px `--text-tertiary` vlevo (120 px), hodnota vpravo jako ghost tlačítko; klik otevře editor na místě. |
| Filtr čip | `pole · operátor · hodnota`, každá část klikatelná zvlášť, × odstraní. |
| Pás fází | segmenty stejné šířky, hotové `--accent`, aktuální `--accent` s tečkou, budoucí `--border`; popisky pod segmentem 12 px. |
| Částka | `text-num`, formát `14 000 Kč`, záporné s mínusem v `danger`. |
| Prázdný stav | ikona 20 px `--text-tertiary`, jedna věta, jedno tlačítko; zarovnáno vlevo nahoře v oblasti seznamu. |
| Skeleton | obdélníky `--bg-hover` v přesném tvaru obsahu, jemné pulzování 1,2 s. |
| Widget dashboardu | okraj `--border`, zaoblení 8 px, hlavička 36 px (název 13 / 500, menu „…“), obsah bez dalšího vnitřního rámečku. |

## Vzory a texty

Stejné situace se řeší všude stejně. Texty jsou česky, krátké, věcné a ve větné velikosti písmen.

**Načítání a chyby**

- Načítání seznamu nebo detailu: skeleton ve tvaru obsahu, nikdy spinner přes celou plochu. Pod 300 ms se skeleton vůbec neukáže (zpoždění 150 ms).
- Ukládání: optimisticky, bez indikace; jen při selhání toast „Nepodařilo se uložit. Zkusit znovu“ a návrat hodnoty.
- Chyba načtení: na místě obsahu věta „Data se nepodařilo načíst.“ + tlačítko „Zkusit znovu“.
- Offline: tenký pruh nahoře „Jste offline. Změny se uloží po připojení.“ (změny ve frontě, max. 50).
- Validace formuláře: při odeslání a pak živě u chybného pole; první chybné pole dostane fokus.

**Potvrzování**

- Bez potvrzení: všechno vratné (úpravy, přesuny, měkké mazání s „Vrátit“).
- Dialog s potvrzením jen u nevratného nebo citlivého: trvalé smazání z koše, změna oprávnění, zrušení retaineru, přepočet alokací zaplacené platby, sloučení duplicit.

**Formátování**

| Údaj | Formát |
| --- | --- |
| Částka | `14 000 Kč`, haléře jen když nejsou nulové: `166,66 Kč`; velké v grafech `1,2 mil. Kč` |
| Procenta | `40 %` (mezera před %) |
| Datum | `7. 10. 2026`; v aktuálním roce `7. 10.`; v seznamech relativně do 7 dní: „dnes“, „zítra“, „včera“, „pá“ |
| Čas | `14:30` |
| Datum a čas | `7. 10. 14:30` |
| Relativní čas v logu | „před 2 min“, „před 3 h“, „včera 16:20“, pak datum |
| Telefon | `+420 777 123 456` |
| IČO | 8 číslic bez mezer, mono písmo |
| Hodiny | `1,5 h` nebo `1:30` |

**Texty v UI**

- Tlačítka slovesem: „Uložit“, „Vytvořit obchod“, „Zapsat platbu“, ne „OK“ nebo „Odeslat“.
- Popisky polí podstatným jménem bez dvojtečky.
- Žádné vykřičníky, emoji ani oslovení („Skvělá práce!“).
- Prázdné stavy konkrétně: „Žádné otevřené obchody. Vytvořit obchod“, ne „Tady zatím nic není 🙂“.
- Chyby říkají, co se stalo a co udělat: „IČO nemá 8 číslic.“

## Mobil

Pod 768 px se rozložení přepne na mobilní: spodní lišta místo sidebaru, karty místo širokých tabulek, sheety zdola místo bočních panelů. Tokeny barev a typografie zůstávají stejné; mění se rozměry ovládacích prvků.

- **Breakpointy**: mobil < 768 px, tablet 768–1199 px (sidebar sbalený na ikony 56 px), desktop ≥ 1200 px.
- **Spodní lišta**: výška 56 px + bezpečná zóna, 5 položek s ikonou 20 px a popiskem 11 px, aktivní `--accent-text`. Lišta se při scrollu dolů neschovává.
- **Hlavička obrazovky**: 48 px, zpět vlevo, název uprostřed zkrácený, akce vpravo (max. 2 ikony).
- **Dotykové plochy**: min. 44 × 44 px; ovládací prvky velikost lg (40 px); text `text-base` zvětšený na 15 px kvůli čitelnosti, `text-sm` na 13 px; pole formulářů 16 px (iOS jinak zoomuje).
- **Seznamy jako karty**: řádek 56–64 px se dvěma řádky textu (název + podtitulek), vpravo hlavní údaj (částka, termín). Swipe doleva odhalí 2 akce (např. Hotovo, Odložit u úkolu).
- **Akční tlačítka na detailu**: řada kulatých tlačítek 44 px pod hlavičkou s popisky (Zavolat, E-mail, Disk, Navigovat, Úkol).
- **Sheet zdola**: místo dialogů a menu; táhlo nahoře, zavření stažením dolů, max. 90 % výšky.
- **Vytváření**: plovoucí tlačítko se nepoužívá; „+“ je v hlavičce seznamu.
- **Cmd+K na mobilu** = obrazovka Hledat na celou plochu s klávesnicí otevřenou hned po vstupu.

## Klávesové zkratky

Zkratky fungují všude kromě textových polí. Seznam všech zkratek otevře `?`. Na Windows se Cmd nahrazuje Ctrl.

| Zkratka | Akce |
| --- | --- |
| Cmd+K | hledání a příkazy |
| C | nový záznam v aktuálním modulu |
| / | fokus do filtru seznamu |
| G pak P | přejít na Přehled |
| G pak O | přejít na Obchody |
| G pak K | přejít na Klienty |
| G pak Z | přejít na Zakázky |
| G pak U | přejít na Moje úkoly |
| G pak F | přejít na Finance |
| G pak N | přejít do Nastavení |
| J / K nebo ↓ / ↑ | další / předchozí řádek |
| Enter | otevřít záznam |
| Space | náhled v bočním panelu |
| X | označit řádek |
| Esc | zavřít panel, dialog, zrušit výběr |
| E | upravit název |
| S | změnit stav / fázi |
| A | přiřadit / vlastník |
| P | priorita |
| D | termín |
| L | štítky |
| Shift+D | otevřít Disk |
| Cmd+Enter | uložit formulář / dokončit úkol |
| Cmd+Backspace | přesunout do koše |
| Cmd+Z | vrátit poslední akci (10 s po ní) |
| ? | přehled zkratek |

## Implementace

Tokeny žijí na jednom místě jako CSS proměnné a Tailwind v4 je mapuje v `@theme`. Komponenty používají jen třídy z tokenů (`bg-panel`, `text-secondary`, `border`), nikdy libovolné hodnoty (`bg-[#fff]`, `p-[13px]`). Biome / ESLint pravidlo zakáže arbitrary values v className.

```css
/* apps/web/src/styles/tokens.css */
:root {
  --bg-app: #FCFCFD;  --bg-sidebar: #F7F7F9;  --bg-panel: #FFFFFF;
  --bg-elevated: #FFFFFF;  --bg-hover: #F1F1F4;  --bg-active: #E9E9EE;  --bg-input: #FFFFFF;
  --border-subtle: #EEEEF1;  --border: #E2E2E7;  --border-strong: #CFD0D7;
  --text-primary: #1B1C21;  --text-secondary: #5F616B;  --text-tertiary: #757782;  --text-disabled: #B4B6BE;
  --accent: #5B5BD6;  --accent-hover: #4F4FC8;  --accent-subtle: #EEEFFE;  --accent-text: #4646B8;
  --on-accent: #FFFFFF;  --focus-ring: rgb(91 91 214 / 0.5);
  --success: #1F8A4C;  --success-subtle: #E9F6EE;
  --warning: #B35C00;  --warning-subtle: #FFF4E5;
  --danger:  #D93036;  --danger-subtle:  #FDECEC;
  --info:    #0B6BCB;  --info-subtle:    #E8F2FD;
  --radius-xs: 4px; --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px;
  --font-sans: 'Inter Variable', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --ease-out: cubic-bezier(0.2, 0, 0, 1);
}
:root[data-theme='dark'] {
  --bg-app: #0E0F11;  --bg-sidebar: #0A0B0D;  --bg-panel: #141518;
  --bg-elevated: #1A1B1F;  --bg-hover: #1D1E23;  --bg-active: #25262C;  --bg-input: #121316;
  --border-subtle: #1E1F24;  --border: #2A2B31;  --border-strong: #3A3B43;
  --text-primary: #ECEDEF;  --text-secondary: #A1A3AB;  --text-tertiary: #7C7E87;  --text-disabled: #4B4D55;
  --accent: #5E60DC;  --accent-hover: #6E70E6;  --accent-subtle: #1F2047;  --accent-text: #9EA0F5;
  --focus-ring: rgb(110 112 230 / 0.6);
  --success: #3DD68C;  --success-subtle: #11261A;
  --warning: #F5A524;  --warning-subtle: #2A1F0B;
  --danger:  #FF6B6E;  --danger-subtle:  #2E1415;
  --info:    #5EB1FF;  --info-subtle:    #0F1F33;
}
/* režim „podle systému“: stejné hodnoty jako dark v @media (prefers-color-scheme: dark),
   pokud uživatel nezvolil světlý režim ručně */
```

```css
/* apps/web/src/styles/app.css */
@import 'tailwindcss';
@import './tokens.css';
@theme inline {
  --color-app: var(--bg-app);       --color-sidebar: var(--bg-sidebar);
  --color-panel: var(--bg-panel);   --color-elevated: var(--bg-elevated);
  --color-hover: var(--bg-hover);   --color-active: var(--bg-active);
  --color-primary: var(--text-primary);  --color-secondary: var(--text-secondary);
  --color-tertiary: var(--text-tertiary);
  --color-accent: var(--accent);    --color-accent-subtle: var(--accent-subtle);
  --color-border: var(--border);    --color-border-subtle: var(--border-subtle);
  --color-success: var(--success);  --color-warning: var(--warning);
  --color-danger: var(--danger);    --color-info: var(--info);
  --radius-sm: var(--radius-sm);    --radius-md: var(--radius-md);  --radius-lg: var(--radius-lg);
  --font-sans: var(--font-sans);    --font-mono: var(--font-mono);
  --text-base: 13px;  --text-base--line-height: 20px;
}
```

**UI kit stránka**: route `/dev/ui` (jen ve vývoji a pro Ownera v produkci) ukazuje všechny komponenty ve všech stavech a velikostech, v obou režimech vedle sebe, plus vzorový seznam, kanban, detail a dialog s realistickými českými daty. Agent ji aktualizuje s každou novou komponentou a před každým PR s UI ji zkontroluje screenshotem (Playwright) v obou režimech.

**Kontrola před sloučením UI změny**

- [ ] Používá jen tokeny a komponenty z tohoto dokumentu.
- [ ] Funguje ve světlém i tmavém režimu a na 375 px šířce.
- [ ] Má stavy načítání, prázdný a chybový.
- [ ] Všechny akce jdou udělat klávesnicí a fokus je vidět.
- [ ] Projde seznamem „Zakázáno (anti-slop)“.
