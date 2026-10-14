import type { ClientExtension } from "@rebar/core";
import { exampleExtension } from "./example";

/** Rozšíření tohoto klienta. Připojují se jen přes veřejné události a sloty jádra. */
export const extensions: ClientExtension[] = [exampleExtension];
