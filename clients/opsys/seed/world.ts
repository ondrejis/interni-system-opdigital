import type { Ctx } from "@rebar/core/rbac";
import type { ContactIds } from "./contacts";
import type { Kit } from "./kit";
import type { DemoUserKey } from "./users";

export type Member = { id: string; name: string; ctx: Ctx };

/** Všechno, co potřebují jednotlivé části seedu: nástroje, přihlášení uživatelé a založené kontakty. */
export type World = {
  kit: Kit;
  cast: Record<DemoUserKey, Member>;
  contacts: ContactIds;
};
