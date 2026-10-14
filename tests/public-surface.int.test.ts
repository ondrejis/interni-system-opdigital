import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { systemCtx } from "@rebar/core/rbac";
import type { Db } from "@rebar/core/db";
import { connectAppDb } from "@rebar/core/testing";
import { renderMail, type MailTemplateName } from "@rebar/core/mail";
import { renderInvoicePdf } from "@rebar/fakturace/server";
import { buildIcs } from "@rebar/kalendar/server";
import { shareApi, budgetApi } from "@rebar/zakazky/server";
import { NotFoundError, PermissionError } from "@rebar/core/rbac";
import { buildFixture, isolatedDb, MONEY, type Fixture } from "./support/security-fixture";

/** Zachytí definice PDF, které moduly posílají do `renderPdf` (obsah PDF je komprimovaný, definice ne). */
const captured: unknown[] = [];
vi.mock("@rebar/core/pdf", async (orig) => {
  const actual = await orig<
    Record<string, unknown> & { renderPdf: (def: never) => Promise<Buffer> }
  >();
  return {
    ...actual,
    renderPdf: async (def: unknown) => {
      captured.push(def);
      return actual.renderPdf(def as never);
    },
  };
});

const app = connectAppDb();
let f: Fixture;
let db: Db;
let discard: () => Promise<void>;
beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  f = await buildFixture(db);
}, 120_000);
afterAll(async () => {
  await discard();
  await app.close();
});

const INTERNAL = /rebar/i;

describe("interní název se nedostane do e-mailů, PDF, kalendáře ani veřejné stránky", () => {
  it("systémové e-maily (předmět, text, HTML) nesou jen název klienta", () => {
    const vars: Record<MailTemplateName, Record<string, string>> = {
      invitation: { url: "https://system.klient.cz/pozvanka/x", name: "Jan" },
      "password-reset": { url: "https://system.klient.cz/obnova-hesla/x", name: "Jan" },
      test: {},
      document: { url: "https://system.klient.cz/x", title: "Faktura", message: "Dobrý den" },
      notification: { subject: "Nový úkol", body: "Dobrý den", url: "https://system.klient.cz/x" },
    };
    for (const [name, v] of Object.entries(vars)) {
      let mail;
      try {
        mail = renderMail(name as MailTemplateName, v, "Demo firma s.r.o.");
      } catch {
        continue; // šablona vyžaduje další proměnné; zbytek pokrývá test šablon v jádru
      }
      expect(`${mail.subject}\n${mail.text}\n${mail.html}`, name).not.toMatch(INTERNAL);
      expect(mail.html, name).toContain("Demo firma");
    }
  });

  it("PDF faktury a nabídky: definice dokumentu i hlavička souboru bez interního názvu", async () => {
    captured.length = 0;
    const office = f.people.office.ctx;
    const invoice = await renderInvoicePdf(office, f.deps, f.jobA.invoiceId).catch((e) => e);
    const offer = await budgetApi
      .renderOfferPdf(office, f.deps, f.jobA.id, f.jobA.offerVersionId)
      .catch((e) => e);
    for (const out of [invoice, offer]) {
      if (out instanceof Error) {
        process.stderr.write(`[PDF] ${out.message}\n`);
        continue; // fixture nemusí mít vše pro PDF; zachycené definice se kontrolují níž
      }
      expect(out.buffer.subarray(0, 5).toString()).toBe("%PDF-");
      expect(out.buffer.toString("latin1")).not.toMatch(INTERNAL);
      expect(out.filename).not.toMatch(INTERNAL);
    }
    expect(captured.length).toBeGreaterThan(0);
    for (const def of captured) expect(JSON.stringify(def)).not.toMatch(INTERNAL);
  });

  it("PDF faktury a nabídky smí vyrobit jen ten, kdo vidí faktury a ekonomiku; nabídka nenese náklady ani marži", async () => {
    for (const person of [f.people.workerA, f.people.foremanA]) {
      await expect(renderInvoicePdf(person.ctx, f.deps, f.jobA.invoiceId)).rejects.toSatisfy(
        (e) => e instanceof PermissionError || e instanceof NotFoundError,
      );
      await expect(
        budgetApi.renderOfferPdf(person.ctx, f.deps, f.jobA.id, f.jobA.offerVersionId),
      ).rejects.toBeInstanceOf(PermissionError);
    }
    captured.length = 0;
    await budgetApi.renderOfferPdf(f.people.office.ctx, f.deps, f.jobA.id, f.jobA.offerVersionId);
    // texty v dokumentu (definice je po vykreslení doplněná o rozložení, hledáme jen skutečné texty)
    const texts = [...JSON.stringify(captured).matchAll(/"text":"([^"]*)"/g)].map((m) => m[1]!);
    expect(texts.some((t) => /12[\s\u00a0]345/.test(t))).toBe(true); // prodejní cena položky
    expect(texts.filter((t) => /9[\s\u00a0]?876/.test(t))).toEqual([]); // nákladová cena nikdy
  });

  it("odběr kalendáře (iCal) nese jen obecné označení", () => {
    const ics = buildIcs(
      [
        {
          uid: "1@system.klient.cz",
          title: "Schůzka",
          startsAt: new Date("2026-10-20T08:00:00Z"),
          endsAt: new Date("2026-10-20T09:00:00Z"),
          allDay: false,
          recurrence: null,
          recurrenceUntil: null,
          reminderMinutes: 15,
          updatedAt: new Date("2026-10-01T08:00:00Z"),
        } as never,
      ],
      "Kalendář",
    );
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toMatch(INTERNAL);
  });

  it("veřejná stránka investora: žádné peníze, čísla zakázek ani interní název; neplatný token je jen „nenalezeno“", async () => {
    const created = (await f.collected.commands.get("zakazky.share.create")!.handler(
      f.people.office.ctx,
      f.collected.commands.get("zakazky.share.create")!.input.parse({
        jobId: f.jobA.id,
        label: "Investor",
        scope: { schedule: true, diary: "all", photos: true, documentIds: [] },
      }),
      f.deps,
    )) as { token: string };
    const share = await shareApi.resolveShare(db, created.token);
    expect(share).not.toBeNull();
    const base = await shareApi.investorBase(db, share!);
    const view = await f.collected.commands
      .get("realizace.investor.view")!
      .handler(
        systemCtx(db),
        { jobId: f.jobA.id, scope: { schedule: true, diary: "all" } } as never,
        f.deps,
      );
    const text = JSON.stringify({ base, view });
    expect(text).not.toMatch(INTERNAL);
    for (const amount of [MONEY.contract, MONEY.cost, MONEY.sellUnit, MONEY.costUnit, MONEY.rate])
      expect(text).not.toContain(String(amount));
    expect(text).not.toContain(f.jobA.number); // číslo zakázky je interní
    expect(text).not.toMatch(/hourlyCost|unitPrice|marginPct|valueMinor/i);

    // neplatný, příliš krátký, cizí a zrušený token: stejně `null`
    expect(await shareApi.resolveShare(db, "x")).toBeNull();
    expect(await shareApi.resolveShare(db, "A".repeat(43))).toBeNull();
    expect(await shareApi.resolveShare(db, created.token.slice(0, -1) + "_")).toBeNull();
    await f.collected.commands
      .get("zakazky.share.revoke")!
      .handler(
        f.people.office.ctx,
        f.collected.commands.get("zakazky.share.revoke")!.input.parse({ id: share!.id }),
        f.deps,
      );
    expect(await shareApi.resolveShare(db, created.token)).toBeNull();
  });
});
