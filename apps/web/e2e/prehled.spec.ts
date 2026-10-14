import { expect, test } from "@playwright/test";

test("přehled: pozornost, dlaždice modulů a moje úkoly", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("attention")).toBeVisible();
  await expect(page.getByTestId("widgets")).toBeVisible();
  await expect(page.getByTestId("widgets").getByText("Dnešní události")).toBeVisible();
  await expect(page.getByTestId("bottom-nav")).toBeHidden(); // na počítači spodní lišta není
});

test.describe("telefon", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("spodní navigace z manifestů modulů a velké dotykové plochy", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByTestId("bottom-nav");
    await expect(nav).toBeVisible();
    // Dnes, první tři položky modulů označené `bottom: true` v manifestu (Zakázky, CRM, Docházka) a Více
    for (const name of ["Dnes", "Zakázky", "CRM", "Docházka", "Více"])
      await expect(nav.getByText(name, { exact: true })).toBeVisible();

    // dotykové plochy ve spodní liště mají aspoň 44 px
    const box = await nav.getByRole("link", { name: "Zakázky" }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await nav.getByRole("link", { name: "Zakázky" }).click();
    await expect(page).toHaveURL(/\/zakazky$/);
    await expect(nav.getByRole("link", { name: "Zakázky" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await nav.getByRole("button", { name: "Více" }).click();
    await expect(page.getByRole("link", { name: "Kalendář", exact: true }).first()).toBeVisible();
  });
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
