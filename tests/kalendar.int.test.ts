import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
  type EntityRegistry,
} from "@rebar/core/entities";
import type {
  CalendarLayerProvider,
  CommandDef,
  ModuleJob,
  ModuleJobDeps,
  ModuleDeps,
  WidgetProvider,
} from "@rebar/core/module-server";
import { PermissionError } from "@rebar/core/rbac";
import { formatDate } from "@rebar/core/shared";
import { createCipher, parseKeyRing } from "@rebar/core/security";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { addDaysIso, localParts, todayIso, weekStartIso } from "@rebar/core/time";
import {
  calendarFeed,
  calendarImport,
  calendarResource,
  commands,
  entities as kalendarEntities,
  event,
  externalEvent,
  feedForToken,
  hashToken,
  sendEventReminders,
  server,
  syncImport,
} from "@rebar/kalendar/server";

const app = connectAppDb();
afterAll(() => app.close());

const cipher = createCipher(
  parseKeyRing({ APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") }),
);
let registry: EntityRegistry;
let layers: CalendarLayerProvider[] = [];
const deps = () =>
  ({
    registry,
    baseURL: "http://localhost:3000",
    cipher,
    costProviders: [],
    calendarLayers: layers,
    diaryPrefill: [],
    emit: async () => {},
  }) as unknown as ModuleDeps;

beforeAll(() => {
  clearEntityPolicies();
  registry = createEntityRegistry([...kalendarEntities]);
  registerEntityPolicies(registry);
});

const run = async (name: string, ctx: unknown, input: unknown) => {
  const c = commands.find((x) => x.name === name) as CommandDef | undefined;
  if (!c) throw new Error(`Příkaz ${name} neexistuje.`);
  return c.handler(ctx as never, c.input.parse(input), deps()) as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
};

const planner = () =>
  makeUser(app.db, [
    ["kalendar.read", "all"],
    ["kalendar.write", "all"],
    ["kalendar.resources", "all"],
  ]);
const worker = () =>
  makeUser(app.db, [
    ["kalendar.read", "own"],
    ["kalendar.write", "own"],
  ]);
const viewer = () => makeUser(app.db, [["kalendar.read", "own"]]);

const tag = () => randomBytes(3).toString("hex");
const nextMonday = () => {
  const m = addDaysIso(weekStartIso(todayIso()), 7);
  return m;
};

const timed = (over: Record<string, unknown> = {}) => ({
  title: `Schůzka ${tag()}`,
  type: "meeting",
  allDay: false,
  startDate: nextMonday(),
  startTime: "09:00",
  endDate: nextMonday(),
  endTime: "10:00",
  attendeeIds: [] as string[],
  ...over,
});

const week = (ctx: unknown, who: "me" | "all" = "me") =>
  run("kalendar.range", ctx, { from: nextMonday(), to: addDaysIso(nextMonday(), 6), who });
const titles = (r: { items: { kind: string; title: string }[] }) =>
  r.items.filter((i) => i.kind === "event").map((i) => i.title);

describe("události a viditelnost", () => {
  it("vlastník a pozvaný událost vidí, ostatní s rozsahem „jen moje“ ne", async () => {
    const owner = await planner();
    const guest = await worker();
    const stranger = await worker();
    const boss = await planner();
    const e = timed({ attendeeIds: [guest.id] });
    const { id } = await run("kalendar.event.save", owner.ctx, e);

    expect(titles(await week(owner.ctx))).toContain(e.title);
    expect(titles(await week(guest.ctx))).toContain(e.title);
    expect(titles(await week(stranger.ctx))).not.toContain(e.title);
    // plný rozsah vidí vše, ale ve výchozím pohledu jen svoje
    expect(titles(await week(boss.ctx))).not.toContain(e.title);
    expect(titles(await week(boss.ctx, "all"))).toContain(e.title);
    // „všichni“ si rozsah „jen moje“ nevynutí
    expect(titles(await week(stranger.ctx, "all"))).not.toContain(e.title);

    await run("kalendar.event.get", guest.ctx, { id });
    await expect(run("kalendar.event.get", stranger.ctx, { id })).rejects.toThrow();
  });

  it("detail vrací místní časy a hlídá práva k úpravám", async () => {
    const owner = await worker();
    const other = await worker();
    const boss = await planner();
    const { id } = await run("kalendar.event.save", owner.ctx, timed({ attendeeIds: [other.id] }));
    const d = await run("kalendar.event.get", other.ctx, { id });
    expect(d).toMatchObject({ startTime: "09:00", endTime: "10:00", canEdit: false });
    expect((await run("kalendar.event.get", owner.ctx, { id })).canEdit).toBe(true);
    expect((await run("kalendar.event.get", boss.ctx, { id })).canEdit).toBe(true);

    await expect(
      run("kalendar.event.save", other.ctx, { ...timed(), id, title: "Cizí změna" }),
    ).rejects.toBeInstanceOf(PermissionError);
    await expect(run("kalendar.event.delete", other.ctx, { id })).rejects.toBeInstanceOf(
      PermissionError,
    );
    await run("kalendar.event.save", boss.ctx, { ...timed(), id, title: "Změna vedoucího" });
    const reader = await viewer();
    await expect(run("kalendar.event.save", reader.ctx, timed())).rejects.toBeInstanceOf(
      PermissionError,
    );
  });

  it("kontroluje časy, připomenutí a účastníky", async () => {
    const u = await planner();
    await expect(run("kalendar.event.save", u.ctx, timed({ endTime: "08:00" }))).rejects.toThrow(
      /po začátku/,
    );
    await expect(
      run("kalendar.event.save", u.ctx, timed({ endDate: addDaysIso(nextMonday(), -1) })),
    ).rejects.toThrow(/Konec je před začátkem/);
    await expect(run("kalendar.event.save", u.ctx, timed({ startTime: null }))).rejects.toThrow(
      /čas začátku a konce/,
    );
    await expect(
      run("kalendar.event.save", u.ctx, timed({ allDay: true, reminderMinutes: 60 })),
    ).rejects.toThrow(/den předem/);
    await expect(
      run("kalendar.event.save", u.ctx, timed({ attendeeIds: [crypto.randomUUID()] })),
    ).rejects.toThrow(/účastníků/);
    await expect(
      run(
        "kalendar.event.save",
        u.ctx,
        timed({ recurrence: "weekly", recurrenceUntil: addDaysIso(nextMonday(), -3) }),
      ),
    ).rejects.toThrow(/před začátkem/);
    await expect(run("kalendar.event.save", u.ctx, timed({ title: " " }))).rejects.toThrow();
    // celodenní událost přes víc dní
    const { id } = await run(
      "kalendar.event.save",
      u.ctx,
      timed({
        allDay: true,
        startTime: null,
        endTime: null,
        endDate: addDaysIso(nextMonday(), 2),
        title: "Dovolená",
      }),
    );
    const d = await run("kalendar.event.get", u.ctx, { id });
    expect(d).toMatchObject({
      allDay: true,
      startDate: nextMonday(),
      endDate: addDaysIso(nextMonday(), 2),
    });
    const r = await week(u.ctx);
    const item = r.items.find((x: { title: string }) => x.title === "Dovolená");
    expect(item).toMatchObject({
      start: nextMonday(),
      end: addDaysIso(nextMonday(), 2),
      allDay: true,
    });
  });

  it("opakovaná událost se rozbalí do okna a zruší celá", async () => {
    const u = await planner();
    const title = `Porada ${tag()}`;
    const { id } = await run(
      "kalendar.event.save",
      u.ctx,
      timed({ title, recurrence: "daily", recurrenceUntil: addDaysIso(nextMonday(), 2) }),
    );
    const r = await week(u.ctx);
    expect(r.items.filter((i: { title: string }) => i.title === title)).toHaveLength(3);
    await run("kalendar.event.delete", u.ctx, { id });
    expect(titles(await week(u.ctx))).not.toContain(title);
  });

  it("vrstvy ostatních modulů a svátky jsou v rozsahu, rozbitá vrstva kalendář nesrazí", async () => {
    const u = await planner();
    layers = [
      {
        key: "test.vrstva",
        label: "Zkušební vrstva",
        color: "teal",
        items: async () => [
          {
            id: "x1",
            layer: "test.vrstva",
            title: "Splatnost faktury",
            start: nextMonday(),
            allDay: true,
            href: "/fakturace",
          },
        ],
      },
      {
        key: "test.rozbita",
        label: "Rozbitá",
        color: "red",
        items: async () => {
          throw new Error("chyba poskytovatele");
        },
      },
    ];
    try {
      const r = await run("kalendar.range", u.ctx, {
        from: "2026-12-20",
        to: "2026-12-31",
      });
      expect(r.layers.map((l: { key: string }) => l.key)).toEqual(["test.vrstva", "test.rozbita"]);
      expect(
        r.items.some(
          (i: { kind: string; title: string }) => i.kind === "holiday" && /Štědrý/.test(i.title),
        ),
      ).toBe(true);
      const w = await week(u.ctx);
      expect(w.items.find((i: { layer: string }) => i.layer === "test.vrstva")).toMatchObject({
        kind: "layer",
        href: "/fakturace",
        color: "teal",
      });
      const only = await run("kalendar.range", u.ctx, {
        from: nextMonday(),
        to: nextMonday(),
        layers: [],
      });
      expect(only.items.some((i: { kind: string }) => i.kind === "layer")).toBe(false);
      await expect(
        run("kalendar.range", u.ctx, { from: "2026-01-01", to: "2028-01-01" }),
      ).rejects.toThrow(/příliš dlouhé/);
    } finally {
      layers = [];
    }
  });
});

describe("zdroje a kolize", () => {
  async function resource() {
    const [r] = await app.db
      .insert(calendarResource)
      .values({ name: `Zasedačka ${tag()}` })
      .returning();
    return r!;
  }

  it("zdroj nejde obsadit dvakrát; návaznost a úprava vlastní události kolize nejsou", async () => {
    const u = await planner();
    const r = await resource();
    const first = await run(
      "kalendar.event.save",
      u.ctx,
      timed({ resourceId: r.id, title: "První" }),
    );
    await expect(
      run(
        "kalendar.event.save",
        u.ctx,
        timed({ resourceId: r.id, startTime: "09:30", endTime: "10:30" }),
      ),
    ).rejects.toThrow(new RegExp(`${r.name} je v tomto čase obsazený: „První“`));
    await run(
      "kalendar.event.save",
      u.ctx,
      timed({ resourceId: r.id, startTime: "10:00", endTime: "11:00" }),
    );
    // úprava téže události nekoliduje sama se sebou
    await run("kalendar.event.save", u.ctx, {
      ...timed({ resourceId: r.id, title: "První upravená" }),
      id: first.id,
    });
    // jiný zdroj bez problému
    await run("kalendar.event.save", u.ctx, timed({ resourceId: (await resource()).id }));
  });

  it("kolize s opakovanou událostí se najde i o několik týdnů později", async () => {
    const u = await planner();
    const r = await resource();
    await run(
      "kalendar.event.save",
      u.ctx,
      timed({ resourceId: r.id, title: "Týdenní porada", recurrence: "weekly" }),
    );
    await expect(
      run(
        "kalendar.event.save",
        u.ctx,
        timed({
          resourceId: r.id,
          startDate: addDaysIso(nextMonday(), 21),
          endDate: addDaysIso(nextMonday(), 21),
          startTime: "09:15",
          endTime: "09:45",
        }),
      ),
    ).rejects.toThrow(/Týdenní porada/);
    // jiný den v týdnu je volný
    await run(
      "kalendar.event.save",
      u.ctx,
      timed({
        resourceId: r.id,
        startDate: addDaysIso(nextMonday(), 22),
        endDate: addDaysIso(nextMonday(), 22),
      }),
    );
  });

  it("vyřazený zdroj se odmítne", async () => {
    const u = await planner();
    const r = await resource();
    await app.db
      .update(calendarResource)
      .set({ active: false })
      .where(eq(calendarResource.id, r.id));
    await expect(run("kalendar.event.save", u.ctx, timed({ resourceId: r.id }))).rejects.toThrow(
      /vyřazený/,
    );
    const opts = await run("kalendar.options", u.ctx, {});
    expect(opts.resources.some((x: { id: string }) => x.id === r.id)).toBe(false);
  });
});

const eventTitle = async (id: string) =>
  (await app.db.select({ t: event.title }).from(event).where(eq(event.id, id)))[0]!.t;

describe("pozvánky a připomenutí", () => {
  const notes = (userId: string, kind: string, entityId?: string) =>
    app.db
      .select()
      .from(schema.notification)
      .where(
        and(
          eq(schema.notification.userId, userId),
          eq(schema.notification.kind, kind),
          entityId ? eq(schema.notification.entityId, entityId) : undefined,
        ),
      );

  it("pozvaný dostane upozornění, změna termínu a zrušení také", async () => {
    const owner = await planner();
    const guest = await worker();
    const { id } = await run("kalendar.event.save", owner.ctx, timed({ attendeeIds: [guest.id] }));
    expect(await notes(guest.id, "kalendar.invite", id)).toHaveLength(1);
    expect(await notes(owner.id, "kalendar.invite", id)).toHaveLength(0);

    // úprava bez změny času nepozve znovu
    await run("kalendar.event.save", owner.ctx, {
      ...timed({ attendeeIds: [guest.id] }),
      id,
      location: "Plzeň",
    });
    expect(await notes(guest.id, "kalendar.invite", id)).toHaveLength(1);
    expect(await notes(guest.id, "kalendar.changed", id)).toHaveLength(0);

    await run("kalendar.event.save", owner.ctx, {
      ...timed({ attendeeIds: [guest.id] }),
      id,
      startTime: "11:00",
      endTime: "12:00",
    });
    expect(await notes(guest.id, "kalendar.changed", id)).toHaveLength(1);

    await run("kalendar.event.delete", owner.ctx, { id });
    const cancelled = await notes(guest.id, "kalendar.cancelled");
    expect(cancelled.some((n) => /Zrušeno/.test(n.title))).toBe(true);
  });

  it("pozvánka říká kdy, kde a kdo zve a vede přímo na událost; kdo kalendář číst nesmí, nic nedostane", async () => {
    const owner = await planner();
    const guest = await worker();
    const blind = await makeUser(app.db, []);
    const e = timed({ attendeeIds: [guest.id, blind.id], location: "Plzeň, Americká 12" });
    const { id } = await run("kalendar.event.save", owner.ctx, e);
    const [n] = await notes(guest.id, "kalendar.invite", id);
    expect(n!.title).toBe(`Pozvánka: ${e.title}`);
    expect(n!.body).toBe(
      `${formatDate(e.startDate)} 09:00\nPlzeň, Americká 12\nPozval vás ${owner.name}`,
    );
    expect(n!.url).toBe(`/kalendar/udalosti/${id}`);
    expect(await notes(blind.id, "kalendar.invite", id)).toHaveLength(0);
  });

  it("opakované přesouvání se sloučí do jednoho nepřečteného upozornění", async () => {
    const owner = await planner();
    const guest = await worker();
    const { id } = await run("kalendar.event.save", owner.ctx, timed({ attendeeIds: [guest.id] }));
    const move = (startTime: string, endTime: string) =>
      run("kalendar.event.save", owner.ctx, {
        ...timed({ attendeeIds: [guest.id] }),
        id,
        startTime,
        endTime,
      });
    await move("10:00", "11:00");
    await move("11:00", "12:00");
    await move("12:00", "13:00");
    const list = await notes(guest.id, "kalendar.changed", id);
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toMatch(/\(3×\)$/);
    expect(list[0]!.body).toContain("12:00");
    expect(list[0]!.body).toContain("Původně");
  });

  it("zrušení dostane jen pozvaný, ne ten, kdo událost zrušil, a nese termín", async () => {
    const owner = await planner();
    const guest = await worker();
    const e = timed({ attendeeIds: [guest.id] });
    const { id } = await run("kalendar.event.save", owner.ctx, e);
    await run("kalendar.event.delete", owner.ctx, { id });
    const mineCancelled = (userId: string) =>
      notes(userId, "kalendar.cancelled").then((r) => r.filter((n) => n.title.includes(e.title)));
    const [n] = await mineCancelled(guest.id);
    expect(n!.title).toBe(`Zrušeno: ${e.title}`);
    expect(n!.body).toBe(`${formatDate(e.startDate)} 09:00`);
    expect(n!.url).toBe("/kalendar");
    expect(await mineCancelled(owner.id)).toHaveLength(0);
  });

  it("denní úloha připomene událost právě jednou vlastníkovi i pozvaným", async () => {
    const owner = await planner();
    const guest = await worker();
    const soon = new Date(Date.now() + 10 * 60_000);
    const later = new Date(Date.now() + 70 * 60_000);
    const s = localParts(soon);
    const e = localParts(later);
    const { id } = await run(
      "kalendar.event.save",
      owner.ctx,
      timed({
        startDate: s.date,
        startTime: s.time,
        endDate: e.date,
        endTime: e.time,
        reminderMinutes: 15,
        attendeeIds: [guest.id],
      }),
    );
    const job = server.jobs?.find((j) => j.name === "kalendar.reminders") as ModuleJob;
    const jobDeps = {
      db: app.db,
      registry,
      queue: { send: async () => null },
      settings: {},
      cipher,
      baseURL: "http://localhost",
    } as unknown as ModuleJobDeps;
    await job.handler(jobDeps, {}, {} as never);
    await job.handler(jobDeps, {}, {} as never);
    expect(await notes(owner.id, "kalendar.reminder", id)).toHaveLength(1);
    expect(await notes(guest.id, "kalendar.reminder", id)).toHaveLength(1);
    // text říká, kdy to je (dnes nebo zítra v hh:mm), ne jen „v hh:mm“
    const [note] = await notes(owner.id, "kalendar.reminder", id);
    expect(note!.title).toMatch(new RegExp(` (dnes|zítra) v ${s.time}$`));
  });

  it("připomenutí: jednou za výskyt, v den přechodu na letní čas už je „dnes“ podle českého data, ne podle UTC", async () => {
    const owner = await planner();
    const guest = await worker();
    // pondělí 29. 3. 2027 01:30 SELČ = neděle 28. 3. 23:30 UTC; připomenutí 60 minut předem
    const { id } = await run(
      "kalendar.event.save",
      owner.ctx,
      timed({
        startDate: "2027-03-29",
        startTime: "01:30",
        endDate: "2027-03-29",
        endTime: "02:30",
        reminderMinutes: 60,
        location: "Stavba Doubravka",
        attendeeIds: [guest.id],
      }),
    );
    const count = () => notes(owner.id, "kalendar.reminder", id);
    // ještě před připomenutím (neděle 23:25 SELČ) a po začátku nic
    await sendEventReminders(app.db, new Date("2027-03-28T21:25:00Z"));
    await sendEventReminders(app.db, new Date("2027-03-28T23:31:00Z"));
    expect(await count()).toHaveLength(0);

    // 00:35 SELČ v pondělí: v UTC je ještě neděle 22:35, v Praze už „dnes“
    const now = new Date("2027-03-28T22:35:00Z");
    await sendEventReminders(app.db, now);
    await sendEventReminders(app.db, now);
    await sendEventReminders(app.db, new Date("2027-03-28T22:40:00Z"));
    const [o] = await count();
    expect(await count()).toHaveLength(1);
    expect(o!.title).toBe(`${await eventTitle(id)} dnes v 01:30`);
    expect(o!.body).toBe("Stavba Doubravka");
    expect(o!.url).toBe(`/kalendar/udalosti/${id}`);
    expect(await notes(guest.id, "kalendar.reminder", id)).toHaveLength(1);
  });

  it("připomenutí den předem řekne „zítra“ a událost bez práva číst kalendář ho nedostane", async () => {
    const owner = await planner();
    const blind = await makeUser(app.db, []);
    const { id } = await run(
      "kalendar.event.save",
      owner.ctx,
      timed({
        startDate: "2027-06-15",
        startTime: "08:00",
        endDate: "2027-06-15",
        endTime: "09:00",
        reminderMinutes: 1440,
        attendeeIds: [blind.id],
      }),
    );
    await sendEventReminders(app.db, new Date("2027-06-14T06:00:00Z"));
    const [n] = await notes(owner.id, "kalendar.reminder", id);
    expect(n!.title).toMatch(/ zítra v 08:00$/);
    expect(await notes(blind.id, "kalendar.reminder", id)).toHaveLength(0);
  });
});

describe("odběr (ICS)", () => {
  it("token se ukáže jednou, v databázi je jen otisk; starý odkaz po obnovení přestane fungovat", async () => {
    const u = await planner();
    const title = `V odběru ${tag()}`;
    await run("kalendar.event.save", u.ctx, timed({ title, location: "Plzeň, Hlavní 1" }));
    const { url } = await run("kalendar.feed.regenerate", u.ctx, {});
    const token = /\/api\/kalendar\/feed\/([^/]+)\.ics$/.exec(url)![1]!;
    expect(url.startsWith("http://localhost:3000/api/kalendar/feed/")).toBe(true);

    const [row] = await app.db.select().from(calendarFeed).where(eq(calendarFeed.userId, u.id));
    expect(row!.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);

    const ics = await feedForToken(app.db, token, "localhost", "Kalendář");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain(`SUMMARY:${title}`);
    expect(ics).toContain("LOCATION:Plzeň\\, Hlavní 1");
    expect((await run("kalendar.feed.status", u.ctx, {})).exists).toBe(true);

    const second = await run("kalendar.feed.regenerate", u.ctx, {});
    expect(second.url).not.toBe(url);
    expect(await feedForToken(app.db, token, "localhost")).toBeNull();
    expect(await feedForToken(app.db, "krátký", "localhost")).toBeNull();
    expect(await feedForToken(app.db, "x".repeat(40), "localhost")).toBeNull();
  });

  it("odběr deaktivovaného uživatele přestane vydávat události (token přežije odhlášení relací)", async () => {
    const u = await planner();
    const title = `Po odchodu ${tag()}`;
    await run("kalendar.event.save", u.ctx, timed({ title }));
    const { url } = await run("kalendar.feed.regenerate", u.ctx, {});
    const token = /feed\/([^/]+)\.ics$/.exec(url)![1]!;
    expect(await feedForToken(app.db, token, "localhost")).toContain(title);
    await app.db.update(schema.user).set({ active: false }).where(eq(schema.user.id, u.id));
    expect(await feedForToken(app.db, token, "localhost")).toBeNull();
    await app.db.update(schema.user).set({ active: true }).where(eq(schema.user.id, u.id));
    expect(await feedForToken(app.db, token, "localhost")).toContain(title);
    await app.db.update(schema.user).set({ deletedAt: new Date() }).where(eq(schema.user.id, u.id));
    expect(await feedForToken(app.db, token, "localhost")).toBeNull();
  });

  it("odběr obsahuje jen vlastní a pozvané události", async () => {
    const a = await planner();
    const b = await planner();
    const mineTitle = `Moje ${tag()}`;
    const theirsTitle = `Cizí ${tag()}`;
    const invitedTitle = `Pozvaný ${tag()}`;
    await run("kalendar.event.save", a.ctx, timed({ title: mineTitle }));
    await run("kalendar.event.save", b.ctx, timed({ title: theirsTitle }));
    await run("kalendar.event.save", b.ctx, timed({ title: invitedTitle, attendeeIds: [a.id] }));
    const { url } = await run("kalendar.feed.regenerate", a.ctx, {});
    const token = /feed\/([^/]+)\.ics$/.exec(url)![1]!;
    const ics = (await feedForToken(app.db, token, "localhost"))!;
    expect(ics).toContain(mineTitle);
    expect(ics).toContain(invitedTitle);
    expect(ics).not.toContain(theirsTitle);
  });
});

describe("import cizích kalendářů", () => {
  const ICS = (start: string) =>
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:ext-1",
      `DTSTART;VALUE=DATE:${start.replaceAll("-", "")}`,
      "SUMMARY:Dovolená v Itálii",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:ext-2",
      `DTSTART:${start.replaceAll("-", "")}T080000Z`,
      `DTEND:${start.replaceAll("-", "")}T090000Z`,
      "RRULE:FREQ=DAILY;COUNT=2",
      "SUMMARY:Zubař",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

  it("adresu, kterou nesmíme stáhnout, příkaz odmítne dřív, než se cokoli uloží", async () => {
    const u = await planner();
    for (const url of [
      "https://127.0.0.1/cal.ics",
      "https://169.254.169.254/latest/meta-data",
      "http://example.com/cal.ics",
      "https://localhost/cal.ics",
      "file:///etc/passwd",
    ])
      await expect(run("kalendar.import.add", u.ctx, { name: "x", url })).rejects.toThrow(
        /není povolená|https|adres/i,
      );
    expect(await run("kalendar.import.list", u.ctx, {})).toEqual([]);
  });

  it("synchronizace uloží výskyty jako „obsazeno“, vidí je jen majitel; chyba se zapíše", async () => {
    const u = await planner();
    const other = await planner();
    const day = nextMonday();
    const [imp] = await app.db
      .insert(calendarImport)
      .values({
        userId: u.id,
        name: "Google",
        urlEncrypted: cipher.encrypt("https://calendar.example.com/x.ics"),
      })
      .returning();
    const ok = await syncImport(app.db, cipher, imp!.id, async () => ({
      status: 200,
      body: ICS(day),
    }));
    expect(ok).toEqual({ ok: true, count: 3 });
    const stored = await app.db
      .select()
      .from(externalEvent)
      .where(eq(externalEvent.importId, imp!.id));
    expect(stored.map((s) => s.title).sort()).toEqual(["Dovolená v Itálii", "Zubař", "Zubař"]);
    expect(new Set(stored.map((s) => s.uid)).size).toBe(3);

    const mine = await week(u.ctx);
    expect(mine.items.filter((i: { kind: string }) => i.kind === "busy")).toHaveLength(3);
    const theirs = await week(other.ctx);
    expect(theirs.items.filter((i: { kind: string }) => i.kind === "busy")).toHaveLength(0);

    // opakovaná synchronizace nahradí, nenaplní duplicitami
    await syncImport(app.db, cipher, imp!.id, async () => ({ status: 200, body: ICS(day) }));
    expect(
      (await app.db.select().from(externalEvent).where(eq(externalEvent.importId, imp!.id))).length,
    ).toBe(3);

    const failed = await syncImport(app.db, cipher, imp!.id, async () => ({ status: 404 }));
    expect(failed).toEqual({ ok: false, error: "Server kalendáře odpověděl chybou 404." });
    const [after] = await app.db
      .select()
      .from(calendarImport)
      .where(eq(calendarImport.id, imp!.id));
    expect(after!.lastError).toMatch(/404/);
    // původní události zůstanou
    expect(
      (await app.db.select().from(externalEvent).where(eq(externalEvent.importId, imp!.id))).length,
    ).toBe(3);

    // cizí import nejde synchronizovat ani smazat
    await expect(run("kalendar.import.sync", other.ctx, { id: imp!.id })).rejects.toThrow();
    await run("kalendar.import.delete", other.ctx, { id: imp!.id });
    expect(
      (await run("kalendar.import.list", u.ctx, {})).map((x: { id: string }) => x.id),
    ).toContain(imp!.id);
    await run("kalendar.import.delete", u.ctx, { id: imp!.id });
    expect(
      await app.db.select().from(externalEvent).where(eq(externalEvent.importId, imp!.id)),
    ).toEqual([]);
  });

  it("úloha obnoví jen zastaralé importy", async () => {
    const u = await planner();
    const [imp] = await app.db
      .insert(calendarImport)
      .values({ userId: u.id, name: "Staré", urlEncrypted: "poškozené" })
      .returning();
    const job = server.jobs?.find((j) => j.name === "kalendar.sync") as ModuleJob;
    const jobDeps = {
      db: app.db,
      registry,
      queue: { send: async () => null },
      settings: {},
      cipher,
      baseURL: "http://localhost",
    } as unknown as ModuleJobDeps;
    await job.handler(jobDeps, {}, {} as never);
    const [after] = await app.db
      .select()
      .from(calendarImport)
      .where(eq(calendarImport.id, imp!.id));
    // adresa se nedá dešifrovat → chyba se zapíše, úloha nespadne
    expect(after!.lastSyncAt).not.toBeNull();
    expect(after!.lastError).toMatch(/přečíst/);
  });
});

describe("widget a entity", () => {
  it("dnešní události na přehledu", async () => {
    const u = await planner();
    const today = todayIso();
    await run(
      "kalendar.event.save",
      u.ctx,
      timed({
        startDate: today,
        endDate: today,
        startTime: "23:00",
        endTime: "23:30",
        title: "Večerní",
      }),
    );
    const [w] = await (server.widgets![0] as WidgetProvider)(u.ctx, deps());
    expect(w).toMatchObject({ id: "calendar-today", module: "kalendar" });
    expect(Number(w!.value)).toBeGreaterThanOrEqual(1);
    const stranger = await makeUser(app.db, [["zakazky.read", "all"]]);
    expect(await (server.widgets![0] as WidgetProvider)(stranger.ctx, deps())).toEqual([]);
  });

  it("události v databázi mají okamžiky a soft delete", async () => {
    const u = await planner();
    const { id } = await run("kalendar.event.save", u.ctx, timed());
    const [row] = await app.db.select().from(event).where(eq(event.id, id));
    expect(row!.startsAt.getTime()).toBeLessThan(row!.endsAt.getTime());
    await run("kalendar.event.delete", u.ctx, { id });
    const [gone] = await app.db.select().from(event).where(eq(event.id, id));
    expect(gone!.deletedAt).not.toBeNull();
  });
});
