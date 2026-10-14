import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLookup, ensurePipeline } from "@rebar/core/config-data";
import {
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
} from "@rebar/core/entities";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { addDaysIso, todayIso, zonedToUtc } from "@rebar/core/time";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { feedForToken, regenerateFeedToken } from "@rebar/kalendar/server";
import { manifest } from "@rebar/poptavky";
import { crmApi, inquiryEntity } from "@rebar/poptavky/server";
import { jobEntity } from "@rebar/zakazky/server";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import { ensureSeries } from "@rebar/core/numbering";

/** Odběr kalendáře (iCalendar) s aktivitami CRM: modul Kalendář je nezná, dodá je volající (trasa odběru). */
const app = connectAppDb();
afterAll(() => app.close());

beforeAll(async () => {
  clearEntityPolicies();
  registerEntityPolicies(
    createEntityRegistry([companyEntity, personEntity, inquiryEntity, jobEntity]),
  );
  for (const m of [manifest, zakazkyManifest]) {
    for (const p of m.seed.pipelines ?? []) await ensurePipeline(app.db, p);
    for (const l of "lookups" in m.seed ? m.seed.lookups : []) await ensureLookup(app.db, l);
    if ("series" in m.seed) await ensureSeries(app.db, m.seed.series);
  }
  await crmApi.ensureCrmDefaults(app.db);
});

describe("odběr kalendáře s aktivitami", () => {
  it("do odběru patří otevřené aktivity přiřazené vlastníkovi, hotová z něj zmizí, bez práva ke CRM nic", async () => {
    const u = await makeUser(app.db, [
      ["kalendar.read", "all"],
      ["poptavky.read", "own"],
      ["poptavky.write", "own"],
    ]);
    const plain = await makeUser(app.db, [["kalendar.read", "all"]]);
    const tag = randomBytes(3).toString("hex");
    const due = zonedToUtc(addDaysIso(todayIso(), 2), "09:00");
    const open = await crmApi.createActivity(u.ctx, {
      typeKey: "meeting",
      subject: `Schůzka ${tag}`,
      dueAt: due,
      durationMin: 45,
      location: "Plzeň, Husova 12",
    });
    const done = await crmApi.createActivity(u.ctx, {
      typeKey: "call",
      subject: `Hotovo ${tag}`,
      dueAt: due,
    });
    await crmApi.completeActivity(u.ctx, done.id, {});
    const withCrm = (userId: string) => crmApi.activityIcsEvents(app.db, userId, "example.test");

    const token = await regenerateFeedToken(app.db, u.id);
    const ics = (await feedForToken(app.db, token, "example.test", "Kalendář", withCrm))!;
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain(`UID:crm-activity-${open.id}@example.test`);
    expect(ics).toContain(`SUMMARY:Schůzka: Schůzka ${tag}`);
    expect(ics).toMatch(/DTSTART;TZID=Europe\/Prague:\d{8}T090000/);
    expect(ics).toMatch(/DTEND;TZID=Europe\/Prague:\d{8}T094500/);
    expect(ics).toContain("LOCATION:Plzeň\\, Husova 12");
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).not.toContain(`Hotovo ${tag}`);

    // bez doplňku (CRM vypnuté) se aktivity do odběru nedostanou
    expect(await feedForToken(app.db, token, "example.test")).not.toContain(`Schůzka ${tag}`);
    // uživatel bez práva ke CRM je v odběru nemá, ani kdyby mu nějaká byla přiřazena
    const plainToken = await regenerateFeedToken(app.db, plain.id);
    expect(
      await feedForToken(app.db, plainToken, "example.test", "Kalendář", withCrm),
    ).not.toContain("crm-activity-");
  });
});
