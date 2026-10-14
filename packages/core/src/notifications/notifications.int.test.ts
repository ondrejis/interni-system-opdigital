import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { revokeSessions, setUserActive } from "../admin/users";
import { listNotifications, markRead, unreadCount } from "../collab/notifications";
import { createNotifications } from "../collab/notifications";
import { createTask } from "../collab/tasks";
import { schema } from "../db/client";
import { clearEntityPolicies, registerEntityPolicy } from "../entities/policy";
import {
  countSubscriptions,
  listDevices,
  removeDevice,
  removeSessionSubscriptions,
  removeSubscription,
  removeUserSubscriptions,
  saveSubscription,
  type PushSender,
  type PushSendOptions,
} from "../push/push";
import { connectAppDb, makeUser } from "../testing";
import { configureNotifications, resetNotifications, SYSTEM_TEST } from "./catalog";
import { notificationsConfigSchema } from "./config";
import {
  MAX_ATTEMPTS,
  cleanupNotifications,
  dispatchDue,
  snoozeNotification,
  type EmailMessage,
} from "./dispatch";
import { notify } from "./notify";
import { sendTaskDigests } from "./scheduled";
import {
  getAdminRules,
  getDeliveryStats,
  getDeliveryStatus,
  getMyPreferences,
  listMyDeliveries,
  queueTestNotification,
  saveAdminRules,
  saveMyPreferences,
} from "./service";
import { defineNotificationEvent } from "./types";
import { createSettings } from "../settings";
import { createCipher, parseKeyRing } from "../security";

const app = connectAppDb();
afterAll(() => app.close());

const JOB_ID = crypto.randomUUID();
const jobOwners = new Map<string, string[]>([[JOB_ID, []]]);

/** Událost s částkou: příklad události, která smí ukázat peníze jen někomu. */
const APPROVED = defineNotificationEvent({
  key: "testing.approved",
  label: "Schváleno",
  description: "Test",
  group: "Test",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { team: "Tým" },
  recipients: ["team"],
  params: {
    number: { label: "Číslo", example: "Z-1" },
    amount: { label: "Částka", example: "52 000 Kč", sensitive: "money" },
  },
  template: {
    title: "{number}: schváleno {amount}",
    body: "Vícepráce na zakázce {number}\nČástka {amount}",
    url: "/zakazky/{entityId}",
  },
  entity: "test_job",
  dedupe: "record",
});

const SCHEDULE = defineNotificationEvent({
  key: "testing.schedule",
  label: "Harmonogram",
  description: "Test",
  group: "Test",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { team: "Tým" },
  recipients: ["team"],
  params: { number: { label: "Číslo", example: "Z-1" } },
  template: { title: "{number}: změna harmonogramu", url: "/zakazky/{entityId}" },
  entity: "test_job",
  mergeWindowSeconds: 900,
  debounceSeconds: 45,
});

const URGENT = defineNotificationEvent({
  key: "testing.urgent",
  label: "Naléhavé",
  description: "Test",
  group: "Test",
  severity: "urgent",
  channels: { push: true, bell: true },
  audiences: { to: "Příjemce" },
  recipients: ["to"],
  params: { what: { label: "Co", example: "STK" } },
  template: { title: "Naléhavé: {what}", url: "/inbox" },
  snooze: true,
});

const PLAIN = defineNotificationEvent({
  key: "testing.plain",
  label: "Běžné",
  description: "Test",
  group: "Test",
  severity: "normal",
  channels: { push: true, bell: true, email: false },
  audiences: { to: "Příjemce" },
  recipients: ["to"],
  params: { n: { label: "Číslo", example: "1" } },
  template: { title: "Událost {n}", url: "/inbox" },
});

beforeAll(() => {
  clearEntityPolicies();
  registerEntityPolicy({
    entityType: "test_job",
    read: "test_job.read",
    write: "test_job.write",
    owners: async (_db, id) => (jobOwners.has(id) ? { ownerIds: jobOwners.get(id)! } : null),
  });
  configureNotifications({
    events: [APPROVED, SCHEDULE, URGENT, PLAIN],
    config: notificationsConfigSchema.parse({
      quietHours: { enabled: false, start: "20:00", end: "06:00" },
    }),
  });
});
afterAll(() => {
  clearEntityPolicies();
  resetNotifications();
});

const sub = () => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID().slice(0, 12)}`,
  p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
  auth: "tBHItJI5svbpez7KI4CCXg",
});

type Sent = { endpoint: string; payload: Record<string, unknown>; options?: PushSendOptions };
function recorder(fail: Record<string, number> = {}) {
  const sent: Sent[] = [];
  const send: PushSender = async (t, payload, options) => {
    const code = fail[t.endpoint];
    if (code) throw Object.assign(new Error("push"), { statusCode: code });
    sent.push({
      endpoint: t.endpoint,
      payload: JSON.parse(payload) as Record<string, unknown>,
      options,
    });
  };
  return { sent, send };
}

async function person(perms: [string, "all" | "own"][] = [], withDevice = true) {
  const u = await makeUser(app.db, perms);
  const s = sub();
  if (withDevice) await saveSubscription(u.ctx, s);
  return { ...u, device: s };
}

const deliveries = (userId: string) =>
  app.db
    .select()
    .from(schema.notificationDelivery)
    .where(eq(schema.notificationDelivery.userId, userId))
    .orderBy(schema.notificationDelivery.createdAt);

const notificationsOf = (userId: string) =>
  app.db.select().from(schema.notification).where(eq(schema.notification.userId, userId));

const minutes = (base: Date, m: number) => new Date(base.getTime() + m * 60_000);

async function dispatch(
  users: string[],
  send: PushSender | null,
  now = new Date(),
  email?: (m: EmailMessage) => Promise<void>,
) {
  return dispatchDue({ db: app.db, push: send, email: email ?? null, now, userIds: users });
}

describe("příjemci a přístup", () => {
  it("doručí skupinám podle pravidel události, vynechá původce a neaktivní, zapíše zvoneček i push", async () => {
    const a = await person([["test_job.read", "all"]]);
    const b = await person([["test_job.read", "all"]]);
    const author = await person([["test_job.read", "all"]]);
    const gone = await person([["test_job.read", "all"]]);
    await app.db.update(schema.user).set({ active: false }).where(eq(schema.user.id, gone.id));

    const r = await notify(app.db, SCHEDULE, {
      params: { number: "Z-1" },
      to: { team: [a.id, b.id, author.id, gone.id, null, undefined] },
      record: { id: JOB_ID },
      actorId: author.id,
    });
    expect(r).toMatchObject({ created: 2, candidates: 3, noAccess: 0 });
    expect(await notificationsOf(author.id)).toEqual([]);
    expect(await notificationsOf(gone.id)).toEqual([]);
    const [n] = await notificationsOf(a.id);
    expect(n).toMatchObject({
      kind: "testing.schedule",
      title: "Z-1: změna harmonogramu",
      url: `/zakazky/${JOB_ID}`,
      inbox: true,
      entityType: "test_job",
      entityId: JOB_ID,
    });
    const d = await deliveries(a.id);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ channel: "push", status: "queued", mode: "instant" });
  });

  it("příjemce bez práva na záznam upozornění nedostane; rozsah „own“ vyžaduje vlastnictví", async () => {
    const outsider = await person([]);
    const reader = await person([["test_job.read", "all"]]);
    const own = await person([["test_job.read", "own"]]);
    const owner = await person([["test_job.read", "own"]]);
    const job = crypto.randomUUID();
    jobOwners.set(job, [owner.id]);
    const r = await notify(app.db, SCHEDULE, {
      params: { number: "Z-2" },
      to: { team: [outsider.id, reader.id, own.id, owner.id] },
      record: { id: job },
    });
    expect(r.created).toBe(2);
    expect(r.noAccess).toBe(2);
    expect(await notificationsOf(outsider.id)).toEqual([]);
    expect(await notificationsOf(own.id)).toEqual([]);
    expect(await notificationsOf(reader.id)).toHaveLength(1);
    expect(await notificationsOf(owner.id)).toHaveLength(1);
    // záznam, který neexistuje, nedostane nikdo
    const none = await notify(app.db, SCHEDULE, {
      params: { number: "Z-3" },
      to: { team: [reader.id] },
      record: { id: crypto.randomUUID() },
    });
    expect(none.created).toBe(0);
  });

  it("příjemci podle oprávnění (perm:) a role (role:) z pravidel klienta", async () => {
    const withPerm = await person([
      ["testing.special", "all"],
      ["test_job.read", "all"],
    ]);
    const without = await person([["test_job.read", "all"]]);
    const roleUser = await person([["test_job.read", "all"]]);
    const [role] = await app.db
      .select({ key: schema.role.key })
      .from(schema.role)
      .innerJoin(schema.user, eq(schema.user.roleId, schema.role.id))
      .where(eq(schema.user.id, roleUser.id));
    configureNotifications({
      events: [APPROVED, SCHEDULE, URGENT, PLAIN],
      config: notificationsConfigSchema.parse({
        quietHours: { enabled: false, start: "20:00", end: "06:00" },
        events: {
          "testing.schedule": { recipients: ["perm:testing.special", `role:${role!.key}`] },
        },
      }),
    });
    try {
      await notify(app.db, SCHEDULE, { params: { number: "Z-4" }, record: { id: JOB_ID } });
      expect(await notificationsOf(withPerm.id)).toHaveLength(1);
      expect(await notificationsOf(roleUser.id)).toHaveLength(1);
      expect(await notificationsOf(without.id)).toEqual([]);
    } finally {
      configureNotifications({
        events: [APPROVED, SCHEDULE, URGENT, PLAIN],
        config: notificationsConfigSchema.parse({
          quietHours: { enabled: false, start: "20:00", end: "06:00" },
        }),
      });
    }
  });
});

describe("obsah podle oprávnění", () => {
  it("peníze v titulku i podtitulku dostane jen ten, kdo smí vidět ekonomiku", async () => {
    const finance = await person([
      ["test_job.read", "all"],
      ["fakturace.read", "all"],
    ]);
    const foreman = await person([["test_job.read", "all"]]);
    const job = crypto.randomUUID();
    jobOwners.set(job, []);
    await notify(app.db, APPROVED, {
      params: { number: "VP-1", amount: "+52 000 Kč" },
      to: { team: [finance.id, foreman.id] },
      record: { id: job },
    });
    const [f] = await notificationsOf(finance.id);
    const [m] = await notificationsOf(foreman.id);
    expect(f).toMatchObject({
      title: "VP-1: schváleno +52 000 Kč",
      body: "Vícepráce na zakázce VP-1\nČástka +52 000 Kč",
    });
    expect(m!.title).toBe("VP-1: schváleno");
    expect(m!.body).toBe("Vícepráce na zakázce VP-1");
    for (const text of [m!.title, m!.body ?? ""]) expect(text).not.toMatch(/Kč|52/);

    // stejný obsah musí obstát i v push zprávě
    const rec = recorder();
    await dispatch([finance.id, foreman.id], rec.send);
    const pushed = rec.sent.map((s) => JSON.stringify(s.payload)).join("|");
    expect(pushed).toContain("52 000");
    expect(rec.sent.filter((s) => s.endpoint === foreman.device.endpoint)[0]!.payload.title).toBe(
      "VP-1: schváleno",
    );
    expect(
      JSON.stringify(rec.sent.filter((s) => s.endpoint === foreman.device.endpoint)),
    ).not.toMatch(/Kč/);
  });

  it("částka propašovaná jiným parametrem se odstraní pojistkou", async () => {
    const foreman = await person([["test_job.read", "all"]]);
    await notify(app.db, APPROVED, {
      params: { number: "VP-2 (celkem 120 000 Kč)", amount: "1 Kč" },
      to: { team: [foreman.id] },
      record: { id: JOB_ID },
      dedupe: "x",
    });
    const [n] = await notificationsOf(foreman.id);
    expect(n!.title).not.toMatch(/Kč/);
  });
});

describe("pravidla klienta a správce", () => {
  it("správce událost vypne, přepíše text a kanály; úpravu uloží přes nastavení", async () => {
    const admin = await makeUser(app.db, [["settings.manage", "all"]]);
    const a = await person();
    const settings = createSettings(
      createCipher(parseKeyRing({ APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") })),
    );
    try {
      await saveAdminRules(admin.ctx, settings, {
        events: { "testing.plain": { enabled: false } },
      });
      expect(await notify(app.db, PLAIN, { params: { n: 1 }, to: { to: [a.id] } })).toMatchObject({
        created: 0,
      });
      expect(await notificationsOf(a.id)).toEqual([]);

      await saveAdminRules(admin.ctx, settings, {
        events: {
          "testing.plain": { title: "Vlastní č. {n}", channels: { push: false, email: false } },
        },
      });
      await notify(app.db, PLAIN, { params: { n: 7 }, to: { to: [a.id] } });
      const [n] = await notificationsOf(a.id);
      expect(n!.title).toBe("Vlastní č. 7");
      // push i e-mail vypnul správce: zvoneček zůstal, doručení do zařízení nevzniklo
      expect(await deliveries(a.id)).toEqual([]);
    } finally {
      await saveAdminRules(admin.ctx, settings, { events: {} });
    }
  });

  it("neplatná úprava se odmítne (neznámý parametr, příjemce)", async () => {
    const admin = await makeUser(app.db, [["settings.manage", "all"]]);
    const settings = createSettings(
      createCipher(parseKeyRing({ APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") })),
    );
    await expect(
      saveAdminRules(admin.ctx, settings, { events: { "testing.plain": { title: "{nic}" } } }),
    ).rejects.toThrow(/neznámý parametr/);
    await expect(
      saveAdminRules(admin.ctx, settings, { events: { "testing.plain": { recipients: ["x"] } } }),
    ).rejects.toThrow(/neexistuje/);
    await expect(
      saveAdminRules(admin.ctx, settings, { events: { "neexistuje.x": {} } }),
    ).rejects.toThrow(/Neznámá událost/);
    const nobody = await makeUser(app.db, []);
    await expect(saveAdminRules(nobody.ctx, settings, { events: {} })).rejects.toThrow();
  });
});

describe("předvolby uživatele", () => {
  it("push vypnutý uživatelem se zapíše jako přeskočený, zvoneček vypnutý skryje upozornění z Inboxu", async () => {
    const u = await person();
    await saveMyPreferences(u.ctx, {
      events: { "testing.plain": { push: "off" }, "testing.urgent": { bell: false } },
    });
    await notify(app.db, PLAIN, { params: { n: 1 }, to: { to: [u.id] } });
    await notify(app.db, URGENT, { params: { what: "STK" }, to: { to: [u.id] } });
    const d = await deliveries(u.id);
    expect(d.filter((x) => x.status === "skipped")).toEqual([
      expect.objectContaining({ channel: "push", reason: "user_off" }),
    ]);
    const rows = await notificationsOf(u.id);
    expect(rows.find((n) => n.kind === "testing.urgent")!.inbox).toBe(false);
    const inbox = await listNotifications(u.ctx);
    expect(inbox.map((n) => n.kind)).toEqual(["testing.plain"]);
    expect(await unreadCount(u.ctx)).toBe(1);
    // skrytá push zpráva se přesto odešle
    const rec = recorder();
    await dispatch([u.id], rec.send);
    expect(rec.sent.map((s) => s.payload.title)).toEqual(["Naléhavé: STK"]);
    expect(rec.sent[0]!.payload.nid).toBeNull();
  });

  it("uloží jen odchylky od výchozích, zahodí neznámé události a vrací jen relevantní události", async () => {
    const u = await person([["test_job.read", "all"]]);
    const noJob = await person([]);
    await saveMyPreferences(u.ctx, {
      events: {
        "testing.plain": { push: "instant", bell: true, email: false },
        "neexistuje.x": { push: "off" },
        "testing.urgent": { push: "digest" },
      },
      quiet: { enabled: true, start: "21:00", end: "05:30" },
    });
    const [row] = await app.db
      .select()
      .from(schema.notificationPref)
      .where(eq(schema.notificationPref.userId, u.id));
    expect(row!.prefs).toEqual({
      events: { "testing.urgent": { push: "digest" } },
      quiet: { enabled: true, start: "21:00", end: "05:30" },
    });
    const mine = await getMyPreferences(u.ctx);
    expect(mine.quietCustom).toBe(true);
    expect(mine.events.map((e) => e.key)).toContain("testing.approved");
    expect(mine.events.find((e) => e.key === "system.test")).toBeUndefined();
    const theirs = await getMyPreferences(noJob.ctx);
    expect(theirs.events.map((e) => e.key)).not.toContain("testing.approved");
    expect(theirs.quietCustom).toBe(false);
  });

  it("neplatné předvolby (čas 25:00) uložit nejde", async () => {
    const u = await person();
    await expect(
      saveMyPreferences(u.ctx, {
        events: {},
        quiet: { enabled: true, start: "25:00", end: "06:00" },
      }),
    ).rejects.toThrow();
  });
});

describe("tiché hodiny, shrnutí a naléhavost", () => {
  it("v tichých hodinách push čeká do rána, naléhavé jde hned; zvoneček vždy hned", async () => {
    const u = await person();
    await saveMyPreferences(u.ctx, {
      events: {},
      quiet: { enabled: true, start: "20:00", end: "06:00" },
    });
    const night = new Date("2026-10-09T21:00:00Z"); // 23:00 místně
    await notify(app.db, PLAIN, { params: { n: 1 }, to: { to: [u.id] }, at: night });
    await notify(app.db, URGENT, { params: { what: "Revize" }, to: { to: [u.id] }, at: night });
    expect(await notificationsOf(u.id)).toHaveLength(2);
    const d = await deliveries(u.id);
    const quiet = d.find((x) => x.mode === "quiet")!;
    expect(quiet).toMatchObject({ status: "held", channel: "push" });
    expect(quiet.releaseAt).toEqual(new Date("2026-10-10T04:00:00Z"));

    const rec = recorder();
    await dispatch([u.id], rec.send, minutes(night, 1));
    expect(rec.sent.map((s) => s.payload.title)).toEqual(["Naléhavé: Revize"]);
    expect(rec.sent[0]!.options).toMatchObject({ urgency: "high" });
    // ráno se uvolní
    const morning = new Date("2026-10-10T04:00:30Z");
    const rec2 = recorder();
    const res = await dispatch([u.id], rec2.send, morning);
    expect(res.sent).toBe(1);
    expect(rec2.sent.map((s) => s.payload.title)).toEqual(["Událost 1"]);
  });

  it("přes jarní změnu času uvolní zdržené push v 6:00 místního času (04:00Z)", async () => {
    const u = await person();
    await saveMyPreferences(u.ctx, {
      events: {},
      quiet: { enabled: true, start: "20:00", end: "06:00" },
    });
    const saturdayNight = new Date("2026-03-28T21:30:00Z"); // 22:30 SEČ
    await notify(app.db, PLAIN, { params: { n: 2 }, to: { to: [u.id] }, at: saturdayNight });
    const [d] = await deliveries(u.id);
    expect(d!.releaseAt).toEqual(new Date("2026-03-29T04:00:00Z"));
    const rec = recorder();
    expect((await dispatch([u.id], rec.send, new Date("2026-03-29T03:59:00Z"))).sent).toBe(0);
    expect((await dispatch([u.id], rec.send, new Date("2026-03-29T04:00:00Z"))).sent).toBe(1);
  });

  it("shrnutí: víc upozornění naráz je jedna push zpráva v čase shrnutí", async () => {
    const u = await person();
    await saveMyPreferences(u.ctx, {
      events: { "testing.plain": { push: "digest" } },
      digestTimes: ["07:00"],
    });
    const base = new Date("2026-10-12T05:00:00Z"); // 07:00 místně v pondělí; další shrnutí zítra
    for (const n of [1, 2, 3])
      await notify(app.db, PLAIN, { params: { n }, to: { to: [u.id] }, at: base });
    const d = await deliveries(u.id);
    expect(d.every((x) => x.mode === "digest" && x.status === "held")).toBe(true);
    const rec = recorder();
    expect((await dispatch([u.id], rec.send, minutes(base, 120))).sent).toBe(0);
    const res = await dispatch([u.id], rec.send, new Date("2026-10-13T05:00:10Z"));
    expect(res.sent).toBe(3);
    expect(rec.sent).toHaveLength(1);
    expect(rec.sent[0]!.payload).toMatchObject({
      title: "3 nových upozornění",
      url: "/inbox",
      count: 3,
    });
    const after = await deliveries(u.id);
    expect(after.map((x) => x.reason).sort()).toEqual(["summarized", "summarized", "summary"]);
  });
});

describe("doručení: fronta, opakování, úklid", () => {
  it("odešle push se správným obsahem, odznakem, tagem, TTL a urgency; podruhé už nic", async () => {
    const u = await person();
    await notify(app.db, URGENT, { params: { what: "STK" }, to: { to: [u.id] } });
    await notify(app.db, PLAIN, { params: { n: 5 }, to: { to: [u.id] } });
    const rec = recorder();
    const res = await dispatch([u.id], rec.send);
    expect(res).toMatchObject({ claimed: 2, sent: 2 });
    const urgent = rec.sent.find((s) => s.payload.urgent === true)!;
    const [n] = (await notificationsOf(u.id)).filter((x) => x.kind === "testing.urgent");
    expect(urgent.payload).toMatchObject({
      title: "Naléhavé: STK",
      url: "/inbox",
      nid: n!.id,
      badge: 2,
      snooze: true,
    });
    expect(urgent.payload.tag).toBe(`n:${n!.id}`);
    expect(urgent.options).toMatchObject({ ttl: 6 * 3600, urgency: "high" });
    expect(urgent.options!.topic).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
    const plain = rec.sent.find((s) => s.payload.urgent === false)!;
    expect(plain.options).toMatchObject({ ttl: 24 * 3600, urgency: "normal" });
    const again = recorder();
    expect((await dispatch([u.id], again.send)).claimed).toBe(0);
    expect(again.sent).toEqual([]);
    for (const d of await deliveries(u.id))
      expect(d).toMatchObject({ status: "sent", attempts: 1 });
  });

  it("souběžné běhy nepošlou totéž dvakrát", async () => {
    const u = await person();
    await notify(app.db, PLAIN, { params: { n: 9 }, to: { to: [u.id] } });
    const rec = recorder();
    await Promise.all([1, 2, 3, 4].map(() => dispatch([u.id], rec.send)));
    expect(rec.sent).toHaveLength(1);
  });

  it("přechodná chyba: opakování s rostoucí prodlevou, pak odešle; po vyčerpání pokusů selže", async () => {
    const u = await person();
    await notify(app.db, PLAIN, { params: { n: 11 }, to: { to: [u.id] } });
    const t0 = new Date();
    const flaky = recorder({ [u.device.endpoint]: 503 });
    const waits: number[] = [];
    let now = t0;
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      const r = await dispatch([u.id], flaky.send, now);
      expect(r.retried).toBe(1);
      const [d] = await deliveries(u.id);
      expect(d).toMatchObject({ status: "retry", attempts: i + 1, lastError: "HTTP 503" });
      waits.push(d!.releaseAt.getTime() - now.getTime());
      // před uplynutím prodlevy se nic neděje
      expect((await dispatch([u.id], flaky.send, new Date(now.getTime() + 1000))).claimed).toBe(0);
      now = d!.releaseAt;
    }
    expect(waits).toEqual([30_000, 120_000, 600_000, 1_800_000, 7_200_000, 21_600_000]);
    const last = await dispatch([u.id], flaky.send, now);
    expect(last.failed).toBe(1);
    const [d] = await deliveries(u.id);
    expect(d).toMatchObject({
      status: "failed",
      reason: "retries_exhausted",
      attempts: MAX_ATTEMPTS,
    });
    // odběr po přechodných chybách zůstává, ale eviduje poruchu
    const devices = await listDevices(u.ctx);
    expect(devices).toHaveLength(1);
    expect(devices[0]!.failures).toBeGreaterThan(0);

    // nová zpráva po uzdravení projde a vynuluje počítadlo chyb
    await notify(app.db, PLAIN, { params: { n: 12 }, to: { to: [u.id] } });
    const ok = recorder();
    expect((await dispatch([u.id], ok.send, new Date(now.getTime() + 60_000))).sent).toBe(1);
    expect((await listDevices(u.ctx))[0]!.failures).toBe(0);
  });

  it("zrušený odběr (410/404) se smaže; když nezbyde žádné zařízení, doručení je přeskočené s důvodem", async () => {
    const u = await person();
    const second = sub();
    await saveSubscription(u.ctx, second);
    await notify(app.db, PLAIN, { params: { n: 13 }, to: { to: [u.id] } });
    const rec = recorder({ [u.device.endpoint]: 410 });
    const res = await dispatch([u.id], rec.send);
    expect(res.sent).toBe(1);
    expect(await countSubscriptions(u.ctx)).toBe(1);
    expect((await deliveries(u.id))[0]!.detail).toMatchObject({ devices: 1, removed: 1 });

    await notify(app.db, PLAIN, { params: { n: 14 }, to: { to: [u.id] } });
    const allGone = recorder({ [second.endpoint]: 404 });
    await dispatch([u.id], allGone.send);
    expect(await countSubscriptions(u.ctx)).toBe(0);
    const last = (await deliveries(u.id)).at(-1)!;
    expect(last).toMatchObject({ status: "skipped", reason: "no_device" });
  });

  it("trvalé odmítnutí (špatné klíče VAPID) neopakuje, zapíše důvod bez tajemství", async () => {
    const u = await person();
    await notify(app.db, PLAIN, { params: { n: 15 }, to: { to: [u.id] } });
    const r = await dispatch([u.id], recorder({ [u.device.endpoint]: 403 }).send);
    expect(r.failed).toBe(1);
    const [d] = await deliveries(u.id);
    expect(d).toMatchObject({ status: "failed", reason: "push_rejected", attempts: 1 });
    expect(JSON.stringify(d)).not.toContain(u.device.endpoint);
    expect(JSON.stringify(d)).not.toContain(sub().auth);
  });

  it("bez klíčů VAPID i bez zařízení se doručení přeskočí s důvodem", async () => {
    const u = await person([], false);
    const v = await person();
    await notify(app.db, PLAIN, { params: { n: 16 }, to: { to: [u.id, v.id] } });
    await dispatch([u.id], recorder().send);
    expect((await deliveries(u.id))[0]).toMatchObject({ status: "skipped", reason: "no_device" });
    await dispatch([v.id], null);
    expect((await deliveries(v.id))[0]).toMatchObject({
      status: "skipped",
      reason: "push_not_configured",
    });
  });

  it("už přečtené upozornění se neposílá; deaktivovaný uživatel nic nedostane", async () => {
    const u = await person();
    const off = await person();
    await notify(app.db, PLAIN, { params: { n: 17 }, to: { to: [u.id, off.id] } });
    const [n] = await notificationsOf(u.id);
    await markRead(u.ctx, [n!.id]);
    await app.db.update(schema.user).set({ active: false }).where(eq(schema.user.id, off.id));
    const rec = recorder();
    await dispatch([u.id, off.id], rec.send);
    expect(rec.sent).toEqual([]);
    expect((await deliveries(u.id))[0]).toMatchObject({
      status: "skipped",
      reason: "already_read",
    });
    expect((await deliveries(off.id))[0]).toMatchObject({
      status: "skipped",
      reason: "user_inactive",
    });
  });

  it("příliš starý push se neodešle", async () => {
    const u = await person();
    await notify(app.db, PLAIN, {
      params: { n: 18 },
      to: { to: [u.id] },
      at: new Date(Date.now() - 30 * 3600_000),
    });
    const rec = recorder();
    await dispatch([u.id], rec.send);
    expect(rec.sent).toEqual([]);
    expect((await deliveries(u.id))[0]).toMatchObject({ status: "skipped", reason: "expired" });
  });

  it("větší bouřka různých událostí se pošle jako jedno shrnutí; naléhavé zvlášť", async () => {
    const u = await person();
    for (const n of [1, 2, 3, 4, 5])
      await notify(app.db, PLAIN, { params: { n }, to: { to: [u.id] } });
    await notify(app.db, URGENT, { params: { what: "Revize" }, to: { to: [u.id] } });
    const rec = recorder();
    const res = await dispatch([u.id], rec.send);
    expect(res.sent).toBe(6);
    expect(rec.sent.map((s) => s.payload.title).sort()).toEqual([
      "5 nových upozornění",
      "Naléhavé: Revize",
    ]);
    expect(rec.sent.find((s) => s.payload.count === 5)!.payload.body).toMatch(/…a 2 dalších/);
  });

  it("omezení počtu zpráv: nad limit za 10 minut se běžná upozornění zdrží", async () => {
    const u = await person();
    const now = new Date();
    await app.db
      .insert(schema.notification)
      .values({ userId: u.id, kind: "x.y", title: "dávka" })
      .then(async () => {
        const [anchor] = await notificationsOf(u.id);
        await app.db.insert(schema.notificationDelivery).values(
          Array.from({ length: 20 }, () => ({
            notificationId: anchor!.id,
            userId: u.id,
            channel: "push" as const,
            status: "sent" as const,
            sentAt: now,
            releaseAt: now,
          })),
        );
      });
    await notify(app.db, PLAIN, { params: { n: 20 }, to: { to: [u.id] }, at: now });
    const rec = recorder();
    const res = await dispatch([u.id], rec.send, now);
    expect(res.deferred).toBe(1);
    expect(rec.sent).toEqual([]);
    const held = (await deliveries(u.id)).find((d) => d.status === "held")!;
    expect(held.reason).toBe("rate_limited");
    expect(held.attempts).toBe(0);
    expect(held.releaseAt.getTime()).toBe(now.getTime() + 600_000);
  });
});

describe("idempotence, sloučení a outbox", () => {
  it("stejná událost pro stejný záznam se pro příjemce vytvoří jednou (i souběžně)", async () => {
    const u = await person([["test_job.read", "all"]]);
    const job = crypto.randomUUID();
    jobOwners.set(job, []);
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        notify(app.db, APPROVED, {
          params: { number: "VP-3", amount: "1 Kč" },
          to: { team: [u.id] },
          record: { id: job },
        }),
      ),
    );
    expect(results.reduce((a, r) => a + r.created, 0)).toBe(1);
    expect(results.reduce((a, r) => a + r.deduped, 0)).toBe(5);
    expect(await notificationsOf(u.id)).toHaveLength(1);
    expect(await deliveries(u.id)).toHaveLength(1);
  });

  it("20 změn harmonogramu se sloučí do jednoho upozornění a jedné push zprávy", async () => {
    const u = await person([["test_job.read", "all"]]);
    const job = crypto.randomUUID();
    jobOwners.set(job, []);
    const t0 = new Date();
    for (let i = 0; i < 20; i++)
      await notify(app.db, SCHEDULE, {
        params: { number: "Z-9" },
        to: { team: [u.id] },
        record: { id: job },
        at: new Date(t0.getTime() + i * 1000),
      });
    const rows = await notificationsOf(u.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ count: 20, title: "Z-9: změna harmonogramu (20×)" });
    const d = await deliveries(u.id);
    expect(d).toHaveLength(1);
    // push čeká na uklidnění bouřky (45 s od první změny)
    expect(d[0]!.releaseAt.getTime()).toBe(t0.getTime() + 45_000);
    const rec = recorder();
    expect((await dispatch([u.id], rec.send, new Date(t0.getTime() + 30_000))).claimed).toBe(0);
    await dispatch([u.id], rec.send, new Date(t0.getTime() + 46_000));
    expect(rec.sent).toHaveLength(1);
    expect(rec.sent[0]!.payload).toMatchObject({
      title: "Z-9: změna harmonogramu (20×)",
      count: 20,
    });
    // další změna po odeslání (upozornění je dál nepřečtené) založí novou zprávu, která nahradí starou stejným tagem
    await notify(app.db, SCHEDULE, {
      params: { number: "Z-9" },
      to: { team: [u.id] },
      record: { id: job },
      at: new Date(t0.getTime() + 60_000),
    });
    expect((await notificationsOf(u.id))[0]!.count).toBe(21);
    const all = await deliveries(u.id);
    expect(all.map((x) => x.status)).toEqual(["sent", "queued"]);
    const rec2 = recorder();
    await dispatch([u.id], rec2.send, new Date(t0.getTime() + 120_000));
    expect(rec2.sent[0]!.payload.tag).toBe(rec.sent[0]!.payload.tag);
  });

  it("přečtené upozornění se už nesloučí, další změna založí nové", async () => {
    const u = await person([["test_job.read", "all"]]);
    const job = crypto.randomUUID();
    jobOwners.set(job, []);
    const input = { params: { number: "Z-10" }, to: { team: [u.id] }, record: { id: job } };
    await notify(app.db, SCHEDULE, input);
    await markRead(u.ctx, [(await notificationsOf(u.id))[0]!.id]);
    await notify(app.db, SCHEDULE, input);
    expect(await notificationsOf(u.id)).toHaveLength(2);
  });

  it("transakce, která se zruší, po sobě nezanechá žádné upozornění ani doručení (outbox)", async () => {
    const u = await person();
    await expect(
      app.db.transaction(async (tx) => {
        await notify(tx, PLAIN, { params: { n: 30 }, to: { to: [u.id] } });
        expect(
          await tx.select().from(schema.notification).where(eq(schema.notification.userId, u.id)),
        ).toHaveLength(1);
        throw new Error("změna se nepovedla");
      }),
    ).rejects.toThrow("změna se nepovedla");
    expect(await notificationsOf(u.id)).toEqual([]);
    expect(await deliveries(u.id)).toEqual([]);
  });

  it("notify neodesílá: push služba se při vyvolání události nevolá a chyba doručení volajícího neohrozí", async () => {
    const u = await person();
    const rec = recorder({ [u.device.endpoint]: 500 });
    await app.db.transaction(async (tx) => {
      await notify(tx, PLAIN, { params: { n: 31 }, to: { to: [u.id] } });
    });
    expect(rec.sent).toEqual([]);
    // a selhání doručení se projeví až ve workeru, jako stav doručení
    const r = await dispatch([u.id], rec.send);
    expect(r.retried).toBe(1);
  });

  it("správnost kanálu NOTIFY: LISTEN dostane signál až po potvrzení transakce", async () => {
    const u = await person();
    const seen: string[] = [];
    const listener = await app.sql.listen("notification_new", (payload) => {
      if (payload.includes(u.id)) seen.push(payload); // v sdílené databázi chodí i signály z jiných testů
    });
    try {
      await app.db.transaction(async (tx) => {
        await notify(tx, PLAIN, { params: { n: 32 }, to: { to: [u.id] } });
        await new Promise((r) => setTimeout(r, 150));
        expect(seen).toEqual([]);
      });
      await new Promise((r) => setTimeout(r, 300));
      expect(seen.length).toBeGreaterThan(0);
    } finally {
      await listener.unlisten();
    }
  });
});

describe("e-mail a odložení", () => {
  it("e-mail jde jen tam, kde ho uživatel zapnul; bez SMTP se přeskočí s důvodem", async () => {
    const u = await person();
    const v = await person();
    await saveMyPreferences(u.ctx, { events: { "testing.plain": { email: true } } });
    await notify(app.db, PLAIN, { params: { n: 40 }, to: { to: [u.id, v.id] } });
    const mails: EmailMessage[] = [];
    const email = async (m: EmailMessage) => void mails.push(m);
    await dispatch([u.id, v.id], recorder().send, new Date(), email);
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ subject: "Událost 40", url: "/inbox", body: "Událost 40" });
    expect((await deliveries(v.id)).filter((d) => d.channel === "email")).toEqual([]);

    const without = await person();
    await saveMyPreferences(without.ctx, { events: { "testing.plain": { email: true } } });
    await notify(app.db, PLAIN, { params: { n: 41 }, to: { to: [without.id] } });
    await dispatch([without.id], recorder().send, new Date(), undefined);
    expect((await deliveries(without.id)).find((d) => d.channel === "email")).toMatchObject({
      status: "skipped",
      reason: "email_not_configured",
    });
  });

  it("chyba e-mailu se opakuje, ne ztratí", async () => {
    const u = await person();
    await saveMyPreferences(u.ctx, { events: { "testing.plain": { email: true } } });
    await notify(app.db, PLAIN, { params: { n: 42 }, to: { to: [u.id] } });
    const r = await dispatch([u.id], recorder().send, new Date(), async () => {
      throw new Error("SMTP spadlo");
    });
    expect(r.retried).toBe(1);
    expect((await deliveries(u.id)).find((d) => d.channel === "email")).toMatchObject({
      status: "retry",
      lastError: "SMTP spadlo",
    });
  });

  it("odložení vrátí upozornění do fronty a cizí upozornění odložit nejde", async () => {
    const u = await person();
    const other = await person();
    await notify(app.db, URGENT, { params: { what: "Odložit" }, to: { to: [u.id] } });
    const [n] = await notificationsOf(u.id);
    const rec = recorder();
    await dispatch([u.id], rec.send);
    const t = new Date();
    expect(await snoozeNotification(app.db, other.id, n!.id, 60, t)).toBe(false);
    expect(await snoozeNotification(app.db, u.id, n!.id, 60, t)).toBe(true);
    expect((await dispatch([u.id], rec.send, minutes(t, 30))).claimed).toBe(0);
    const again = await dispatch([u.id], rec.send, minutes(t, 61));
    expect(again.sent).toBe(1);
    expect(rec.sent.map((s) => s.payload.tag)).toEqual([`n:${n!.id}`, `n:${n!.id}`]);
  });
});

describe("odběry zařízení", () => {
  it("odběr patří přihlášenému: cizí endpoint ani id zařízení smazat nejde", async () => {
    const a = await person([], false);
    const b = await person([], false);
    const s = sub();
    await saveSubscription(a.ctx, { ...s, sessionId: "sess-a" });
    await removeSubscription(b.ctx, s.endpoint);
    expect(await countSubscriptions(a.ctx)).toBe(1);
    const [dev] = await listDevices(a.ctx);
    expect(await removeDevice(b.ctx, dev!.id)).toBe(false);
    expect(await listDevices(b.ctx)).toEqual([]);
    expect(await removeDevice(a.ctx, dev!.id)).toBe(true);
    expect(await countSubscriptions(a.ctx)).toBe(0);
  });

  it("odhlášení z relace a deaktivace účtu zruší odběry", async () => {
    const u = await person([], false);
    const s1 = sub();
    const s2 = sub();
    await saveSubscription(u.ctx, { ...s1, sessionId: "sess-1" });
    await saveSubscription(u.ctx, { ...s2, sessionId: "sess-2" });
    expect(await removeSessionSubscriptions(app.db, "sess-1")).toBe(1);
    expect((await listDevices(u.ctx)).map((d) => d.endpoint)).toEqual([s2.endpoint]);
    expect(await removeUserSubscriptions(app.db, u.id)).toBe(1);
    expect(await countSubscriptions(u.ctx)).toBe(0);
  });

  it("deaktivace účtu a odhlášení ze všech zařízení zruší odběry uživatele", async () => {
    const admin = await makeUser(app.db, [["users.manage", "all"]]);
    const a = await person();
    const b = await person();
    await setUserActive(admin.ctx, a.id, false);
    expect(await countSubscriptions(a.ctx)).toBe(0);
    await revokeSessions(admin.ctx, b.id);
    expect(await countSubscriptions(b.ctx)).toBe(0);
  });

  it("přenos zařízení na jiného uživatele nepřenáší cizí upozornění", async () => {
    const a = await person([], false);
    const b = await person([], false);
    const s = sub();
    await saveSubscription(a.ctx, s);
    await saveSubscription(b.ctx, s);
    await notify(app.db, PLAIN, { params: { n: 50 }, to: { to: [a.id] } });
    const rec = recorder();
    await dispatch([a.id], rec.send);
    expect(rec.sent).toEqual([]);
    expect((await deliveries(a.id))[0]).toMatchObject({ status: "skipped", reason: "no_device" });
  });
});

describe("plánované události a úklid", () => {
  it("ranní přehled úkolů: jedna zpráva na člověka, idempotentní, o víkendu nic", async () => {
    const mgr = await person([["tasks.assign", "all"]]);
    const worker = await person();
    const today = "2026-10-12"; // pondělí
    const at = new Date("2026-10-12T05:00:00Z"); // 07:00 místně
    await createTask(mgr.ctx, {
      title: "Objednat sádrokarton",
      assigneeId: worker.id,
      dueDate: today,
    });
    await createTask(mgr.ctx, {
      title: "Zavolat investorovi",
      assigneeId: worker.id,
      dueDate: "2026-10-09",
    });
    await createTask(mgr.ctx, {
      title: "Budoucí úkol",
      assigneeId: worker.id,
      dueDate: "2026-10-30",
    });
    const r1 = await sendTaskDigests(app.db, at);
    expect(r1.users).toBeGreaterThanOrEqual(1);
    const mine = (await notificationsOf(worker.id)).filter((n) => n.kind === "task.due_today");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ title: "Dnes: 1 úkol na dnes, 1 po termínu" });
    expect(mine[0]!.body).toBe("Zavolat investorovi · Objednat sádrokarton");
    await sendTaskDigests(app.db, at);
    await sendTaskDigests(app.db, new Date("2026-10-12T05:30:00Z"));
    expect(
      (await notificationsOf(worker.id)).filter((n) => n.kind === "task.due_today"),
    ).toHaveLength(1);
    // zítra je nový den
    await sendTaskDigests(app.db, new Date("2026-10-13T05:00:00Z"));
    expect(
      (await notificationsOf(worker.id)).filter((n) => n.kind === "task.due_today"),
    ).toHaveLength(2);
    // sobota
    const before = (await notificationsOf(worker.id)).length;
    await sendTaskDigests(app.db, new Date("2026-10-17T05:00:00Z"));
    expect((await notificationsOf(worker.id)).length).toBe(before);
  });

  it("přidělení úkolu používá katalog (kdo, termín) a respektuje předvolby", async () => {
    const mgr = await person([["tasks.assign", "all"]], false);
    const worker = await person();
    await saveMyPreferences(worker.ctx, { events: { "task.assigned": { push: "off" } } });
    await createTask(mgr.ctx, {
      title: "Úkol z katalogu",
      assigneeId: worker.id,
      dueDate: "2026-10-30",
    });
    const [n] = await notificationsOf(worker.id);
    expect(n).toMatchObject({ kind: "task.assigned", title: "Byl vám přidělen úkol" });
    expect(n!.body).toMatch(/Úkol z katalogu\nTermín: .*30/);
    expect((await deliveries(worker.id))[0]).toMatchObject({
      status: "skipped",
      reason: "user_off",
    });
  });

  it("zkušební upozornění obchází tiché hodiny a nezobrazuje se v Inboxu", async () => {
    const u = await person();
    await saveMyPreferences(u.ctx, {
      events: {},
      quiet: { enabled: true, start: "00:00", end: "23:59" },
    });
    await notify(app.db, SYSTEM_TEST, { params: {}, to: { self: [u.id] } });
    expect(await listNotifications(u.ctx)).toEqual([]);
    const rec = recorder();
    await dispatch([u.id], rec.send);
    expect(rec.sent.map((s) => s.payload.title)).toEqual(["Zkušební upozornění"]);
    const log = await listMyDeliveries(u.ctx);
    expect(log[0]).toMatchObject({ channel: "push", status: "sent", devices: 1 });
  });

  it("starší způsob (createNotifications) dodržuje předvolby a katalog; bez katalogu je to běžné upozornění", async () => {
    const u = await person();
    await saveMyPreferences(u.ctx, { events: { "task.assigned": { bell: false } } });
    await createNotifications(app.db, [
      { userId: u.id, kind: "task.assigned", title: "Přiděleno" },
      { userId: u.id, kind: "legacy.kind", title: "Staré volání" },
    ]);
    const rows = await notificationsOf(u.id);
    expect(rows.find((r) => r.kind === "task.assigned")!.inbox).toBe(false);
    expect(rows.find((r) => r.kind === "legacy.kind")!.inbox).toBe(true);
    const d = await deliveries(u.id);
    expect(d.some((x) => x.channel === "push")).toBe(true);
  });

  it("úklid smaže stará a skrytá upozornění i s protokolem doručení", async () => {
    const u = await person();
    const [old] = await app.db
      .insert(schema.notification)
      .values({
        userId: u.id,
        kind: "x.old",
        title: "stará",
        createdAt: new Date(Date.now() - 100 * 86_400_000),
      })
      .returning();
    const [hidden] = await app.db
      .insert(schema.notification)
      .values({
        userId: u.id,
        kind: "x.hidden",
        title: "skrytá",
        inbox: false,
        createdAt: new Date(Date.now() - 8 * 86_400_000),
      })
      .returning();
    const [fresh] = await app.db
      .insert(schema.notification)
      .values({ userId: u.id, kind: "x.fresh", title: "nová" })
      .returning();
    await app.db
      .insert(schema.notificationDelivery)
      .values({ notificationId: old!.id, userId: u.id, channel: "push", status: "sent" });
    const r = await cleanupNotifications(app.db);
    expect(r.removed).toBeGreaterThanOrEqual(2);
    const left = await app.db
      .select({ id: schema.notification.id })
      .from(schema.notification)
      .where(inArray(schema.notification.id, [old!.id, hidden!.id, fresh!.id]));
    expect(left.map((x) => x.id)).toEqual([fresh!.id]);
    expect(await deliveries(u.id)).toEqual([]);
  });
});

describe("správa: přehled pravidel, statistiky doručení, zkušební upozornění", () => {
  it("správce vidí pravidla se základem i úpravou a statistiku doručení; ostatní ne", async () => {
    const admin = await makeUser(app.db, [["settings.manage", "all"]]);
    const nobody = await makeUser(app.db, []);
    const view = await getAdminRules(admin.ctx);
    const e = view.events.find((x) => x.key === "testing.plain")!;
    expect(e.base).toMatchObject({ enabled: true, mandatory: false, severity: "normal" });
    expect(e.params.map((p) => p.name)).toEqual(["n"]);
    expect(view.events.find((x) => x.key === "system.test")).toBeUndefined();
    const stats = await getDeliveryStats(admin.ctx);
    expect(stats.pending).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(stats.counts)).toBe(true);
    await expect(getAdminRules(nobody.ctx)).rejects.toThrow();
    await expect(getDeliveryStats(nobody.ctx)).rejects.toThrow();
  });

  it("zkušební upozornění jde frontou, stav čte jen majitel a druhé hned po prvním se odmítne", async () => {
    const u = await person();
    const other = await person();
    const { deliveryId } = await queueTestNotification(u.ctx);
    expect(deliveryId).toBeTruthy();
    expect(await getDeliveryStatus(u.ctx, deliveryId!)).toMatchObject({ status: "queued" });
    expect(await getDeliveryStatus(other.ctx, deliveryId!)).toBeNull();
    await expect(queueTestNotification(u.ctx)).rejects.toThrow(/na cestě/);
    const rec = recorder();
    await dispatch([u.id], rec.send);
    expect(await getDeliveryStatus(u.ctx, deliveryId!)).toMatchObject({
      status: "sent",
      devices: 1,
    });
  });
});

afterEach(() => void 0);
void and;
