# ADR 020: Exporty (XLSX, balík pro účetní) a odesílání faktur e-mailem

- Stav: přijato (2026-10-09)
- Kontext: ADR 009 (fronta úloh), ADR 012 (moduly a příkazy), ADR 017 (fakturace), Q28 a Q44 v `OPEN-QUESTIONS.md`

## Kontext

Faktury se uměly jen stáhnout jako PDF a exportovat jako CSV; odeslat je zákazníkovi musel člověk ručně z vlastní pošty.
Seznamy entit uměly jen klientský export CSV vybraných řádků. Účetní chce za měsíc jednu věc: doklady, souhrn a stav úhrad.

## Rozhodnutí

**Export seznamů je serverový a streamovaný.** `@rebar/core/export` zapisuje XLSX (OOXML) a ZIP bez závislostí:
`zip.ts` (deflate, datové popisy, žádné ZIP64), `xlsx.ts` (texty `inlineStr`, takže se nikdy nevyhodnotí jako vzorec;
čísla jako čísla, peníze v korunách s formátem `#,##0.00`, data jako data, procenta jako zlomek), `csv.ts`.
`prepareEntityExport` čte entitu po stránkách po 200 řádcích přes `queryRecords` (tedy se stejným oprávněním, rozsahem
„jen moje“ a skrytými atributy jako seznam v aplikaci), bere celou filtrovanou sadu s řazením a sloupci z pohledu a
odmítne víc než 50 000 řádků. Route `POST /api/export/<entita>` odpovídá streamem. Důvody pro vlastní zápis místo knihovny:
formát potřebujeme jen pro zápis tabulek, `exceljs` a spol. drží sešit v paměti a přinášejí desítky tranzitivních závislostí;
ověření je test, který soubor znovu rozbalí a zkontroluje CRC, a vykreslení v Numbers/Quick Look.
Oprávnění: `EntityDef.permissions.export` (volitelné; faktury `fakturace.export`), jinak stačí čtení. Stopa jde do auditu (`export`).
CSV: texty začínající `=`, `+`, `-`, `@` se neutralizují apostrofem (CSV injection v Excelu), čísla ne.

**Balík pro účetní** (`/fakturace/export`, `POST /api/fakturace/export`): ZIP s `souhrn.xlsx` (listy Souhrn, Vydané, Přijaté;
nebo dvě CSV), `vydane/<číslo>.pdf` a `prijate/<dodavatel>-<číslo>.<přípona>` (sken přijaté faktury). Vydané: všechny
vystavené doklady včetně dobropisů a uvolnění zádržného podle data vystavení; přijaté: schválené a uhrazené. U každého
dokladu je stav úhrady (uhrazeno, částečně, neuhrazeno, stornováno, dobropis) a datum poslední úhrady; PDP a zádržné jsou
ve sloupcích Režim DPH a Zádržné. PDF se vykreslují postupně při streamování. Chybějící sken a PDF, které nejde vytvořit,
skončí v `poznamky.txt`, balík se kvůli nim nezruší. Strop 500 dokladů na balík.

**Adaptéry účetních formátů** (`exports.ts`) mají XLSX vedle CSV (stejné sloupce, typovaně, řádek součtů). Pohoda a Money S3
se nedělají „pro jistotu“: přijdou podle požadavku klienta (Q61); výchozí je CSV a XLSX.

**Odesílání faktur e-mailem jde přes stávající frontu (`mail.send`).** Jádro dostalo šablonu „document“ (předmět a text
složí volající, podpis je v textu), kopii, `Reply-To` a přílohy. Příloha (PDF) leží v úložišti pod `mail/<logId>/…`,
ve frontě je jen odkaz; úloha ji po odeslání nebo definitivním selhání smaže. Text zprávy je ve frontě šifrovaný a v
`email_log` není (jen předmět). Odesílatel je `„Název firmy“ <adresa ze SMTP>`, odpovědi chodí na e-mail firmy.
Úloha `mail.send` navíc po vyčerpání pokusů označí e-mail jako `failed` (dřív zůstal navždy `queued`).

**Evidence odeslání** je tabulka `invoice_dispatch` (doklad nebo upomínka, příjemce, kopie, předmět, kdo, kdy, stav, důvod
selhání) s měkkým odkazem na `email_log`. Stav z `email_log` se přenáší do evidence a do sloupců faktury (`sent_on`,
`reminder_count`, `last_reminder_on`) funkcí `syncDispatches`; volá ji úloha `fakturace.dispatch.sync` každou minutu i
čtení evidence (stav na dokladu je aktuální hned). Selhání (po vyčerpání pokusů, nenastavené SMTP ve workeru) pošle
upozornění tomu, kdo e-mail odeslal. Do počtu upomínek se počítají jen úspěšně odeslané.

**Pravidla odeslání** (čistá funkce `dispatchBlocker`): koncept nejde odeslat; upomínku jde poslat jen po splatnosti u
neuhrazeného dokladu, který není dobropis ani stornovaný. Odeslání vyžaduje `fakturace.write` a zápisový přístup k faktuře;
bez nastaveného SMTP se odmítne s odkazem na Nastavení → E-maily (stránka `/nastaveni/email`). Hromadné odeslání (max. 50)
vrací výsledek po jednotlivých dokladech, před odesláním ukáže, komu co odejde a co se přeskočí.

**Šablony textů** jsou v `fakturaceSetting` (e-mail faktury a upomínky, výchozí kopie; platební podmínky, poznámka a
kontakt v patičce PDF faktury) a v `offerTemplateSetting` (Zakázky; úvod, podmínky, platnost, patička nabídky). Proměnné
`{cislo}`, `{castka}`, `{zbyva}`, `{splatnost}`, `{dnu_po_splatnosti}`, `{variabilni_symbol}`, `{ucet}`, `{nazev_firmy}`,
`{dodavatel}`, `{druh}`, `{zakazka}`; neznámá proměnná (překlep) se odmítne při uložení, v textu zůstává doslova.

## Důsledky

- Migrace `odeslani_faktur`: tabulka `invoice_dispatch` a tři sloupce u `invoice`.
- E-maily odesílá worker; bez workeru zůstávají ve frontě (UI ukáže „Ve frontě“).
- Přílohy jsou v úložišti jen po dobu doručování; zachycený soubor po výpadku workeru uklidí až další pokus.
- Nová závislost: žádná.
