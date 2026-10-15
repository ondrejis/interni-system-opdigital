import { defaultStructure } from "@rebar/disk/api";
import { NONE, P, type Probe } from "./shared";

const COMPANY = { entityType: "company", id: NONE } as const;

/** Vstupy příkazů: modul „disk“ (DSK). Vše je globální: záznam, na který míří, neexistuje, a příkaz tedy nic nezmění. */
export const diskProbes: Record<string, Probe> = {
  "disk.folderState": P(() => COMPANY, true),
  "disk.requestFolder": P(() => ({ ...COMPANY, force: false }), true),
  "disk.retry": P(() => COMPANY, true),
  "disk.structure.get": P(() => ({}), true),
  "disk.structure.set": P(() => ({ structure: defaultStructure() }), true),
  "disk.enabled.set": P(() => ({ enabled: true }), true),
  "disk.status": P(() => ({}), true),
  "disk.test": P(() => ({}), true),
};
