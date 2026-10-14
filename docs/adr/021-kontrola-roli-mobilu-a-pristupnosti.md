# ADR 021: Průřezová kontrola rolí, mobilu a přístupnosti

- Stav: přijato (2026-10-09)
- Kontext: ADR 015 (zakázka jako kořen, montér nevidí ceny), ADR 018 (detail zakázky, deník), `docs/SECURITY.md`

## Kontext

Procházecí testy (`pnpm test:crawl`) prošly jednotlivé moduly, ale ne to, co se mění podle role, šířky obrazovky a vstupu.
Průřezová kontrola našla: částky v upozorněních mistra a montéra, chybovou stránku místo „nenalezeno“ u stránek Nastavení,
vodorovné přetékání Přehledu a Strojů na telefonu, dvojí založení záznamu při rychlém dvojkliku, zápornou cenu a text místo
částky uložený jako nula, kontrast akcentní barvy a chybějící role dialogu u mobilního menu.

## Rozhodnutí

**Peníze v textu upozornění.** `createNotifications` vynechá částky z textu pro příjemce bez `zakazky.economics` a
`fakturace.read` (`MONEY_PERMISSIONS`); `listNotifications` totéž provede při čtení, aby se očistila i starší upozornění.
Příjemce se tak dozví, co se stalo („schválená vícepráce“), ne za kolik. Stejné pravidlo už platí pro časovou osu (`visibleAudit`).

**Stránky vyhrazené oprávnění** používají `requireCan(klíč)` z `apps/web/src/server/request.ts`: bez oprávnění je to
„Stránka nenalezena“ (stejně jako neexistující adresa), ne výjimka. `assertCan` zůstává pro datovou vrstvu a server actions.

**Chyby.** `toResult` převede očekávané chyby databáze (duplicita 23505, vazba 23503, mimo rozsah 23514, příliš dlouhý text
22001, neplatné číslo/datum 22003/22007/22P02, kolize transakcí 40001/40P01) na konkrétní české věty. Neočekávaná chyba dostane
kód `E-xxxxxxxx`: uživatel ho vidí v hlášce a stejný kód je v logu (`[chyba]`, štítek `errorId`), takže ji jde dohledat.
Chyby při vykreslení stránky zachytává `app/(app)/error.tsx` a `app/global-error.tsx` (kód = `digest` Next.js, který zapisuje
`onRequestError` v `instrumentation.ts`); neexistující adresy mimo aplikační rámec `app/not-found.tsx`.

**Meze hodnot.** Atribut entity má volitelné `min` a `max` (číslo, částka v haléřích); engine je vynucuje a vrací větu
(„Pole … nesmí být záporné“). Nastaveno u cen, zádržného, záruky, souřadnic, DPH, minima zásoby, nádrže a roku výroby.
Dialog „Nový záznam“ neodešle formulář, když má pole rozepsanou neplatnou hodnotu, a ignoruje druhé odeslání, dokud první běží.

**Mobil.** Mřížka bez vlastního počtu sloupců má jeden sloupec `minmax(0, 1fr)` (jinak ji široký obsah roztáhne přes obrazovku);
štítek (`.chip`) se zalomí místo přetečení; ikonová tlačítka mají na dotykovém zařízení 44 × 44 px; menu na telefonu je
dialog (zachytí focus, Esc ho zavře, focus se vrátí). Testy: `mobil-obrazovky.mobile.spec.ts` (360, 412 a 768 px, role
montér, mistr, kancelář a majitel).

**Přístupnost.** Automatická kontrola je `@axe-core/playwright` (vývojová závislost): standardní nástroj k Playwrightu,
malý, udržovaný a bez vlastního kódu v aplikaci; ruční kontrola popisků, rolí a kontrastu by byla delší a méně spolehlivá.
Kritické a vážné nálezy WCAG 2 A a AA na hlavních stránkách ve světlém i tmavém režimu test shodí (`pristupnost.crawl.spec.ts`).
Opraveno: kontrast textu na akcentu (`brandStyle` vybírá bílý nebo tmavý text podle kontrastu), akcent jako barva textu
(`--accent-text`), světlý šedý text (`--fg-subtle`), role v tabulce záznamů (`columnheader`, `gridcell`), živý popisek dnd-kitu mimo řádek.

## Důsledky

- Test rolí (`role-*.crawl.spec.ts`) bere záznamy z živé aplikace (seznamy majitele), takže nezávisí na konkrétních demo datech,
  ale předpokládá demo uživatele z `clients/demo/seed/users.ts`.
- Akcentní oranžová dostává tmavý text na tlačítkách. Klient s jinou barvou dostane automaticky vhodnější z obou.
- Tabulka seznamu (`overflow-auto`) a pásy záložek se na telefonu úmyslně posouvají vodorovně; stránka jako celek ne.
