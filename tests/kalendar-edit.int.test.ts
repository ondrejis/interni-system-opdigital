import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
  type EntityRegistry,
} from "@rebar/core/entities";
import type { CommandDef, ModuleDeps } from "@rebar/core/module-server";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { addDaysIso, todayIso, weekStartIso } from "@rebar/core/time";
import { commands, entities as kalendarEntities } from "@rebar/kalendar/server";

/** Úprava cizí události správcem: účastníci se zachovají, vlastník se do seznamu nezapisuje. */
const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
const deps = () =>
  ({
    registry,
    baseURL: "http://localhost:3000",
    costProviders: [],
    calendarLayers: [],
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
  ]);
const worker = () =>
  makeUser(app.db, [
    ["kalendar.read", "own"],
    ["kalendar.write", "own"],
  ]);

const monday = addDaysIso(weekStartIso(todayIso()), 7);
const timed = (over: Record<string, unknown> = {}) => ({
  title: `Schůzka ${randomBytes(3).toString("hex")}`,
  type: "meeting",
  allDay: false,
  startDate: monday,
  startTime: "09:00",
  endDate: monday,
  endTime: "10:00",
  attendeeIds: [] as string[],
  ...over,
});
const attendeesOf = async (ctx: unknown, id: string) =>
  ((await run("kalendar.event.get", ctx, { id })).attendees as { id: string }[])
    .map((a) => a.id)
    .sort();

describe("úprava cizí události", () => {
  it("správce, který je pozvaný, zůstane účastníkem; vlastník se do účastníků nezapíše", async () => {
    const owner = await worker();
    const boss = await planner();
    const guest = await worker();
    const e = timed({ attendeeIds: [boss.id, guest.id] });
    const { id } = await run("kalendar.event.save", owner.ctx, e);
    expect(await attendeesOf(boss.ctx, id)).toEqual([boss.id, guest.id].sort());

    // správce změní název a pošle stejný seznam účastníků, včetně sebe i vlastníka
    await run("kalendar.event.save", boss.ctx, {
      ...e,
      id,
      title: `${e.title} (upraveno)`,
      attendeeIds: [boss.id, guest.id, owner.id],
    });
    const after = await run("kalendar.event.get", boss.ctx, { id });
    expect(after.title).toContain("(upraveno)");
    expect(after.ownerId).toBe(owner.id);
    expect(await attendeesOf(boss.ctx, id)).toEqual([boss.id, guest.id].sort());

    // událost zůstane i v jeho „moje“ rozsahu (je pozvaný) a vlastník ji dál vidí
    const range = (ctx: unknown) =>
      run("kalendar.range", ctx, { from: monday, to: addDaysIso(monday, 6), who: "me" });
    expect((await range(boss.ctx)).items.map((x: { title: string }) => x.title)).toContain(
      after.title,
    );
    expect((await range(owner.ctx)).items.map((x: { title: string }) => x.title)).toContain(
      after.title,
    );
  });

  it("rozsah označí vlastní události (`own`), pozvané ne", async () => {
    const owner = await worker();
    const guest = await worker();
    const e = timed({ attendeeIds: [guest.id] });
    await run("kalendar.event.save", owner.ctx, e);
    const flag = async (ctx: unknown) =>
      (
        await run("kalendar.range", ctx, { from: monday, to: addDaysIso(monday, 6), who: "me" })
      ).items.find((x: { title: string }) => x.title === e.title)?.own;
    expect(await flag(owner.ctx)).toBe(true);
    expect(await flag(guest.ctx)).toBe(false);
  });

  it("vlastník při úpravě vlastní události dál není ve výčtu účastníků a odebraný host zmizí", async () => {
    const owner = await planner();
    const a = await worker();
    const b = await worker();
    const e = timed({ attendeeIds: [a.id, b.id] });
    const { id } = await run("kalendar.event.save", owner.ctx, e);
    await run("kalendar.event.save", owner.ctx, { ...e, id, attendeeIds: [owner.id, a.id] });
    expect(await attendeesOf(owner.ctx, id)).toEqual([a.id]);
  });
});
