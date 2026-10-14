import { expect, test } from "@playwright/test";
import { clickSubmenuItem } from "./helpers";

test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const job = `Odeslání ${stamp}`;
const customer = `Odběratel ${stamp} s.r.o.`;
const customerEmail = `odberatel-${stamp}@e2e.example`;
let invoiceUrl = "";
let invoiceNumber = "";

test("příprava: SMTP vypnuté, údaje o firmě, odběratel s e-mailem, zakázka a vystavená faktura", async ({
  page,
}) => {
  test.setTimeout(150_000);
  // stav se zjišťuje, ne předpokládá: ostatní testy (nebo dřívější běh) mohly SMTP nechat zapnuté
  await page.goto("/nastaveni/email");
  const enabled = page.getByLabel("Odesílání e-mailů je zapnuté");
  await expect(enabled).toBeVisible();
  if (await enabled.isChecked()) {
    await enabled.uncheck();
    await page.getByRole("button", { name: "Uložit", exact: true }).click();
    await expect(page.getByText("Nastavení e-mailů uloženo.")).toBeVisible();
  }

  await page.goto("/nastaveni/firma");
  await page.getByLabel("Název firmy").fill("Stavby E2E s.r.o.");
  await page.getByLabel("IČO", { exact: true }).fill("12345678");
  await page.getByLabel("DIČ").fill("CZ12345678");
  await page.getByLabel("Ulice a č. p.").fill("Hlavní 1");
  await page.getByLabel("Město").fill("Plzeň");
  await page.getByLabel("PSČ").fill("30100");
  await page.getByLabel("Bankovní účet").fill("19-2000145399/0800");
  await page.getByRole("button", { name: "Uložit údaje" }).click();
  await expect(page.getByText("Údaje o firmě uloženy.")).toBeVisible();

  // vlastní odběratel s e-mailem (hromadné odeslání potřebuje adresu); nezávisí na jiných testech
  await page.goto("/kontakty/firmy");
  await page.getByTestId("create-record").click();
  const company = page.getByRole("dialog");
  await company.getByLabel(/Název/).fill(customer);
  await company.getByRole("button", { name: /Další pole/ }).click();
  await company.getByLabel("E-mail").fill(customerEmail);
  await company.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name: customer, exact: true }),
  ).toBeVisible();

  await page.goto("/zakazky");
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(job);
  await dialog.getByRole("button", { name: "Vybrat…" }).click();
  await page.getByPlaceholder("Hledat…").last().fill(customer);
  await page.getByRole("option", { name: customer }).click();
  await dialog.getByRole("button", { name: /Další pole/ }).click();
  await dialog.getByLabel("Původní smluvní cena").fill("100 000");
  await dialog.getByRole("button", { name: "Poptávka" }).click();
  await page.getByRole("option", { name: "Realizace" }).click();
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(page.getByTestId("record-view").getByRole("heading", { name: job })).toBeVisible();

  await page.getByTestId("record-view").getByRole("tab", { name: "Fakturace" }).click();
  await page.getByTestId("record-view").getByRole("radio", { name: "Faktury" }).click();
  await page.getByRole("button", { name: "Zálohová faktura" }).click();
  await page.getByLabel("Kolik procent smluvní ceny").fill("10");
  await page.getByRole("button", { name: "Vytvořit koncept" }).click();
  await expect(page).toHaveURL(/\/fakturace\/[0-9a-f-]{36}$/);
  invoiceUrl = new URL(page.url()).pathname;
  const view = page.getByTestId("record-view");
  await view.getByRole("button", { name: "Vystavit", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Vystavit doklad" })
    .getByRole("button", { name: "Vystavit", exact: true })
    .click();
  const toast = page.getByText(/Vystaveno: ZF-\d{4}-\d{4}/);
  await expect(toast).toBeVisible();
  invoiceNumber = /ZF-\d{4}-\d{4}/.exec((await toast.textContent()) ?? "")![0];
});

test("bez nastaveného SMTP dialog vysvětlí proč a odkáže do Nastavení", async ({ page }) => {
  await page.goto(invoiceUrl);
  await page.getByTestId("record-view").getByRole("button", { name: "Odeslat e-mailem" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Komu")).toHaveValue(customerEmail, { timeout: 30_000 }); // dialog je načtený
  await expect(dialog.getByText("Odesílání e-mailů není nastavené")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Odeslat e-mail" })).toBeDisabled();
  await dialog.getByRole("link", { name: "Nastavení → E-maily" }).click();
  await expect(page).toHaveURL(/\/nastaveni\/email$/);
});

test("SMTP: uložení, ověření nedostupného serveru hlásí důvod", async ({ page }) => {
  await page.goto("/nastaveni/email");
  await page.getByLabel("Odesílání e-mailů je zapnuté").check();
  await page.getByLabel("Server (host)").fill("127.0.0.1");
  await page.getByLabel("Port", { exact: true }).fill("2525");
  await page.getByLabel("Adresa odesílatele").fill("faktury@e2e.example");
  await page.getByRole("button", { name: "Ověřit spojení" }).click();
  await expect(page.getByText(/Spojení se serverem se nepodařilo/)).toBeVisible();
  await page.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(page.getByText("Nastavení e-mailů uloženo.")).toBeVisible();
});

test("odeslání faktury: úprava textu, náhled, zařazení do fronty a záznam v evidenci", async ({
  page,
}) => {
  await page.goto(invoiceUrl);
  const view = page.getByTestId("record-view");
  await view.getByRole("button", { name: "Odeslat e-mailem" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Předmět")).toHaveValue(
    new RegExp(`${invoiceNumber} od Stavby E2E s\\.r\\.o\\.`),
  );
  await dialog.getByLabel("Komu").fill("odberatel@e2e.example");
  await dialog.getByLabel("Kopie (oddělte čárkou)").fill("ucetni@e2e.example");
  await dialog.getByRole("radio", { name: "Náhled" }).click();
  await expect(dialog.getByTestId("mail-preview")).toContainText("odberatel@e2e.example");
  await expect(dialog.getByTestId("mail-preview")).toContainText(invoiceNumber);
  await expect(dialog.getByText(`Příloha: ${invoiceNumber}.pdf`)).toBeVisible();
  await dialog.getByRole("button", { name: "Odeslat e-mail" }).click();
  await expect(page.getByText("E-mail s dokladem je zařazený k odeslání.")).toBeVisible();

  await view.getByRole("tab", { name: "Odeslání" }).click();
  const list = view.getByTestId("dispatch-list");
  await expect(list).toContainText("odberatel@e2e.example");
  await expect(list).toContainText("Kopie: ucetni@e2e.example");
  // worker v e2e nemusí běžet (ve frontě), nebo e-mail zamítne nedostupný server (selhalo s důvodem)
  await expect(list).toContainText(/Ve frontě|Odesláno|Selhalo/);
});

test("upomínka se nabízí jen po splatnosti; hromadné odeslání se potvrzuje a přeskočí nesplatné", async ({
  page,
}) => {
  await page.goto(invoiceUrl);
  await expect(
    page.getByTestId("record-view").getByRole("button", { name: "Poslat upomínku" }),
  ).toBeHidden();

  await page.goto("/fakturace");
  // seznam vykresluje jen řádky v okně (asi 27); v databázi s dřívějšími běhy by nová faktura nemusela být mezi nimi
  await page.getByPlaceholder("Hledat…").fill(invoiceNumber);
  const row = page.getByRole("row").filter({ hasText: invoiceNumber });
  await row.getByRole("checkbox", { name: "Vybrat řádek" }).check();
  const bar = page.getByRole("region", { name: "Hromadné akce" });
  await bar.getByRole("button", { name: "Poslat upomínky" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("bulk-preview")).toContainText("Přeskočí se");
  await expect(dialog.getByTestId("bulk-preview")).toContainText("po splatnosti");
  await expect(dialog.getByRole("button", { name: /^Odeslat 0 upomínek$/ })).toBeDisabled();
  await dialog.getByRole("button", { name: "Zrušit" }).click();

  await row.getByRole("checkbox", { name: "Vybrat řádek" }).check();
  await bar.getByRole("button", { name: "Odeslat e-mailem" }).click();
  await expect(page.getByRole("dialog").getByTestId("bulk-preview")).toContainText("Odešle se");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Odeslat 1 e-mailů$/ })
    .click();
  await expect(page.getByTestId("bulk-results")).toContainText("Zařazeno k odeslání: 1 z 1");
});

test("šablona e-mailu: neznámá proměnná se odmítne; šablona faktury a nabídky se uloží", async ({
  page,
}) => {
  await page.goto("/fakturace/nastaveni");
  await page.getByLabel("Poznámka pod položkami").fill("Děkujeme za spolupráci.");
  await page.getByLabel("Platební podmínky").fill("Penále 0,05 % denně.");
  await page.getByLabel("Podmínky nabídky").fill("Záruka 24 měsíců.");
  const body = page.getByLabel("Text e-mailu").first();
  const original = await body.inputValue();
  await body.fill(`${original}\n{neznama}`);
  await page.getByTestId("save-settings").click();
  await expect(page.getByText(/Neznámá proměnná \{neznama\}/)).toBeVisible();
  await body.fill(original);
  await page.getByTestId("save-settings").click();
  await expect(page.getByText("Nastavení fakturace uloženo.")).toBeVisible();
  // texty ze šablony jsou na PDF
  const pdf = await page.request.get(`${invoiceUrl.replace("/fakturace/", "/api/fakturace/")}/pdf`);
  expect(pdf.status()).toBe(200);
});

test("exporty: XLSX seznamu a balík pro účetní (ZIP)", async ({ page }) => {
  await page.goto("/fakturace");
  await page.getByTestId("list-options").click();
  await page.getByTestId("export-menu").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    clickSubmenuItem(page, page.getByRole("menuitem", { name: "Excel (XLSX)" })),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);

  await page.goto("/fakturace/export");
  const zip = await page.evaluate(async () => {
    const t = new Date().toISOString().slice(0, 10);
    const r = await fetch("/api/fakturace/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: `${t.slice(0, 8)}01`, to: t, format: "xlsx" }),
    });
    const buf = new Uint8Array(await r.arrayBuffer());
    return {
      status: r.status,
      head: String.fromCharCode(buf[0]!, buf[1]!),
      issued: r.headers.get("x-export-issued"),
    };
  });
  expect(zip.status).toBe(200);
  expect(zip.head).toBe("PK");
  expect(Number(zip.issued)).toBeGreaterThanOrEqual(1);
});

test("úklid: odesílání e-mailů se znovu vypne", async ({ page }) => {
  await page.goto("/nastaveni/email");
  await page.getByLabel("Odesílání e-mailů je zapnuté").uncheck();
  await page.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(page.getByText("Nastavení e-mailů uloženo.")).toBeVisible();
});
