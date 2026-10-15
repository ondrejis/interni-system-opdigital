import { expect, test } from "@playwright/test";

// Přehled (widgety, úpravy, telefon) je v `prehled-widgety.spec.ts`; tady zůstává jen cesta z úvodní adresy a PWA.
test("úvodní adresa vede na Přehled", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/prehled/);
  await expect(page.getByRole("navigation", { name: "Nástěnky" })).toBeVisible();
});

test("upozornění v telefonu: bez klíčů VAPID systém push nenabízí, s klíči ano", async ({
  page,
}) => {
  await page.goto("/nastaveni/upozorneni");
  const res = await page.request.get("/api/push/subscription");
  const state = (await res.json()) as { enabled: boolean; publicKey: string | null };
  if (state.enabled) {
    // lokální vývoj: klíče VAPID jsou v .env.local, stránka push nabízí
    expect(typeof state.publicKey).toBe("string");
    await expect(page.getByTestId("push-disabled")).toHaveCount(0);
  } else {
    // čistá instance (CI): bez klíčů se push nenabízí
    await expect(page.getByTestId("push-disabled")).toBeVisible();
    expect(state.publicKey).toBeNull();
  }
  expect((await page.request.get("/sw.js")).headers()["content-type"]).toContain("javascript");
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  expect(await manifest.json()).toMatchObject({ display: "standalone", start_url: "/" });
  const icon = await page.request.get("/pwa-icon/192");
  expect(icon.headers()["content-type"]).toBe("image/png");
});
