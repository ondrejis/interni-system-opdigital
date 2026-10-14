import { describe, it } from "vitest";

/*
  Kostra (D §5.4): canary test ručních čtecích cest. Založí fixture se soukromými záznamy s řetězcem
  `PRIVATE-CANARY-<n>`, spustí každou položku `privatePaths` (widget, metrika, vrstva, služba, příspěvek karty klienta,
  navBadges) jako `partner` a ověří, že výsledek canary neobsahuje; jako `owner` ho obsahovat musí. Vlastní QA-SEC;
  do té doby `skip`.
*/
describe.skip("soukromé záznamy: ruční čtecí cesty modulů (QA-SEC)", () => {
  it.todo("každý widget, metrika, vrstva, služba a příspěvek má záznam v privatePaths");
  it.todo(
    "partner: výsledek privatePaths neobsahuje PRIVATE-CANARY, součty se rovnají hodnotě bez soukromých dat",
  );
  it.todo("owner: výsledek obsahuje PRIVATE-CANARY");
});
