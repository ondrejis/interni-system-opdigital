import { expect, test, type Locator, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const van = `Dodávka ${stamp}`;
const defect = `Netěsní hydraulika ${stamp}`;
const plate = `E2E${stamp}`.toUpperCase();

async function pick(page: Page, trigger: Locator, search: string) {
  await trigger.click();
  await page.getByPlaceholder("Hledat…").last().fill(search);
  await page.getByRole("option").filter({ hasText: search }).first().click();
}

async function openAsset(page: Page) {
  await page.goto("/stroje/evidence");
  await page.getByPlaceholder("Hledat…").fill(stamp);
  const row = page.getByRole("row").filter({ hasText: van });
  await row.hover();
  await row.getByRole("button", { name: "Otevřít" }).click();
  return page.getByTestId("record-view");
}

test("karta stroje: založení s výchozím druhem, SPZ velkými písmeny", async ({ page }) => {
  await page.goto("/stroje/evidence");
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(van);
  await dialog.getByRole("button", { name: /Další pole/ }).click();
  await dialog.getByLabel("SPZ").fill(plate.toLowerCase());
  await dialog.getByLabel("Stav tachometru").fill("50000");
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  const view = page.getByTestId("record-view");
  await expect(view.getByRole("heading", { name: van })).toBeVisible();
  await expect(view).toContainText(plate);
});

test("kniha jízd: zápis ze stránky Stroje zvýší stav a objeví se v knize", async ({ page }) => {
  await page.goto("/stroje");
  await page.getByRole("button", { name: "Zapsat jízdu / provoz" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Zapsat jízdu nebo provoz" });
  await pick(page, dialog.getByRole("button", { name: /^Stroj/ }), stamp);
  // počáteční stav se předvyplní z posledního známého
  await expect(dialog.getByLabel(/Počáteční stav/)).toHaveValue("50000");
  await dialog.getByLabel(/Konečný stav/).fill("50120");
  await dialog.getByLabel("Trasa").fill("Plzeň – Rokycany");
  await dialog.getByLabel("Účel").fill("Rozvoz materiálu");
  await dialog.getByRole("button", { name: "Zapsat", exact: true }).click();
  await expect(page.getByText("Zapsáno: 120,0")).toBeVisible();

  await page.getByRole("link", { name: "Kniha jízd" }).click();
  await expect(page).toHaveURL(/\/stroje\/kniha$/);
  const row = page.getByTestId("log-row").filter({ hasText: "Rozvoz materiálu" });
  await expect(row.first()).toContainText("Plzeň – Rokycany");
  await expect(row.first()).toContainText("120 km");
});

test("tankování: spotřeba mezi plnými nádržemi", async ({ page }) => {
  const view = await openAsset(page);
  await view.getByRole("tab", { name: "Tankování" }).click();
  for (const [meter, liters, total] of [
    ["50200", "40", "1600"],
    ["50700", "35", "1400"],
  ] as const) {
    await view.getByRole("button", { name: "Natankováno" }).click();
    const dialog = page.getByRole("dialog", { name: "Natankováno" });
    await dialog.getByLabel(/Stav tachometru/).fill(meter);
    await dialog.getByLabel("Litrů").fill(liters);
    await dialog.getByLabel("Částka z účtenky").fill(total);
    await dialog.getByRole("button", { name: "Zapsat tankování" }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(view.getByTestId("fuel-row")).toHaveCount(2);
  await expect(view).toContainText("Průměrná spotřeba 7,0 l/100 km");
});

test("servis: interval, zápis servisu splní interval", async ({ page }) => {
  const view = await openAsset(page);
  await view.getByRole("tab", { name: "Servis" }).click();
  await view.getByRole("button", { name: "Nový interval" }).click();
  let dialog = page.getByRole("dialog", { name: "Servisní interval" });
  await dialog.getByLabel("Název").fill("Výměna oleje");
  await dialog.getByLabel(/^Každých/).fill("15000");
  await dialog.getByLabel(/Stav při posledním/).fill("30000");
  await dialog.getByRole("button", { name: "Uložit interval" }).click();
  await expect(view.getByTestId("intervals")).toContainText("Výměna oleje");
  await expect(view.getByTestId("intervals")).toContainText("překročeno");

  await view.getByRole("button", { name: "Zapsat servis" }).click();
  dialog = page.getByRole("dialog", { name: "Servis" });
  await dialog.getByLabel("Co se dělalo").fill("Olej a filtry");
  await dialog.getByLabel("Cena servisu").fill("6500");
  await pick(page, dialog.getByRole("button", { name: /^Interval/ }), "Výměna oleje");
  await dialog.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(view.getByTestId("service-row")).toContainText("Olej a filtry");
  await expect(view.getByTestId("intervals")).toContainText("zbývá");
});

test("rezervace: kolize se odmítne s vysvětlením", async ({ page }) => {
  const view = await openAsset(page);
  await view.getByRole("tab", { name: "Rezervace" }).click();
  await view.getByRole("button", { name: "Rezervovat" }).click();
  let dialog = page.getByRole("dialog", { name: "Rezervace" });
  await dialog.getByRole("button", { name: "Rezervovat", exact: true }).click(); // dnes až dnes
  await expect(dialog).toBeHidden();
  await expect(view.getByTestId("reservations")).toBeVisible();

  await view.getByRole("button", { name: "Rezervovat" }).click();
  dialog = page.getByRole("dialog", { name: "Rezervace" });
  await dialog.getByRole("button", { name: "Rezervovat", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("už rezervovaný");
});

test("závada: blokující závada odstaví stroj, vyřešení ho vrátí", async ({ page }) => {
  await page.goto("/stroje");
  await page.getByRole("button", { name: "Nahlásit závadu" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Nahlásit závadu" });
  await pick(page, dialog.getByRole("button", { name: /^Stroj/ }), stamp);
  await dialog.getByLabel("Co je špatně").fill(defect);
  await dialog.getByLabel(/Stroj nesmí jet/).click();
  await dialog.getByRole("button", { name: "Nahlásit závadu" }).click();
  await expect(page.getByText(/Závada nahlášena/)).toBeVisible();

  await expect(page.getByTestId("fleet-card").filter({ hasText: van })).toContainText(
    "Mimo provoz",
  );

  await page.goto("/stroje/zavady");
  await page.getByPlaceholder("Hledat…").fill(defect);
  const row = page.getByRole("row").filter({ hasText: defect }).first();
  await row.hover();
  await row.getByRole("button", { name: "Otevřít" }).click();
  const view = page.getByTestId("record-view");
  await view.getByRole("button", { name: "Vyřešit závadu" }).click();
  const resolve = page.getByRole("dialog", { name: "Vyřešit závadu" });
  await resolve.getByLabel("Jak se vyřešilo").fill("Vyměněno těsnění");
  await resolve.getByRole("button", { name: "Vyřešit", exact: true }).click();
  await expect(page.getByText("Vyřešeno, stroj je zpět v provozu.")).toBeVisible();

  await page.goto("/stroje");
  await expect(page.getByTestId("fleet-card").filter({ hasText: van })).not.toContainText(
    "Mimo provoz",
  );
});
