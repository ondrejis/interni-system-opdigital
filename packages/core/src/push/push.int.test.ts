import { afterAll, describe, expect, it } from "vitest";
import { UserError } from "../rbac/errors";
import { connectAppDb, makeUser } from "../testing";
import {
  classifyPushError,
  countSubscriptions,
  isAllowedPushEndpoint,
  listDevices,
  payloadOf,
  pushToUser,
  removeSubscription,
  saveSubscription,
  type PushSender,
} from "./push";

const app = connectAppDb();
afterAll(() => app.close());

const sub = (n = crypto.randomUUID().slice(0, 8)) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${n}`,
  p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
  auth: "tBHItJI5svbpez7KI4CCXg",
});

function recorder(fail: Record<string, number> = {}) {
  const sent: { endpoint: string; payload: Record<string, unknown> }[] = [];
  const send: PushSender = async (t, payload) => {
    const code = fail[t.endpoint];
    if (code) throw Object.assign(new Error("push"), { statusCode: code });
    sent.push({ endpoint: t.endpoint, payload: JSON.parse(payload) as Record<string, unknown> });
  };
  return { sent, send };
}

describe("adresy push služeb", () => {
  it("povolí jen https na známé služby", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/abc",
      "https://wns2-par02p.notify.windows.com/w/?token=x",
    ])
      expect(isAllowedPushEndpoint(ok), ok).toBe(true);
    for (const bad of [
      "http://fcm.googleapis.com/x",
      "https://evil.example.com/x",
      "https://169.254.169.254/latest",
      "https://fcm.googleapis.com.evil.com/x",
      "https://user:pw@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "ftp://fcm.googleapis.com/x",
      "není adresa",
    ])
      expect(isAllowedPushEndpoint(bad), bad).toBe(false);
  });
});

describe("odběry", () => {
  it("uloží, přepíše majitele zařízení a odebere jen svůj", async () => {
    const a = await makeUser(app.db, []);
    const b = await makeUser(app.db, []);
    const s = sub();
    await saveSubscription(a.ctx, s);
    await saveSubscription(a.ctx, s); // znovu totéž zařízení: bez duplicity
    expect(await countSubscriptions(a.ctx)).toBe(1);

    await saveSubscription(b.ctx, s); // zařízení převzal jiný uživatel
    expect(await countSubscriptions(a.ctx)).toBe(0);
    expect(await countSubscriptions(b.ctx)).toBe(1);

    await removeSubscription(a.ctx, s.endpoint); // cizí odběr nesmaže
    expect(await countSubscriptions(b.ctx)).toBe(1);
    await removeSubscription(b.ctx, s.endpoint);
    expect(await countSubscriptions(b.ctx)).toBe(0);
  });

  it("odmítne cizí adresu a neúplné klíče", async () => {
    const a = await makeUser(app.db, []);
    await expect(
      saveSubscription(a.ctx, { ...sub(), endpoint: "https://evil.example.com/x" }),
    ).rejects.toBeInstanceOf(UserError);
    await expect(saveSubscription(a.ctx, { ...sub(), auth: "!" })).rejects.toBeInstanceOf(
      UserError,
    );
  });
});

describe("odeslání na zařízení", () => {
  it("rozliší zaniklý odběr, trvalé odmítnutí a přechodnou chybu", () => {
    const err = (statusCode?: number) => Object.assign(new Error("push"), { statusCode });
    expect(classifyPushError(err(410))).toEqual({ kind: "gone", status: 410 });
    expect(classifyPushError(err(404))).toEqual({ kind: "gone", status: 404 });
    for (const code of [400, 401, 403, 413])
      expect(classifyPushError(err(code)).kind, String(code)).toBe("rejected");
    for (const code of [429, 500, 502, 503])
      expect(classifyPushError(err(code)).kind, String(code)).toBe("transient");
    expect(classifyPushError(new Error("ECONNRESET"))).toEqual({ kind: "transient", status: null });
  });

  it("zprávu pošle na všechna zařízení, zaniklé odběry smaže a zbytek ponechá", async () => {
    const u = await makeUser(app.db, []);
    const gone = sub();
    const flaky = sub();
    const ok = sub();
    for (const s of [gone, flaky, ok]) await saveSubscription(u.ctx, s);
    const r = recorder({ [gone.endpoint]: 410, [flaky.endpoint]: 500 });
    const res = await pushToUser(app.db, r.send, u.id, {
      title: "Ahoj",
      url: "https://evil.example.com/phish",
    });
    expect(res).toMatchObject({ sent: 1, removed: 1, transient: 1, rejected: 0, noDevice: false });
    expect(res.hosts).toEqual(["fcm.googleapis.com"]);
    expect(await countSubscriptions(u.ctx)).toBe(2);
    // odkaz mimo aplikaci se nahradí kořenem
    expect(r.sent[0]!.payload.url).toBe("/");
    const devices = await listDevices(u.ctx);
    expect(devices.find((d) => d.endpoint === flaky.endpoint)).toMatchObject({
      failures: 1,
      lastError: "HTTP 500",
    });
    expect(devices.find((d) => d.endpoint === ok.endpoint)).toMatchObject({
      failures: 0,
      lastError: null,
    });
  });

  it("uživatel bez zařízení: nic se neodesílá", async () => {
    const u = await makeUser(app.db, []);
    const r = recorder();
    expect(await pushToUser(app.db, r.send, u.id, { title: "X" })).toMatchObject({
      noDevice: true,
      sent: 0,
    });
    expect(r.sent).toEqual([]);
  });

  it("payload ořízne texty a odznak a nepustí cizí odkaz", () => {
    const p = JSON.parse(
      payloadOf({
        title: "x".repeat(300),
        body: "y".repeat(500),
        url: "//evil.example",
        badge: 5000,
        count: 1,
      }),
    ) as Record<string, unknown>;
    expect((p.title as string).length).toBe(120);
    expect((p.body as string).length).toBe(240);
    expect(p).toMatchObject({ url: "/", badge: 999, count: null, urgent: false, snooze: false });
  });
});
