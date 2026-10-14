# Systém mezer a rytmu (UI)

Všechny mezery jsou na mřížce 4 px (Tailwind `1` = 4 px). Žádné náhodné hodnoty typu `p-[13px]`, `py-3.5`, `mt-7`.
Povolené kroky: `0.5, 1, 1.5, 2, 3, 4, 5, 6, 8`. Půlkroky (`0.5`, `1.5`) jen uvnitř malých prvků
(chip, odkaz v buňce, popisek–pole), nikdy mezi bloky.

## Odsazení

| Místo                                           | Třídy                                                                                         | Poznámka                                                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Obsah stránky (scrollovací plocha pod záhlavím) | `p-4 md:p-6`                                                                                  | Přehled, Sklad, Stroje, Kalendář, Docházka, Fakturace, Inbox, Úkoly                       |
| Stránka Nastavení (`SettingsPage`)              | `p-4 md:p-6 lg:p-8`                                                                           | sloupec je vystředěný, `max-w-*`                                                          |
| Záhlaví stránky (`PageHeader`)                  | `h-11 px-4`                                                                                   | výška 44 px, `gap-3` mezi drobečky a akcemi                                               |
| Záznam: hlavička                                | `px-4 py-3 sm:px-5`                                                                           | text hlavičky = hrana karet v záložce                                                     |
| Záznam: lišta záložek                           | `ScrollTabsList px-1 sm:px-2`                                                                 | `TabsTrigger` má `px-3`, takže text záložky leží na stejné svislici jako hlavička a karty |
| Záznam: obsah záložky                           | `p-4 sm:p-5`                                                                                  | záložka modulu **nepřidává vlastní padding** (žádné `p-4`, `m-4` uvnitř)                  |
| Lišta pohledů seznamu                           | `px-1 pt-1.5` + `ViewTab px-3`                                                                | text záložky = levá hrana vyhledávání                                                     |
| Nástrojová lišta seznamu                        | `px-4 py-2`, `gap-2`                                                                          | na telefonu se akce posouvají do strany                                                   |
| Karta                                           | `rounded-lg border border-line p-4`                                                           | KPI dlaždice, sekce, boxy v záložkách                                                     |
| Karta v Nastavení (`FormSection`)               | `rounded-xl`, `px-5`, `pt/pb-5`                                                               | formulářově těžší, výjimka                                                                |
| Dialog: hlavička / tělo / patička               | `px-5 py-3` / `px-5 py-4` / `px-5 py-4`                                                       | tělo `space-y-3`; patička s tlačítky `flex justify-end gap-2`                             |
| Karta nástěnky (kanban)                         | `rounded-lg border border-line p-3`, `space-y-1` v těle, patička `mt-2`; mezi kartami `gap-2` | sloupec `w-72`, hlavička `px-3 pt-3`; jedna barva signálu na kartu                        |
| Pás fází (`PipelineStepper`)                    | `md` 40 px (`min-h-10`), `compact` 24 px, `mini` 20 px                                        | segmenty přes celou šířku, mezera 3/2 px, zaoblený začátek a konec                        |
| Karta v mobilním seznamu                        | `p-4`, mezi kartami `space-y-3`                                                               |                                                                                           |
| Skeleton v záložce / dialogu                    | bez `m-*` (záložka), `m-5` (dialog)                                                           |                                                                                           |

## Vertikální rytmus

- Mezi bloky na stránce a v záložce: `space-y-4`. Mezi sekcemi stránky (nadpis + obsah): `space-y-6` / `mt-6`.
- Nadpis sekce (`h2`, malé kapitálky) → obsah: `mb-2`. Nadpis karty → obsah: `mb-2`.
- Popisek → pole: `1.5` (`Label mb-1.5`, `TextField space-y-1.5`). Nápověda/chyba pod polem: `mt-1.5`.
- Pole ve formuláři pod sebou: `Field` má `mb-3`. V mřížce polí proto **`gap-x-3`**, ne `gap-3`
  (svislou mezeru už dává `mb-3`, jinak vznikne dvojitá).
- Alert / banner: `p-3`, `gap-2`.

## Mezery mezi prvky (`gap`)

| Kde                                          | Hodnota   |
| -------------------------------------------- | --------- |
| Toolbar, řádek tlačítek, akce v záhlaví      | `gap-2`   |
| Formulář (sloupce polí), KPI dlaždice        | `gap-3`   |
| Karty vedle sebe (sloupce stránky)           | `gap-4`   |
| Ikona + text v tlačítku, drobečky, chip řady | `gap-1.5` |
| Položka navigace (ikona + text)              | `gap-2`   |

## Výšky (jedna výška v jedné řadě)

| Prvek                                                                             | Výška                                                                                         |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Řádek tabulky, hlavička a patička tabulky                                         | 36 px (`h-9`)                                                                                 |
| Tlačítko v toolbaru / na stránce (`Button` `md`, `IconButton` `md`)               | 32 px (`h-8`)                                                                                 |
| Pole formuláře (`Input`, `Combobox`, `DatePicker`, `TextField density="compact"`) | 32 px (`h-8`)                                                                                 |
| Přepínač (`Segmented`, skupina Tabulka/Kanban, Měsíc/Týden)                       | 32 px (`min-h-8`, `p-0.5`, tlačítka se natáhnou)                                              |
| `Button size="sm"` (28 px)                                                        | jen uvnitř řádku seznamu/tabulky (Smazat, Podepsat) a v bublinách                             |
| Přihlašovací pole (`TextField` comfortable)                                       | 44 px                                                                                         |
| Štítek (`.chip`)                                                                  | 20 px                                                                                         |
| Dotyk (`pointer: coarse`)                                                         | min. 44 px (globální pravidlo ve `styles.css`; řádky atributů mají `pointer-coarse:min-h-11`) |

Pozor: pevné `h-8` na skupině s tlačítky na dotyku rozbije layout (tlačítka mají min. 44 px), proto `min-h-8`.

## Písmo

Stupnice z `styles.css` (`text-xs` 11,5 / `sm` 12,5 / `base` 13,5 / `lg` 15 / `xl` 18 / `2xl` 22 px). Na telefonu s dotykem (do 768 px) se `xs/sm/base` zvětší na 14 / 15 / 16 px; stupnice je v `@theme static` a přepisuje se proměnnými v mediálním dotazu (`@theme` uvnitř `@media` se nepodmiňuje, proto dříve platilo 16/15/14 px i na desktopu).

- Nadpis stránky (v `PageHeader`) `text-base font-semibold`; nadpis záznamu `text-xl`; úvodní „Dobrý den“ `text-2xl`.
- Nadpis karty `text-sm font-semibold`; podnadpis ve kartě `text-sm font-medium text-muted`.
- Nadpis sekce stránky `text-sm font-medium uppercase tracking-wide text-faint`.
- Popisek pole `text-sm font-medium text-muted`; hodnota `text-base`; nápověda `text-sm text-faint`.

## Postup při změně

1. Použij hodnoty z tabulek, nevymýšlej nové.
2. U sdílené komponenty měň třídy tam (`packages/ui`), ne v jednotlivých modulech.
3. Zkontroluj 1440 / 768 / 375 px, světlý i tmavý režim a to, že se na telefonu nic nezalamuje ven z obrazovky.

## Oddělování prvků

Cíl: aby se prvky neslévaly. Používá se **povrch, okraj a mezera**, ne jen tenká čára; změny jsou jemné a sdílené přes tokeny a primitiva, ne přebarvení obrazovek.

### Povrchy (tokeny ve `styles.css`)

| Token / třída               | Světlý    | Tmavý     | Použití                                                                        |
| --------------------------- | --------- | --------- | ------------------------------------------------------------------------------ |
| `--bg` / `bg-bg`            | `#fff`    | `#131417` | stránka, pop-up, záhlaví a lišta záložek                                       |
| `--bg-sunken` / `bg-sunken` | `#f1f1f4` | `#0e0f12` | podklad **pod kartami** (Přehled záznamu, Nastavení): karty se od něj odlišují |
| `--bg-card` / `bg-card`     | `#fff`    | `#181a1e` | povrch karty (`.card`, `Card`, `FormSection`)                                  |
| `--bg-subtle` / `bg-subtle` | `#f7f7f8` | `#191a1e` | záhlaví tabulky, patička karty, lišta záložek psacího panelu                   |

Pravidlo: každá úroveň je jen o stupeň světlejší nebo tmavší než sousední; karta na `bg-sunken` má okraj `--line` a stín `--shadow-card`, v tmavém režimu stačí okraj.

### Okraje

| Token                                  | Světlý    | Tmavý     | Použití                                                           |
| -------------------------------------- | --------- | --------- | ----------------------------------------------------------------- |
| `--line-soft` / `border-line-soft`     | `#eceef1` | `#25262c` | dělení **uvnitř** karty: řádky polí, řádky tabulky, patička karty |
| `--line` / `border-line`               | `#dcdce2` | `#33353d` | okraj karty, panelu, tabulky, záhlaví; dělení velkých částí       |
| `--line-strong` / `border-line-strong` | `#c8c9d1` | `#484a55` | okraj ovládacích prvků (pole, tlačítka, checkbox)                 |

### Rozestupy (blízkost = příbuznost)

- Uvnitř karty mezi řádky polí: `py-0.5` na řádek a čára `--line-soft`; mezi kartami v jednom sloupci `space-y-3`; mezi sloupci `gap-4` nebo svislá čára `--line`.
- Mezera mezi bloky je vždy větší než mezera uvnitř bloku (`space-y-3` mezi kartami × `py-0.5` mezi řádky).
- Hodnoty se **nezkracují**: v panelu údajů záznamu a v pop-upu se dlouhý text zalomí (`[overflow-wrap:anywhere]`, `CellValue wrap`). Zkracování `truncate` zůstává jen v tabulkách, kartách kanbanu a buňkách a plný text je pak v `title`.

### Primitiva (`packages/ui/src/components/surface.tsx`)

| Primitivum                | Co dělá                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `Card` (`.card`)          | povrch `--bg-card`, okraj `--line`, `rounded-lg`, stín `--shadow-card`                                                          |
| `CardHeader`              | záhlaví karty (`.card-head`): pruh s nadpisem `text-sm font-semibold`, ikonou, počtem a akcí vpravo, čára `--line-soft` pod ním |
| `CardBody`                | tělo `p-4`; `flush` bez odsazení (seznam, řádky polí)                                                                           |
| `FieldList` + `FieldRow`  | řádky „popisek — hodnota“: sloupec popisků `minmax(6rem,8rem)`, popisek se zalamuje, prázdné pole má tlumený popisek            |
| `FormSection` (Nastavení) | karta nastavení: záhlaví s čárou, tělo, patička `bg-subtle`; `SettingsPage` leží na `bg-sunken`                                 |

Starší karty zapsané jako `rounded-lg border border-line` dostanou stejný stín a povrch automaticky (pravidlo ve `styles.css`, vrstva `components`); nové karty používají `Card`.

### Příklad: pop-up zakázky CRM

```
┌ hlavička (jeden řádek, pevná): Nástěnka › stav / název · vlastník · sledující · Vyhráno · Prohráno · menu · zavřít ┐
│ pás stavů                                                                                                           │
├ lišta záložek (Přehled · Rozpočet · Soubory) ───────────────────────────────────────────────────────────────────────┤
│ levý sloupec (scroll)  clamp(24rem,36%,30rem) │ pravý sloupec (scroll)                                              │
│  Karta Souhrn (hodnota, termíny nahoře)       │  Karta psací panel (záložky Aktivita / Poznámka / Hovor)            │
│  Karta Osoba a Firma                          │  Karta Další kroky                                                   │
│  Karta Podrobnosti („2 z 4“ v záhlaví)        │  Karta Historie (filtry, osa s nití mezi položkami)                 │
│  Karta Účastníci · Původ · Přehled            │                                                                     │
└───────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────┘
```

- Šířka pop-upu `min(80rem, 100vw - 2rem)`, na telefonu celá obrazovka; dva sloupce od šířky pop-upu 52 rem, pod ní jeden sloupec (celý pop-up se posouvá, hlavička, pás stavů a záložky nahoře zůstávají).
- Každý sloupec se posouvá zvlášť, hlavička a pás stavů zůstávají vidět. Sekce levého sloupce jsou sbalitelné karty a stav sbalení si pamatuje prohlížeč (`crm.deal.section.<id>`).
- Pořadí polí podle důležitosti: Souhrn (hodnota, vážená hodnota, pravděpodobnost, uzavření, štítky) → Osoba a Firma → Podrobnosti → Účastníci → Původ (zdroj, kanál, kampaň) → Přehled.
- Prázdné pole: tlumený popisek i hodnota „Vyplnit…“; po najetí se zvýrazní řádek.
- Časová osa: bublina vlevo, svislá nit mezi položkami, rozestup `pb-5`.

### Kontrola

Zkontroluj 1440 / 1280 / 768 / 375 px, světlý i tmavý režim; neměnit výšku řádku tabulky 36 px, dotykové cíle 44 px ani virtualizaci seznamů.
