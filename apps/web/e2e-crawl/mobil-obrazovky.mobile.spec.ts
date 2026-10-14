import { expect, test, type Browser, type Page } from "@playwright/test";
import { collectErrors, expectClean, visit } from "./helpers";
import { pageAs, type Role } from "./roles";

/**
 * Mobil a tablet: hlavní obrazovky bez vodorovného posunu stránky a bez oříznutých prvků, spodní navigace a
 * dotykové plochy ovládacích prvků. Spouští se v projektu `mobile` (Pixel 7); šířky 360 a 768 px se nastaví v kontextu.
 */
const VIEWPORTS = [
  { name: "telefon 360", width: 360, height: 740 },
  { name: "Pixel 7", width: 412, height: 915 },
  { name: "tablet", width: 768, height: 1024 },
] as const;

const PAGES = [
  "/",
  "/inbox",
  "/ukoly",
  "/zakazky",
  "/dochazka",
  "/sklad",
  "/stroje",
  "/kalendar",
  "/nastaveni/upozorneni",
];

/** Stránky, které vidí jen kancelář a vedení (faktury, kontakty, poptávky, správa). */
const OFFICE_PAGES = ["/fakturace", "/kontakty/firmy", "/poptavky"];
const OWNER_PAGES = [
  "/nastaveni/firma",
  "/nastaveni/uzivatele",
  "/nastaveni/role",
  "/nastaveni/stavy",
  "/nastaveni/schvalovani",
];

/**
 * Problémy rozložení: posun celé stránky a vertikální rolovací kontejnery, které se rolují i do strany (obsah je širší
 * než obrazovka). Úmyslné vodorovné pásy (záložky, tabulky) mají `overflow-x-auto`, datová tabulka seznamu `overflow-auto`; nepočítají se.
 */
async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > innerWidth)
      out.push(`stránka se posouvá: ${doc.scrollWidth} > ${innerWidth}`);
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const o = getComputedStyle(el).overflowX;
      if ((o !== "auto" && o !== "scroll") || el.scrollWidth <= el.clientWidth + 1) continue;
      const cls = String(el.className);
      // úmyslně posuvné: pás záložek, tabulka (`overflow-x-auto`) a datová tabulka seznamu (`overflow-auto`)
      if (/overflow-(x-)?(auto|scroll)/.test(cls) && !/overflow-y-auto/.test(cls)) continue;
      out.push(
        `${el.tagName.toLowerCase()}.${cls.slice(0, 60)} ${el.scrollWidth} > ${el.clientWidth}`,
      );
    }
    return out;
  });
}

/** Id první zakázky, kterou role vidí. Na telefonu jsou řádky seznamu karty bez odkazů, proto se hledá v širokém okně. */
async function firstJobHref(browser: Browser, role: Role): Promise<string> {
  const { ctx, page } = await pageAs(browser, role, { viewport: { width: 1280, height: 800 } });
  await page.goto("/zakazky", { waitUntil: "networkidle" });
  const all = await page.$$eval("a[href^='/zakazky/']", (as) =>
    as.map((a) => a.getAttribute("href")!),
  );
  await ctx.close();
  const href = all.find((h) => /^\/zakazky\/[0-9a-f-]{36}$/.test(h));
  expect(href, `${role} vidí aspoň jednu zakázku`).toBeTruthy();
  return href!;
}

// montér (role jen pro terminál) má vlastní obrazovky, viz terminal-obrazovky.crawl.spec.ts
for (const role of ["foreman1", "office", "owner"] as const satisfies Role[]) {
  for (const vp of VIEWPORTS) {
    test(`${role}, ${vp.name}: obrazovky bez posunu a oříznutí, bez chyb`, async ({ browser }) => {
      test.setTimeout(240_000);
      const { ctx, page } = await pageAs(browser, role, { viewport: vp });
      const c = collectErrors(page);
      const problems: string[] = [];
      const pages = [
        ...PAGES,
        ...(role === "office" || role === "owner" ? OFFICE_PAGES : []),
        ...(role === "owner" ? OWNER_PAGES : []),
      ];
      const job = await firstJobHref(browser, role);
      pages.push(job, `${job}?tab=realizace&sub=denik`);
      for (const p of pages) {
        await visit(page, p, c);
        for (const pr of await layoutProblems(page)) problems.push(`${p}: ${pr}`);
      }
      // záložky detailu zakázky
      await visit(page, job, c);
      for (const tab of await page.getByRole("tab").all()) {
        await tab.scrollIntoViewIfNeeded();
        await tab.click();
        await page.waitForLoadState("networkidle").catch(() => undefined);
        for (const pr of await layoutProblems(page))
          problems.push(`${job} záložka ${(await tab.innerText()).trim()}: ${pr}`);
      }
      expect(problems, "rozložení na úzké obrazovce").toEqual([]);
      expectClean(c, `${role} ${vp.name}`);
      await ctx.close();
    });
  }
}

test("mistr na telefonu: spodní navigace funguje a dotykové plochy mají 44 px", async ({
  browser,
}) => {
  const { ctx, page } = await pageAs(browser, "foreman1", {
    viewport: { width: 360, height: 740 },
  });
  const c = collectErrors(page);
  // odznak vývojového serveru Next.js (jen dev) leží nad spodní navigací a zachytává klepnutí
  await page.addInitScript(() => {
    const st = document.createElement("style");
    st.textContent = "nextjs-portal{display:none!important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(st));
  });
  await visit(page, "/", c);
  const nav = page.getByTestId("bottom-nav");
  await expect(nav).toBeVisible();
  // hlavička a spodní navigace: každý prvek aspoň 44 × 44 px
  const small = await page.evaluate(() => {
    const sel = "header button, [data-testid=bottom-nav] a, [data-testid=bottom-nav] button";
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .map((el) => ({ el, b: el.getBoundingClientRect() }))
      .filter(({ b }) => b.width > 0 && (b.width < 44 || b.height < 44))
      .map(
        ({ el, b }) =>
          `${el.getAttribute("aria-label") ?? el.innerText.trim()} ${Math.round(b.width)}x${Math.round(b.height)}`,
      );
  });
  expect(small, "malé dotykové plochy").toEqual([]);
  // položky navigace vedou na správné stránky
  const labels = await nav.locator("a").allInnerTexts();
  expect(labels.length).toBeGreaterThan(1);
  await nav.getByRole("link", { name: "Zakázky" }).click();
  await expect(page).toHaveURL(/\/zakazky$/);
  await nav.getByRole("link", { name: "Dnes" }).click();
  await expect(page).toHaveURL(/\/$/);
  // „Více“ otevře menu s celou navigací a Esc ho zavře
  await nav.getByRole("button", { name: "Více" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expectClean(c, "spodní navigace");
  await ctx.close();
});

test("tmavý režim: obrazovky se otevřou a text má dostatečný kontrast", async ({ browser }) => {
  const { ctx, page } = await pageAs(browser, "foreman1", {
    viewport: { width: 412, height: 915 },
  });
  await page.emulateMedia({ colorScheme: "dark" });
  const c = collectErrors(page);
  for (const p of ["/", "/zakazky", "/dochazka", "/kalendar"]) {
    await visit(page, p, c);
    // nikde nesmí být tmavý text na tmavém pozadí: kontrast vybraných textů proti skutečnému pozadí
    const low = await page.evaluate(() => {
      const lum = (rgb: number[]) => {
        const f = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(rgb[0]!) + 0.7152 * f(rgb[1]!) + 0.0722 * f(rgb[2]!);
      };
      // `getComputedStyle` vrací i `color(srgb …)` a `oklab(…)` (color-mix): přes plátno vždy dostaneme RGBA 0–255
      const ctx2d = document
        .createElement("canvas")
        .getContext("2d", { willReadFrequently: true })!;
      const parse = (css: string) => {
        ctx2d.clearRect(0, 0, 1, 1);
        ctx2d.fillStyle = "#000";
        ctx2d.fillStyle = css;
        ctx2d.fillRect(0, 0, 1, 1);
        const d = ctx2d.getImageData(0, 0, 1, 1).data;
        return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
      };
      const bgOf = (el: Element | null): number[] => {
        for (let e = el; e; e = e.parentElement) {
          const c = parse(getComputedStyle(e).backgroundColor);
          if (c.length >= 3 && (c[3] ?? 1) > 0.9) return c;
        }
        return [255, 255, 255];
      };
      const bad: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(
        "h1,h2,p,span,a,button,td,li,label",
      )) {
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
        if (!own) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        // jen skutečně vykreslený text (ne skrytý pod jiným prvkem ani mimo obrazovku)
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!hit || !(el === hit || el.contains(hit) || hit.contains(el))) continue;
        const st = getComputedStyle(el);
        if (st.visibility === "hidden" || Number(st.opacity) < 0.5) continue;
        const fg = parse(st.color);
        const bg = bgOf(el);
        const [a, b] = [lum(fg), lum(bg)];
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (ratio < 3) bad.push(`${el.innerText.trim().slice(0, 30)} (${ratio.toFixed(1)})`);
      }
      return bad.slice(0, 8);
    });
    expect(low, `nízký kontrast v tmavém režimu na ${p}`).toEqual([]);
  }
  expectClean(c, "tmavý režim");
  await ctx.close();
});

test("mistr na telefonu: hlavní tlačítka po posunutí nepřekrývá spodní navigace ani hlavička", async ({
  browser,
}) => {
  const { ctx, page } = await pageAs(browser, "foreman1", {
    viewport: { width: 412, height: 915 },
  });
  const c = collectErrors(page);
  const diary = await (async () => {
    await visit(page, "/", c);
    return page.$$eval("a[href*='?tab=realizace&sub=denik']", (as) => as[0]?.getAttribute("href"));
  })();
  const pages = ["/", "/dochazka", "/stroje", "/sklad", ...(diary ? [diary] : [])];
  const covered: string[] = [];
  for (const p of pages) {
    await visit(page, p, c);
    const buttons = page.locator("main button.bg-accent, main a.bg-accent, button[type=submit]");
    const n = Math.min(await buttons.count(), 6);
    for (let i = 0; i < n; i++) {
      const b = buttons.nth(i);
      if (!(await b.isVisible())) continue;
      await b.scrollIntoViewIfNeeded();
      const ok = await b.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!top && (el === top || el.contains(top));
      });
      if (!ok) covered.push(`${p}: ${(await b.innerText()).trim().slice(0, 30)}`);
    }
  }
  expect(covered, "tlačítka zakrytá jiným prvkem").toEqual([]);
  expectClean(c, "zakrytá tlačítka");
  await ctx.close();
});
