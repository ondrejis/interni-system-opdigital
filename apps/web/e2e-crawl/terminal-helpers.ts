import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";
import { userOf, type Role } from "./roles";

/** Telefon: jedna ruka, 375 × 812 px (iPhone SE/13 mini; užší běžné telefony jsou 360). */
export const PHONE = { width: 375, height: 812 } as const;

/** Je k dispozici `psql` a databáze serveru? Test jen s ověřením v databázi se jinak přeskočí. */
export function canUseDb(): boolean {
  if (!process.env.DATABASE_URL) return false;
  try {
    execFileSync("psql", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Jedna hodnota z dotazu (bez hlaviček). Vstup je jen z testu, proto jen jednoduché ověření znaků. */
export function sql(query: string): string {
  if (/[\0\\]/.test(query)) throw new Error("Neplatný dotaz.");
  return execFileSync("psql", [process.env.DATABASE_URL!, "-t", "-A", "-c", query], {
    encoding: "utf8",
  }).trim();
}

const safe = (s: string) => {
  if (!/^[\p{L}\p{N} _.:@-]+$/u.test(s)) throw new Error(`Nebezpečná hodnota: ${s}`);
  return s;
};

/** Založí řemeslníkovi otevřený úkol (jako by mu ho zadal mistr). Vrací id úkolu. */
export function insertTask(role: Role, title: string): string {
  const email = safe(userOf(role).email);
  return sql(
    `insert into task (id, title, assignee_id, due_date, priority, created_by, updated_by)
     select gen_random_uuid(), '${safe(title)}', u.id, current_date, 'normal', u.id, u.id from "user" u where u.email = '${email}'
     returning id`,
  )
    .split("\n")[0]!
    .trim();
}

export const deleteTask = (id: string) => sql(`delete from task where id = '${safe(id)}'`);

/** Kolik běžících píchaček (příchod bez odchodu) má uživatel. */
export function runningClocks(role: Role): number {
  const email = safe(userOf(role).email);
  return Number(
    sql(
      `select count(*) from time_entry t join "user" u on u.id = t.user_id
       where u.email = '${email}' and t.source = 'clock' and t.ended_at is null and t.deleted_at is null`,
    ),
  );
}

/** Ukončí případnou zbylou píchačku tak, že ji smaže (úklid po testu, nejde o skutečný záznam). */
export function dropRunningClocks(role: Role) {
  const email = safe(userOf(role).email);
  sql(
    `delete from time_entry where source = 'clock' and ended_at is null
     and user_id = (select id from "user" where email = '${email}')`,
  );
}

/** Problémy rozložení: vodorovný posun stránky. */
export async function overflowProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > innerWidth)
      out.push(`stránka se posouvá: ${doc.scrollWidth} > ${innerWidth}`);
    for (const el of document.querySelectorAll<HTMLElement>("main *")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > innerWidth + 1 || r.left < -1))
        out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} mimo obrazovku`);
    }
    return out.slice(0, 8);
  });
}

/** Dotykové cíle menší než 44 px (WCAG 2.5.5/2.5.8; v terminálu je cílem 48+ px). */
export async function touchProblems(page: Page, min = 44): Promise<string[]> {
  return page.evaluate((limit) => {
    const out: string[] = [];
    const sel =
      "a[href], button, select, textarea, input:not([type=hidden]), [role=radio], [role=button], [role=checkbox]";
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      if (el.closest("nextjs-portal, [aria-hidden=true]")) continue;
      // skrytý vstup souboru: cílem je jeho popisek (label)
      if (el instanceof HTMLInputElement && el.type === "file") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (getComputedStyle(el).visibility === "hidden") continue;
      if (r.height < limit - 0.5 || r.width < limit - 0.5)
        out.push(
          `${el.tagName.toLowerCase()} „${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}“ ${Math.round(r.width)}×${Math.round(r.height)}`,
        );
    }
    for (const el of document.querySelectorAll<HTMLElement>("label:has(input[type=file])")) {
      const r = el.getBoundingClientRect();
      if (r.height && (r.height < limit || r.width < limit))
        out.push(
          `label „${el.textContent?.trim()}“ ${Math.round(r.width)}×${Math.round(r.height)}`,
        );
    }
    return out;
  }, min);
}

export async function expectTerminalBasics(page: Page, label: string) {
  expect(await overflowProblems(page), `${label}: vodorovný přetok`).toEqual([]);
  expect(await touchProblems(page), `${label}: dotykové cíle pod 44 px`).toEqual([]);
  expect(await page.locator("table").count(), `${label}: žádné tabulky`).toBe(0);
  expect(
    await page.getByTestId("terminal-nav").locator("a").count(),
    `${label}: spodní lišta má nejvýš pět položek`,
  ).toBeLessThanOrEqual(5);
  expect(
    ((await page.locator("body").innerText()) ?? "").toLowerCase(),
    `${label}: interní název`,
  ).not.toContain("rebar");
}
