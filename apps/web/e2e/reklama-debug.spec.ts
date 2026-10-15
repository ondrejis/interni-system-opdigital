import { test } from "@playwright/test";
test("debug", async ({ page }) => {
  const msgs: string[] = [];
  page.on("console", (m) => msgs.push(m.type() + ": " + m.text().slice(0, 300)));
  page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 400) msgs.push(r.status() + " " + r.url()); });
  await page.goto("/reklama");
  await page.waitForTimeout(4000);
  console.log((await page.locator("main, body").first().innerText()).slice(0, 1500));
  console.log(msgs.join("\n"));
});
