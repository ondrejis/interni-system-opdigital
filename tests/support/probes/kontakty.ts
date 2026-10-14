import { P, type Probe } from "./shared";

/** Vstupy příkazů: Kontakty. */
export const kontaktyProbes: Record<string, Probe> = {
  "kontakty.ares": P(() => ({ ico: "12345678" }), true),
};
