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
  /** Zakázky podle klíče (plní `jobs.ts`). */
  jobs: Record<string, DemoJob>;
  /** Zakázky v pořadí vzniku. */
  jobList: DemoJob[];
  /** Zpětné datování po skončení seedu (přechody fází se dějí „dnes“, v ukázce mají mít skutečné termíny). */
  dateFixes: DateFix[];
};

export type DateFix = {
  jobId: string;
  createdAt?: string;
  wonAt?: string;
  handoverAt?: string;
  closedAt?: string;
  warrantyUntil?: string;
  /** Kdy zakázka vstoupila do současné fáze. */
  phaseChangedAt?: string;
};

export type DemoJob = {
  key: string;
  id: string;
  number: string;
  title: string;
  /** Položky rozpočtu podle názvu oddílu a položky (pro objednávky, soupisy a změny). */
  items: { id: string; title: string; sectionId: string; section: string }[];
  sections: Record<string, string>;
  manager: DemoUserKey;
  members: DemoUserKey[];
};

export const money = (kc: number) => Math.round(kc * 100);
