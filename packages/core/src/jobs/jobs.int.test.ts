import { eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { schema } from "../db/client";
import { createQueuedMailer, sendMailJob, type MailDeps } from "../mail";
import { createCipher, parseKeyRing } from "../security";
import { connectAppDb, expectPgError, fakeMailer, rebarDbUrls, waitFor } from "../testing";
import { createQueueClient, defineJob, installQueues, registerWorkers } from "./jobs";

const app = connectAppDb();
const urls = () => rebarDbUrls();
const cipher = createCipher(
  parseKeyRing({ APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") }),
);
const clients: ReturnType<typeof createQueueClient>[] = [];

const echo = defineJob({
  name: "test.echo",
  schema: z.object({ n: z.number().int(), fail: z.boolean().optional() }),
  handler: async () => {},
});

beforeAll(async () => {
  await installQueues(urls().migrator, [echo, { name: "test.retry", retryLimit: 3 }]);
});
/** Po každém testu zastavit workery, aby se jejich zpracování nemíchalo do dalšího testu. */
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.stop()));
});
afterAll(() => app.close());

/** Klient fronty pod aplikační rolí (bez práv DDL) — jako v produkci. */
function client(over: { supervise?: boolean; schedule?: boolean } = {}) {
  const c = createQueueClient({ connectionString: urls().app, ...over });
  clients.push(c);
  return c;
}

describe("fronta úloh (pg-boss)", () => {
  it("aplikační role úlohu odešle a worker ji zpracuje; vstup se validuje", async () => {
    const q = client();
    await q.start();
    const seen: number[] = [];
    await registerWorkers(
      q,
      [
        defineJob({
          name: "test.echo",
          schema: echo.schema,
          handler: async (_d: null, data) => void seen.push(data.n),
        }),
      ],
      null,
      { pollingIntervalSeconds: 0.5 },
    );
    await q.send(echo, { n: 41 });
    await q.send(echo, { n: 42 });
    await waitFor(async () => seen.length === 2);
    expect(seen.sort()).toEqual([41, 42]);
    await expect(q.send(echo, { n: "x" as never })).rejects.toThrow();
  });

  it("neúspěšná úloha se opakuje, dokud neprojde", async () => {
    const q = client();
    await q.start();
    let attempts = 0;
    const retry = defineJob({
      name: "test.retry",
      schema: z.object({}),
      handler: async (_d: null) => {
        if (++attempts < 2) throw new Error("dočasná chyba");
      },
    });
    await registerWorkers(q, [retry], null, { pollingIntervalSeconds: 0.5 });
    await q.send(retry, {}, { retryDelay: 1 });
    await waitFor(async () => attempts >= 2, 20_000);
    expect(attempts).toBe(2);
  });

  it("aplikační role nesmí měnit schéma fronty (instalaci a migrace dělá samostatný krok)", async () => {
    await expectPgError(app.sql`create table pgboss.zz_nope (id int)`, /permission denied/);
    await expectPgError(
      app.sql`alter table pgboss.queue add column zz int`,
      /must be owner|permission denied/,
    );
  });
});

describe("e-mail přes frontu", () => {
  const brand = async () => "Stavby Novák";

  async function setup(transport: { send: (m: never) => Promise<void> } | null) {
    const q = client();
    await q.start();
    const deps: MailDeps = {
      db: app.db,
      cipher,
      brand,
      resolveTransport: async () =>
        transport ? { transport: transport as never, from: "systém@example.cz" } : null,
    };
    await registerWorkers(q, [sendMailJob], deps, { pollingIntervalSeconds: 0.5 });
    return { q, mailer: createQueuedMailer({ db: app.db, queue: q, cipher, brand }) };
  }
  const logOf = (to: string) =>
    app.db.select().from(schema.emailLog).where(eq(schema.emailLog.toEmail, to));
  const addr = () => `mail-${randomBytes(4).toString("hex")}@test.example`;

  it("e-mail se odešle, log nemá tělo ani odkaz a v úloze je odkaz jen zašifrovaný", async () => {
    const sent: { to: string; subject: string; text: string; html: string; from: string }[] = [];
    const { mailer } = await setup({ send: async (m) => void sent.push(m as never) });
    const to = addr();
    const secret = `http://localhost:3000/pozvanka/${randomBytes(24).toString("base64url")}`;
    await mailer.send({ to, template: "invitation", vars: { url: secret, expiresInDays: "7" } });

    await waitFor(async () => (await logOf(to))[0]?.status === "sent");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to,
      from: "systém@example.cz",
      subject: "Pozvánka do systému Stavby Novák",
    });
    expect(sent[0]!.text).toContain(secret);
    expect(sent[0]!.html).toContain("Nastavit přístup");

    const [log] = await logOf(to);
    expect(JSON.stringify(log)).not.toContain(secret);
    expect(JSON.stringify(log)).not.toContain("pozvanka");
    const jobs =
      await app.sql`select data from pgboss.job where name = 'mail.send' and data->>'to' = ${to}`;
    expect(jobs.length).toBeGreaterThan(0);
    expect(JSON.stringify(jobs)).not.toContain(secret);
    expect(JSON.stringify(jobs)).not.toContain("pozvanka");
  });

  it("bez nastaveného SMTP e-mail skončí ve stavu failed s vysvětlením (bez opakování)", async () => {
    const { mailer } = await setup(null);
    const to = addr();
    await mailer.send({
      to,
      template: "password-reset",
      vars: { url: "http://x/y", name: "Jana" },
    });
    await waitFor(async () => (await logOf(to))[0]?.status === "failed");
    expect((await logOf(to))[0]?.error).toMatch(/není nastavené/);
  });

  it("chyba přenosu se zapíše a e-mail se po opakování odešle", async () => {
    let calls = 0;
    const { mailer } = await setup({
      send: async () => {
        if (++calls === 1) throw new Error("SMTP dočasně nedostupné");
      },
    });
    const to = addr();
    await mailer.send({ to, template: "password-reset", vars: { url: "http://x/y" } });
    await waitFor(async () => calls >= 1 && (await logOf(to))[0]?.error?.includes("dočasně"));
    expect((await logOf(to))[0]?.status).toBe("queued");
  });
});

void fakeMailer;
void sql;
