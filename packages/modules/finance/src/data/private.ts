/*
  Soukromé záznamy (zámek) v ručních dotazech modulu (D §5.1, §5.4): každý dotaz nad `payment` a nad zakázkami, který
  nejde přes engine entit (příkazy, služby, metriky, příspěvky), musí přidat `privateScope`. Vše přichází z jádra
  (`@rebar/core/entities`); `syncPrivate` udržuje `private_record` u platby založené příkazem.
*/
export {
  canSeePrivate,
  isPrivateRecord,
  privateScope,
  syncPrivateRecord as syncPrivate,
} from "@rebar/core/entities";
