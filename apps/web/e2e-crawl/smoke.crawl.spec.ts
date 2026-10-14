import { test } from "@playwright/test";
import { collectErrors, visit } from "./helpers";

/** Ukázkový průchod: hlavní obrazovky se otevřou bez chyby. Rozšiřují ho soubory `*.crawl.spec.ts` jednotlivých oblastí. */
const PAGES = [
  "/",
  "/inbox",
  "/ukoly",
  "/zakazky",
  "/kontakty/firmy",
  "/fakturace",
  "/nastaveni/firma",
];

test("hlavní obrazovky se otevřou bez chyby", async ({ page }) => {
  const c = collectErrors(page);
  for (const p of PAGES) await visit(page, p, c);
});
