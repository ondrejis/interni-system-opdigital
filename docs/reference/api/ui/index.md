# @rebar/ui

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/ui` (soubor `packages/ui/src/index.ts`). Exportů: 260, z toho s popisem 176.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`AppShell`](#appshell) | function |  |  |
| [`AuthShell`](#authshell) | function | Společný rámec přihlášení, zapomenutého hesla, ověření a pozvánky: vlevo formulář, vpravo (od šířky `lg`) brandový panel. Název a barvu bere z brandingu klienta. |  |
| [`Avatar`](#avatar) | function |  |  |
| [`BarChart`](#barchart) | function | Sloupcový graf: svislý nebo vodorovný, skládaný nebo seskupený (více řad vedle sebe). Šířka se řídí kontejnerem; popisky kategorií se podle místa zkracují, otáčejí nebo přeskakují. |  |
| [`BottomNav`](#bottomnav) | function | Spodní navigace pro práci jednou rukou na telefonu (jen pod šířkou `md`). Každá položka má dotykovou plochu aspoň 56 px na výšku; aktivní položka je zvýrazněná i pro čtečky (`aria-current`). |  |
| [`BrandMark`](#brandmark) | function | Logo klienta, nebo monogram z jeho názvu. |  |
| [`Button`](#button) | function |  |  |
| [`Card`](#card) | function | Karta: povrch s okrajem a jemným stínem (třída `.card` ve `styles.css`). |  |
| [`CardBody`](#cardbody) | function | Tělo karty: odsazení `p-4`; `flush` je bez něj (seznam nebo řádky polí přes celou šířku karty). |  |
| [`CardHeader`](#cardheader) | function | Záhlaví karty: pruh s nadpisem (`text-sm font-semibold`), volitelnou ikonou, počtem a akcí vpravo, od těla odděleno jemnou čárou. Nadpis je `h3`, pokud `heading` neurčí jinak. |  |
| [`CellEditor`](#celleditor) | function | Editor hodnoty v buňce podle typu atributu. Enter ukládá, Esc ruší, Tab ukládá a přejde dál, ztráta fokusu ukládá. Výběry a datum se otevřou rovnou jako popover. |  |
| [`CellValue`](#cellvalue) | function | Zobrazení hodnoty atributu podle typu (v buňce tabulky, na kartě i v panelu atributů). Výchozí je jednořádkové zkrácení (tabulka, karta kanbanu; plný text je v `title`). S `wrap` (panel údajů záznamu) se dlouhý text zalomí na víc řádků a nic se nezkracuje. |  |
| [`ChartLegend`](#chartlegend) | function | Legenda grafu. `inline` je řádek značek pod grafem, `list` svislý seznam s hodnotami a podíly. Barva je jen ve značce, text zůstává v barvách textu; tvar značky nese rozlišení i bez barev. |  |
| [`ChartTooltip`](#charttooltip) | function | Jednoduchý tooltip bez portálu. Leží uvnitř `position: relative` kontejneru grafu a souřadnice [x, y] jsou v pixelech kontejneru. Je jen vizuální (`aria-hidden`): totéž čte čtečka z popisku prvku a z datové tabulky. `top` sedí nad bodem (pod něj se překlopí u horního okraje), `side` vedle bodu na tu stranu, kde je víc místa. |  |
| [`Checkbox`](#checkbox) | function |  |  |
| [`Chip`](#chip) | function | Barevný štítek (stav, role, typ). Barva nese význam — bez významu zůstává šedá. |  |
| [`Combobox`](#combobox) | function | Výběr z možností s hledáním (bez diakritiky díky vlastnímu filtru), jedna i více hodnot. |  |
| [`CommandPalette`](#commandpalette) | function | Cmd/Ctrl+K (HLE-01…07): bez zadání nedávné záznamy a nejčastější příkazy (`idleGroups`), při psaní nálezy ze serveru seskupené podle typu (`search`) a příkazy, které odpovídají textu. Nálezy naskakují během psaní (bez čekání na pauzu, předchozí výsledky zůstávají, dokud nepřijdou nové). |  |
| [`ConfirmDialog`](#confirmdialog) | function | Potvrzení nevratné nebo dopadové akce (smazání, deaktivace, změna role). `onConfirm` může být asynchronní; když vrátí `false`, dialog zůstane otevřený. |  |
| [`ContactActionBar`](#contactactionbar) | function | Velká tlačítka rychlých akcí pro telefon (MOB-03, MOB-04): Zavolat, SMS, WhatsApp, E-mail, Navigovat, Disk. Každé tlačítko má výšku aspoň 48 px; chybí-li údaj, tlačítko se nezobrazí. Na šířce od `sm` se mřížka skryje (počítač má vlastní odkazy v záhlaví a v kartách). |  |
| [`CreateDialog`](#createdialog) | function | Vytvoření záznamu: jen povinná pole a název, ostatní po rozkliknutí. Cmd/Ctrl+Enter odešle. |  |
| [`DashboardApiProvider`](#dashboardapiprovider) | function |  |  |
| [`DashboardGrid`](#dashboardgrid) | function | Mřížka nástěnky (12 sloupců na počítači, na telefonu jeden). V režimu úprav se widgety přetahují (myš, dotyk i klávesnice) a mění se jejich velikost; jinak se jen zobrazují a každý se načítá samostatně. |  |
| [`DashboardSwitcher`](#dashboardswitcher) | function | Přepínač nástěnek na úvodní stránce: klasický Přehled a nástěnky uživatele. Mobil: vodorovný posuvný pruh. |  |
| [`DashboardView`](#dashboardview) | function | Jedna nástěnka: filtry (období, zakázka, osoba), mřížka widgetů, úpravy (přidat, přesunout, změnit velikost, upravit, odebrat), uložení s kontrolou souběžné změny, klon, sdílení, smazání a exporty (PDF, PNG). Chyba jednoho widgetu nerozbije ostatní. |  |
| [`DataTable`](#datatable) | function |  |  |
| [`DatePicker`](#datepicker) | function | Výběr data (hodnota je ISO `RRRR-MM-DD`). |  |
| [`DesktopOnly`](#desktoponly) | function | Záměrně omezené na mobilu (MOB-09): editor oprávnění, editor šablon, editor struktury Disku a úpravy přehledu (na telefonu jen pořadí widgetů) se na telefonu nezobrazují; místo nich je jasná zpráva. Komponentu obalí vlastník editoru: `<DesktopOnly what="Editor šablon">…editor…</DesktopOnly>`. Na počítači vykreslí obsah beze změny. |  |
| [`DialogContent`](#dialogcontent) | function |  |  |
| [`DonutChart`](#donutchart) | function | Koláč / prstenec. Zobrazí nejvýše 8 největších výřezů, zbytek je „Ostatní“. Legenda ukazuje hodnotu a podíl, takže graf lze číst i bez rozlišování barev. Koláč se hodí na podíl celku u pár položek; na porovnání blízkých hodnot je lepší sloupcový graf. |  |
| [`DropdownMenuCheckboxItem`](#dropdownmenucheckboxitem) | function |  |  |
| [`DropdownMenuContent`](#dropdownmenucontent) | function |  |  |
| [`DropdownMenuItem`](#dropdownmenuitem) | function |  |  |
| [`DropdownMenuLabel`](#dropdownmenulabel) | function |  |  |
| [`DropdownMenuSeparator`](#dropdownmenuseparator) | function |  |  |
| [`EmptyState`](#emptystate) | function | Prázdný stav vždy vysvětlí, co tu bude, a nabídne hlavní akci. |  |
| [`EntityApiProvider`](#entityapiprovider) | function | Aplikace dodá implementaci `EntityApi` (server actions); komponenty ji berou z kontextu. |  |
| [`EntityList`](#entitylist) | function | Seznam záznamů entity: tabulka nebo kanban, pohledy, filtry, hledání, hromadné akce a detail v bočním panelu. |  |
| [`ExportDialog`](#exportdialog) | function | Export seznamu: formát, rozsah (aktuální pohled s filtry a řazením, nebo všechno), výběr sloupců, název souboru, šablony (uložená sada sloupců a filtrů, sdílená v týmu). Co se smí exportovat, určuje server (oprávnění, skryté sloupce). |  |
| [`Field`](#field) | function | Popisek + pole + nápověda/chyba pod ním. |  |
| [`FieldList`](#fieldlist) | function | Seznam řádků polí v kartě (řádky odděluje `--line-soft`). |  |
| [`FieldRow`](#fieldrow) | function | Řádek „popisek — hodnota“: popisek vlevo (zalamuje se, nezkracuje), hodnota vpravo (dlouhý text se zalomí bez přetečení). `below` je doplněk pod hodnotou (kontakt firmy), `hint` nápověda drobným písmem. |  |
| [`FilterBar`](#filterbar) | function | Filtr na jednom místě: tlačítko „Filtr“ a vedle něj aktivní podmínky (jen v rámci řádku, kde není místo na dvě části). |  |
| [`FiltersBar`](#filtersbar) | function | Filtry nástěnky: období, zakázka, osoba. Propisují se do widgetů a do adresy (sdílitelný odkaz). |  |
| [`FormSection`](#formsection) | function | Karta sekce nastavení: záhlaví, tělo a volitelná patička s akcemi (primární vpravo). `flush` odstraní odsazení těla, např. pro tabulku nebo seznam přes celou šířku karty. |  |
| [`Gauge`](#gauge) | function | Měřidlo plnění cíle: vodorovný pruh se značkou cíle. Pod cílem modře, splněno zeleně, přesah nad cíl jiným odstínem (u `lowerIsBetter` červeně). Stav je i slovy, takže význam nestojí jen na barvě. |  |
| [`Icon`](#icon) | function | Ikona podle názvu z manifestu modulu (neznámý název = obecná ikona seznamu). |  |
| [`IconButton`](#iconbutton) | function | Tlačítko jen s ikonou; `label` je povinný název pro čtečky a tooltip. |  |
| [`Input`](#input) | function |  |  |
| [`InstallHint`](#installhint) | function | Pokyn „Přidat OPSYS na plochu“ (MOB-10) pro Nastavení → Vzhled nebo Profil. Android: tlačítko Nainstalovat; iPhone Safari: návod Sdílet → Přidat na plochu; už nainstalováno nebo nepodporováno: nic (komponenta nevykreslí nic). |  |
| [`Kanban`](#kanban) | function |  |  |
| [`KanbanInteractive`](#kanbaninteractive) | function | Obal interaktivního prvku na kartě (tlačítko, popover): klik, tah ani klávesa v něm kartu neotevřou ani nepřesunou. Použije ho modul v `footer` karty; sloty `topRight` / `bottomRight` jím jsou obalené samy. |  |
| [`Kbd`](#kbd) | function |  |  |
| [`Label`](#label) | function |  |  |
| [`LineChart`](#linechart) | function | Čárový nebo plošný graf časové řady. Čára se přeruší u `null`. Najetí i fokus na kategorii ukáže svislici a v tooltipu hodnoty všech řad; mezi kategoriemi se chodí šipkami. |  |
| [`ModuleUiProvider`](#moduleuiprovider) | function |  |  |
| [`MoneyInput`](#moneyinput) | function | Pole pro částku: uživatel píše „125 000“ nebo „1 250,50“, hodnota jde ven v haléřích (`null` = prázdné nebo neplatné). Neplatný vstup se označí, ale neztratí se. |  |
| [`NavProvider`](#navprovider) | function | Design system nezná router; aplikace mu ho předá. |  |
| [`NewBoardDialog`](#newboarddialog) | function | Pojmenování nové nástěnky. |  |
| [`Notice`](#notice) | function | Zpráva ve formuláři. Chyba se čtečkám oznámí hned (`role="alert"`), ostatní zprávy slušně (`status`). |  |
| [`OfflineBridge`](#offlinebridge) | function | Nad spodní lištou ukáže „jste offline, jen ke čtení“, zapíše `data-offline` na `<html>` (CSS pak zablokuje odesílací tlačítka), registruje service worker (jen v ostrém provozu) a drží kopii posledních načtených dat v mezipaměti prohlížeče. Po otevření bez spojení se tato data vrátí do paměti dotazů, takže jdou číst. Zápisy se nefrontují. |  |
| [`OrderDialog`](#orderdialog) | function | Pořadí nástěnek v přepínači (moje osobní řazení; přetažením nebo klávesnicí). |  |
| [`OtpInput`](#otpinput) | function | Kód o pevném počtu číslic v samostatných polích. Uvnitř je jediný skutečný `<input>` (vložení ze schránky, automatické doplnění z SMS/aplikace i čtečky fungují přirozeně), políčka jsou jen jeho zobrazení. |  |
| [`PageHeader`](#pageheader) | function | Hlavička stránky: drobečky, přepínač pohledů a akce. |  |
| [`PageSkeleton`](#pageskeleton) | function | Kostra stránky, která se ukáže hned po kliknutí v navigaci, ještě než dorazí data. Drží stejné rozměry jako skutečná stránka (záhlaví, nástrojová lišta, řádky), takže obsah nepoposkočí. |  |
| [`PaletteActionsProvider`](#paletteactionsprovider) | function | Drží kontextové akce paletky (Cmd+K), které si registrují zobrazené komponenty (např. otevřený záznam). |  |
| [`PaletteHost`](#palettehost) | function | Paleta Cmd+K nad daty aplikace: příkazy z `paletteActions` zapnutých modulů (podle oprávnění), „Nový …“ pro entity, které modul nedeklaroval, Přejít na…, Přepnout téma; nálezy ze serveru seskupené podle typu s podtitulkem a akcemi (zavolat, zkopírovat telefon, napsat e-mail, otevřít Disk); bez zadání nedávné záznamy a nejčastější příkazy. |  |
| [`PasswordField`](#passwordfield) | function | Pole pro heslo se zobrazením/skrytím a upozorněním na zapnutý Caps Lock. |  |
| [`PasswordStrength`](#passwordstrength) | function | Indikátor síly hesla s kontrolním seznamem požadavků. |  |
| [`PhotoDialog`](#photodialog) | function | Fotky z terénu: vybrat zakázku (naposledy použitá je předvyplněná), vyfotit nebo vybrat z galerie, zmenšit a odeslat na pozadí. Fotka se nejdřív uloží do zařízení, takže se neztratí ani bez signálu. |  |
| [`PipelineStepper`](#pipelinestepper) | function | Pás fází jako šipky (chevrony) přes celou dostupnou šířku: šířka se dělí úměrně délce názvu (v mini pásu stejně), hotové fáze jsou zeleně, aktuální v barvě akcentu, budoucí šedě. V detailu (`md`) je v segmentu název a pod ním dny ve fázi; dlouhý název se zkrátí a celý je v tooltipu. Klik přesune záznam do fáze, zamčený přechod ukáže důvod v tooltipu. Na úzkém displeji se pás posouvá do stran uvnitř sebe (stránka se nerozšíří) a aktuální fáze se sama vystředí. |  |
| [`Placeholder`](#placeholder) | function | Zástupná stránka pro část systému, která se teprve staví (kostra S0). Modul ji vrací z `ui.pages`, dokud nemá skutečný obsah; plný obsah ji nahradí. |  |
| [`PopoverContent`](#popovercontent) | function |  |  |
| [`RealtimeBridge`](#realtimebridge) | function | Připojí prohlížeč na `/api/realtime` a při změně u druhého uživatele zneplatní dotazy dotčených entit (`["entity", <klíč>]`), příkazové dotazy modulů (`["command", …]`), koš a historii. Změna je vidět do 2 s bez obnovení stránky. `onChange` slouží k obnově serverově vykreslených stránek (např. `router.refresh()`). |  |
| [`RecordDialog`](#recorddialog) | function | Detail záznamu v pop-upu, široký až 1280 px (pod ~1300 px obrazovky téměř celou šířku, na telefonu celou obrazovku). Obsah je `RecordView` v režimu `dialog`: hlavička, pás od modulu (`recordHeader`), záložky i akce modulu fungují jako na stránce záznamu. Seznam pod pop-upem se nepřekresluje, takže filtr, hledání i pozice v nástěnce zůstanou. |  |
| [`RecordView`](#recordview) | function |  |  |
| [`RelatedRecords`](#relatedrecords) | function | Související záznamy uvnitř detailu (vady zakázky, osoby firmy…): stejný seznam jako jinde (inline editace, panel, vytvoření), jen s pevným filtrem na rodiče a předvyplněným rodičem při vytvoření. |  |
| [`SegmentedControl`](#segmentedcontrol) | function | Přepínač jedné možnosti ze 2–3 (např. „Ne / Jen moje / Vše“). Přístupná skupina voleb, šipky přepínají. |  |
| [`SettingsPage`](#settingspage) | function | Stránka nastavení: posuvná plocha s jednotným záhlavím (ikona, nadpis, popis, akce vpravo) a obsahem ve sloupci. Plocha je o stupeň tmavší než karty (`bg-sunken`), aby se karty odlišily od podkladu. |  |
| [`ShareDialog`](#sharedialog) | function | Sdílení nástěnky s rolemi a konkrétními lidmi. Každý, komu je sdílená, vidí v widgetech jen data, na která má sám oprávnění; sdílení tedy neodemyká žádná data. |  |
| [`Sheet`](#sheet) | function |  |  |
| [`ShortcutsDialog`](#shortcutsdialog) | function | Přehled zkratek (klávesa `?`). |  |
| [`SignaturePad`](#signaturepad) | function | Plocha pro podpis prstem nebo myší. `onChange` dostane PNG s průhledným pozadím, nebo `null`, když je plocha prázdná. Funguje s dotykem i myší (pointer events); `touch-action: none` brání posouvání stránky při kreslení. |  |
| [`Skeleton`](#skeleton) | function |  |  |
| [`Slot`](#slot) | function | Vykreslí komponenty, které moduly přispěly do slotu `name`, se stejnými props: `<Slot name="task.dialog.extras" taskId={id} />`. |  |
| [`Sparkline`](#sparkline) | function | Drobná čára pro KPI: tlumená, jen poslední bod v barvě grafu. Přeruší se u `null`. |  |
| [`TabsList`](#tabslist) | function |  |  |
| [`TabsTrigger`](#tabstrigger) | function |  |  |
| [`TextField`](#textfield) | function | Pole formuláře pro přihlašovací a účtové stránky: popisek nad polem, ikona, nápověda a chyba pod ním. |  |
| [`Textarea`](#textarea) | function |  |  |
| [`ThemeSwitch`](#themeswitch) | function |  |  |
| [`Toaster`](#toaster) | function | Oznámení vpravo dole. U vratných akcí se používá `undoToast`, potvrzovací dialog jen u nevratných. |  |
| [`Tooltip`](#tooltip) | function |  |  |
| [`TooltipProvider`](#tooltipprovider) | function |  |  |
| [`VatRatesProvider`](#vatratesprovider) | function | Aplikace dodá sazby DPH platné dnes (z Nastavení); moduly je nabízejí u položek dokladů a rozpočtu. |  |
| [`VisibilityLock`](#visibilitylock) | function | Zámek viditelnosti v hlavičce záznamu (SPOL-12, VID-03). Vlastník (`private.read`) ho přepíná: soukromý záznam a jeho podřízené záznamy (úkoly, poznámky, platby, hodiny) nikdy neuvidí ostatní. U záznamu, který zámek jen dědí (hodiny, fáze), nebo zámek zdědil od nadřazeného záznamu, ukáže stav bez možnosti přepnutí. Ostatním se nezobrazí nic. Moduly s vlastní hlavičkou (`recordHeader`) ho přidají samy. |  |
| [`WidgetBody`](#widgetbody) | function | Obsah widgetu podle druhu výsledku. Výsledek je už filtrovaný oprávněními na serveru; tady se jen zobrazuje. |  |
| [`WidgetCard`](#widgetcard) | function | Karta widgetu: záhlaví s nabídkou, načítání, chyba (česká hláška), obsah. Načítá se samostatně a souběžně s ostatními. |  |
| [`addressText`](#addresstext) | function | Adresa jedním řádkem (prázdné části se vynechají); null, když není z čeho skládat. |  |
| [`axisTickLabel`](#axisticklabel) | function | Popisek značky osy. Krátký tvar („1,2 mil.“), ale u jemných kroků přesný, aby se hodnoty nezaokrouhlily na stejné číslo. |  |
| [`brandStyle`](#brandstyle) | function | Akcentová barva klienta do CSS proměnných. Text na akcentu je bílý, nebo tmavý podle toho, který má vyšší kontrast (u středně světlých barev, třeba oranžové, vychází lépe tmavý; bílý by nesplnil WCAG AA 4,5 : 1). |  |
| [`buildTopTabs`](#buildtoptabs) | function | Složí lištu záložek: skupiny a samostatné záložky seřazené podle `order` (stabilně). |  |
| [`cn`](#cn) | function | Spojí třídy a vyřeší konflikty Tailwindu (poslední vyhrává). |  |
| [`colorFor`](#colorfor) | function | Stabilní barva avataru podle jména. |  |
| [`completeFilters`](#completefilters) | function | Je podmínka úplná a smí se poslat na server? Nedokončené chipy se z dotazu vynechají. |  |
| [`compressImage`](#compressimage) | function | Zmenší fotku z telefonu před odesláním (typicky z 5–10 MB na ~300 kB), aby prošla i slabým signálem. Respektuje otočení z EXIF. Cokoli, co zmenšit nejde (jiný formát, chybí podpora prohlížeče), vrátí beze změny. |  |
| [`contactActions`](#contactactions) | function | Sada akcí pro kartu: pořadí Zavolat, SMS, WhatsApp, E-mail, Navigovat, Disk. Akce bez údaje se vynechá, `only` omezí výběr (karta kontaktu: telefon + e-mail; karta klienta: Zavolat, E-mail, Navigovat, Disk). |  |
| [`defineModuleUi`](#definemoduleui) | function |  |  |
| [`elementToPng`](#elementtopng) | function | Uloží prvek stránky jako obrázek PNG (stažení souboru). |  |
| [`emptyBoard`](#emptyboard) | function | Prázdná definice nové nástěnky. |  |
| [`errorToast`](#errortoast) | function |  |  |
| [`findModulePage`](#findmodulepage) | function |  |  |
| [`initials`](#initials) | function |  |  |
| [`installState`](#installstate) | function | Jak nabídnout instalaci na plochu (MOB-10): spuštěno jako aplikace = „installed“; prohlížeč nabídl `beforeinstallprompt` = „prompt“ (tlačítko); iPhone/iPad Safari = „ios“ (návod Sdílet → Přidat na plochu). |  |
| [`isMac`](#ismac) | function |  |  |
| [`mailHref`](#mailhref) | function | Odkaz `mailto:` pro napsání e-mailu; null u neplatné adresy. |  |
| [`mapsLink`](#mapslink) | function | Adresa v mapách: univerzální odkaz Google Maps, který telefon nabídne otevřít v aplikaci map. |  |
| [`mergeModuleUi`](#mergemoduleui) | function | Složí UI oblastí modulu do jednoho `ModuleUi`. Mapy podle klíče entity se spojují (pole se zřetězí; u hlaviček a hlaviček sloupců platí první oblast, která je dodá; karta kanbanu se skládá pole po poli), stránky a příkazy palety se přidají za sebe. |  |
| [`modKey`](#modkey) | function |  |  |
| [`niceScale`](#nicescale) | function | Osa s „hezkými“ hodnotami. Zvládá samé nuly, jedinou hodnotu, záporné hodnoty i velké částky v haléřích. |  |
| [`niceStep`](#nicestep) | function | Nejbližší „hezký“ krok (1, 2, 5 × 10^k) nad `raw`; u minut navíc časové kroky. |  |
| [`notifyQueued`](#notifyqueued) | function | Oznámení, že velký export běží na pozadí. |  |
| [`passwordStrength`](#passwordstrength) | function | Jak dobré je heslo: server vyžaduje jen délku, ostatní je doporučení. |  |
| [`plainValue`](#plainvalue) | function | Text hodnoty pro exporty a hledání (bez formátování komponent). |  |
| [`readRecordParam`](#readrecordparam) | function | Id záznamu z `?record=` (`null`, když chybí nebo je prázdné). |  |
| [`runExport`](#runexport) | function | Spustí export na serveru. Malý se rovnou stáhne, velký se zařadí do fronty (odpověď 202) a čeká v „Moje exporty“. |  |
| [`runLastUndo`](#runlastundo) | function | Provede poslední vratnou akci, pokud je ještě v 10s okně. Vrací, zda se něco vrátilo. |  |
| [`seriesColor`](#seriescolor) | function | Barva řady podle pořadí (token); od 9. řady neutrální šedá, žádné generované odstíny. |  |
| [`shouldOpenStartSearch`](#shouldopenstartsearch) | function | Má se po otevření aplikace samo otevřít Hledat? |  |
| [`smsHref`](#smshref) | function | Odkaz `sms:` pro napsání zprávy; null, když číslo není použitelné. |  |
| [`successToast`](#successtoast) | function |  |  |
| [`telHref`](#telhref) | function | Odkaz `tel:` pro zavolání; null, když číslo není použitelné. |  |
| [`undoToast`](#undotoast) | function | Toast s tlačítkem „Vrátit“ (vratná akce; zpětná změna se provede až po kliknutí nebo Cmd/Ctrl+Z, do 10 s, R-24). Platí jen poslední vratná akce. |  |
| [`useCan`](#usecan) | function | Zda má přihlášený uživatel oprávnění (jen pro skrývání prvků UI; server kontroluje vždy). |  |
| [`useCommandMutation`](#usecommandmutation) | function | Spuštění příkazu modulu; po úspěchu zneplatní uvedené klíče (nebo všechny dotazy příkazů a záznamů). |  |
| [`useCommandQuery`](#usecommandquery) | function | Dotaz na příkaz modulu (`api.command`) s cache TanStack Query; klíč tvoří jméno a vstup. |  |
| [`useDashboardApi`](#usedashboardapi) | function | Rozhraní nástěnek z kontextu; mimo `DashboardApiProvider` je to chyba. |  |
| [`useDensity`](#usedensity) | function | Aktuální hustota řádků: čte `data-density` na `<html>` (nastaví ji `themeScript` při načtení a Nastavení → Vzhled při změně) a sleduje jeho změny, takže se tabulka přepočítá hned po přepnutí. |  |
| [`useElementWidth`](#useelementwidth) | function | Šířka prvku sledovaná přes ResizeObserver. Vrací `[ref, šířka]`; ref patří na kontejner grafu. Na serveru, při prvním vykreslení a bez ResizeObserveru je to `fallback` (600 px), takže SSR se shoduje s hydratací. |  |
| [`useEntityApi`](#useentityapi) | function |  |  |
| [`useEntityDescriptor`](#useentitydescriptor) | function | Popis entity (atributy, stavy, oprávnění); sdílená mezipaměť s `RelatedRecords`, takže se načte jednou. |  |
| [`useEntityRecord`](#useentityrecord) | function | Jeden záznam entity s popisky vazeb (stejná mezipaměť jako detail záznamu, takže inline úpravy ji obnoví). |  |
| [`useEntitySummary`](#useentitysummary) | function | Počet a součty za celou filtrovanou sadu (patička tabulky); nezávisí na tom, kolik řádků je načteno. |  |
| [`useHotkeys`](#usehotkeys) | function | Globální klávesové zkratky. Klíče: `mod+k` (Cmd na Macu, Ctrl jinde), `?`, `c`, dvoutlačítkové sekvence `g z` (do 900 ms po sobě). Jednoznakové zkratky se při psaní do pole nespouští; `mod+…` a `Escape` fungují vždy. |  |
| [`useInvalidateEntity`](#useinvalidateentity) | function |  |  |
| [`useIsMobile`](#useismobile) | function | Zda je obrazovka užší než `md` (768 px). Na serveru a při prvním vykreslení vrací false, pak se opraví. |  |
| [`useKanbanExtensions`](#usekanbanextensions) | function | Rozšíření kanbanu od zapnutých modulů pro entitu (první nalezené vyhrává, jako u `recordHeader`). |  |
| [`useModuleUi`](#usemoduleui) | function |  |  |
| [`useNav`](#usenav) | function |  |  |
| [`useOnline`](#useonline) | function | Je zařízení připojené? Na serveru a při prvním vykreslení „ano“ (bez bliknutí), pak se opraví. |  |
| [`usePaletteActions`](#usepaletteactions) | function | Zaregistruje akce do paletky, dokud je komponenta zobrazená. `items` je potřeba zapamatovat (`useMemo`). |  |
| [`usePendingUploads`](#usependinguploads) | function | Počet fotek, které čekají na odeslání (odznak ve spodní navigaci). |  |
| [`useRecordDialogExt`](#userecorddialogext) | function | Vlastní podoba pop-upu od zapnutých modulů pro entitu (první nalezená vyhrává). |  |
| [`useRecordExtensions`](#userecordextensions) | function |  |  |
| [`useRecordParam`](#userecordparam) | function | Otevřený záznam v adrese (`?record=<id>`). Otevření přidá položku do historie, zavření se vrátí (`history.back()`), takže tlačítko Zpět zavře pop-up a filtr i pozice v seznamu zůstanou, protože stránka se nepřekresluje. Odkaz s `?record=` otevře pop-up rovnou (`initial` z adresy ze serveru brání probliknutí). Router aplikace (`history.pushState` je v Next.js propojený s routerem) se nevolá, stránka se nenačítá znovu. |  |
| [`useSlotComponents`](#useslotcomponents) | function | Komponenty všech zapnutých modulů pro slot hostitele (v pořadí modulů). Hostitel o přispěvatelích neví; bez přispěvatele je výsledek prázdný. |  |
| [`useUndoShortcut`](#useundoshortcut) | function | Cmd/Ctrl+Z vrátí poslední vratnou akci (smazání, hromadná změna); v textovém poli zůstává běžné „zpět“. |  |
| [`useUpdateAttribute`](#useupdateattribute) | function | Inline úprava jednoho atributu. Změna se hned ukáže (optimisticky); když ji server odmítne, vrátí se původní stav a chyba se předá volajícímu (buňka ji ukáže). |  |
| [`useVatRates`](#usevatrates) | function |  |  |
| [`useVisualViewportVar`](#usevisualviewportvar) | function | Výška viditelné části okna (bez klávesnice) jako CSS proměnná `--vvh`. iOS Safari při otevřené klávesnici nezmenšuje `100dvh`, takže celoobrazovkové Hledat by schovalo seznam pod klávesnici; styly používají `height: var(--vvh, 100dvh)`. |  |
| [`vatBpChoices`](#vatbpchoices) | function | Sazby (v setinách procenta) k nabídnutí ve výběru, od nejvyšší. K nabízeným se přidají `extra` (sazby, které už doklad obsahuje, i když dnes neplatí), aby se hodnota řádku neztratila. |  |
| [`whatsappHref`](#whatsapphref) | function | Odkaz `wa.me` pro WhatsApp (číslo v mezinárodním tvaru); null, když číslo není použitelné. |  |
| [`withRecordParam`](#withrecordparam) | function | Adresa s nastaveným nebo odebraným `record`. Záložka detailu (`tab`, `sub`) se zahodí, když se mění záznam nebo se zavírá; ostatní parametry (`pohled`, filtry…) zůstanou. `keepTab` zachová záložku (otevření přímým odkazem). |  |
| [`ApiError`](#apierror) | class | Chyba z `ActionResult` jako výjimka — TanStack Query a toasty s ní umí pracovat. |  |
| [`AUTH_LINK_BUTTON`](#auth_link_button) | const | Odkaz vzhledem primárního tlačítka (např. „Požádat o nový odkaz“). |  |
| [`AUTH_SUBMIT`](#auth_submit) | const | Třídy tlačítka odeslání na přihlašovacích stránkách (použije se s `Button variant="primary"`). |  |
| [`CHART_EMPTY_TEXT`](#chart_empty_text) | const |  |  |
| [`Dialog`](#dialog) | const |  |  |
| [`DialogClose`](#dialogclose) | const |  |  |
| [`DialogTrigger`](#dialogtrigger) | const |  |  |
| [`DropdownMenu`](#dropdownmenu) | const |  |  |
| [`DropdownMenuTrigger`](#dropdownmenutrigger) | const |  |  |
| [`FIELD_LABEL_COLUMN`](#field_label_column) | const | Šířka sloupce popisků u řádků polí; stejná v celém detailu, aby popisky ležely pod sebou. |  |
| [`LABEL_COLORS`](#label_colors) | const |  |  |
| [`Popover`](#popover) | const |  |  |
| [`PopoverAnchor`](#popoveranchor) | const |  |  |
| [`PopoverTrigger`](#popovertrigger) | const |  |  |
| [`RECORD_PARAM`](#record_param) | const | Adresa otevřeného záznamu v pop-upu (`?record=<id>`): čisté funkce bez prohlížeče, aby šly testovat. |  |
| [`ROW_HEIGHTS`](#row_heights) | const | Výška řádku tabulky podle hustoty (NAS-05): pohodlná 36 px, kompaktní 28 px. |  |
| [`TYPE_ICONS`](#type_icons) | const | Ikona typu atributu — v záhlaví sloupce, ve filtrech a v panelu atributů. |  |
| [`Tabs`](#tabs) | const |  |  |
| [`TabsContent`](#tabscontent) | const |  |  |
| [`dashKeys`](#dashkeys) | const |  |  |
| [`entityKeys`](#entitykeys) | const |  |  |
| [`themeScript`](#themescript) | const | Skript na začátku `<body>`: nastaví téma a hustotu řádků (`data-density`) před vykreslením, aby stránka při načtení nezablikala. |  |
| [`ActivityResult`](#activityresult) | type |  |  |
| [`AuthBrand`](#authbrand) | type |  |  |
| [`BarChartProps`](#barchartprops) | type |  |  |
| [`BottomItem`](#bottomitem) | type |  |  |
| [`BulkAction`](#bulkaction) | type | Hromadná akce nad vybranými řádky seznamu (např. „Odeslat e-mailem“ u faktur); běží v okně, které modul vykreslí sám. |  |
| [`ButtonProps`](#buttonprops) | type |  |  |
| [`ChartCategory`](#chartcategory) | type | Kategorie na ose (sloupec, den, zakázka). `href` ji dělá klikatelnou, `color` přebarví sloupec u grafu s jednou řadou. |  |
| [`ChartLegendItem`](#chartlegenditem) | type |  |  |
| [`ChartSeries`](#chartseries) | type | Datová řada; `values` jsou po kategoriích, `null` = bez dat (mezera). |  |
| [`ChartTooltipRow`](#charttooltiprow) | type |  |  |
| [`ChartValueFormat`](#chartvalueformat) | type | Jak se hodnota ukazuje: peníze jsou v haléřích, `minutes` v minutách (7:30 h), `hours` v desetinných hodinách. |  |
| [`ComboOption`](#combooption) | type |  |  |
| [`ComboboxProps`](#comboboxprops) | type |  |  |
| [`ContactAction`](#contactaction) | type | Jedna rychlá akce: popisek, ikona a odkaz. |  |
| [`ContactActionKind`](#contactactionkind) | type | Druh rychlé akce na kartě kontaktu nebo klienta. |  |
| [`DashboardApi`](#dashboardapi) | type | Vše, co UI nástěnek potřebuje od serveru. Komponenty nezná server actions ani route handlery; aplikace jim rozhraní dodá (`apps/web/src/lib/dashboard-api.ts`). Chyby se hlásí výjimkou s čitelnou hláškou. |  |
| [`Density`](#density) | type | Hustota řádků v seznamech a tabulkách (Nastavení → Vzhled). |  |
| [`DonutChartProps`](#donutchartprops) | type |  |  |
| [`DonutSliceInput`](#donutsliceinput) | type |  |  |
| [`EntityApi`](#entityapi) | type | Vše, co data-driven UI potřebuje od serveru. Komponenty ve `@rebar/ui` neznají Next.js ani server actions; aplikace jim tohle rozhraní dodá (server actions, v testech atrapa). Chyby se hlásí výjimkou s čitelnou hláškou. |  |
| [`ExportFormat`](#exportformat) | type | Formát souboru exportu seznamu. |  |
| [`ExportQuery`](#exportquery) | type | Pohled seznamu, který se exportuje: filtry, řazení, hledání. |  |
| [`ExportRequest`](#exportrequest) | type | Požadavek na export seznamu (formát, rozsah, sloupce, pohled, název souboru). |  |
| [`ExportTemplateInfo`](#exporttemplateinfo) | type | Šablona exportu (uložená sada sloupců a filtrů). |  |
| [`FileItem`](#fileitem) | type |  |  |
| [`FilterAttributeGroup`](#filterattributegroup) | type | Skupina atributů v nabídce „Filtr“: modul si ji pro entitu definuje výčtem klíčů (`EntityList` prop `filterGroups`). Atribut, který žádná skupina nezmiňuje, spadne do „Vlastní pole“ (je-li vlastní) nebo do „Ostatní“. |  |
| [`GaugeProps`](#gaugeprops) | type |  |  |
| [`InstallState`](#installstate) | type | Stav instalace na plochu: nainstalováno, nabídka prohlížeče, návod pro iPhone, nepodporováno. |  |
| [`KanbanCardContext`](#kanbancardcontext) | type | Co dostane rozšíření karty kanbanu: řádek, popisky vazeb a výchozí tělo, které může modul doplnit. |  |
| [`KanbanCardExtension`](#kanbancardextension) | type | Rozšíření karty kanbanu pro jednu entitu. Vše je nepovinné; co modul nedodá, vypadá jako dřív. Komponenty se vykreslují jako prvky Reactu, takže smí používat hooky (dotaz, popover…). Kliky a tažení uvnitř `topRight` / `bottomRight` kartu neotevírají ani nepřesouvají; ve `footer` je to na modulu (interaktivní prvky obalí `KanbanInteractive`), aby šla celá řádka patičky použít i pro text. |  |
| [`KanbanColumnContext`](#kanbancolumncontext) | type | Co dostane doplňující řádek v hlavičce sloupce kanbanu (vážený součet, počet po termínu…). |  |
| [`KanbanDropTarget`](#kanbandroptarget) | type | Cílový sloupec vedle sloupců stavů (Vyhráno, Prohráno…): objeví se při tahu karty a karta se na něj nepřesouvá, jen se zavolá `onDrop` (modul typicky otevře dialog). Karta zůstane tam, kde byla. |  |
| [`LineChartProps`](#linechartprops) | type |  |  |
| [`Lookups`](#lookups) | type | Načítání možností pro výběr uživatele a odkazovaného záznamu (provádí aplikace přes server). |  |
| [`ModulePage`](#modulepage) | type | Stránka modulu mimo seznamy entit (týdenní docházka, pohyby skladu, kalendář…). |  |
| [`ModuleUi`](#moduleui) | type | Dlaždice přehledu, kterou kreslí modul sám (data dodává `widgets` na serveru). |  |
| [`NavApi`](#navapi) | type |  |  |
| [`NavItem`](#navitem) | type |  |  |
| [`NavSection`](#navsection) | type |  |  |
| [`NiceScale`](#nicescale) | type |  |  |
| [`PaletteAction`](#paletteaction) | type | Příkaz do palety (Cmd+K), který modul nabízí („Nový obchod“, „Zapsat hodiny“…). Buď `href` (přejít), nebo `run`. Vykresluje paletu C3; typ je tady, aby moduly mohly akce deklarovat hned. |  |
| [`PaletteGroup`](#palettegroup) | type |  |  |
| [`PaletteHit`](#palettehit) | type | Nález hledání ze serveru (`SearchHit` z `@rebar/core/entities`; tvar je tu opsaný, aby UI nezávisel na serveru). |  |
| [`PaletteHostProps`](#palettehostprops) | type | Vstupy palety Cmd+K: navigace, entity k zakládání, funkce hledání a nedávných záznamů. |  |
| [`PaletteItem`](#paletteitem) | type |  |  |
| [`PaletteRecent`](#paletterecent) | type | Naposledy otevřený záznam (z `recent_record`). |  |
| [`PaletteRowAction`](#paletterowaction) | type | Akce u řádku, která nic neotevírá (zavolat, zkopírovat telefon, napsat e-mail, otevřít Disk). |  |
| [`PipelineStage`](#pipelinestage) | type | Čistá logika pásu fází (bez Reactu), aby šla testovat samostatně. |  |
| [`PipelineStepperProps`](#pipelinestepperprops) | type | Vlastnosti `PipelineStepper`. |  |
| [`QuickCondition`](#quickcondition) | type | Navržená („rychlá“) podmínka: nabídne se v nabídce „Filtr“ ve skupině „Návrhy“ a jedním kliknutím přidá hotovou podmínku (chybí-li jí hodnota, rovnou se otevře její editor). Nabídne se jen tehdy, když atribut existuje a smí se filtrovat. |  |
| [`RecordAction`](#recordaction) | type | Akce v hlavičce detailu (např. „Vytvořit fakturu“, „Převést na zakázku“). |  |
| [`RecordDialogExt`](#recorddialogext) | type | Vlastní podoba detailu v pop-upu (`RecordDialog`, `EntityList openMode="dialog"`): modul nahradí hlavičku a Přehled a omezí lištu záložek. Stránka záznamu (`/zakazky/<id>`) se tím nemění. Komponenty smějí používat hooky. |  |
| [`RecordDialogParts`](#recorddialogparts) | type | Co dostane vlastní hlavička a vlastní Přehled pop-upu (`RecordDialogExt`). |  |
| [`RecordHeader`](#recordheader) | type | Pás pod názvem záznamu (čísla, hlavní akce podle stavu…). |  |
| [`RecordOpenMode`](#recordopenmode) | type | Kde se záznam otevře po kliku: vlastní stránka (výchozí), boční panel nad seznamem, nebo pop-up s `?record=<id>`. |  |
| [`RecordOverviewCard`](#recordoverviewcard) | type | Karta na Přehledu záznamu. Karty z různých modulů se skládají pod sebe (podle `order`); modul tak přidá „poslední zápis z deníku“, „nespárované náklady“ apod. bez zásahu do záložky Přehled. |  |
| [`RecordResult`](#recordresult) | type |  |  |
| [`RecordTab`](#recordtab) | type | Záložka na detailu záznamu, kterou nabízí modul (např. Materiál na zakázce). |  |
| [`RecordTabGroup`](#recordtabgroup) | type | Skupina záložek na detailu (jedna záložka v liště, uvnitř přepínač). |  |
| [`SavedViewInfo`](#savedviewinfo) | type |  |  |
| [`SegmentOption`](#segmentoption) | type |  |  |
| [`ShellProps`](#shellprops) | type |  |  |
| [`ShortcutGroup`](#shortcutgroup) | type |  |  |
| [`SourceCatalog`](#sourcecatalog) | type | Zdroje, ze kterých smí uživatel skládat widgety (entity, metriky) a role pro sdílení. |  |
| [`SparklineProps`](#sparklineprops) | type |  |  |
| [`StepState`](#stepstate) | type | Stav jedné fáze v pásu vůči aktuální: hotová, aktuální, budoucí. |  |
| [`TextFieldProps`](#textfieldprops) | type |  |  |
| [`TimelineItem`](#timelineitem) | type |  |  |
| [`TopTab`](#toptab) | type | Záložka v liště detailu: samostatná záložka modulu, nebo skupina záložek s přepínačem. |  |
| [`VatChoice`](#vatchoice) | type | Sazba DPH z Nastavení; `rateBp` v setinách procenta (21 % = 2100). |  |
| [`VatRates`](#vatrates) | type |  |  |
| [`ViewConfig`](#viewconfig) | type |  |  |
| [`ViewGroupDef`](#viewgroupdef) | type | Skupina uložených pohledů v nabídce pohledů (pořadí skupin určuje pořadí v poli `ViewLayout.groups`). |  |
| [`ViewLayout`](#viewlayout) | type | Uspořádání pohledů seznamu: nejčastější jsou záložky, ostatní jedna nabídka po skupinách. Bez tohoto nastavení zůstává pás záložek se všemi pohledy. |  |
| [`ViewMeta`](#viewmeta) | type | Zařazení jednoho uloženého pohledu: skupina, krátký popis, kratší název do nabídky a zda je mezi viditelnými záložkami. |  |

Re-exporty z externích knihoven: `toast` (`.pnpm`).

### AppShell

function · `packages/ui/src/shell/app-shell.tsx`

_Bez popisu._

```ts
function AppShell({ brand, user, top, sections, footer, pathname, onSearch, onLogout, settingsHref, securityHref, accountHref, bottomNav, children, }: ShellProps): import("react").JSX.Element
```

### AuthShell

function · `packages/ui/src/components/auth-shell.tsx`

Společný rámec přihlášení, zapomenutého hesla, ověření a pozvánky: vlevo formulář,
vpravo (od šířky `lg`) brandový panel. Název a barvu bere z brandingu klienta.

```ts
function AuthShell({ brand, title, description, icon, footer, children, }: { brand: AuthBrand; title: string; description?: ReactNode; /** Ikona nad nadpisem (jen pro stránky, kde pomáhá pochopit situaci). */ icon?: ReactNode; /** Pod formulářem, např. odkaz zpět na přihlášení. */ footer?: ReactNode; children: ReactNode; }): import("react").JSX.Element
```

### Avatar

function · `packages/ui/src/components/badges.tsx`

_Bez popisu._

```ts
function Avatar({ name, size = 20, className, }: { name: string; size?: number; className?: string; }): import("react").JSX.Element
```

### BarChart

function · `packages/ui/src/charts/bar-chart.tsx`

Sloupcový graf: svislý nebo vodorovný, skládaný nebo seskupený (více řad vedle sebe).
Šířka se řídí kontejnerem; popisky kategorií se podle místa zkracují, otáčejí nebo přeskakují.

```ts
function BarChart({ categories, series, stacked = false, horizontal = false, format, height, ariaLabel, onSelect, className, }: BarChartProps): import("react").JSX.Element
```

### BottomNav

function · `packages/ui/src/shell/bottom-nav.tsx`

Spodní navigace pro práci jednou rukou na telefonu (jen pod šířkou `md`). Každá položka má dotykovou plochu
aspoň 56 px na výšku; aktivní položka je zvýrazněná i pro čtečky (`aria-current`).

```ts
function BottomNav({ items, pathname, }: { items: BottomItem[]; pathname: string; }): ReactNode
```

### BrandMark

function · `packages/ui/src/components/auth-shell.tsx`

Logo klienta, nebo monogram z jeho názvu.

```ts
function BrandMark({ brand, className, tone = "default", }: { brand: AuthBrand; className?: string; tone?: "default" | "inverse"; }): import("react").JSX.Element
```

### Button

function · `packages/ui/src/components/button.tsx`

_Bez popisu._

```ts
function Button({ className, variant, size, loading, children, disabled, type = "button", ref, ...rest }: ButtonProps): import("react").JSX.Element
```

### Card

function · `packages/ui/src/components/surface.tsx`

Karta: povrch s okrajem a jemným stínem (třída `.card` ve `styles.css`).

```ts
function Card({ as, className, ...rest }: { as?: ElementType } & Omit<ComponentProps<"section">, "ref">): import("react").JSX.Element
```

### CardBody

function · `packages/ui/src/components/surface.tsx`

Tělo karty: odsazení `p-4`; `flush` je bez něj (seznam nebo řádky polí přes celou šířku karty).

```ts
function CardBody({ flush, className, ...rest }: { flush?: boolean } & ComponentProps<"div">): import("react").JSX.Element
```

### CardHeader

function · `packages/ui/src/components/surface.tsx`

Záhlaví karty: pruh s nadpisem (`text-sm font-semibold`), volitelnou ikonou, počtem a akcí vpravo,
od těla odděleno jemnou čárou. Nadpis je `h3`, pokud `heading` neurčí jinak.

```ts
function CardHeader({ title, icon, count, action, heading: Heading = "h3", className, children, }: { title?: ReactNode; icon?: ReactNode; count?: ReactNode; action?: ReactNode; heading?: ElementType; className?: string; children?: ReactNode; }): import("react").JSX.Element
```

### CellEditor

function · `packages/ui/src/data/editors.tsx`

Editor hodnoty v buňce podle typu atributu. Enter ukládá, Esc ruší, Tab ukládá a přejde dál,
ztráta fokusu ukládá. Výběry a datum se otevřou rovnou jako popover.

```ts
function CellEditor(props: EditorProps): import("react").JSX.Element
```

### CellValue

function · `packages/ui/src/data/cell.tsx`

Zobrazení hodnoty atributu podle typu (v buňce tabulky, na kartě i v panelu atributů).
Výchozí je jednořádkové zkrácení (tabulka, karta kanbanu; plný text je v `title`). S `wrap` (panel údajů záznamu)
se dlouhý text zalomí na víc řádků a nic se nezkracuje.

```ts
function CellValue({ attr, value, labels, className, wrap, }: { attr: AttributeDescriptor; value: unknown; labels?: Labels | undefined; className?: string; wrap?: boolean; }): import("react").JSX.Element | null
```

### ChartLegend

function · `packages/ui/src/charts/chart-legend.tsx`

Legenda grafu. `inline` je řádek značek pod grafem, `list` svislý seznam s hodnotami a podíly.
Barva je jen ve značce, text zůstává v barvách textu; tvar značky nese rozlišení i bez barev.

```ts
function ChartLegend({ items, layout = "inline", activeKey, onHover, className, label = "Legenda", }: { items: ChartLegendItem[]; layout?: "inline" | "list"; activeKey?: string | null; /** Najetí na položku (pro zvýraznění výřezu); `null` při opuštění. */ onHover?: (key: string | null) => void; className?: string; label?: string; }): import("react").JSX.Element | null
```

### ChartTooltip

function · `packages/ui/src/charts/chart-tooltip.tsx`

Jednoduchý tooltip bez portálu. Leží uvnitř `position: relative` kontejneru grafu a souřadnice [x, y]
jsou v pixelech kontejneru. Je jen vizuální (`aria-hidden`): totéž čte čtečka z popisku prvku a z datové tabulky.
`top` sedí nad bodem (pod něj se překlopí u horního okraje), `side` vedle bodu na tu stranu, kde je víc místa.

```ts
function ChartTooltip({ x, y, width, placement = "top", title, rows, }: { x: number; y: number; /** Šířka kontejneru v px. */ width: number; placement?: "top" | "side"; title?: string; rows: ChartTooltipRow[]; }): import("react").JSX.Element
```

### Checkbox

function · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
function Checkbox({ className, ...rest }: ComponentProps<typeof C.Root>): import("react").JSX.Element
```

### Chip

function · `packages/ui/src/components/badges.tsx`

Barevný štítek (stav, role, typ). Barva nese význam — bez významu zůstává šedá.

```ts
function Chip({ color = "gray", dot, className, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { color?: string; dot?: boolean }): import("react").JSX.Element
```

### Combobox

function · `packages/ui/src/components/combobox.tsx`

Výběr z možností s hledáním (bez diakritiky díky vlastnímu filtru), jedna i více hodnot.

```ts
function Combobox({ options, load, value, selectedLabels = {}, onChange, multiple, placeholder = "Vybrat…", searchPlaceholder = "Hledat…", emptyText = "Nic nenalezeno", clearable, renderOption, trigger, "aria-label": ariaLabel, className, disabled, open: openProp, onOpenChange, }: ComboboxProps): import("react").JSX.Element
```

### CommandPalette

function · `packages/ui/src/components/command-palette.tsx`

Cmd/Ctrl+K (HLE-01…07): bez zadání nedávné záznamy a nejčastější příkazy (`idleGroups`), při psaní nálezy ze serveru
seskupené podle typu (`search`) a příkazy, které odpovídají textu. Nálezy naskakují během psaní (bez čekání na
pauzu, předchozí výsledky zůstávají, dokud nepřijdou nové).

```ts
function CommandPalette({ open, onOpenChange, groups, idleGroups = [], search, onRun, }: { open: boolean; onOpenChange: (o: boolean) => void; /** Příkazy a navigace: filtruje je cmdk podle zadaného textu. */ groups: PaletteGroup[]; /** Jen při prázdném poli: nedávné záznamy a nejčastější příkazy. */ idleGroups?: PaletteGroup[]; /** Nálezy ze serveru podle textu, už seskupené. */ search?: (q: string) => Promise<PaletteGroup[]>; /** Zavolá se po výběru řádku (např. započítání použití příkazu). */ onRun?: (item: PaletteItem) => void; }): import("react").JSX.Element
```

### ConfirmDialog

function · `packages/ui/src/components/confirm-dialog.tsx`

Potvrzení nevratné nebo dopadové akce (smazání, deaktivace, změna role).
`onConfirm` může být asynchronní; když vrátí `false`, dialog zůstane otevřený.

```ts
function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Potvrdit", cancelLabel = "Zrušit", danger, onConfirm, children, }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; onConfirm: () => void | boolean | Promise<void | boolean>; children?: ReactNode; }): import("react").JSX.Element
```

### ContactActionBar

function · `packages/ui/src/mobile/contact-action-bar.tsx`

Velká tlačítka rychlých akcí pro telefon (MOB-03, MOB-04): Zavolat, SMS, WhatsApp, E-mail, Navigovat, Disk.
Každé tlačítko má výšku aspoň 48 px; chybí-li údaj, tlačítko se nezobrazí. Na šířce od `sm` se mřížka skryje
(počítač má vlastní odkazy v záhlaví a v kartách).

```ts
function ContactActionBar({ phone, email, address, driveUrl, only, desktop = false, className, }: { phone?: string | null; email?: string | null; address?: string | null; driveUrl?: string | null; only?: readonly ContactActionKind[]; /** Zobrazit i na počítači (výchozí jen pod šířkou `sm`). */ desktop?: boolean; className?: string; }): import("react").JSX.Element | null
```

### CreateDialog

function · `packages/ui/src/data/create-dialog.tsx`

Vytvoření záznamu: jen povinná pole a název, ostatní po rozkliknutí. Cmd/Ctrl+Enter odešle.

```ts
function CreateDialog({ entity, open, onOpenChange, defaults, onCreated }: Props): import("react").JSX.Element
```

### DashboardApiProvider

function · `packages/ui/src/dashboards/api.tsx`

_Bez popisu._

```ts
function DashboardApiProvider({ api, children, }: { api: DashboardApi; children: ReactNode; }): import("react").JSX.Element
```

### DashboardGrid

function · `packages/ui/src/dashboards/dashboard-grid.tsx`

Mřížka nástěnky (12 sloupců na počítači, na telefonu jeden). V režimu úprav se widgety přetahují (myš, dotyk i klávesnice)
a mění se jejich velikost; jinak se jen zobrazují a každý se načítá samostatně.

```ts
function DashboardGrid({ widgets, filters, refreshKey, autoRefreshMs, editing, reorderOnly, onChange, onEdit, hideMenu, }: Props): import("react").JSX.Element
```

### DashboardSwitcher

function · `packages/ui/src/dashboards/dashboard-switcher.tsx`

Přepínač nástěnek na úvodní stránce: klasický Přehled a nástěnky uživatele. Mobil: vodorovný posuvný pruh.

```ts
function DashboardSwitcher({ boards, activeId, overviewHref, boardHref, onCreate, createLabel, onOrder, }: { boards: DashboardSummary[]; /** Id aktivní nástěnky, `null` = klasický Přehled. */ activeId: string | null; /** Adresa klasického Přehledu; bez ní se záložka „Přehled“ nezobrazí (OPSYS: každý přehled je nástěnka). */ overviewHref?: string | undefined; boardHref: (id: string) => string; onCreate?: (() => void) | undefined; /** Popisek tlačítka pro založení (výchozí „Nová nástěnka“). */ createLabel?: string | undefined; onOrder?: (() => void) | undefined; }): import("react").JSX.Element
```

### DashboardView

function · `packages/ui/src/dashboards/dashboard-view.tsx`

Jedna nástěnka: filtry (období, zakázka, osoba), mřížka widgetů, úpravy (přidat, přesunout, změnit velikost, upravit,
odebrat), uložení s kontrolou souběžné změny, klon, sdílení, smazání a exporty (PDF, PNG). Chyba jednoho widgetu
nerozbije ostatní.

```ts
function DashboardView({ boardId, filters, onFiltersChange, canWrite, jobsAvailable, tvHref, onDeleted, onCloned, }: Props): import("react").JSX.Element
```

### DataTable

function · `packages/ui/src/data/data-table.tsx`

_Bez popisu._

```ts
function DataTable(p: DataTableProps): import("react").JSX.Element
```

### DatePicker

function · `packages/ui/src/components/date-picker.tsx`

Výběr data (hodnota je ISO `RRRR-MM-DD`).

```ts
function DatePicker({ value, onChange, placeholder = "Vybrat datum", clearable = true, trigger, className, disabled, open: openProp, onOpenChange, }: { value: string | null; onChange: (v: string | null) => void; placeholder?: string; clearable?: boolean; trigger?: ReactNode; className?: string; disabled?: boolean; open?: boolean; onOpenChange?: (o: boolean) => void; }): import("react").JSX.Element
```

### DesktopOnly

function · `packages/ui/src/mobile/desktop-only.tsx`

Záměrně omezené na mobilu (MOB-09): editor oprávnění, editor šablon, editor struktury Disku a úpravy přehledu
(na telefonu jen pořadí widgetů) se na telefonu nezobrazují; místo nich je jasná zpráva. Komponentu obalí
vlastník editoru: `<DesktopOnly what="Editor šablon">…editor…</DesktopOnly>`. Na počítači vykreslí obsah beze změny.

```ts
function DesktopOnly({ what, children, hint, }: { /** Co se na telefonu nedá dělat („Editor šablon zakázek“). */ what: string; children: ReactNode; /** Doplňující věta (výchozí: otevřít na počítači). */ hint?: string; }): import("react").JSX.Element
```

### DialogContent

function · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
function DialogContent({ title, description, className, children, ...rest }: ComponentProps<typeof D.Content> & { title: string; description?: string }): import("react").JSX.Element
```

### DonutChart

function · `packages/ui/src/charts/donut-chart.tsx`

Koláč / prstenec. Zobrazí nejvýše 8 největších výřezů, zbytek je „Ostatní“. Legenda ukazuje hodnotu a podíl,
takže graf lze číst i bez rozlišování barev. Koláč se hodí na podíl celku u pár položek; na porovnání blízkých
hodnot je lepší sloupcový graf.

```ts
function DonutChart({ slices: input, format, donut = true, centerLabel, centerValue, ariaLabel, className, }: DonutChartProps): import("react").JSX.Element
```

### DropdownMenuCheckboxItem

function · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
function DropdownMenuCheckboxItem({ className, children, ...rest }: ComponentProps<typeof M.CheckboxItem>): import("react").JSX.Element
```

### DropdownMenuContent

function · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
function DropdownMenuContent({ className, align = "end", sideOffset = 6, ...rest }: ComponentProps<typeof M.Content>): import("react").JSX.Element
```

### DropdownMenuItem

function · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
function DropdownMenuItem({ className, danger, inset, ...rest }: ComponentProps<typeof M.Item> & { danger?: boolean; inset?: boolean }): import("react").JSX.Element
```

### DropdownMenuLabel

function · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
function DropdownMenuLabel({ className, ...rest }: ComponentProps<typeof M.Label>): import("react").JSX.Element
```

### DropdownMenuSeparator

function · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
function DropdownMenuSeparator({ className, ...rest }: ComponentProps<typeof M.Separator>): import("react").JSX.Element
```

### EmptyState

function · `packages/ui/src/components/badges.tsx`

Prázdný stav vždy vysvětlí, co tu bude, a nabídne hlavní akci.

```ts
function EmptyState({ icon, title, description, action, }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; }): import("react").JSX.Element
```

### EntityApiProvider

function · `packages/ui/src/data/context.tsx`

Aplikace dodá implementaci `EntityApi` (server actions); komponenty ji berou z kontextu.

```ts
function EntityApiProvider({ api, children }: { api: EntityApi; children: ReactNode }): import("react").JSX.Element
```

### EntityList

function · `packages/ui/src/data/entity-list.tsx`

Seznam záznamů entity: tabulka nebo kanban, pohledy, filtry, hledání, hromadné akce a detail v bočním panelu.

```ts
function EntityList({ entity, initialViewId, createDefaults, renderOverview, autoOpenCreate, baseFilters, compact, initialExportTemplate, openMode = "page", basePath, initialRecordId, initialRecordTab, initialRecordSub, kanban, defaultFilters, allViewLabel = "Všechny", quickConditions, filterGroups, viewLayout, recordDialog, defaultConfig, hideViewToggle, }: Props): import("react").JSX.Element
```

### ExportDialog

function · `packages/ui/src/data/export-dialog.tsx`

Export seznamu: formát, rozsah (aktuální pohled s filtry a řazením, nebo všechno), výběr sloupců, název souboru,
šablony (uložená sada sloupců a filtrů, sdílená v týmu). Co se smí exportovat, určuje server (oprávnění, skryté sloupce).

```ts
function ExportDialog({ open, onOpenChange, entityKey, entityLabel, attributes, currentColumns, query, total, initialTemplateId, }: { open: boolean; onOpenChange: (o: boolean) => void; entityKey: string; entityLabel: string; attributes: AttributeDescriptor[]; /** Sloupce zobrazené v tabulce (výchozí výběr). */ currentColumns: string[]; query: ExportQuery; total: number | undefined; initialTemplateId?: string | undefined; }): import("react").JSX.Element
```

### Field

function · `packages/ui/src/components/input.tsx`

Popisek + pole + nápověda/chyba pod ním.

```ts
function Field({ label, error, hint, htmlFor, children, }: { label: string; error?: string | undefined; hint?: string; htmlFor?: string; children: React.ReactNode; }): import("react").JSX.Element
```

### FieldList

function · `packages/ui/src/components/surface.tsx`

Seznam řádků polí v kartě (řádky odděluje `--line-soft`).

```ts
function FieldList({ className, ...rest }: ComponentProps<"div">): import("react").JSX.Element
```

### FieldRow

function · `packages/ui/src/components/surface.tsx`

Řádek „popisek — hodnota“: popisek vlevo (zalamuje se, nezkracuje), hodnota vpravo (dlouhý text se zalomí
bez přetečení). `below` je doplněk pod hodnotou (kontakt firmy), `hint` nápověda drobným písmem.

```ts
function FieldRow({ label, icon, children, hint, below, empty, className, ...rest }: { label: ReactNode; icon?: ReactNode; children: ReactNode; hint?: ReactNode; below?: ReactNode; /** Prázdná hodnota: popisek je tlumenější, aby se prázdná pole nepletla s vyplněnými. */ empty?: boolean; className?: string; } & Omit<ComponentProps<"div">, "children">): import("react").JSX.Element
```

### FilterBar

function · `packages/ui/src/data/filter-bar.tsx`

Filtr na jednom místě: tlačítko „Filtr“ a vedle něj aktivní podmínky (jen v rámci řádku, kde není místo na dvě části).

```ts
function FilterBar(props: Props): import("react").JSX.Element
```

### FiltersBar

function · `packages/ui/src/dashboards/filters-bar.tsx`

Filtry nástěnky: období, zakázka, osoba. Propisují se do widgetů a do adresy (sdílitelný odkaz).

```ts
function FiltersBar({ value, onChange, jobsAvailable, }: { value: DashboardFilters; onChange: (f: DashboardFilters) => void; /** Zakázky jsou k dispozici (zapnutý modul a oprávnění). */ jobsAvailable: boolean; }): import("react").JSX.Element
```

### FormSection

function · `packages/ui/src/components/settings-page.tsx`

Karta sekce nastavení: záhlaví, tělo a volitelná patička s akcemi (primární vpravo).
`flush` odstraní odsazení těla, např. pro tabulku nebo seznam přes celou šířku karty.

```ts
function FormSection({ title, description, icon, badge, footer, flush, tone = "default", className, children, ...rest }: { title: string; description?: ReactNode; icon?: ReactNode; /** Štítek vpravo v záhlaví (např. stav). */ badge?: ReactNode; footer?: ReactNode; flush?: boolean; tone?: "default" | "danger"; className?: string; children?: ReactNode; } & Omit<React.HTMLAttributes<HTMLElement>, "title">): import("react").JSX.Element
```

### Gauge

function · `packages/ui/src/charts/gauge.tsx`

Měřidlo plnění cíle: vodorovný pruh se značkou cíle. Pod cílem modře, splněno zeleně, přesah nad cíl
jiným odstínem (u `lowerIsBetter` červeně). Stav je i slovy, takže význam nestojí jen na barvě.

```ts
function Gauge({ value, target, format, label, lowerIsBetter = false, className, }: GaugeProps): import("react").JSX.Element
```

### Icon

function · `packages/ui/src/lib/icons.tsx`

Ikona podle názvu z manifestu modulu (neznámý název = obecná ikona seznamu).

```ts
function Icon({ name, className }: { name: string; className?: string }): import("react").JSX.Element
```

### IconButton

function · `packages/ui/src/components/button.tsx`

Tlačítko jen s ikonou; `label` je povinný název pro čtečky a tooltip.

```ts
function IconButton({ label, className, size = "md", variant = "ghost", children, ...rest }: IconButtonProps): import("react").JSX.Element
```

### Input

function · `packages/ui/src/components/input.tsx`

_Bez popisu._

```ts
function Input({ className, ref, ...rest }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }): import("react").JSX.Element
```

### InstallHint

function · `packages/ui/src/mobile/install-hint.tsx`

Pokyn „Přidat OPSYS na plochu“ (MOB-10) pro Nastavení → Vzhled nebo Profil. Android: tlačítko Nainstalovat;
iPhone Safari: návod Sdílet → Přidat na plochu; už nainstalováno nebo nepodporováno: nic (komponenta nevykreslí nic).

```ts
function InstallHint(): import("react").JSX.Element | null
```

### Kanban

function · `packages/ui/src/data/kanban.tsx`

_Bez popisu._

```ts
function Kanban({ entity, titleKey, statusAttr, attributes, cardAttributes, params, canWrite, onOpen, onMove, openId, dropTargets, onShortcut, shortcutKeys = DEFAULT_SHORTCUT_KEYS, onAddCard, }: Props): import("react").JSX.Element
```

### KanbanInteractive

function · `packages/ui/src/data/kanban.tsx`

Obal interaktivního prvku na kartě (tlačítko, popover): klik, tah ani klávesa v něm kartu neotevřou ani nepřesunou.
Použije ho modul v `footer` karty; sloty `topRight` / `bottomRight` jím jsou obalené samy.

```ts
function KanbanInteractive({ className, children, }: { className?: string | undefined; children: ReactNode; }): import("react").JSX.Element
```

### Kbd

function · `packages/ui/src/components/badges.tsx`

_Bez popisu._

```ts
function Kbd({ children, className }: { children: React.ReactNode; className?: string }): import("react").JSX.Element
```

### Label

function · `packages/ui/src/components/input.tsx`

_Bez popisu._

```ts
function Label({ className, ...rest }: LabelHTMLAttributes<HTMLLabelElement>): import("react").JSX.Element
```

### LineChart

function · `packages/ui/src/charts/line-chart.tsx`

Čárový nebo plošný graf časové řady. Čára se přeruší u `null`. Najetí i fokus na kategorii ukáže svislici
a v tooltipu hodnoty všech řad; mezi kategoriemi se chodí šipkami.

```ts
function LineChart({ categories, series, area = false, format, height, ariaLabel, className, }: LineChartProps): import("react").JSX.Element
```

### ModuleUiProvider

function · `packages/ui/src/data/module-ui.tsx`

_Bez popisu._

```ts
function ModuleUiProvider({ all, enabled, permissions, children, }: { all: Record<string, ModuleUi>; enabled: readonly string[]; permissions: readonly string[]; children: ReactNode; }): import("react").JSX.Element
```

### MoneyInput

function · `packages/ui/src/data/money-input.tsx`

Pole pro částku: uživatel píše „125 000“ nebo „1 250,50“, hodnota jde ven v haléřích (`null` = prázdné nebo neplatné).
Neplatný vstup se označí, ale neztratí se.

```ts
function MoneyInput({ value, onChange, placeholder, className, "aria-label": ariaLabel, id, }: { value: number | null; onChange: (minor: number | null) => void; placeholder?: string; className?: string; "aria-label"?: string; id?: string; }): import("react").JSX.Element
```

### NavProvider

function · `packages/ui/src/nav.tsx`

Design system nezná router; aplikace mu ho předá.

```ts
function NavProvider({ value, children }: { value: NavApi; children: ReactNode }): import("react").JSX.Element
```

### NewBoardDialog

function · `packages/ui/src/dashboards/board-dialogs.tsx`

Pojmenování nové nástěnky.

```ts
function NewBoardDialog({ open, onOpenChange, onCreate, }: { open: boolean; onOpenChange: (o: boolean) => void; onCreate: (name: string) => Promise<void>; }): import("react").JSX.Element
```

### Notice

function · `packages/ui/src/components/form-controls.tsx`

Zpráva ve formuláři. Chyba se čtečkám oznámí hned (`role="alert"`), ostatní zprávy slušně (`status`).

```ts
function Notice({ tone = "info", title, children, className, }: { tone?: NoticeTone; title?: string; children?: ReactNode; className?: string; }): import("react").JSX.Element
```

### OfflineBridge

function · `packages/ui/src/mobile/offline-bridge.tsx`

Nad spodní lištou ukáže „jste offline, jen ke čtení“, zapíše `data-offline` na `<html>` (CSS pak zablokuje odesílací
tlačítka), registruje service worker (jen v ostrém provozu) a drží kopii posledních načtených dat v mezipaměti
prohlížeče. Po otevření bez spojení se tato data vrátí do paměti dotazů, takže jdou číst. Zápisy se nefrontují.

```ts
function OfflineBridge({ userId, pathname }: { userId: string; pathname: string }): import("react").JSX.Element | null
```

### OrderDialog

function · `packages/ui/src/dashboards/board-dialogs.tsx`

Pořadí nástěnek v přepínači (moje osobní řazení; přetažením nebo klávesnicí).

```ts
function OrderDialog({ open, onOpenChange, boards, onSave, }: { open: boolean; onOpenChange: (o: boolean) => void; boards: DashboardSummary[]; onSave: (ids: string[]) => Promise<void>; }): import("react").JSX.Element
```

### OtpInput

function · `packages/ui/src/components/form-controls.tsx`

Kód o pevném počtu číslic v samostatných polích. Uvnitř je jediný skutečný `<input>`
(vložení ze schránky, automatické doplnění z SMS/aplikace i čtečky fungují přirozeně),
políčka jsou jen jeho zobrazení.

```ts
function OtpInput({ label, value, onChange, length = 6, autoFocus, invalid, hint, id, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "size" | "maxLength"> & { label: string; value: string; onChange: (v: string) => void; length?: number; invalid?: boolean; hint?: ReactNode; }): import("react").JSX.Element
```

### PageHeader

function · `packages/ui/src/shell/app-shell.tsx`

Hlavička stránky: drobečky, přepínač pohledů a akce.

```ts
function PageHeader({ breadcrumbs, actions, children, }: { breadcrumbs: { label: string; href?: string }[]; actions?: ReactNode; children?: ReactNode; }): import("react").JSX.Element
```

### PageSkeleton

function · `packages/ui/src/components/page-skeleton.tsx`

Kostra stránky, která se ukáže hned po kliknutí v navigaci, ještě než dorazí data.
Drží stejné rozměry jako skutečná stránka (záhlaví, nástrojová lišta, řádky), takže obsah nepoposkočí.

```ts
function PageSkeleton({ rows = 9, className }: { rows?: number; className?: string }): import("react").JSX.Element
```

### PaletteActionsProvider

function · `packages/ui/src/components/palette-actions.tsx`

Drží kontextové akce paletky (Cmd+K), které si registrují zobrazené komponenty (např. otevřený záznam).

```ts
function PaletteActionsProvider({ children, }: { children: (items: PaletteItem[]) => ReactNode; }): import("react").JSX.Element
```

### PaletteHost

function · `packages/ui/src/palette/palette-host.tsx`

Paleta Cmd+K nad daty aplikace: příkazy z `paletteActions` zapnutých modulů (podle oprávnění), „Nový …“ pro entity,
které modul nedeklaroval, Přejít na…, Přepnout téma; nálezy ze serveru seskupené podle typu s podtitulkem a akcemi
(zavolat, zkopírovat telefon, napsat e-mail, otevřít Disk); bez zadání nedávné záznamy a nejčastější příkazy.

```ts
function PaletteHost(p: PaletteHostProps): import("react").JSX.Element
```

### PasswordField

function · `packages/ui/src/components/form-controls.tsx`

Pole pro heslo se zobrazením/skrytím a upozorněním na zapnutý Caps Lock.

```ts
function PasswordField({ icon, hint, onKeyUp, ...rest }: Omit<TextFieldProps, "type" | "trailing">): import("react").JSX.Element
```

### PasswordStrength

function · `packages/ui/src/components/form-controls.tsx`

Indikátor síly hesla s kontrolním seznamem požadavků.

```ts
function PasswordStrength({ password, id }: { password: string; id?: string }): import("react").JSX.Element
```

### PhotoDialog

function · `packages/ui/src/data/photo-capture.tsx`

Fotky z terénu: vybrat zakázku (naposledy použitá je předvyplněná), vyfotit nebo vybrat z galerie, zmenšit a odeslat
na pozadí. Fotka se nejdřív uloží do zařízení, takže se neztratí ani bez signálu.

```ts
function PhotoDialog({ open, onOpenChange, entity = "job", }: { open: boolean; onOpenChange: (o: boolean) => void; entity?: string; }): import("react").JSX.Element
```

### PipelineStepper

function · `packages/ui/src/data/pipeline-stepper.tsx`

Pás fází jako šipky (chevrony) přes celou dostupnou šířku: šířka se dělí úměrně délce názvu (v mini pásu stejně), hotové fáze jsou zeleně,
aktuální v barvě akcentu, budoucí šedě. V detailu (`md`) je v segmentu název a pod ním dny ve fázi; dlouhý název se
zkrátí a celý je v tooltipu. Klik přesune záznam do fáze, zamčený přechod ukáže důvod v tooltipu. Na úzkém displeji
se pás posouvá do stran uvnitř sebe (stránka se nerozšíří) a aktuální fáze se sama vystředí.

```ts
function PipelineStepper({ stages, currentId, onSelect, disabledReason, size = "md", disabled, label = "Fáze", className, }: PipelineStepperProps): import("react").JSX.Element
```

### Placeholder

function · `packages/ui/src/components/placeholder.tsx`

Zástupná stránka pro část systému, která se teprve staví (kostra S0). Modul ji vrací z `ui.pages`, dokud nemá
skutečný obsah; plný obsah ji nahradí.

```ts
function Placeholder({ title, description = "Tato část OPSYS se právě staví.", icon = "list", }: { title: string; description?: string; /** Název ikony z `Icon`. */ icon?: string; }): import("react").JSX.Element
```

### PopoverContent

function · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
function PopoverContent({ className, align = "start", sideOffset = 6, ...rest }: ComponentProps<typeof P.Content>): import("react").JSX.Element
```

### RealtimeBridge

function · `packages/ui/src/realtime/realtime-bridge.tsx`

Připojí prohlížeč na `/api/realtime` a při změně u druhého uživatele zneplatní dotazy dotčených entit
(`["entity", <klíč>]`), příkazové dotazy modulů (`["command", …]`), koš a historii. Změna je vidět do 2 s bez
obnovení stránky. `onChange` slouží k obnově serverově vykreslených stránek (např. `router.refresh()`).

```ts
function RealtimeBridge({ url = "/api/realtime", onChange, }: { url?: string; /** Zavolá se (sloučeně) po každé dávce změn. */ onChange?: () => void; }): null
```

### RecordDialog

function · `packages/ui/src/data/record-dialog.tsx`

Detail záznamu v pop-upu, široký až 1280 px (pod ~1300 px obrazovky téměř celou šířku, na telefonu celou obrazovku). Obsah je `RecordView` v režimu
`dialog`: hlavička, pás od modulu (`recordHeader`), záložky i akce modulu fungují jako na stránce záznamu.
Seznam pod pop-upem se nepřekresluje, takže filtr, hledání i pozice v nástěnce zůstanou.

```ts
function RecordDialog({ entity, id, onClose, onDeleted, overview, initialTab, initialSub, ext, }: Props): import("react").JSX.Element
```

### RecordView

function · `packages/ui/src/data/record-view.tsx`

_Bez popisu._

```ts
function RecordView({ entity, id, mode, onClose, onDeleted, overview, initialTab, initialSub, dialogExt, }: Props): import("react").JSX.Element
```

### RelatedRecords

function · `packages/ui/src/data/related-records.tsx`

Související záznamy uvnitř detailu (vady zakázky, osoby firmy…): stejný seznam jako jinde (inline editace, panel,
vytvoření), jen s pevným filtrem na rodiče a předvyplněným rodičem při vytvoření.

```ts
function RelatedRecords({ entity, parentAttribute, parentId, height = 420, }: { entity: string; /** Klíč atributu typu záznam, který odkazuje na rodiče (např. `job`). */ parentAttribute: string; parentId: string; height?: number; }): import("react").JSX.Element
```

### SegmentedControl

function · `packages/ui/src/components/segmented-control.tsx`

Přepínač jedné možnosti ze 2–3 (např. „Ne / Jen moje / Vše“). Přístupná skupina voleb, šipky přepínají.

```ts
function SegmentedControl<T extends string>({ options, value, onChange, label, disabled, className, }: { options: SegmentOption<T>[]; value: T; onChange: (v: T) => void; /** Název skupiny pro čtečky obrazovky. */ label: string; disabled?: boolean; className?: string; }): import("react").JSX.Element
```

### SettingsPage

function · `packages/ui/src/components/settings-page.tsx`

Stránka nastavení: posuvná plocha s jednotným záhlavím (ikona, nadpis, popis, akce vpravo)
a obsahem ve sloupci. Plocha je o stupeň tmavší než karty (`bg-sunken`), aby se karty odlišily od podkladu.

```ts
function SettingsPage({ title, description, icon, actions, width = "md", children, }: { title: string; description?: ReactNode; icon?: ReactNode; actions?: ReactNode; width?: keyof typeof WIDTH; children: ReactNode; }): import("react").JSX.Element
```

### ShareDialog

function · `packages/ui/src/dashboards/share-dialog.tsx`

Sdílení nástěnky s rolemi a konkrétními lidmi. Každý, komu je sdílená, vidí v widgetech jen data, na která má sám
oprávnění; sdílení tedy neodemyká žádná data.

```ts
function ShareDialog({ summary, catalog, onClose, onSaved, }: { summary: DashboardSummary; catalog: SourceCatalog | undefined; onClose: () => void; onSaved: () => void; }): import("react").JSX.Element
```

### Sheet

function · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
function Sheet({ open, onOpenChange, title, children, width = 520, }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; width?: number; }): import("react").JSX.Element
```

### ShortcutsDialog

function · `packages/ui/src/components/shortcuts-dialog.tsx`

Přehled zkratek (klávesa `?`).

```ts
function ShortcutsDialog({ open, onOpenChange, groups, }: { open: boolean; onOpenChange: (o: boolean) => void; groups: ShortcutGroup[]; }): import("react").JSX.Element
```

### SignaturePad

function · `packages/ui/src/data/signature-pad.tsx`

Plocha pro podpis prstem nebo myší. `onChange` dostane PNG s průhledným pozadím, nebo `null`, když je plocha prázdná.
Funguje s dotykem i myší (pointer events); `touch-action: none` brání posouvání stránky při kreslení.

```ts
function SignaturePad({ onChange, height = 160, }: { onChange: (png: Blob | null) => void; height?: number; }): import("react").JSX.Element
```

### Skeleton

function · `packages/ui/src/components/badges.tsx`

_Bez popisu._

```ts
function Skeleton({ className }: { className?: string }): import("react").JSX.Element
```

### Slot

function · `packages/ui/src/data/module-ui.tsx`

Vykreslí komponenty, které moduly přispěly do slotu `name`, se stejnými props: `<Slot name="task.dialog.extras" taskId={id} />`.

```ts
function Slot<K extends SlotName>({ name, ...props }: { name: K } & SlotMap[K]): ReactNode
```

### Sparkline

function · `packages/ui/src/charts/sparkline.tsx`

Drobná čára pro KPI: tlumená, jen poslední bod v barvě grafu. Přeruší se u `null`.

```ts
function Sparkline({ values, ariaLabel, width = 80, height = 24, className, }: SparklineProps): import("react").JSX.Element
```

### TabsList

function · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
function TabsList({ className, ...rest }: ComponentProps<typeof TB.List>): import("react").JSX.Element
```

### TabsTrigger

function · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
function TabsTrigger({ className, ...rest }: ComponentProps<typeof TB.Trigger>): import("react").JSX.Element
```

### TextField

function · `packages/ui/src/components/form-controls.tsx`

Pole formuláře pro přihlašovací a účtové stránky: popisek nad polem, ikona, nápověda a chyba pod ním.

```ts
function TextField({ label, icon, trailing, labelAction, hint, error, density = "comfortable", id, className, ref, ...rest }: TextFieldProps): import("react").JSX.Element
```

### Textarea

function · `packages/ui/src/components/input.tsx`

_Bez popisu._

```ts
function Textarea({ className, ref, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }): import("react").JSX.Element
```

### ThemeSwitch

function · `packages/ui/src/shell/theme.tsx`

_Bez popisu._

```ts
function ThemeSwitch({ className }: { className?: string }): import("react").JSX.Element
```

### Toaster

function · `packages/ui/src/components/toast.tsx`

Oznámení vpravo dole. U vratných akcí se používá `undoToast`, potvrzovací dialog jen u nevratných.

```ts
function Toaster(): import("react").JSX.Element
```

### Tooltip

function · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
function Tooltip({ label, shortcut, children, side = "top", }: { label: string; shortcut?: string; children: ReactNode; side?: "top" | "right" | "bottom" | "left"; }): import("react").JSX.Element
```

### TooltipProvider

function · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
function TooltipProvider({ children }: { children: ReactNode }): import("react").JSX.Element
```

### VatRatesProvider

function · `packages/ui/src/data/vat-rates.tsx`

Aplikace dodá sazby DPH platné dnes (z Nastavení); moduly je nabízejí u položek dokladů a rozpočtu.

```ts
function VatRatesProvider({ value, children }: { value: VatRates; children: ReactNode }): import("react").JSX.Element
```

### VisibilityLock

function · `packages/ui/src/data/record-lock.tsx`

Zámek viditelnosti v hlavičce záznamu (SPOL-12, VID-03). Vlastník (`private.read`) ho přepíná: soukromý záznam
a jeho podřízené záznamy (úkoly, poznámky, platby, hodiny) nikdy neuvidí ostatní. U záznamu, který zámek jen dědí
(hodiny, fáze), nebo zámek zdědil od nadřazeného záznamu, ukáže stav bez možnosti přepnutí. Ostatním se nezobrazí nic.
Moduly s vlastní hlavičkou (`recordHeader`) ho přidají samy.

```ts
function VisibilityLock({ entity, id, row, }: { entity: EntityDescriptor; id: string; row: RecordRow; }): import("react").JSX.Element | null
```

### WidgetBody

function · `packages/ui/src/dashboards/widget-body.tsx`

Obsah widgetu podle druhu výsledku. Výsledek je už filtrovaný oprávněními na serveru; tady se jen zobrazuje.

```ts
function WidgetBody({ result, title, h, }: { result: WidgetResult; title: string; h: number; }): import("react").JSX.Element
```

### WidgetCard

function · `packages/ui/src/dashboards/widget-card.tsx`

Karta widgetu: záhlaví s nabídkou, načítání, chyba (česká hláška), obsah. Načítá se samostatně a souběžně s ostatními.

```ts
function WidgetCard({ widget, filters, refreshKey, autoRefreshMs, editing, reorderOnly, onEdit, onRemove, dragProps, resizeHandle, nodeRef, style, className, hideMenu, }: Props): import("react").JSX.Element
```

### addressText

function · `packages/ui/src/mobile/contact-actions.ts`

Adresa jedním řádkem (prázdné části se vynechají); null, když není z čeho skládat.

```ts
function addressText(parts: { street?: unknown; city?: unknown; zip?: unknown; country?: unknown; }): string | null
```

### axisTickLabel

function · `packages/ui/src/charts/scale.ts`

Popisek značky osy. Krátký tvar („1,2 mil.“), ale u jemných kroků přesný, aby se hodnoty nezaokrouhlily na stejné číslo.

```ts
function axisTickLabel(format: ChartValueFormat, value: number, step: number): string
```

### brandStyle

function · `packages/ui/src/brand.ts`

Akcentová barva klienta do CSS proměnných. Text na akcentu je bílý, nebo tmavý podle toho, který má vyšší kontrast
(u středně světlých barev, třeba oranžové, vychází lépe tmavý; bílý by nesplnil WCAG AA 4,5 : 1).

```ts
function brandStyle(accentColor: string): Record<`--${string}`, string>
```

### buildTopTabs

function · `packages/ui/src/data/module-ui.tsx`

Složí lištu záložek: skupiny a samostatné záložky seřazené podle `order` (stabilně).

```ts
function buildTopTabs(tabs: readonly RecordTab[], groups: readonly RecordTabGroup[], can: (k: string | readonly string[] | undefined) => boolean, row?: RecordRow): TopTab[]
```

### cn

function · `packages/ui/src/lib/cn.ts`

Spojí třídy a vyřeší konflikty Tailwindu (poslední vyhrává).

```ts
function cn(...inputs: ClassValue[]): string
```

### colorFor

function · `packages/ui/src/components/badges.tsx`

Stabilní barva avataru podle jména.

```ts
function colorFor(name: string): string
```

### completeFilters

function · `packages/ui/src/data/filters.ts`

Je podmínka úplná a smí se poslat na server? Nedokončené chipy se z dotazu vynechají.

```ts
function completeFilters(f: FilterGroup | undefined): FilterGroup | undefined
```

### compressImage

function · `packages/ui/src/data/image-compress.ts`

Zmenší fotku z telefonu před odesláním (typicky z 5–10 MB na ~300 kB), aby prošla i slabým signálem.
Respektuje otočení z EXIF. Cokoli, co zmenšit nejde (jiný formát, chybí podpora prohlížeče), vrátí beze změny.

```ts
async function compressImage(file: File, opts: { maxSide?: number; quality?: number; keepBelowBytes?: number } = {}): Promise<Blob>
```

### contactActions

function · `packages/ui/src/mobile/contact-actions.ts`

Sada akcí pro kartu: pořadí Zavolat, SMS, WhatsApp, E-mail, Navigovat, Disk. Akce bez údaje se vynechá, `only`
omezí výběr (karta kontaktu: telefon + e-mail; karta klienta: Zavolat, E-mail, Navigovat, Disk).

```ts
function contactActions(data: { phone?: string | null; email?: string | null; address?: string | null; driveUrl?: string | null; }, only?: readonly ContactActionKind[]): ContactAction[]
```

### defineModuleUi

function · `packages/ui/src/data/module-ui.tsx`

_Bez popisu._

```ts
function defineModuleUi<const U extends ModuleUi>(ui: U): U
```

### elementToPng

function · `packages/ui/src/dashboards/png.ts`

Uloží prvek stránky jako obrázek PNG (stažení souboru).

```ts
async function elementToPng(el: HTMLElement, fileName: string, scale = 2): Promise<void>
```

### emptyBoard

function · `packages/ui/src/dashboards/index.ts`

Prázdná definice nové nástěnky.

```ts
function emptyBoard(): DashboardDefinition
```

### errorToast

function · `packages/ui/src/components/toast.tsx`

_Bez popisu._

```ts
function errorToast(message: string): void
```

### findModulePage

function · `packages/ui/src/data/module-ui.tsx`

_Bez popisu._

```ts
function findModulePage(modules: ReadonlyMap<string, ModuleUi>, path: string): ModulePage | undefined
```

### initials

function · `packages/ui/src/components/badges.tsx`

_Bez popisu._

```ts
function initials(name: string): string
```

### installState

function · `packages/ui/src/mobile/start.ts`

Jak nabídnout instalaci na plochu (MOB-10): spuštěno jako aplikace = „installed“; prohlížeč nabídl
`beforeinstallprompt` = „prompt“ (tlačítko); iPhone/iPad Safari = „ios“ (návod Sdílet → Přidat na plochu).

```ts
function installState(input: { standalone: boolean; userAgent: string; hasPrompt: boolean; }): InstallState
```

### isMac

function · `packages/ui/src/hooks/use-hotkeys.ts`

_Bez popisu._

```ts
function isMac(): boolean
```

### mailHref

function · `packages/ui/src/mobile/contact-actions.ts`

Odkaz `mailto:` pro napsání e-mailu; null u neplatné adresy.

```ts
function mailHref(email: string | null | undefined): string | null
```

### mapsLink

function · `packages/ui/src/mobile/contact-actions.ts`

Adresa v mapách: univerzální odkaz Google Maps, který telefon nabídne otevřít v aplikaci map.

```ts
function mapsLink(address: string | null | undefined): string | null
```

### mergeModuleUi

function · `packages/ui/src/data/module-ui.tsx`

Složí UI oblastí modulu do jednoho `ModuleUi`. Mapy podle klíče entity se spojují (pole se zřetězí; u hlaviček
a hlaviček sloupců platí první oblast, která je dodá; karta kanbanu se skládá pole po poli), stránky a příkazy
palety se přidají za sebe.

```ts
function mergeModuleUi(...parts: ModuleUi[]): ModuleUi
```

### modKey

function · `packages/ui/src/hooks/use-hotkeys.ts`

_Bez popisu._

```ts
function modKey(): "⌘" | "Ctrl"
```

### niceScale

function · `packages/ui/src/charts/scale.ts`

Osa s „hezkými“ hodnotami. Zvládá samé nuly, jedinou hodnotu, záporné hodnoty i velké částky v haléřích.

```ts
function niceScale(minV: number, maxV: number, opts: NiceScaleOptions = {}): NiceScale
```

### niceStep

function · `packages/ui/src/charts/scale.ts`

Nejbližší „hezký“ krok (1, 2, 5 × 10^k) nad `raw`; u minut navíc časové kroky.

```ts
function niceStep(raw: number, unit: "decimal" | "minutes" = "decimal"): number
```

### notifyQueued

function · `packages/ui/src/data/export-dialog.tsx`

Oznámení, že velký export běží na pozadí.

```ts
function notifyQueued(): void
```

### passwordStrength

function · `packages/ui/src/components/form-controls.tsx`

Jak dobré je heslo: server vyžaduje jen délku, ostatní je doporučení.

```ts
function passwordStrength(password: string): { score: number; label: string; longEnough: boolean; variety: number; }
```

### plainValue

function · `packages/ui/src/data/cell.tsx`

Text hodnoty pro exporty a hledání (bez formátování komponent).

```ts
function plainValue(attr: AttributeDescriptor, value: unknown, labels?: Labels): string
```

### readRecordParam

function · `packages/ui/src/data/record-url.ts`

Id záznamu z `?record=` (`null`, když chybí nebo je prázdné).

```ts
function readRecordParam(search: string): string | null
```

### runExport

function · `packages/ui/src/data/export-dialog.tsx`

Spustí export na serveru. Malý se rovnou stáhne, velký se zařadí do fronty (odpověď 202) a čeká v „Moje exporty“.

```ts
async function runExport(entityKey: string, req: ExportRequest): Promise<"downloaded" | "queued">
```

### runLastUndo

function · `packages/ui/src/components/toast.tsx`

Provede poslední vratnou akci, pokud je ještě v 10s okně. Vrací, zda se něco vrátilo.

```ts
function runLastUndo(): boolean
```

### seriesColor

function · `packages/ui/src/charts/series.ts`

Barva řady podle pořadí (token); od 9. řady neutrální šedá, žádné generované odstíny.

```ts
function seriesColor(index: number): string
```

### shouldOpenStartSearch

function · `packages/ui/src/mobile/start.ts`

Má se po otevření aplikace samo otevřít Hledat?

```ts
function shouldOpenStartSearch(input: { pathname: string; /** Užší než `md` a dotykové zařízení. */ phone: boolean; /** Už se při tomto spuštění otevřelo. */ alreadyStarted: boolean; /** Adresa nese `?bez-hledani` (např. odkaz z notifikace nebo testy). */ suppressed?: boolean; }): boolean
```

### smsHref

function · `packages/ui/src/mobile/contact-actions.ts`

Odkaz `sms:` pro napsání zprávy; null, když číslo není použitelné.

```ts
function smsHref(phone: string | null | undefined): string | null
```

### successToast

function · `packages/ui/src/components/toast.tsx`

_Bez popisu._

```ts
function successToast(message: string): void
```

### telHref

function · `packages/ui/src/mobile/contact-actions.ts`

Odkaz `tel:` pro zavolání; null, když číslo není použitelné.

```ts
function telHref(phone: string | null | undefined): string | null
```

### undoToast

function · `packages/ui/src/components/toast.tsx`

Toast s tlačítkem „Vrátit“ (vratná akce; zpětná změna se provede až po kliknutí nebo Cmd/Ctrl+Z, do 10 s,
R-24). Platí jen poslední vratná akce.

```ts
function undoToast(message: string, onUndo: () => void | Promise<void>): void
```

### useCan

function · `packages/ui/src/data/module-ui.tsx`

Zda má přihlášený uživatel oprávnění (jen pro skrývání prvků UI; server kontroluje vždy).

```ts
function useCan(): (key: string | readonly string[] | undefined) => boolean
```

### useCommandMutation

function · `packages/ui/src/data/hooks.ts`

Spuštění příkazu modulu; po úspěchu zneplatní uvedené klíče (nebo všechny dotazy příkazů a záznamů).

```ts
function useCommandMutation<I = unknown, O = unknown>(name: string, opts: { onSuccess?: (data: O, input: I) => void; invalidate?: readonly (readonly unknown[])[]; } = {}): import("@tanstack/react-query").UseMutationResult<O, Error, I, unknown>
```

### useCommandQuery

function · `packages/ui/src/data/hooks.ts`

Dotaz na příkaz modulu (`api.command`) s cache TanStack Query; klíč tvoří jméno a vstup.

```ts
function useCommandQuery<O = unknown, I = unknown>(name: string, input?: I, opts: { enabled?: boolean; refetchInterval?: number } = {}): import("@tanstack/react-query").UseQueryResult<O, Error>
```

### useDashboardApi

function · `packages/ui/src/dashboards/api.tsx`

Rozhraní nástěnek z kontextu; mimo `DashboardApiProvider` je to chyba.

```ts
function useDashboardApi(): DashboardApi
```

### useDensity

function · `packages/ui/src/hooks/use-density.ts`

Aktuální hustota řádků: čte `data-density` na `<html>` (nastaví ji `themeScript` při načtení a Nastavení → Vzhled
při změně) a sleduje jeho změny, takže se tabulka přepočítá hned po přepnutí.

```ts
function useDensity(): Density
```

### useElementWidth

function · `packages/ui/src/charts/use-element-width.ts`

Šířka prvku sledovaná přes ResizeObserver. Vrací `[ref, šířka]`; ref patří na kontejner grafu.
Na serveru, při prvním vykreslení a bez ResizeObserveru je to `fallback` (600 px), takže SSR se shoduje s hydratací.

```ts
function useElementWidth<T extends HTMLElement = HTMLDivElement>(fallback = CHART_FALLBACK_WIDTH): readonly [import("react").RefObject<T | null>, number]
```

### useEntityApi

function · `packages/ui/src/data/context.tsx`

_Bez popisu._

```ts
function useEntityApi(): EntityApi
```

### useEntityDescriptor

function · `packages/ui/src/data/hooks.ts`

Popis entity (atributy, stavy, oprávnění); sdílená mezipaměť s `RelatedRecords`, takže se načte jednou.

```ts
function useEntityDescriptor(entity: string): import("@tanstack/react-query").UseQueryResult<EntityDescriptor, Error>
```

### useEntityRecord

function · `packages/ui/src/data/hooks.ts`

Jeden záznam entity s popisky vazeb (stejná mezipaměť jako detail záznamu, takže inline úpravy ji obnoví).

```ts
function useEntityRecord(entity: string, id: string | null | undefined): import("@tanstack/react-query").UseQueryResult<import("./api").RecordResult, Error>
```

### useEntitySummary

function · `packages/ui/src/data/hooks.ts`

Počet a součty za celou filtrovanou sadu (patička tabulky); nezávisí na tom, kolik řádků je načteno.

```ts
function useEntitySummary(entity: string, params: QueryParams): import("@tanstack/react-query").UseQueryResult<{ total: number; totals: Record<string, number>; }, Error>
```

### useHotkeys

function · `packages/ui/src/hooks/use-hotkeys.ts`

Globální klávesové zkratky. Klíče: `mod+k` (Cmd na Macu, Ctrl jinde), `?`, `c`, dvoutlačítkové sekvence `g z`
(do 900 ms po sobě). Jednoznakové zkratky se při psaní do pole nespouští; `mod+…` a `Escape` fungují vždy.

```ts
function useHotkeys(map: HotkeyMap, enabled = true): void
```

### useInvalidateEntity

function · `packages/ui/src/data/hooks.ts`

_Bez popisu._

```ts
function useInvalidateEntity(entity: string): () => Promise<void>
```

### useIsMobile

function · `packages/ui/src/hooks/use-media.ts`

Zda je obrazovka užší než `md` (768 px). Na serveru a při prvním vykreslení vrací false, pak se opraví.

```ts
function useIsMobile(query = "(max-width: 767px)"): boolean
```

### useKanbanExtensions

function · `packages/ui/src/data/module-ui.tsx`

Rozšíření kanbanu od zapnutých modulů pro entitu (první nalezené vyhrává, jako u `recordHeader`).

```ts
function useKanbanExtensions(entityKey: string): { card: KanbanCardExtension | undefined; columnHeader: ComponentType<KanbanColumnContext> | undefined; }
```

### useModuleUi

function · `packages/ui/src/data/module-ui.tsx`

_Bez popisu._

```ts
function useModuleUi(): ReadonlyMap<string, ModuleUi>
```

### useNav

function · `packages/ui/src/nav.tsx`

_Bez popisu._

```ts
function useNav(): NavApi
```

### useOnline

function · `packages/ui/src/mobile/offline-bridge.tsx`

Je zařízení připojené? Na serveru a při prvním vykreslení „ano“ (bez bliknutí), pak se opraví.

```ts
function useOnline(): boolean
```

### usePaletteActions

function · `packages/ui/src/components/palette-actions.tsx`

Zaregistruje akce do paletky, dokud je komponenta zobrazená. `items` je potřeba zapamatovat (`useMemo`).

```ts
function usePaletteActions(items: PaletteItem[] | null): void
```

### usePendingUploads

function · `packages/ui/src/data/photo-capture.tsx`

Počet fotek, které čekají na odeslání (odznak ve spodní navigaci).

```ts
function usePendingUploads(): number
```

### useRecordDialogExt

function · `packages/ui/src/data/module-ui.tsx`

Vlastní podoba pop-upu od zapnutých modulů pro entitu (první nalezená vyhrává).

```ts
function useRecordDialogExt(entityKey: string): RecordDialogExt | undefined
```

### useRecordExtensions

function · `packages/ui/src/data/module-ui.tsx`

_Bez popisu._

```ts
function useRecordExtensions(entityKey: string): { tabs: RecordTab[]; topTabs: (row?: RecordRow) => TopTab[]; actions: RecordAction[]; overviewCards: (row?: RecordRow) => RecordOverviewCard[]; header: RecordHeader | undefined; hiddenCore: ReadonlySet<"activity" | "tasks" | "files">; }
```

### useRecordParam

function · `packages/ui/src/data/use-record-param.ts`

Otevřený záznam v adrese (`?record=<id>`). Otevření přidá položku do historie, zavření se vrátí (`history.back()`),
takže tlačítko Zpět zavře pop-up a filtr i pozice v seznamu zůstanou, protože stránka se nepřekresluje.
Odkaz s `?record=` otevře pop-up rovnou (`initial` z adresy ze serveru brání probliknutí). Router aplikace
(`history.pushState` je v Next.js propojený s routerem) se nevolá, stránka se nenačítá znovu.

```ts
function useRecordParam(enabled: boolean, initial?: string | null): { id: string | null; open: (next: string) => void; close: () => void; }
```

### useSlotComponents

function · `packages/ui/src/data/module-ui.tsx`

Komponenty všech zapnutých modulů pro slot hostitele (v pořadí modulů). Hostitel o přispěvatelích neví; bez
přispěvatele je výsledek prázdný.

```ts
function useSlotComponents<K extends SlotName>(name: K): ComponentType<SlotMap[K]>[]
```

### useUndoShortcut

function · `packages/ui/src/components/toast.tsx`

Cmd/Ctrl+Z vrátí poslední vratnou akci (smazání, hromadná změna); v textovém poli zůstává běžné „zpět“.

```ts
function useUndoShortcut(): void
```

### useUpdateAttribute

function · `packages/ui/src/data/hooks.ts`

Inline úprava jednoho atributu. Změna se hned ukáže (optimisticky); když ji server odmítne,
vrátí se původní stav a chyba se předá volajícímu (buňka ji ukáže).

```ts
function useUpdateAttribute(entity: string): import("@tanstack/react-query").UseMutationResult<import("./api").RecordResult, Error, { id: string; attr: string; value: unknown; updatedAt: string; }, { snapshot: [readonly unknown[], Pages | undefined][]; }>
```

### useVatRates

function · `packages/ui/src/data/vat-rates.tsx`

_Bez popisu._

```ts
function useVatRates(): VatRates
```

### useVisualViewportVar

function · `packages/ui/src/mobile/viewport.ts`

Výška viditelné části okna (bez klávesnice) jako CSS proměnná `--vvh`. iOS Safari při otevřené klávesnici
nezmenšuje `100dvh`, takže celoobrazovkové Hledat by schovalo seznam pod klávesnici; styly používají
`height: var(--vvh, 100dvh)`.

```ts
function useVisualViewportVar(): void
```

### vatBpChoices

function · `packages/ui/src/data/vat-rates.tsx`

Sazby (v setinách procenta) k nabídnutí ve výběru, od nejvyšší. K nabízeným se přidají `extra`
(sazby, které už doklad obsahuje, i když dnes neplatí), aby se hodnota řádku neztratila.

```ts
function vatBpChoices(vat: VatRates, extra: readonly number[] = []): number[]
```

### whatsappHref

function · `packages/ui/src/mobile/contact-actions.ts`

Odkaz `wa.me` pro WhatsApp (číslo v mezinárodním tvaru); null, když číslo není použitelné.

```ts
function whatsappHref(phone: string | null | undefined): string | null
```

### withRecordParam

function · `packages/ui/src/data/record-url.ts`

Adresa s nastaveným nebo odebraným `record`. Záložka detailu (`tab`, `sub`) se zahodí, když se mění záznam
nebo se zavírá; ostatní parametry (`pohled`, filtry…) zůstanou. `keepTab` zachová záložku (otevření přímým odkazem).

```ts
function withRecordParam(href: string, id: string | null, opts: { keepTab?: boolean } = {}): string
```

### ApiError

class · `packages/ui/src/data/api.ts`

Chyba z `ActionResult` jako výjimka — TanStack Query a toasty s ní umí pracovat.

```ts
class ApiError extends Error {
  constructor(message: string, readonly code: string);
}
```

### AUTH_LINK_BUTTON

const · `packages/ui/src/components/auth-shell.tsx`

Odkaz vzhledem primárního tlačítka (např. „Požádat o nový odkaz“).

```ts
const AUTH_LINK_BUTTON: "inline-flex h-11 w-full items-center justify-center rounded-lg bg-accent px-4 text-[15px] font-semibold text-accent-fg transition-colors hover:bg-[var(--accent-hover)]"
```

### AUTH_SUBMIT

const · `packages/ui/src/components/auth-shell.tsx`

Třídy tlačítka odeslání na přihlašovacích stránkách (použije se s `Button variant="primary"`).

```ts
const AUTH_SUBMIT: "h-11 w-full rounded-lg text-[15px] font-semibold"
```

### CHART_EMPTY_TEXT

const · `packages/ui/src/charts/chart-parts.tsx`

_Bez popisu._

```ts
const CHART_EMPTY_TEXT: "Žádná data za zvolené období"
```

### Dialog

const · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
const Dialog: import("react").FC<D.DialogProps>
```

### DialogClose

const · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
const DialogClose: import("react").ForwardRefExoticComponent<D.DialogCloseProps & import("react").RefAttributes<HTMLButtonElement>>
```

### DialogTrigger

const · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
const DialogTrigger: import("react").ForwardRefExoticComponent<D.DialogTriggerProps & import("react").RefAttributes<HTMLButtonElement>>
```

### DropdownMenu

const · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
const DropdownMenu: import("react").FC<M.DropdownMenuProps>
```

### DropdownMenuTrigger

const · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
const DropdownMenuTrigger: import("react").ForwardRefExoticComponent<M.DropdownMenuTriggerProps & import("react").RefAttributes<HTMLButtonElement>>
```

### FIELD_LABEL_COLUMN

const · `packages/ui/src/components/surface.tsx`

Šířka sloupce popisků u řádků polí; stejná v celém detailu, aby popisky ležely pod sebou.

```ts
const FIELD_LABEL_COLUMN: "grid-cols-[minmax(6rem,8rem)_minmax(0,1fr)]"
```

### LABEL_COLORS

const · `packages/ui/src/components/badges.tsx`

_Bez popisu._

```ts
const LABEL_COLORS: readonly ["gray", "blue", "green", "orange", "red", "purple", "pink", "teal", "yellow", "indigo"]
```

### Popover

const · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
const Popover: import("react").FC<P.PopoverProps>
```

### PopoverAnchor

const · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
const PopoverAnchor: import("react").ForwardRefExoticComponent<P.PopoverAnchorProps & import("react").RefAttributes<HTMLDivElement>>
```

### PopoverTrigger

const · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
const PopoverTrigger: import("react").ForwardRefExoticComponent<P.PopoverTriggerProps & import("react").RefAttributes<HTMLButtonElement>>
```

### RECORD_PARAM

const · `packages/ui/src/data/record-url.ts`

Adresa otevřeného záznamu v pop-upu (`?record=<id>`): čisté funkce bez prohlížeče, aby šly testovat.

```ts
const RECORD_PARAM: "record"
```

### ROW_HEIGHTS

const · `packages/ui/src/hooks/use-density.ts`

Výška řádku tabulky podle hustoty (NAS-05): pohodlná 36 px, kompaktní 28 px.

```ts
const ROW_HEIGHTS: Record<Density, number>
```

### TYPE_ICONS

const · `packages/ui/src/data/type-icons.ts`

Ikona typu atributu — v záhlaví sloupce, ve filtrech a v panelu atributů.

```ts
const TYPE_ICONS: Record<AttributeType, LucideIcon>
```

### Tabs

const · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
const Tabs: import("react").ForwardRefExoticComponent<TB.TabsProps & import("react").RefAttributes<HTMLDivElement>>
```

### TabsContent

const · `packages/ui/src/components/overlay.tsx`

_Bez popisu._

```ts
const TabsContent: import("react").ForwardRefExoticComponent<TB.TabsContentProps & import("react").RefAttributes<HTMLDivElement>>
```

### dashKeys

const · `packages/ui/src/dashboards/api.tsx`

_Bez popisu._

```ts
const dashKeys: { list: readonly ["dashboards", "list"]; board: (id: string) => readonly ["dashboards", "board", string]; catalog: readonly ["dashboards", "catalog"]; widget: (w: DashboardWidget, f: DashboardFilters, n?: number) => readonly ["dashboards",…
```

### entityKeys

const · `packages/ui/src/data/hooks.ts`

_Bez popisu._

```ts
const entityKeys: { all: (entity: string) => readonly ["entity", string]; list: (entity: string, params: QueryParams) => readonly ["entity", string, "list", QueryParams]; listAny: (entity: string) => readonly ["entity", string, "list"]; kanban: (entity: str…
```

### themeScript

const · `packages/ui/src/shell/theme.tsx`

Skript na začátku `<body>`: nastaví téma a hustotu řádků (`data-density`) před vykreslením, aby stránka při načtení nezablikala.

```ts
const themeScript: "try{var r=document.documentElement,t=localStorage.getItem(\"theme\");if(t===\"light\"||t===\"dark\")r.setAttribute(\"data-theme\",t);var d=localStorage.getItem(\"density\");r.setAttribute(\"data-density\",d===\"compact\"?\"compact\":\"com…
```

### ActivityResult

type · `packages/ui/src/data/api.ts`

_Bez popisu._

```ts
type ActivityResult = { timeline: TimelineItem[]; files: FileItem[] };
```

### AuthBrand

type · `packages/ui/src/components/auth-shell.tsx`

_Bez popisu._

```ts
type AuthBrand = { name: string; logoUrl?: string | null };
```

### BarChartProps

type · `packages/ui/src/charts/bar-chart.tsx`

_Bez popisu._

```ts
type BarChartProps = {
  categories: ChartCategory[];
  series: ChartSeries[];
  /** Řady se skládají na sebe (kladné nahoru, záporné dolů). */
  stacked?: boolean;
  /** Vodorovné sloupce: kategorie pod sebou. */
  horizontal?: boolean;
  format: ChartValueFormat;
  /** Celková výška včetně pásu popisků (min. 120). */
  height?: number;
  ariaLabel: string;
  /** Klik / Enter na kategorii. Kategorie s `href` je odkaz. */
  onSelect?: (categoryKey: string) => void;
  className?: string;
};
```

### BottomItem

type · `packages/ui/src/shell/bottom-nav.tsx`

_Bez popisu._

```ts
type BottomItem = {
  id: string;
  label: string;
  icon: string;
  /** Odkaz, nebo akce (Foto, Více). */
  href?: string;
  onSelect?: () => void;
  badge?: number;
};
```

### BulkAction

type · `packages/ui/src/data/module-ui.tsx`

Hromadná akce nad vybranými řádky seznamu (např. „Odeslat e-mailem“ u faktur); běží v okně, které modul vykreslí sám.

```ts
type BulkAction = {
  id: string;
  label: string;
  permission?: string | readonly string[];
  dialog: {
    title: string;
    description?: string;
    render: (p: { ids: string[]; close: () => void; refresh: () => void }) => ReactNode;
  };
};
```

### ButtonProps

type · `packages/ui/src/components/button.tsx`

_Bez popisu._

```ts
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof button> & { loading?: boolean; ref?: Ref<HTMLButtonElement> };
```

### ChartCategory

type · `packages/ui/src/charts/types.ts`

Kategorie na ose (sloupec, den, zakázka). `href` ji dělá klikatelnou, `color` přebarví sloupec u grafu s jednou řadou.

```ts
type ChartCategory = { key: string; label: string; href?: string; color?: string };
```

### ChartLegendItem

type · `packages/ui/src/charts/chart-legend.tsx`

_Bez popisu._

```ts
type ChartLegendItem = {
  key: string;
  label: string;
  color: string;
  shape: SeriesShape;
  /** Hodnota a podíl (jen v seznamu, např. u koláče). */
  value?: string;
  share?: string;
  href?: string;
};
```

### ChartSeries

type · `packages/ui/src/charts/types.ts`

Datová řada; `values` jsou po kategoriích, `null` = bez dat (mezera).

```ts
type ChartSeries = { key: string; label: string; values: (number | null)[] };
```

### ChartTooltipRow

type · `packages/ui/src/charts/chart-tooltip.tsx`

_Bez popisu._

```ts
type ChartTooltipRow = {
  key: string;
  label: string;
  value: string;
  color?: string;
  shape?: SeriesShape;
  /** Řádek součtu: tučně, bez značky. */
  total?: boolean;
};
```

### ChartValueFormat

type · `packages/ui/src/charts/types.ts`

Jak se hodnota ukazuje: peníze jsou v haléřích, `minutes` v minutách (7:30 h), `hours` v desetinných hodinách.

```ts
type ChartValueFormat = "number" | "money" | "percent" | "hours" | "minutes";
```

### ComboOption

type · `packages/ui/src/components/combobox.tsx`

_Bez popisu._

```ts
type ComboOption = { value: string; label: string; hint?: string; color?: string };
```

### ComboboxProps

type · `packages/ui/src/components/combobox.tsx`

_Bez popisu._

```ts
type ComboboxProps = {
  /** Statické možnosti, nebo `load` pro vyhledávání na serveru. */
  options?: readonly ComboOption[];
  load?: (query: string) => Promise<ComboOption[]>;
  value: string | string[] | null;
  /** Popisek aktuální hodnoty, když není mezi načtenými možnostmi (např. jméno vybrané firmy). */
  selectedLabels?: Record<string, string>;
  onChange: (value: string | string[] | null) => void;
  multiple?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  clearable?: boolean;
  renderOption?: (o: ComboOption) => ReactNode;
  trigger?: ReactNode;
  /** Název pole pro čtečky obrazovky; za něj se přidá vybraná hodnota. */
  "aria-label"?: string;
  className?: string;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};
```

### ContactAction

type · `packages/ui/src/mobile/contact-actions.ts`

Jedna rychlá akce: popisek, ikona a odkaz.

```ts
type ContactAction = {
  kind: ContactActionKind;
  label: string;
  icon: string;
  href: string;
  /** Odkaz se otevírá mimo aplikaci (mapy, Disk, WhatsApp). */
  external: boolean;
};
```

### ContactActionKind

type · `packages/ui/src/mobile/contact-actions.ts`

Druh rychlé akce na kartě kontaktu nebo klienta.

```ts
type ContactActionKind = "call" | "sms" | "whatsapp" | "mail" | "navigate" | "drive";
```

### DashboardApi

type · `packages/ui/src/dashboards/api.tsx`

Vše, co UI nástěnek potřebuje od serveru. Komponenty nezná server actions ani route handlery; aplikace jim rozhraní
dodá (`apps/web/src/lib/dashboard-api.ts`). Chyby se hlásí výjimkou s čitelnou hláškou.

```ts
type DashboardApi = {
  list(): Promise<DashboardSummary[]>;
  get(id: string): Promise<{ summary: DashboardSummary; definition: DashboardDefinition }>;
  create(v: { name: string; definition?: DashboardDefinition }): Promise<{ id: string }>;
  update(v: {
    id: string;
    name?: string;
    definition?: DashboardDefinition;
    expectedUpdatedAt?: string;
  }): Promise<{ updatedAt: string }>;
  remove(id: string): Promise<void>;
  clone(id: string, name?: string): Promise<{ id: string }>;
  share(id: string, to: { roles: string[]; users: string[] }): Promise<void>;
  reorder(ids: string[]): Promise<void>;
  catalog(): Promise<SourceCatalog>;
  /** Vyhodnotí jeden widget (route handler, souběžně). */
  evaluate(
    widget: DashboardWidget,
    filters: DashboardFilters,
    opts?: { fresh?: boolean },
  ): Promise<WidgetOutcome>;
  /** Stáhne data widgetu (CSV / XLSX). */
  exportWidget(
    widget: DashboardWidget,
    filters: DashboardFilters,
    format: "csv" | "xlsx",
  ): Promise<void>;
  /** Odškrtne úkol přímo ve widgetu (příkaz `ukoly.complete`). */
  completeTask(id: string): Promise<void>;
  /** Stáhne snímek nástěnky do PDF. */
  exportBoard(boardId: string, filters: DashboardFilters): Promise<void>;
};
```

### Density

type · `packages/ui/src/hooks/use-density.ts`

Hustota řádků v seznamech a tabulkách (Nastavení → Vzhled).

```ts
type Density = "comfortable" | "compact";
```

### DonutChartProps

type · `packages/ui/src/charts/donut-chart.tsx`

_Bez popisu._

```ts
type DonutChartProps = {
  slices: DonutSliceInput[];
  format: ChartValueFormat;
  /** Prstenec (výchozí) nebo plný koláč. */
  donut?: boolean;
  /** Text uprostřed prstence. Bez něj je to „Celkem“ a součet; prázdný řetězec střed nechá prázdný. */
  centerLabel?: string;
  centerValue?: string;
  ariaLabel: string;
  className?: string;
};
```

### DonutSliceInput

type · `packages/ui/src/charts/types.ts`

_Bez popisu._

```ts
type DonutSliceInput = {
  key: string;
  label: string;
  value: number;
  color?: string;
  href?: string;
};
```

### EntityApi

type · `packages/ui/src/data/api.ts`

Vše, co data-driven UI potřebuje od serveru. Komponenty ve `@rebar/ui` neznají Next.js ani server actions;
aplikace jim tohle rozhraní dodá (server actions, v testech atrapa). Chyby se hlásí výjimkou s čitelnou hláškou.

```ts
type EntityApi = {
  /** Popis entity (atributy, stavy, oprávnění) pro vložené seznamy. */
  describe(entity: string): Promise<EntityDescriptor>;
  query(entity: string, params: QueryParams): Promise<QueryPage>;
  groups(entity: string, group: string, params: QueryParams): Promise<GroupSummary[]>;
  get(entity: string, id: string): Promise<RecordResult>;
  create(entity: string, values: Record<string, unknown>): Promise<RecordResult>;
  update(
    entity: string,
    id: string,
    patch: Record<string, unknown>,
    expectedUpdatedAt?: string,
  ): Promise<RecordResult>;
  remove(entity: string, ids: string[]): Promise<void>;
  restore(entity: string, ids: string[]): Promise<void>;
  /** Zamkne (soukromé) nebo zveřejní (sdílené) záznamy; smí jen vlastník. Vrací počet změněných i s potomky. */
  setVisibility(entity: string, ids: string[], isPrivate: boolean): Promise<{ changed: number }>;
  lookups: Lookups;
  /** Adresa záznamu v aplikaci (odkazy mezi záznamy); `null`, když pro daný typ stránka není. */
  hrefFor(entity: string, id: string): string | null;
  /** Příkaz modulu (`<modul>.<akce>`): pojmenovaná akce nebo dotaz na serveru. */
  command<I = unknown, O = unknown>(name: string, input?: I): Promise<O>;
  /** Kdo je přihlášen (smí mazat vlastní komentáře). */
  me: { id: string; name: string };
  activity(entity: string, id: string): Promise<ActivityResult>;
  addComment(entity: string, id: string, body: string): Promise<void>;
  deleteComment(id: string): Promise<void>;
  /** Nahraje soubor k záznamu a vrátí jeho id; `kind` rozlišuje fotky, podpisy a dokumenty. */
  uploadFile(
    entity: string,
    id: string,
    file: File,
    opts?: { kind?: string; takenAt?: string },
  ): Promise<{ id: string }>;
  detachFile(attachmentId: string): Promise<void>;
  /** Šablony exportů; bez nich export dialog šablony nenabízí. */
  exports?: {
    templates(entity: string): Promise<ExportTemplateInfo[]>;
    saveTemplate(t: {
      name: string;
// … (zkráceno, celá deklarace je ve zdroji)
```

### ExportFormat

type · `packages/ui/src/data/export-dialog.tsx`

Formát souboru exportu seznamu.

```ts
type ExportFormat = "xlsx" | "csv" | "pdf";
```

### ExportQuery

type · `packages/ui/src/data/export-dialog.tsx`

Pohled seznamu, který se exportuje: filtry, řazení, hledání.

```ts
type ExportQuery = {
  filters?: FilterGroup | undefined;
  sort?: { attr: string; dir: "asc" | "desc" }[] | undefined;
  q?: string | undefined;
};
```

### ExportRequest

type · `packages/ui/src/data/export-dialog.tsx`

Požadavek na export seznamu (formát, rozsah, sloupce, pohled, název souboru).

```ts
type ExportRequest = {
  format: ExportFormat;
  scope: "view" | "all";
  columns: string[];
  query: ExportQuery;
  fileName?: string | undefined;
  background?: boolean | undefined;
  templateId?: string | undefined;
};
```

### ExportTemplateInfo

type · `packages/ui/src/data/api.ts`

Šablona exportu (uložená sada sloupců a filtrů).

```ts
type ExportTemplateInfo = {
  id: string;
  name: string;
  shared: boolean;
  mine: boolean;
  ownerName: string;
  spec: {
    entity: string;
    format: "xlsx" | "csv" | "pdf";
    scope: "view" | "all";
    columns?: string[] | undefined;
    query?:
      | {
          filters?: FilterGroup | undefined;
          sort?: { attr: string; dir: "asc" | "desc" }[] | undefined;
          q?: string | undefined;
        }
      | undefined;
    fileName?: string | undefined;
  };
};
```

### FileItem

type · `packages/ui/src/data/api.ts`

_Bez popisu._

```ts
type FileItem = {
  id: string;
  fileId: string;
  name: string;
  mime: string;
  size: number;
  kind: string | null;
  width: number | null;
  height: number | null;
  hasThumb: boolean;
  createdAt: string;
};
```

### FilterAttributeGroup

type · `packages/ui/src/data/filter-attributes.ts`

Skupina atributů v nabídce „Filtr“: modul si ji pro entitu definuje výčtem klíčů (`EntityList` prop `filterGroups`).
Atribut, který žádná skupina nezmiňuje, spadne do „Vlastní pole“ (je-li vlastní) nebo do „Ostatní“.

```ts
type FilterAttributeGroup = { id: string; label: string; attrs: readonly string[] };
```

### GaugeProps

type · `packages/ui/src/charts/gauge.tsx`

_Bez popisu._

```ts
type GaugeProps = {
  value: number;
  target: number;
  format: ChartValueFormat;
  label?: string;
  /** Čím méně, tím lépe (rozpočet, limit): blízko cíle je varování, překročení chyba. */
  lowerIsBetter?: boolean;
  className?: string;
};
```

### InstallState

type · `packages/ui/src/mobile/start.ts`

Stav instalace na plochu: nainstalováno, nabídka prohlížeče, návod pro iPhone, nepodporováno.

```ts
type InstallState = "installed" | "prompt" | "ios" | "unsupported";
```

### KanbanCardContext

type · `packages/ui/src/data/module-ui.tsx`

Co dostane rozšíření karty kanbanu: řádek, popisky vazeb a výchozí tělo, které může modul doplnit.

```ts
type KanbanCardContext = {
  /** Klíč entity (`job`). */
  entity: string;
  row: RecordRow;
  labels: Labels;
  titleKey: string;
  attributes: AttributeDescriptor[];
  /** Atributy, které má uživatel na kartě zapnuté. */
  cardAttributes: string[];
  /** Výchozí tělo karty (název a vybrané atributy); modul ho může obalit nebo doplnit. */
  defaultBody: ReactNode;
};
```

### KanbanCardExtension

type · `packages/ui/src/data/module-ui.tsx`

Rozšíření karty kanbanu pro jednu entitu. Vše je nepovinné; co modul nedodá, vypadá jako dřív.
Komponenty se vykreslují jako prvky Reactu, takže smí používat hooky (dotaz, popover…).
Kliky a tažení uvnitř `topRight` / `bottomRight` kartu neotevírají ani nepřesouvají; ve `footer` je to na modulu
(interaktivní prvky obalí `KanbanInteractive`), aby šla celá řádka patičky použít i pro text.

```ts
type KanbanCardExtension = {
  /** Nahradí tělo karty (jinak název a vybrané atributy). */
  body?: ComponentType<KanbanCardContext>;
  /**
   * „Zhnilá“ karta: karta dostane `data-rotting` a text pro čtečky (barevně ji zvýrazní modul sám, např. čipem v patičce).
   * Vrátí-li funkce text, použije se jako popisek pro čtečky.
   */
  rotting?: (row: RecordRow) => boolean | string;
  /** Slot vpravo nahoře (např. ikona další aktivity s popoverem). */
  topRight?: ComponentType<KanbanCardContext>;
  /** Slot vpravo dole. */
  bottomRight?: ComponentType<KanbanCardContext>;
  /** Patička karty přes celou šířku pod tělem (stav další aktivity, čipy). */
  footer?: ComponentType<KanbanCardContext>;
};
```

### KanbanColumnContext

type · `packages/ui/src/data/module-ui.tsx`

Co dostane doplňující řádek v hlavičce sloupce kanbanu (vážený součet, počet po termínu…).

```ts
type KanbanColumnContext = {
  entity: string;
  stage: StageDescriptor;
  /** Počet záznamů ve sloupci (celkem, ne jen načtených). */
  count: number;
  /** Načtené karty sloupce (první stránka; pro celkové součty použij vlastní dotaz s `params`). */
  rows: RecordRow[];
  /** Součty atributů označených `aggregate` za celý sloupec (jsou-li k dispozici). */
  sums: Record<string, number> | undefined;
  /** Dotaz (filtry, hledání) nástěnky bez filtru stavu; modul ho smí použít v příkazu pro vlastní agregaci. */
  params: QueryParams;
  labels: Labels;
};
```

### KanbanDropTarget

type · `packages/ui/src/data/kanban.tsx`

Cílový sloupec vedle sloupců stavů (Vyhráno, Prohráno…): objeví se při tahu karty a karta se na něj nepřesouvá,
jen se zavolá `onDrop` (modul typicky otevře dialog). Karta zůstane tam, kde byla.

```ts
type KanbanDropTarget = {
  id: string;
  label: string;
  /** Barva štítku (`green`, `red`…); bez ní šedá. */
  color?: string | undefined;
  /** Název ikony z `Icon` (`trophy`, `thumbs-down`). */
  icon?: string | undefined;
  /** Doplňující text pod názvem (např. „nebo klávesa W“). */
  hint?: string | undefined;
  /** Které karty cíl přijímá (výchozí všechny). */
  accepts?: ((row: RecordRow) => boolean) | undefined;
  onDrop: (rowId: string, row: RecordRow) => void | Promise<void>;
};
```

### LineChartProps

type · `packages/ui/src/charts/line-chart.tsx`

_Bez popisu._

```ts
type LineChartProps = {
  /** Kategorie jsou chronologické (den, týden, měsíc); osa X přeskakuje popisky podle místa. */
  categories: ChartCategory[];
  series: ChartSeries[];
  /** Plošný graf: pod čárou jemná výplň. */
  area?: boolean;
  format: ChartValueFormat;
  height?: number;
  ariaLabel: string;
  className?: string;
};
```

### Lookups

type · `packages/ui/src/data/types.ts`

Načítání možností pro výběr uživatele a odkazovaného záznamu (provádí aplikace přes server).

```ts
type Lookups = {
  records: (entity: string, q: string) => Promise<ComboOption[]>;
  users: (q: string) => Promise<ComboOption[]>;
};
```

### ModulePage

type · `packages/ui/src/data/module-ui.tsx`

Stránka modulu mimo seznamy entit (týdenní docházka, pohyby skladu, kalendář…).

```ts
type ModulePage = {
  /** Shodné s `pages[].path` v manifestu. */
  path: string;
  render: (p: { rest: string[]; query: Record<string, string> }) => ReactNode;
};
```

### ModuleUi

type · `packages/ui/src/data/module-ui.tsx`

Dlaždice přehledu, kterou kreslí modul sám (data dodává `widgets` na serveru).

```ts
type ModuleUi = {
  /** Podle klíče entity. */
  recordTabs?: Record<string, readonly RecordTab[]>;
  recordActions?: Record<string, readonly RecordAction[]>;
  /** Hromadné akce v seznamu podle klíče entity (zobrazí se při výběru řádků). */
  bulkActions?: Record<string, readonly BulkAction[]>;
  /** Skupiny záložek podle klíče entity; záložky se do nich řadí přes `RecordTab.group`. */
  recordTabGroups?: Record<string, readonly RecordTabGroup[]>;
  /** Pás pod názvem záznamu (čísla zakázky, hlavní akce podle fáze…); platí první nalezený modul. */
  recordHeader?: Record<string, RecordHeader>;
  /** Karty na Přehledu záznamu podle klíče entity; skládají se ze všech zapnutých modulů. */
  recordOverview?: Record<string, readonly RecordOverviewCard[]>;
  /** Rozšíření karty kanbanu podle klíče entity (tělo, „zhnilá“, sloty vpravo); platí první nalezený modul. */
  kanbanCard?: Record<string, KanbanCardExtension>;
  /** Doplňující řádek pod názvem sloupce kanbanu podle klíče entity (vážený součet); platí první nalezený modul. */
  kanbanColumnHeader?: Record<string, ComponentType<KanbanColumnContext>>;
  /**
   * Vlastní podoba detailu v pop-upu (`RecordDialog`) podle klíče entity; platí první nalezený modul. Tím se každý seznam
   * s `openMode="dialog"` (nástěnka, seznam, archiv) otevře ve stejném pop-upu; `EntityList` prop `recordDialog` ji přebije.
   */
  recordDialog?: Record<string, RecordDialogExt>;
  /** Základní záložky, které se u entity nezobrazují (`activity`, `tasks`, `files`). */
  hiddenCoreTabs?: Record<string, readonly ("activity" | "tasks" | "files")[]>;
  pages?: readonly ModulePage[];
  /** Komponenty do slotů hostitele (`<Slot name="…" />`); kontrakt props je v `SlotMap` (`@rebar/core/contracts`). */
  slots?: { [K in SlotName]?: ComponentType<SlotMap[K]> };
  /** Příkazy do palety Cmd+K. */
  paletteActions?: readonly PaletteAction[];
};
```

### NavApi

type · `packages/ui/src/nav.tsx`

_Bez popisu._

```ts
type NavApi = {
  /** Odkaz aplikace (v Next.js `next/link`, jinde obyčejné `<a>`). */
  Link: ComponentType<LinkProps>;
  push: (href: string) => void;
  replace: (href: string) => void;
  /** Znovu načte data stránky ze serveru (po změně, která se promítá do navigace). */
  refresh: () => void;
};
```

### NavItem

type · `packages/ui/src/shell/app-shell.tsx`

_Bez popisu._

```ts
type NavItem = {
  href: string;
  label: string;
  icon: string;
  count?: number;
  /** Barva odznaku s počtem (výchozí akcentová). */
  tone?: "warning" | "danger";
  /** Vedlejší stránky modulu, rozbalují se pod položkou. */
  children?: NavItem[];
};
```

### NavSection

type · `packages/ui/src/shell/app-shell.tsx`

_Bez popisu._

```ts
type NavSection = { heading?: string; items: NavItem[] };
```

### NiceScale

type · `packages/ui/src/charts/scale.ts`

_Bez popisu._

```ts
type NiceScale = {
  /** Spodní a horní mez osy (zaokrouhlené na krok). */
  min: number;
  max: number;
  step: number;
  /** Hodnoty „hezkých“ značek od min po max včetně. */
  ticks: number[];
};
```

### PaletteAction

type · `packages/ui/src/data/module-ui.tsx`

Příkaz do palety (Cmd+K), který modul nabízí („Nový obchod“, „Zapsat hodiny“…). Buď `href` (přejít), nebo `run`.
Vykresluje paletu C3; typ je tady, aby moduly mohly akce deklarovat hned.

```ts
type PaletteAction = {
  id: string;
  label: string;
  /** Slova navíc, podle kterých jde akci najít. */
  keywords?: string;
  /** Název ikony z `Icon`. */
  icon?: string;
  /** Akce se nabízí jen s některým z oprávnění (UI pohodlí; server kontroluje vždy). */
  permission?: string | readonly string[];
  href?: string;
  run?: (p: { push: (href: string) => void }) => void | Promise<void>;
};
```

### PaletteGroup

type · `packages/ui/src/components/command-palette.tsx`

_Bez popisu._

```ts
type PaletteGroup = { heading: string; items: PaletteItem[] };
```

### PaletteHit

type · `packages/ui/src/palette/logic.ts`

Nález hledání ze serveru (`SearchHit` z `@rebar/core/entities`; tvar je tu opsaný, aby UI nezávisel na serveru).

```ts
type PaletteHit = {
  entityType: string;
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
  label: string;
  labelMany: string;
  phone: string | null;
  email: string | null;
  driveFolderId: string | null;
  isPrivate: boolean;
};
```

### PaletteHostProps

type · `packages/ui/src/palette/palette-host.tsx`

Vstupy palety Cmd+K: navigace, entity k zakládání, funkce hledání a nedávných záznamů.

```ts
type PaletteHostProps = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Položky navigace (Přejít na…). */
  navItems: { href: string; label: string; icon: string }[];
  /** Entity, které aktér smí zakládat (příkazy „Nový …“). */
  creatable: { key: string; label: string; listPath: string }[];
  /** Akce otevřeného záznamu (registrované přes `usePaletteActions`). */
  contextual?: PaletteItem[];
  /** Hledání na serveru (respektuje viditelnost). */
  search: (q: string) => Promise<PaletteHit[]>;
  /** Posledních 8 otevřených záznamů. */
  recent: () => Promise<PaletteRecent[]>;
  onHelp: () => void;
};
```

### PaletteItem

type · `packages/ui/src/components/command-palette.tsx`

_Bez popisu._

```ts
type PaletteItem = {
  id: string;
  label: string;
  hint?: string;
  /** Podtitulek pod názvem (firma, fáze, telefon). */
  subtitle?: string;
  icon?: ReactNode;
  keywords?: string;
  shortcut?: string;
  actions?: PaletteRowAction[];
  onSelect: () => void;
};
```

### PaletteRecent

type · `packages/ui/src/palette/palette-host.tsx`

Naposledy otevřený záznam (z `recent_record`).

```ts
type PaletteRecent = {
  entityType: string;
  id: string;
  title: string;
  label: string;
  url: string;
};
```

### PaletteRowAction

type · `packages/ui/src/components/command-palette.tsx`

Akce u řádku, která nic neotevírá (zavolat, zkopírovat telefon, napsat e-mail, otevřít Disk).

```ts
type PaletteRowAction = {
  id: string;
  label: string;
  icon: ReactNode;
  /** Odkaz (`tel:`, `mailto:`, adresa složky na Disku). */
  href?: string;
  /** Otevře odkaz v nové záložce. */
  external?: boolean;
  /** Provede se po kliknutí (kopírování); paleta se přitom nezavře. */
  onRun?: () => void;
};
```

### PipelineStage

type · `packages/ui/src/data/pipeline-stepper-logic.ts`

Čistá logika pásu fází (bez Reactu), aby šla testovat samostatně.

```ts
type PipelineStage = {
  id: string;
  name: string;
  /** Barva štítku fáze (`LABEL_COLORS`); pás ji nese jako `data-color`, vzhled určuje stav (hotovo / aktuální / budoucí). */
  color?: string | undefined;
  kind?: "open" | "won" | "lost" | "done" | undefined;
  /** Počet dní, které záznam ve fázi strávil (nebo tráví); u fází, kterými neprošel, chybí. */
  daysInStage?: number | null | undefined;
};
```

### PipelineStepperProps

type · `packages/ui/src/data/pipeline-stepper.tsx`

Vlastnosti `PipelineStepper`.

```ts
type PipelineStepperProps = {
  stages: readonly PipelineStage[];
  /** Aktuální fáze; `null` = záznam ještě nemá fázi (všechny jsou budoucí). */
  currentId: string | null;
  /** Klik na jinou fázi než aktuální. Bez něj je pás jen k prohlížení. */
  onSelect?: ((stageId: string) => void) | undefined;
  /** Důvod, proč přechod do fáze nejde (zamčený přechod, zobrazí se v tooltipu); `null`/`undefined` = jde. */
  disabledReason?: ((stageId: string) => string | null | undefined) | undefined;
  /**
   * `md` = 40 px (detail; název a pod ním dny ve fázi), `compact` = 24 px (seznamy, jedna řádka),
   * `mini` = 20 px bez textu a bez minimální šířky segmentu (pruh pozice na úzké kartě; název je v popisku a tooltipu).
   */
  size?: "md" | "compact" | "mini";
  /** Celý pás vypnutý (např. chybí oprávnění zápisu); bez tooltipu. */
  disabled?: boolean | undefined;
  /** Popisek pro čtečky obrazovky. */
  label?: string;
  className?: string | undefined;
};
```

### QuickCondition

type · `packages/ui/src/data/filter-bar.tsx`

Navržená („rychlá“) podmínka: nabídne se v nabídce „Filtr“ ve skupině „Návrhy“ a jedním kliknutím přidá hotovou
podmínku (chybí-li jí hodnota, rovnou se otevře její editor). Nabídne se jen tehdy, když atribut existuje a smí se filtrovat.

```ts
type QuickCondition = { id: string; label: string; condition: Condition };
```

### RecordAction

type · `packages/ui/src/data/module-ui.tsx`

Akce v hlavičce detailu (např. „Vytvořit fakturu“, „Převést na zakázku“).

```ts
type RecordAction = {
  id: string;
  label: string;
  permission?: string | readonly string[];
  primary?: boolean;
  visible?: (row: RecordRow) => boolean;
  /** Pořadí v hlavičce záznamu (nižší dřív, výchozí 100; stejné pořadí = podle pořadí modulů). */
  order?: number;
  /**
   * Vlastní vykreslení místo statického tlačítka (např. tlačítko, jehož popisek se mění podle stavu). Komponenta
   * dostane záznam; `run`/`dialog` se pak nepoužijí.
   */
  render?: ComponentType<{ entity: EntityDescriptor; id: string; row: RecordRow }>;
  /** Přímá akce. Buď `run`, nebo `dialog` (okno s vlastním obsahem, např. výběr důvodu). */
  run?: (p: RecordActionContext) => void | Promise<void>;
  dialog?: {
    title: string;
    render: (p: RecordActionContext & { close: () => void }) => ReactNode;
  };
};
```

### RecordDialogExt

type · `packages/ui/src/data/module-ui.tsx`

Vlastní podoba detailu v pop-upu (`RecordDialog`, `EntityList openMode="dialog"`): modul nahradí hlavičku a Přehled
a omezí lištu záložek. Stránka záznamu (`/zakazky/<id>`) se tím nemění. Komponenty smějí používat hooky.

```ts
type RecordDialogExt = {
  /** Nahradí hlavičku (název, akce, pás od modulu `recordHeader`). */
  header?: ComponentType<RecordDialogParts>;
  /** Nahradí obsah záložky Přehled; vyplní celou plochu pod lištou záložek (sám řeší posouvání sloupců). */
  overview?: ComponentType<RecordDialogParts>;
  /** Jen tyto záložky v liště (id: `prehled`, `soubory`, `rozpocet`…); bez seznamu všechny. */
  tabs?: readonly string[];
};
```

### RecordDialogParts

type · `packages/ui/src/data/module-ui.tsx`

Co dostane vlastní hlavička a vlastní Přehled pop-upu (`RecordDialogExt`).

```ts
type RecordDialogParts = {
  entity: EntityDescriptor;
  id: string;
  row: RecordRow;
  labels: Labels;
  /** Zavře pop-up. */
  onClose: () => void;
  /** Přepne detail na záložku (a podzáložku), např. na Rozpočet. */
  openTab: (tab: string, sub?: string) => void;
  /** Smaže záznam (vratné toastem „Zpět“) a zavře pop-up; `undefined`, když to aktér nesmí. */
  remove: (() => void) | undefined;
};
```

### RecordHeader

type · `packages/ui/src/data/module-ui.tsx`

Pás pod názvem záznamu (čísla, hlavní akce podle stavu…).

```ts
type RecordHeader = (p: {
  entity: EntityDescriptor;
  id: string;
  row: RecordRow;
  /** Popisky vazeb (firma, kontakt, vedoucí…) pro odkazy a jména. */
  labels: Labels;
}) => ReactNode;
```

### RecordOpenMode

type · `packages/ui/src/data/entity-list.tsx`

Kde se záznam otevře po kliku: vlastní stránka (výchozí), boční panel nad seznamem, nebo pop-up s `?record=<id>`.

```ts
type RecordOpenMode = "dialog" | "page" | "panel";
```

### RecordOverviewCard

type · `packages/ui/src/data/module-ui.tsx`

Karta na Přehledu záznamu. Karty z různých modulů se skládají pod sebe (podle `order`); modul tak přidá
„poslední zápis z deníku“, „nespárované náklady“ apod. bez zásahu do záložky Přehled.

```ts
type RecordOverviewCard = {
  id: string;
  /** Hlavní sloupec (výchozí), nebo pravý panel pod údaji (tým, sdílení…). */
  column?: "main" | "side";
  /** Pořadí v sloupci (nižší dřív, výchozí 100). */
  order?: number;
  permission?: string | readonly string[];
  /** Karta se ukáže jen, když funkce vrátí `true` (např. podle fáze zakázky). */
  visible?: (row: RecordRow) => boolean;
  render: (p: {
    entity: EntityDescriptor;
    id: string;
    row: RecordRow;
    /** Přepne detail na záložku (a podzáložku), např. z karty „Otevřené vady“ na Realizace → Vady. */
    openTab: (tab: string, sub?: string) => void;
  }) => ReactNode;
};
```

### RecordResult

type · `packages/ui/src/data/api.ts`

_Bez popisu._

```ts
type RecordResult = { row: RecordRow; labels: Labels };
```

### RecordTab

type · `packages/ui/src/data/module-ui.tsx`

Záložka na detailu záznamu, kterou nabízí modul (např. Materiál na zakázce).

```ts
type RecordTab = {
  id: string;
  label: string;
  /** Zobrazí se jen uživateli s některým z oprávnění (UI pohodlí; skutečná kontrola je na serveru). */
  permission?: string | readonly string[];
  render: (p: {
    entity: EntityDescriptor;
    id: string;
    row: RecordRow;
    /** Přepne detail na jinou záložku (a podzáložku) bez navigace; adresu `?tab=` aktualizuje. */
    openTab?: (tab: string, sub?: string) => void;
  }) => ReactNode;
  /**
   * Skupina (`RecordTabGroup.id`), do které záložka patří: v liště je jedna záložka skupiny a uvnitř přepínač
   * jednotlivých záložek (Rozpočet, Náklady, Fakturace…). Bez skupiny je záložka samostatná.
   */
  group?: string;
  /** Pořadí v liště nebo ve skupině (nižší dřív, výchozí 100). */
  order?: number;
  /** Název ikony z `Icon` (jen u samostatných záložek). */
  icon?: string;
  /** Záložka se ukáže jen, když funkce vrátí `true` (např. podle fáze zakázky). */
  visible?: (row: RecordRow) => boolean;
};
```

### RecordTabGroup

type · `packages/ui/src/data/module-ui.tsx`

Skupina záložek na detailu (jedna záložka v liště, uvnitř přepínač).

```ts
type RecordTabGroup = {
  id: string;
  label: string;
  icon?: string;
  /** Pořadí v liště (výchozí 100; základní záložky: Přehled 0, Aktivita 800, Úkoly 810, Soubory 820). */
  order: number;
  permission?: string | readonly string[];
  /** Skupina se ukáže jen, když funkce vrátí `true` (např. podle fáze zakázky); platí pro všechny její záložky. */
  visible?: (row: RecordRow) => boolean;
};
```

### SavedViewInfo

type · `packages/ui/src/data/api.ts`

_Bez popisu._

```ts
type SavedViewInfo = {
  id: string;
  name: string;
  shared: boolean;
  mine: boolean;
  favorite: boolean;
  config: ViewConfig;
};
```

### SegmentOption

type · `packages/ui/src/components/segmented-control.tsx`

_Bez popisu._

```ts
type SegmentOption<T extends string> = {
  value: T;
  label: string;
  /** `accent` zvýrazní zvolenou možnost akcentovou barvou, `neutral` jen jemně. */
  tone?: "accent" | "neutral";
};
```

### ShellProps

type · `packages/ui/src/shell/app-shell.tsx`

_Bez popisu._

```ts
type ShellProps = {
  brand: { name: string; logoUrl?: string | null };
  user: { name: string; roleName: string };
  /** Pevné položky nahoře (Inbox, Moje úkoly) s počty. */
  top: NavItem[];
  /** Sekce Záznamy a Pohledy. */
  sections: NavSection[];
  /** Položky patičky nad Nastavením (Historie, Koš). */
  footer?: NavItem[];
  pathname: string;
  onSearch: () => void;
  onLogout: () => void;
  settingsHref?: string | null;
  securityHref?: string;
  /** Stránka Můj účet (profil, heslo, přihlášená zařízení); položka v nabídce uživatele. */
  accountHref?: string;
  /** Spodní navigace na telefonu; dostane funkci, která otevře celé menu. */
  bottomNav?: (openMenu: () => void) => ReactNode;
  children: ReactNode;
};
```

### ShortcutGroup

type · `packages/ui/src/components/shortcuts-dialog.tsx`

_Bez popisu._

```ts
type ShortcutGroup = { heading: string; items: { keys: string[]; label: string }[] };
```

### SourceCatalog

type · `packages/ui/src/dashboards/api.tsx`

Zdroje, ze kterých smí uživatel skládat widgety (entity, metriky) a role pro sdílení.

```ts
type SourceCatalog = {
  entities: { key: string; label: string; module: string }[];
  metrics: MetricInfo[];
  roles: { key: string; name: string }[];
  /** Hotové widgety, které aktér smí přidat (jen zapnuté moduly a oprávnění). */
  presets: WidgetPresetInfo[];
  /** Uložené pohledy použitelné ve widgetech Číslo, Seznam z pohledu a Rychlé odkazy. */
  views: ViewChoice[];
};
```

### SparklineProps

type · `packages/ui/src/charts/sparkline.tsx`

_Bez popisu._

```ts
type SparklineProps = {
  values: (number | null)[];
  ariaLabel: string;
  width?: number;
  height?: number;
  className?: string;
};
```

### StepState

type · `packages/ui/src/data/pipeline-stepper-logic.ts`

Stav jedné fáze v pásu vůči aktuální: hotová, aktuální, budoucí.

```ts
type StepState = "done" | "current" | "future";
```

### TextFieldProps

type · `packages/ui/src/components/form-controls.tsx`

_Bez popisu._

```ts
type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label: string;
  /** Ikona uvnitř pole vlevo (lucide, `size-4` se nastaví samo). */
  icon?: ReactNode;
  /** Vpravo uvnitř pole (např. přepínač zobrazení hesla). */
  trailing?: ReactNode;
  /** Vpravo na řádku popisku (např. odkaz „Zapomenuté heslo?“). */
  labelAction?: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  /** `compact` je hustší varianta pro nastavení uvnitř aplikace (výchozí je velké pole přihlášení). */
  density?: "comfortable" | "compact";
  ref?: Ref<HTMLInputElement>;
};
```

### TimelineItem

type · `packages/ui/src/data/api.ts`

_Bez popisu._

```ts
type TimelineItem =
  | {
      kind: "audit";
      id: string;
      at: string;
      actor: string;
      action: string;
      summary: string | null;
      changes: { field: string; old: unknown; new: unknown }[];
    }
  | {
      kind: "comment";
      id: string;
      at: string;
      actor: string;
      actorId: string;
      body: string;
      edited: boolean;
    };
```

### TopTab

type · `packages/ui/src/data/module-ui.tsx`

Záložka v liště detailu: samostatná záložka modulu, nebo skupina záložek s přepínačem.

```ts
type TopTab = {
  id: string;
  label: string;
  icon?: string;
  order: number;
  tabs: RecordTab[];
};
```

### VatChoice

type · `packages/ui/src/data/vat-rates.tsx`

Sazba DPH z Nastavení; `rateBp` v setinách procenta (21 % = 2100).

```ts
type VatChoice = { code: string; label: string; rateBp: number };
```

### VatRates

type · `packages/ui/src/data/vat-rates.tsx`

_Bez popisu._

```ts
type VatRates = { rates: VatChoice[]; defaultBp: number };
```

### ViewConfig

type · `packages/ui/src/data/types.ts`

_Bez popisu._

```ts
type ViewConfig = {
  viewType: "table" | "kanban";
  filters?: FilterGroup | undefined;
  sort?: { attr: string; dir: "asc" | "desc" }[] | undefined;
  group?: string | null | undefined;
  columns?: string[] | undefined;
  columnWidths?: Record<string, number> | undefined;
  cardAttributes?: string[] | undefined;
};
```

### ViewGroupDef

type · `packages/ui/src/data/view-layout.ts`

Skupina uložených pohledů v nabídce pohledů (pořadí skupin určuje pořadí v poli `ViewLayout.groups`).

```ts
type ViewGroupDef = { id: string; label: string; hint?: string };
```

### ViewLayout

type · `packages/ui/src/data/view-layout.ts`

Uspořádání pohledů seznamu: nejčastější jsou záložky, ostatní jedna nabídka po skupinách. Bez tohoto nastavení
zůstává pás záložek se všemi pohledy.

```ts
type ViewLayout = {
  groups: readonly ViewGroupDef[];
  /** Zařazení pohledu podle názvu a vlastnictví; `undefined` = nezařazený (spadne do „Moje pohledy“ / „Sdílené pohledy“). */
  meta: (view: SavedViewInfo) => ViewMeta | undefined;
  /** Nejvíc viditelných záložek kromě výchozího pohledu (výchozí 3). */
  maxPinned?: number;
};
```

### ViewMeta

type · `packages/ui/src/data/view-layout.ts`

Zařazení jednoho uloženého pohledu: skupina, krátký popis, kratší název do nabídky a zda je mezi viditelnými záložkami.

```ts
type ViewMeta = {
  group: string;
  description?: string;
  /** Název v nabídce, když skupina už říká, o co jde (např. „Čištění: bez úpravy 90 dní“ → „Bez úpravy 90 dní“). */
  label?: string;
  pinned?: boolean;
};
```
