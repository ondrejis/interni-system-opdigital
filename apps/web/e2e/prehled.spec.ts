import { deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const company = `Firma ${stamp}`;
const job = `Terén ${stamp}`;
/** Platný PNG 8×8 poskládaný přímo (jednobarevný), aby se test nespoléhal na pevně vložená data. */
function makePng(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 255]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const size = 8;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // hloubka
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, 180)]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const PNG = makePng();

test("přehled: pozornost, dlaždice modulů a moje úkoly", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("attention")).toBeVisible();
  await expect(page.getByTestId("widgets")).toBeVisible();
  await expect(page.getByTestId("widgets").getByText("Dnešní události")).toBeVisible();
  await expect(page.getByTestId("widgets").getByText("Stroje v provozu")).toBeVisible();
  await expect(page.getByTestId("bottom-nav")).toBeHidden(); // na počítači spodní lišta není
});

test("příprava: firma a zakázka pro fotky", async ({ page }) => {
  await page.goto("/kontakty/firmy");
  await page.getByTestId("create-record").click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(company);
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name: company }),
  ).toBeVisible();

  await page.goto("/zakazky");
  await page.getByTestId("create-record").click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(job);
  await dialog.getByRole("button", { name: "Vybrat…" }).click();
  await page.getByPlaceholder("Hledat…").last().fill(company);
  await page.getByRole("option").first().click();
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(page.getByTestId("record-view").getByRole("heading", { name: job })).toBeVisible();
});

test.describe("telefon", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("spodní navigace, píchačka na úvodní stránce a velké dotykové plochy", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByTestId("bottom-nav");
    await expect(nav).toBeVisible();
    for (const name of ["Dnes", "Docházka", "Zakázky", "Foto", "Více"])
      await expect(nav.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByTestId("home-clock")).toBeVisible();
    await expect(
      page.getByTestId("home-clock").getByRole("button", { name: "Příchod" }),
    ).toBeVisible();

    // dotykové plochy ve spodní liště a u píchačky mají aspoň 44 px
    for (const target of [
      nav.getByRole("link", { name: "Zakázky" }),
      page.getByTestId("home-clock").getByRole("button", { name: "Příchod" }),
    ]) {
      const box = await target.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    await nav.getByRole("link", { name: "Zakázky" }).click();
    await expect(page).toHaveURL(/\/zakazky$/);
    await expect(nav.getByRole("link", { name: "Zakázky" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await nav.getByRole("button", { name: "Více" }).click();
    await expect(page.getByRole("link", { name: "Sklad", exact: true }).first()).toBeVisible();
  });

  test("fotka z terénu se zmenší, odešle na pozadí a uloží k zakázce", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("bottom-nav").getByRole("button", { name: "Foto" }).click();
    const dialog = page.getByRole("dialog", { name: "Přidat fotky" });
    await dialog.getByRole("button", { name: /^Zakázka/ }).click();
    await page.getByPlaceholder("Hledat…").last().fill(job);
    await page.getByRole("option").filter({ hasText: job }).first().click();
    await dialog.getByLabel("Vybrat z galerie").setInputFiles({
      name: "e2e-foto.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(dialog.getByRole("img", { name: "Fotka 1" })).toBeVisible();
    await dialog.getByRole("button", { name: /^Odeslat/ }).click();
    await expect(page.getByText("Fotka se odesílá.")).toBeVisible();

    // fronta se vyprázdní (badge u Foto zmizí) a soubor je u zakázky
    await expect(
      page.getByTestId("bottom-nav").getByRole("button", { name: "Foto" }),
    ).toBeVisible();
    await expect
      .poll(async () =>
        (
          await page.getByTestId("bottom-nav").getByRole("button", { name: /^Foto/ }).innerText()
        ).trim(),
      )
      .toBe("Foto");
    await page.goto("/zakazky");
    await page.getByPlaceholder("Hledat…").fill(stamp);
    // na telefonu je seznam jako karty, ne tabulka
    await page
      .getByTestId("card-list")
      .getByRole("button", { name: new RegExp(job) })
      .click();
    const view = page.getByTestId("record-view");
    await view.getByRole("tab", { name: /Soubory/ }).click();
    await expect(view.getByText("e2e-foto.png")).toBeVisible();
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
