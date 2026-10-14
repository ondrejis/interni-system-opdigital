import { expect, test } from "@playwright/test";

// tyto testy běží nepřihlášené
test.use({ storageState: { cookies: [], origins: [] } });

test("nepřihlášený je poslán na přihlášení a vidí název klienta v titulku", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/prihlaseni$/);
  await expect(page).toHaveTitle(/Demo firma/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Přihlášení");
});

test("health bez tokenu vrací 401, se správným tokenem stav systému", async ({ request }) => {
  expect((await request.get("/api/health")).status()).toBe(401);
  expect(
    (
      await request.get("/api/health", {
        headers: { authorization: "Bearer spatny-token-0123456789" },
      })
    ).status(),
  ).toBe(401);
  const token = process.env.HEALTH_TOKEN;
  test.skip(!token, "HEALTH_TOKEN není nastavený");
  const res = await request.get("/api/health", { headers: { authorization: `Bearer ${token}` } });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.db.ok).toBe(true);
  expect(["ok", "degraded"]).toContain(body.status);
});

test("nahrání souboru a stažení bez přihlášení se odmítne", async ({ request, baseURL }) => {
  const up = await request.post("/api/files", {
    headers: { origin: baseURL! },
    multipart: { file: { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("ahoj") } },
  });
  expect(up.status()).toBe(401);
  const crossOrigin = await request.post("/api/files", {
    headers: { origin: "https://evil.example" },
  });
  expect(crossOrigin.status()).toBe(403);
  expect((await request.get("/api/files/0198f0c0-1111-7222-8333-444455556666")).status()).toBe(401);
});
