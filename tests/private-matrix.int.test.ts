import { describe, it } from "vitest";

/*
  Kostra (D §5.1, §3.1): matice soukromých záznamů pro každou entitu s `visibility` × řádky tabulky vynucení
  (queryRecords, getRecord, search, audit, export, emitDomain…) jako `partner` i `owner`. Vlastní C1 po dokončení
  zámku v jádru; do té doby `skip`.
*/
describe.skip("soukromé záznamy: matice vynucení (C1)", () => {
  it.todo("partner nevidí soukromý záznam v seznamu, detailu, hledání, součtech ani exportu");
  it.todo("owner vidí vše; nový záznam partnera je vždy sdílený");
  it.todo("dítě soukromého rodiče dědí zámek; zveřejnění zveřejní jen zděděné děti");
  it.todo("audit_log a webhooky neprozradí soukromé záznamy partnerovi");
});
