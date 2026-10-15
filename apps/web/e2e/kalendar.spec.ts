import { expect, test, type Page } from "@playwright/test";

/*
  Kalendář (KAL-B, AS-13) proti `fake-google`: aplikace se pro tento spec spouští s předspuštěním
  `e2e/support/fake-google-preload.ts` (viz `docs/moduly/kalendar.md`, část „UI a e2e“), které místo Googlu podstrčí
  fake s účtem `ondrej@opdigital.test` a dvěma událostmi (zítra „Konzultace s Novákem“ s Meet a účastníkem
  `jan.novak@kalendar-e2e.test`, pozítří „Oběd s dodavatelem“). Spouští se konfigurací `playwright.kalendar.config.ts`
  (nastaví `KALENDAR_FAKE_GOOGLE=1`); ve výchozí konfiguraci se celý soubor přeskočí.
  Pořadí je důležité: nejdřív kalendář bez Googlu, potom připojení účtu, pohledy, vazby, tažení a odpojení.
*/
test.skip(
  process.env.KALENDAR_FAKE_GOOGLE !== "1",
  "Potřebuje server s fake-google (playwright.kalendar.config.ts).",
);
test.describe.configure({ mode: "serial" });

const stamp = Math.random().toString(36).slice(2, 8);
const CONTACT_EMAIL = "jan.novak@kalendar-e2e.test";
const GOOGLE_EMAIL = "ondrej@opdigital.test";
const plain = `Schůzka bez Googlu ${stamp}`;
const dragged = `Schůzka tažením ${stamp}`;

/** Datum o `plus` dní od dneška v Europe/Prague (`YYYY-MM-DD`), stejně jako předspuštění. */
const day = (plus: number) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(
    new Date(Date.now() + plus * 86_400_000),
  );

const HOUR = 48;

/** Počká na týdenní pohled s daným dnem (přelistuje na další týden, když je v něm). */
async function weekWith(page: Page, date: string) {
  await page.goto("/kalendar");
  await page.getByRole("button", { name: "Týden", exact: true }).click();
  await expect(page.getByTestId("week-grid")).toBeVisible();
  await expect(page.getByTestId("day-column")).toHaveCount(7);
  const col = page.locator(`[data-testid="day-column"][data-day="${date}"]`);
  if (!(await col.count())) await page.getByRole("button", { name: "Další" }).click();
  await expect(col).toBeVisible();
  return col;
}

test("bez připojeného Googlu: výzva k připojení a schůzka z formuláře jen v OPSYS", async ({
  page,
}) => {
  await page.goto("/kalendar");
  await expect(page.getByTestId("calendar-page")).toBeVisible();
  await expect(page.getByText("Google Kalendář není připojený")).toBeVisible();
  await expect(page.getByRole("link", { name: "Připojit Google Kalendář" })).toBeVisible();

  await page.getByTestId("new-meeting").click();
  const dialog = page.getByRole("dialog", { name: "Nová schůzka" });
  // „Poslat pozvánky“ je výchozí vypnuto (O-8)
  await expect(dialog.getByRole("checkbox", { name: "Poslat pozvánky" })).not.toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "Přidat Google Meet" })).toHaveCount(0);
  await dialog.getByLabel("Název").fill(plain);
  await dialog.getByRole("button", { name: "Vytvořit schůzku" }).click();
  await expect(page.getByText("Schůzka vytvořena.")).toBeVisible();

  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(page.getByTestId("agenda")).toContainText(plain);
});

test("Nastavení → Google Kalendář: připojení účtu a výběr kalendářů", async ({ page }) => {
  await page.goto("/nastaveni/google-kalendar");
  await expect(page.getByRole("heading", { name: "Google Kalendář" }).first()).toBeVisible();
  // souhlas Googlu nahradí fake: přesměrování na fake.google.test vrátíme rovnou na callback s kódem
  await page.route("https://fake.google.test/**", async (route) => {
    const u = new URL(route.request().url());
    const back = new URL(u.searchParams.get("redirect_uri")!);
    back.searchParams.set("code", `fake-code:${GOOGLE_EMAIL}`);
    back.searchParams.set("state", u.searchParams.get("state")!);
    await route.fulfill({ status: 302, headers: { location: back.toString() } });
  });
  await page.getByTestId("connect-google").click();
  await expect(page).toHaveURL(/\/nastaveni\/google-kalendar\?google=ok/);
  await expect(page.getByText("Google účet je připojený")).toBeVisible();
  await expect(page.getByTestId("google-email")).toHaveText(GOOGLE_EMAIL);
  const rows = page.getByTestId("calendar-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first().getByRole("checkbox")).toBeChecked();
  await expect(rows.first().getByRole("radio")).toBeChecked();
  await page.getByRole("button", { name: "Synchronizovat teď" }).click();
  await expect(page.getByText(/Vše je aktuální|Synchronizováno/)).toBeVisible();
});

test("pohledy Den, Týden, Měsíc, Agenda, pracovní doba a vrstvy", async ({ page }) => {
  await page.goto("/kalendar");
  await expect(page.getByText("Google Kalendář není připojený")).toHaveCount(0);
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  const agenda = page.getByTestId("agenda");
  await expect(agenda).toContainText("Konzultace s Novákem");
  await expect(agenda).toContainText("10:00–11:00");
  await expect(agenda).toContainText("Oběd s dodavatelem");

  await page.getByRole("button", { name: "Týden", exact: true }).click();
  await expect(page.getByTestId("week-grid")).toBeVisible();
  await expect(page.getByTestId("work-hours").first()).toBeVisible();
  await page.getByRole("button", { name: "Měsíc", exact: true }).click();
  await expect(page.getByTestId("month-grid")).toBeVisible();
  await page.getByRole("button", { name: "Den", exact: true }).click();
  await expect(page.getByTestId("day-grid")).toBeVisible();

  // vrstva „Moje kalendáře“ se dá vypnout a zapnout
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await page.getByTestId("layer-kalendar.mine").click();
  await expect(agenda).not.toContainText("Konzultace s Novákem");
  await page.getByTestId("layer-kalendar.mine").click();
  await expect(agenda).toContainText("Konzultace s Novákem");
});

test("náhled události: odkaz na Meet a automatický návrh vazby podle e-mailu účastníka", async ({
  page,
}) => {
  // kontakt v CRM s e-mailem, který má účastník události
  await page.goto("/kontakty/osoby/novy");
  const form = page.getByTestId("quick-contact");
  await form.getByLabel("Jméno", { exact: true }).fill("Jan");
  await form.getByLabel(/Příjmení/).fill(`Novák${stamp}`);
  await form.getByLabel("E-mail").first().fill(CONTACT_EMAIL);
  await form.getByRole("button", { name: "Založit kontakt" }).click();
  const dups = page.getByTestId("person-duplicates");
  const head = page.getByTestId("record-view").getByRole("heading", { name: `Jan Novák${stamp}` });
  await expect(head.or(dups)).toBeVisible();
  if (await dups.isVisible()) await dups.getByRole("button", { name: "Založit přesto" }).click();
  await expect(head).toBeVisible();

  await page.goto("/kalendar");
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await page
    .getByTestId("calendar-item")
    .filter({ hasText: "Konzultace s Novákem" })
    .first()
    .click();
  const panel = page.getByTestId("event-panel");
  await expect(panel).toContainText("Konzultace s Novákem");
  await expect(panel).toContainText("Plzeň, Americká 1");
  await expect(panel.getByTestId("meet-link")).toHaveAttribute(
    "href",
    "https://meet.google.com/e2e-test-meet",
  );
  const suggestions = panel.getByTestId("link-suggestions");
  await expect(suggestions).toContainText("Novák");
  await suggestions
    .getByRole("button", { name: /^Navázat/ })
    .first()
    .click();
  await expect(panel.getByTestId("link-person")).toContainText("Novák");
  // vazbu jde odebrat
  await panel.getByRole("button", { name: "Odebrat vazbu: Kontakt" }).click();
  await expect(panel.getByTestId("link-person")).toHaveCount(0);
});

test("schůzka tažením, přesun a změna délky přetažením", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1100 }); // 15:00–18:00 musí být celé vidět
  const target = day(2);
  const col = await weekWith(page, target);
  await page.waitForTimeout(600); // pruh nahoře se po načtení dat může zvětšit a posunout mřížku
  const box = (await col.boundingBox())!;
  const y = (h: number) => box.y + h * HOUR;
  const x = box.x + box.width * 0.5;

  // tažení v prázdném místě 15:00–16:00
  await page.mouse.move(x, y(15) + 2);
  await page.mouse.down();
  await page.mouse.move(x, y(15.5), { steps: 4 });
  await page.mouse.move(x, y(16) + 2, { steps: 4 });
  await expect(page.getByTestId("drag-ghost")).toBeVisible();
  await page.mouse.up();

  const dialog = page.getByRole("dialog", { name: "Nová schůzka" });
  await expect(dialog.getByLabel("Od", { exact: true })).toHaveValue("15:00");
  await expect(dialog.getByLabel("Do", { exact: true })).toHaveValue("16:00");
  await expect(dialog.getByRole("checkbox", { name: "Poslat pozvánky" })).not.toBeChecked();
  await dialog.getByLabel("Název").fill(dragged);
  await dialog.getByLabel("Místo").fill("Plzeň");
  await dialog.getByRole("checkbox", { name: "Přidat Google Meet" }).click();
  await dialog.getByRole("button", { name: "Vytvořit schůzku" }).click();
  await expect(page.getByText(/Schůzka vytvořena|do Google Kalendáře se zapíše/)).toBeVisible();

  const block = (time: string) =>
    page.getByRole("button", { name: new RegExp(`${dragged}, ${time}`) });
  await expect(block("15:00–16:00")).toBeVisible();

  // přesun o hodinu níž
  const b = (await block("15:00–16:00").boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + 14);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + 14 + HOUR / 2, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + 14 + HOUR, { steps: 4 });
  await page.mouse.up();
  await expect(block("16:00–17:00")).toBeVisible();

  // změna délky tažením dolního okraje o hodinu
  const m = (await block("16:00–17:00").boundingBox())!;
  const handle = block("16:00–17:00").getByTestId("resize-handle");
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + HOUR / 2, { steps: 4 });
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + HOUR, { steps: 4 });
  await page.mouse.up();
  await expect(block("16:00–18:00")).toBeVisible();
  expect(m.height).toBeGreaterThan(20);

  // po obnovení stránky je změna uložená
  await page.reload();
  await expect(page.getByTestId("calendar-page")).toBeVisible();
});

test("klávesnice: Alt + šipka přesune vybranou událost o 15 minut", async ({ page }) => {
  await weekWith(page, day(2));
  const ev = page.getByRole("button", { name: new RegExp(`${dragged}, 16:00–18:00`) });
  await ev.focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(
    page.getByRole("button", { name: new RegExp(`${dragged}, 16:15–18:15`) }),
  ).toBeVisible();
});

test("mobil: Agenda a Den, schůzka formulářem", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/kalendar");
  await expect(page.getByTestId("agenda")).toBeVisible();
  await expect(page.getByRole("button", { name: "Týden", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Měsíc", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Den", exact: true }).click();
  await expect(page.getByTestId("day-grid")).toBeVisible();
  await page.getByTestId("new-meeting").click();
  await expect(page.getByRole("dialog", { name: "Nová schůzka" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("odpojení účtu: kalendář se vrátí na úkoly a schůzky z OPSYS", async ({ page }) => {
  await page.goto("/nastaveni/google-kalendar");
  await page.getByRole("button", { name: "Odpojit účet" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Odpojit" }).click();
  await expect(page.getByTestId("connect-google")).toBeVisible();
  await page.goto("/kalendar");
  await expect(page.getByText("Google Kalendář není připojený")).toBeVisible();
});
