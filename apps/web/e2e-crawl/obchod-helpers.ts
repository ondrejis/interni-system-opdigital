import { inflateRawSync } from "node:zlib";
import { expect, type Locator, type Page } from "@playwright/test";

/*
  Pomocníci procházecích testů obchodního řetězce (zakázky, rozpočet, náklady, fakturace).
  Všechno si test vytváří sám přes UI s unikátním `stamp`; nic nezávisí na konkrétních demo datech.
*/

export const newStamp = () => Math.random().toString(36).slice(2, 8);

/** Vytvoří firmu přes stránku Firmy a vrátí její název. */
export async function createCompany(page: Page, name: string): Promise<string> {
  await page.goto("/kontakty/firmy");
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(name);
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  await expect(
    page.getByTestId("record-view").getByRole("heading", { name, exact: true }),
  ).toBeVisible();
  return name;
}

export type NewJob = {
  title: string;
  company: string;
  /** Fáze, ve které zakázka vznikne (výchozí Poptávka). */
  phase?: "Poptávka" | "Nabídka" | "Příprava" | "Realizace" | "Předání" | "Záruka";
  address?: string;
  /** Původní smluvní cena (text jako ho píše uživatel, např. „100 000“). */
  value?: string;
  /** Režim DPH (text volby), např. „Přenesená daňová povinnost“. */
  vatMode?: string;
  /** Zádržné v procentech (text pole). */
  retention?: string;
};

/** Založí zakázku dialogem „Nový“ a otevře její detail. Vrátí `record-view`. */
export async function createJob(page: Page, j: NewJob): Promise<Locator> {
  await page.goto("/zakazky");
  await page.getByTestId("create-record").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Název/).fill(j.title);
  await dialog.getByRole("button", { name: "Vybrat…" }).first().click();
  await page.getByPlaceholder("Hledat…").last().fill(j.company);
  await page.getByRole("option", { name: j.company }).click();
  if (j.address || j.value || j.vatMode || j.retention) {
    await dialog.getByRole("button", { name: /Další pole/ }).click();
    if (j.address) await dialog.getByLabel("Adresa stavby").fill(j.address);
    if (j.value) await dialog.getByLabel("Původní smluvní cena").fill(j.value);
    if (j.retention) await dialog.getByLabel("Zádržné").fill(j.retention);
    if (j.vatMode) {
      await dialog.getByRole("button", { name: "Standardní" }).click();
      await page.getByRole("option", { name: j.vatMode }).click();
    }
  }
  if (j.phase && j.phase !== "Poptávka") {
    // stavy fází Poptávka a Nabídka se jmenují „Nová poptávka“ a „Nabídka v přípravě“ (CRM)
    const stageName = { Nabídka: "Nabídka v přípravě" }[j.phase as string] ?? j.phase;
    await dialog.getByRole("button", { name: "Nová poptávka", exact: true }).click();
    await page.getByRole("option", { name: stageName, exact: true }).click();
  }
  await dialog.getByRole("button", { name: "Vytvořit", exact: true }).click();
  const view = page.getByTestId("record-view");
  await expect(view.getByRole("heading", { name: j.title })).toBeVisible();
  return view;
}

/** Otevře detail zakázky podle (části) názvu přes hledání v seznamu. */
export async function openJob(page: Page, search: string): Promise<Locator> {
  await page.goto("/zakazky");
  await page.getByPlaceholder("Hledat…").fill(search);
  const row = page.getByRole("row").filter({ hasText: search }).first();
  await row.hover();
  await row.getByRole("button", { name: "Otevřít" }).click();
  await expect(page).toHaveURL(/\/zakazky\/[0-9a-f-]{36}$/);
  const view = page.getByTestId("record-view");
  await expect(view).toBeVisible();
  return view;
}

/** Dialog „Změnit fázi“: přesune zakázku do fáze (kontroly, které přechod blokují, vrací jako text). */
export async function changePhase(
  page: Page,
  view: Locator,
  to: string,
  opts: { expectBlocked?: RegExp; reason?: string } = {},
): Promise<void> {
  await view.getByRole("button", { name: "Změnit fázi" }).click();
  await page
    .getByRole("dialog", { name: "Změnit fázi zakázky" })
    .getByRole("button", { name: new RegExp(`^${to}(\\s|$)`) })
    .click();
  const dialog = page.getByRole("dialog", { name: new RegExp(`Přesunout do fáze „${to}“`) });
  await expect(dialog).toBeVisible();
  if (opts.expectBlocked) {
    await expect(dialog).toContainText(opts.expectBlocked);
    await expect(dialog.getByRole("button", { name: "Přesunout" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Zrušit" }).click();
    return;
  }
  if (opts.reason) await dialog.getByRole("textbox").fill(opts.reason);
  await dialog.getByRole("button", { name: "Přesunout" }).click();
  await expect(page.getByText(`Zakázka je ve fázi „${to}“.`)).toBeVisible();
}

/** Zapíše hodnotu do vybrané buňky rozpočtové tabulky klávesnicí (Enter otevře editaci, pak Tab/Enter uloží). */
export async function typeInto(
  page: Page,
  col: "qty" | "cost" | "price",
  value: string,
  commit: "Tab" | "Enter",
) {
  const grid = page.getByTestId("budget-grid");
  await expect(grid.locator('[aria-selected="true"]')).toHaveAttribute(
    "id",
    new RegExp(`-${col}$`),
  );
  const input = grid.locator("input, textarea");
  await page.keyboard.press("Enter");
  await expect(input.first()).toBeFocused();
  await page.keyboard.type(value);
  await page.keyboard.press(commit);
  await expect(input).toHaveCount(0);
}

/** První oddíl a první položka rozpočtu (psaní do tabulky). Vrací řádek položky. */
export async function addFirstItem(
  page: Page,
  view: Locator,
  o: { section: string; item: string; qty: string; cost: string; price: string },
): Promise<Locator> {
  const grid = view.getByTestId("budget-grid");
  await view.getByRole("button", { name: "Přidat první oddíl" }).click();
  await expect(grid.getByRole("textbox")).toBeFocused();
  await page.keyboard.type(o.section);
  await page.keyboard.press("Enter");
  await expect(grid).toContainText(o.section);
  await page.keyboard.type(o.item);
  await page.keyboard.press("Tab");
  const row = grid.getByRole("row", { name: new RegExp(o.item) });
  await expect(row).toBeVisible();
  await typeInto(page, "qty", o.qty, "Tab");
  await typeInto(page, "cost", o.cost, "Tab");
  await typeInto(page, "price", o.price, "Enter");
  return row;
}

/** Čte částku z textu typu „12 345,50 Kč“ (mezery, nedělitelné mezery, čárka) v haléřích. */
export function minorOf(text: string): number {
  const m = text.replace(/\s/g, "").match(/(-?[−-]?\d+(?:[.,]\d+)?)Kč/);
  if (!m) throw new Error(`V textu není částka: ${text}`);
  return Math.round(Number(m[1]!.replace("−", "-").replace(",", ".")) * 100);
}

/** Částka v haléřích z textu prvku (první nalezená). */
export async function minorFrom(loc: Locator): Promise<number> {
  return minorOf(await loc.innerText());
}

/** Přečte položku ZIP archivu (XLSX je ZIP) v paměti: bez externího `unzip`, jen `node:zlib`. */
export function readZipEntry(zip: Buffer, name: string): string | null {
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error("Není to ZIP.");
  const count = zip.readUInt16LE(end + 10);
  let p = zip.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("Poškozený ZIP.");
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const n = zip.readUInt16LE(p + 28);
    const e = zip.readUInt16LE(p + 30);
    const c = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const entry = zip.subarray(p + 46, p + 46 + n).toString("utf8");
    if (entry === name) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      return (method === 8 ? inflateRawSync(data) : data).toString("utf8");
    }
    p += 46 + n + e + c;
  }
  return null;
}
