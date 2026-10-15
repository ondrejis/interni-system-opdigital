# ADR 017: Fakturace zakázky: zálohy, zádržné, přenesená daňová povinnost, konečné vyúčtování

- Stav: v OPSYS se nepoužívá (stavební fakturace odstraněna, viz ADR 028); původně přijato (2026-10-09)
- Kontext: ADR 015 (zakázka jako kořen), ADR 003 (peníze), ADR 012 (moduly a příkazy), `docs/_archiv/ZAKAZKA.md` (oblast 5)

## Kontext

Vydané faktury uměly zálohu, průběžnou fakturu, vyúčtování a dobropis z odhadu zakázky. Stavební zakázka potřebuje navíc
zádržné, přenesenou daňovou povinnost (PDP), fakturu ze soupisu prací, vyúčtování po zálohách a dílčích fakturách
a zamčený vystavený doklad. Čísla se čtou v souhrnu zakázky (`zakazky.summary`) a v hlavičce.

## Rozhodnutí

**Role řádku.** `invoice_line.role`: `work` (plnění), `previous` (odpočet už fakturovaných prací), `advance` (odpočet zaplacené
zálohy), `retention` (strženo zádržné, záporný základ), `release` (uvolněné zádržné). `ref_invoice_id` odkazuje na doklad,
který řádek odečítá (záloha, dílčí faktura); `budget_item_id` na položku rozpočtu. Součty dokladu (`documentTotals`) zůstávají
jedna čistá funkce; role slouží jen k výpočtům zádržného a rekapitulace.

**Zádržné je záporný řádek, ne srážka z úhrady.** Dílčí a konečná faktura strhne `job.retention_bp` (setiny procenta) ze základu
plnění po sazbách DPH; řádek „Zádržné x % z …“ je součástí dokladu, takže základ, DPH i částka k úhradě sedí a platby fungují
beze změny. `invoice.retention_minor` je kladný součet stržené částky. Zádržné se počítá z plnění před odpočtem záloh;
základ tvoří řádky `work` a `previous`. Při každém uložení konceptu se zádržné přepočítá ze sazby zakázky.
Uvolnění je samostatný doklad `kind = retention` z řady `fakturace.faktura`, s řádky `release` podle původních sazeb DPH
(DPH ze zádržného se tedy přizná při uvolnění). Jde po předání (fáze Předání, Záruka, Uzavřeno), celé nebo částečně;
nelze uvolnit víc, než je drženo. Uzavření zakázky (fáze `closed`) blokuje neuvolněné zádržné (hook fakturace). Daňové zacházení
se zádržným si má klient ověřit s účetní; model je přizpůsobí změnou sazeb na řádcích.

**Přenesená daňová povinnost.** `job.vat_mode = reverse_charge` se přenese na koncept (`invoice.vat_mode`, jde přepnout
na konceptu). Všechny řádky mají sazbu 0, `documentTotals(lines, { vatMode })` dává jedinou skupinu bez DPH. Doklad nese text
„Daň odvede zákazník (§ 92a zákona č. 235/2004 Sb., o DPH)“, DIČ odběratele a volitelný kód CZ-CPA z nastavení fakturace.
Vystavení vyžaduje, aby měl dodavatel (plátce) i odběratel DIČ.

**Zálohy a konečná faktura.** Konečná faktura je rekapitulace: zbývající plnění po položkách rozpočtu (smluvní cena
= realizační rozpočet, jinak poslední nabídka, plus schválené změny, které se do rozpočtu nepropsaly) minus plnění už
vyfakturované dílčími fakturami (po položkách, nebo odpočtem bez vazby na položku) minus zaplacené zálohy (řádek „Odpočet
zálohy ZF-…“ s odkazem) minus zádržné. Záloha se odečte jednou (jen zaplacená a dosud neodečtená), nezaplacená se hlásí.
Druhou konečnou fakturu systém nedovolí. Rozpočet čtou faktury přímo z tabulek `budget_*` (schéma je ustálené; rozhraní
`budgetApi` by přidalo jen závislost), soupisy přes `statementsApi` (`createInvoiceDraft`, `markInvoiced`, `clearInvoiced`).

**Faktura ze soupisu.** Z hotového (schváleného) soupisu vznikne koncept průběžné faktury s řádky po položkách rozpočtu a obdobím
v poznámce; krácení při schválení je záporný řádek. Soupis se označí jako vyfakturovaný při vystavení a uvolní při stornu
dobropisem.

**Zamykání.** Vystavený doklad má `locked_at`; příkazy odmítnou změnu českou větou „proč“ (`lockReason`, ukazuje se v UI
u zamčené faktury). Opravou je dobropis. Výjimečné vrácení do konceptu (`fakturace.reopen`) smí jen držitel `zakazky.approve_all`,
jen doklad bez úhrady, dobropisu a odečtu jinde; zapíše se do auditu s důvodem a doklad si ponechá číslo (v řadě nevzniká díra).
`approvalsApi.assertUnlocked` se pro faktury nepoužívá: jeho hláška radí vrátit doklad do konceptu, u faktury je správná oprava dobropis.

**Souhrn zakázky.** Po každé změně faktury (koncept, vystavení, úhrada, dobropis, vrácení) se volá
`costsApi.recomputeJobSummary` jako poslední krok transakce. Fakturace dodává poskytovatele `jobInvoicing` (vyfakturováno
a uhrazeno bez DPH; zádržné drženo se do vyfakturovaného nepočítá).

## Důsledky

- Migrace `radky_role_zadrzne` přidává `invoice_line.role` a `ref_invoice_id`; stávající řádky jsou `work`.
- Export (CSV) má sloupce Režim DPH a Zádržné; další adaptéry (Pohoda, Money) zatím neexistují.
- `fakturace.createFromJob` už nečte odhad (`job_estimate_line`); zakázka bez rozpočtu fakturuje z hodnoty zakázky.
- Zálohová faktura zůstává nedaňovým dokladem s DPH po řádcích; „doklad o přijaté platbě“ se zatím nevystavuje.
