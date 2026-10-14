import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLookup, ensurePipeline, getPipeline } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
  type EntityRegistry,
} from "@rebar/core/entities";
import type { StorageDriver } from "@rebar/core/files";
import {
  sendMailJob,
  type MailDeps,
  type MailTransport,
  type OutgoingMail,
} from "@rebar/core/mail";
import type { ModuleSeed } from "@rebar/core";
import type { CommandDef, ModuleDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { PermissionError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { createCipher, parseKeyRing } from "@rebar/core/security";
import { companySetting, smtpSetting } from "@rebar/core/settings";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { addDaysIso, todayIso } from "@rebar/core/time";
import { manifest } from "@rebar/fakturace";
import {
  addPayment,
  createFromJob,
  fakturaceSetting,
  invoiceEntity,
  issue,
  server,
  syncDispatches,
} from "@rebar/fakturace/server";
import { invoice, invoiceDispatch } from "@rebar/fakturace/schema";
import { company, person } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import { job } from "@rebar/zakazky/schema";
import { jobEntity } from "@rebar/zakazky/server";
import { assertCommandPermission } from "../apps/web/src/server/command-gate";

/**
 * Odesílání faktur a upomínek e-mailem: šablony, PDF v příloze, fronta, evidence, selhání SMTP, hromadné odeslání
 * a oprávnění. Doprava je atrapa; úloha odeslání (`sendMailJob`) běží skutečná.
 */
const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
let smtpOn = true;
let settingsOverride: Record<string, unknown> = {};
const supplier = {
  name: "Stavby Test s.r.o.",
  ico: "12345678",
  dic: "CZ12345678",
  street: "Hlavní 1",
  city: "Plzeň",
  zip: "30100",
  email: "kancelar@stavby-test.example",
  phone: "+420 111 222 333",
  web: null,
  bankAccount: "19-2000145399/0800",
};
const cipher = createCipher(
  parseKeyRing({ APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") }),
);

/** Úložiště v paměti (přílohy e-mailů). */
const files = new Map<string, Buffer>();
const storage: StorageDriver = {
  put: async (k, d) => void files.set(k, d),
  get: async (k) => {
    const b = files.get(k);
    if (!b) throw new Error("není");
    return Readable.from([b]);
  },
  delete: async (k) => void files.delete(k),
  exists: async (k) => files.has(k),
};

/** Fronta, která si úlohy jen pamatuje; odeslání pouštíme ručně (deterministicky, bez čekání na pg-boss). */
type Queued = ReturnType<typeof sendMailJob.schema.parse>;
const queue: Queued[] = [];
let queueFails = false;

const deps = () =>
  ({
    registry,
    baseURL: "http://localhost",
    costProviders: [],
    calendarLayers: [],
    diaryPrefill: [],
    emit: async () => {},
    cipher,
    storage,
    queue: {
      send: async (_job: unknown, data: Queued) => {
        if (queueFails) throw new Error("fronta nedostupná");
        queue.push(sendMailJob.schema.parse(data));
        return "id";
      },
    },
    settings: {
      get: async (_db: unknown, def: { key: string; default: Record<string, unknown> }) => {
        if (def.key === companySetting.key) return supplier;
        if (def.key === smtpSetting.key)
          return { ...def.default, enabled: smtpOn, host: smtpOn ? "smtp.example.cz" : "" };
        if (def.key === fakturaceSetting.key) return { ...def.default, ...settingsOverride };
        return def.default;
      },
    },
  }) as unknown as ModuleDeps;

const cmd = (name: string) => server.commands!.find((c) => c.name === name) as CommandDef;
const run = async <R = unknown>(name: string, ctx: Ctx, input: unknown) =>
  cmd(name).handler(ctx, cmd(name).input.parse(input) as never, deps()) as Promise<R>;

type Sent = OutgoingMail;
/** Odešle (jako worker) všechny čekající úlohy dopravou `transport`; `retryCount` simuluje pokus. */
async function deliver(
  transport: MailTransport,
  retryCount = 0,
  from = "faktury@stavby-test.example",
) {
  const mailDeps: MailDeps = {
    db: app.db,
    cipher,
    storage,
    brand: async () => "Stavby Test",
    resolveTransport: async () => ({ transport, from }),
  };
  const pending = queue.splice(0);
  const failures: unknown[] = [];
  for (const data of pending)
    try {
      await sendMailJob.handler(mailDeps, data, { retryCount } as never);
    } catch (e) {
      failures.push(e);
    }
  return { pending, failures };
}
const okTransport = (sent: Sent[]): MailTransport => ({ send: async (m) => void sent.push(m) });
const brokenTransport: MailTransport = {
  send: async () => {
    throw new Error("535 Chybné přihlášení k SMTP");
  },
};

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, jobEntity, invoiceEntity]);
  registerEntityPolicies(registry);
  for (const m of [zakazkyManifest, manifest]) {
    const seed = m.seed as ModuleSeed;
    for (const p of seed.pipelines ?? []) await ensurePipeline(app.db, p);
    for (const l of seed.lookups ?? []) await ensureLookup(app.db, l);
    await ensureSeries(app.db, seed.series ?? []);
  }
});

const office = () =>
  makeUser(app.db, [
    ["fakturace.read", "all"],
    ["fakturace.write", "all"],
    ["fakturace.export", "all"],
    ["zakazky.read", "all"],
    ["kontakty.read", "all"],
  ]);

async function newJob(opts: { email?: string | null; personEmail?: string } = {}) {
  const ico = String(10_000_000 + Math.floor(Math.random() * 89_999_999));
  const [c] = await app.db
    .insert(company)
    .values({
      name: `Odběratel ${randomBytes(3).toString("hex")}`,
      ico,
      dic: `CZ${ico}`,
      email:
        opts.email === undefined
          ? `info-${randomBytes(3).toString("hex")}@odberatel.example`
          : opts.email,
    })
    .returning();
  let personId: string | null = null;
  if (opts.personEmail) {
    const [p] = await app.db
      .insert(person)
      .values({ name: "Jana Nováková", email: opts.personEmail, companyId: c!.id })
      .returning();
    personId = p!.id;
  }
  const stage = (await getPipeline(app.db, "job", "default"))!.stages[0]!;
  const [j] = await app.db
    .insert(job)
    .values({
      number: `M-${randomBytes(4).toString("hex")}`,
      title: "Rekonstrukce",
      companyId: c!.id,
      personId,
      stageId: stage.id,
      valueMinor: 100_000_00,
    })
    .returning();
  return { ...j!, company: c! };
}

/** Vystavená faktura 10 % zakázky; `dueOffset` posune splatnost (záporné = po splatnosti). */
async function issued(
  u: Awaited<ReturnType<typeof office>>,
  j: Awaited<ReturnType<typeof newJob>>,
  dueOffset = 14,
) {
  const { id } = await createFromJob.handler(
    u.ctx,
    createFromJob.input.parse({ jobId: j.id, kind: "partial", percent: 10 }),
    deps(),
  );
  if (j.personId)
    await app.db.update(invoice).set({ personId: j.personId }).where(eq(invoice.id, id));
  const { number } = await issue.handler(
    u.ctx,
    issue.input.parse({
      id,
      issueDate: addDaysIso(todayIso(), dueOffset < 0 ? dueOffset - 10 : 0),
      dueDate: addDaysIso(todayIso(), dueOffset),
    }),
    deps(),
  );
  return { id, number };
}

type Prepared = {
  to: string;
  toSource: string | null;
  cc: string[];
  subject: string;
  body: string;
  smtpConfigured: boolean;
  blocker: string | null;
  attachmentName: string;
  sentCount: number;
  lastReminderAt: string | null;
};
type Rec = {
  id: string;
  kind: string;
  status: string;
  error: string | null;
  to: string;
  cc: string[];
  sentBy: string | null;
};

const prepare = (
  u: { ctx: Ctx },
  invoiceId: string,
  kind: "invoice" | "reminder",
  retryOf?: string,
) =>
  run<Prepared>("fakturace.mail.prepare", u.ctx, {
    invoiceId,
    kind,
    ...(retryOf ? { retryOf } : {}),
  });
const sendInput = (
  p: Prepared,
  invoiceId: string,
  kind: "invoice" | "reminder",
  extra: Record<string, unknown> = {},
) => ({
  invoiceId,
  kind,
  to: p.to,
  cc: p.cc,
  subject: p.subject,
  body: p.body,
  ...extra,
});
const list = (u: { ctx: Ctx }, invoiceId: string) =>
  run<Rec[]>("fakturace.mail.list", u.ctx, { invoiceId });

describe("odeslání faktury e-mailem", () => {
  it("příjemce se předvyplní z kontaktní osoby, jinak z firmy; šablona dosadí proměnné", async () => {
    const u = await office();
    const withPerson = await newJob({ personEmail: "jana@odberatel.example" });
    const a = await issued(u, withPerson);
    const pa = await prepare(u, a.id, "invoice");
    expect(pa.to).toBe("jana@odberatel.example");
    expect(pa.toSource).toMatch(/Jana Nováková/);
    expect(pa.smtpConfigured).toBe(true);
    expect(pa.blocker).toBeNull();
    expect(pa.subject).toBe(`Faktura ${a.number} od Stavby Test s.r.o.`);
    expect(pa.body).toContain(a.number);
    expect(pa.body).toContain(a.number.replace(/\D/g, "")); // variabilní symbol
    expect(pa.body).toContain("12 100 Kč"); // 10 000 + 21 % DPH
    expect(pa.body).toContain("Stavby Test s.r.o.");
    expect(pa.body).not.toMatch(/\{[a-z_]+\}/);
    expect(pa.attachmentName).toBe(`${a.number}.pdf`);

    const noPerson = await newJob();
    const b = await issued(u, noPerson);
    const pb = await prepare(u, b.id, "invoice");
    expect(pb.to).toBe(noPerson.company.email);
    expect(pb.toSource).toMatch(/odběratele/);

    const none = await newJob({ email: null });
    const c = await issued(u, none);
    expect((await prepare(u, c.id, "invoice")).to).toBe("");
  });

  it("koncept se odeslat nedá; šablonu z nastavení a výchozí kopii respektuje", async () => {
    const u = await office();
    const j = await newJob();
    const { id } = await createFromJob.handler(
      u.ctx,
      createFromJob.input.parse({ jobId: j.id, kind: "partial", percent: 10 }),
      deps(),
    );
    expect((await prepare(u, id, "invoice")).blocker).toMatch(/Koncept/);
    await expect(
      run("fakturace.mail.send", u.ctx, {
        invoiceId: id,
        kind: "invoice",
        to: "x@example.cz",
        subject: "S",
        body: "B",
      }),
    ).rejects.toThrow(/Koncept/);

    const { id: id2, number } = await issued(u, j);
    settingsOverride = {
      mailCc: "ucetni@stavby-test.example, sef@stavby-test.example",
      mailInvoiceSubject: "Vaše faktura {cislo}",
      mailInvoiceBody: "Zdravíme {nazev_firmy}, splatnost {splatnost}.",
    };
    try {
      const p = await prepare(u, id2, "invoice");
      expect(p.subject).toBe(`Vaše faktura ${number}`);
      expect(p.body).toContain(j.company.name);
      expect(p.cc).toEqual(["ucetni@stavby-test.example", "sef@stavby-test.example"]);
    } finally {
      settingsOverride = {};
    }
  });

  it("odeslání zařadí e-mail s PDF do fronty, zapíše evidenci a po doručení ji worker dokončí", async () => {
    const u = await office();
    const j = await newJob({ personEmail: "jana@odberatel.example" });
    const { id, number } = await issued(u, j);
    const p = await prepare(u, id, "invoice");
    const res = await run<{ dispatchId: string }>(
      "fakturace.mail.send",
      u.ctx,
      sendInput(p, id, "invoice", { cc: ["Kopie@Odberatel.example", "jana@odberatel.example"] }),
    );
    expect(res.dispatchId).toBeTruthy();

    // hned po odeslání: ve frontě, bez těla zprávy v logu, příloha v úložišti
    let rec = await list(u, id);
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({
      kind: "invoice",
      status: "queued",
      to: "jana@odberatel.example",
    });
    expect(rec[0]!.cc).toEqual(["kopie@odberatel.example"]); // sloučeno a zmenšeno, adresát není v kopii
    expect(queue).toHaveLength(1);
    expect(queue[0]!.attachments).toHaveLength(1);
    const [log] = await app.db
      .select()
      .from(schema.emailLog)
      .where(and(eq(schema.emailLog.entityType, "invoice"), eq(schema.emailLog.entityId, id)));
    expect(log).toMatchObject({
      template: "document",
      status: "queued",
      toEmail: "jana@odberatel.example",
    });
    expect(JSON.stringify(log)).not.toContain("Dobrý den");
    const jobData = JSON.stringify(queue[0]);
    expect(jobData).not.toContain("Dobrý den"); // text je ve frontě jen zašifrovaný

    const sent: Sent[] = [];
    const { failures } = await deliver(okTransport(sent));
    expect(failures).toEqual([]);
    expect(sent).toHaveLength(1);
    const m = sent[0]!;
    expect(m.to).toBe("jana@odberatel.example");
    expect(m.cc).toEqual(["kopie@odberatel.example"]);
    expect(m.subject).toBe(p.subject);
    expect(m.from).toBe('"Stavby Test" <faktury@stavby-test.example>');
    expect(m.replyTo).toBe(supplier.email);
    expect(m.text).toBe(p.body);
    expect(m.html).toContain("<p");
    expect(m.attachments).toHaveLength(1);
    expect(m.attachments![0]!.filename).toBe(`${number}.pdf`);
    expect(m.attachments![0]!.contentType).toBe("application/pdf");
    expect(m.attachments![0]!.content.subarray(0, 5).toString()).toBe("%PDF-");
    // nikdy interní název systému
    expect(`${m.subject}${m.text}${m.html}${m.from}`.toLowerCase()).not.toContain("rebar");
    // příloha se po odeslání uklidí z úložiště
    expect([...files.keys()].filter((k) => k.includes(log!.id))).toEqual([]);

    // evidence: po srovnání odesláno, u faktury datum odeslání
    expect(await syncDispatches(app.db, id)).toBe(1);
    rec = await list(u, id);
    expect(rec[0]).toMatchObject({ status: "sent", error: null, sentBy: expect.any(String) });
    const [inv] = await app.db.select().from(invoice).where(eq(invoice.id, id));
    expect(inv!.sentOn).toBe(todayIso());
    expect(inv!.reminderCount).toBe(0);
    // idempotentní
    expect(await syncDispatches(app.db, id)).toBe(0);
  });

  it("nenastavené SMTP: srozumitelná hláška s odkazem do Nastavení, nic se nezařadí", async () => {
    const u = await office();
    const { id } = await issued(u, await newJob());
    smtpOn = false;
    try {
      const p = await prepare(u, id, "invoice");
      expect(p.smtpConfigured).toBe(false);
      await expect(run("fakturace.mail.send", u.ctx, sendInput(p, id, "invoice"))).rejects.toThrow(
        /není nastavené.*Nastavení → E-maily/,
      );
      expect(await list(u, id)).toEqual([]);
      expect(queue).toHaveLength(0);
    } finally {
      smtpOn = true;
    }
  });

  it("selhání SMTP: chyba se vidí v evidenci, po vyčerpání pokusů je „selhalo“, autor dostane upozornění, opakované odeslání projde", async () => {
    const u = await office();
    const { id, number } = await issued(u, await newJob());
    const p = await prepare(u, id, "invoice");
    await run("fakturace.mail.send", u.ctx, sendInput(p, id, "invoice"));

    // první pokus selže: stále ve frontě, ale s důvodem
    const first = await deliver(brokenTransport, 0);
    expect(first.failures).toHaveLength(1);
    let rec = await list(u, id);
    expect(rec[0]).toMatchObject({ status: "queued" });
    expect(rec[0]!.error).toMatch(/Chybné přihlášení/);
    expect((await app.db.select().from(invoice).where(eq(invoice.id, id)))[0]!.sentOn).toBeNull();

    // poslední pokus: definitivně selhalo (do fronty se musí vrátit stejná úloha)
    queue.push(sendMailJob.schema.parse(first.pending[0]));
    await deliver(brokenTransport, 5);
    rec = await list(u, id);
    expect(rec[0]).toMatchObject({ status: "failed" });
    expect(rec[0]!.error).toMatch(/Chybné přihlášení/);
    const notes = await app.db
      .select()
      .from(schema.notification)
      .where(
        and(
          eq(schema.notification.entityId, id),
          eq(schema.notification.kind, "invoice.mail_failed"),
        ),
      );
    expect(notes).toHaveLength(1);
    expect(notes[0]!.userId).toBe(u.id);
    expect(notes[0]!.title).toContain(number);
    expect(notes[0]!.body).toMatch(/Chybné přihlášení/);
    // příloha po definitivním selhání se uklidí
    expect([...files.keys()].filter((k) => k.startsWith("mail/"))).toEqual(
      [...files.keys()].filter(
        (k) => k.startsWith("mail/") && !k.includes(first.pending[0]!.logId),
      ),
    );

    // opakované odeslání ze selhaného záznamu: příjemce se předvyplní, projde
    const again = await prepare(u, id, "invoice", rec[0]!.id);
    expect(again.to).toBe(p.to);
    await run("fakturace.mail.send", u.ctx, sendInput(again, id, "invoice"));
    const sent: Sent[] = [];
    await deliver(okTransport(sent));
    await syncDispatches(app.db, id);
    rec = await list(u, id);
    expect(rec.map((r) => r.status).sort()).toEqual(["failed", "sent"]);
    expect((await app.db.select().from(invoice).where(eq(invoice.id, id)))[0]!.sentOn).toBe(
      todayIso(),
    );
  });

  it("nenastavené SMTP na straně workeru: e-mail je „selhalo“ bez opakování", async () => {
    const u = await office();
    const { id } = await issued(u, await newJob());
    await run(
      "fakturace.mail.send",
      u.ctx,
      sendInput(await prepare(u, id, "invoice"), id, "invoice"),
    );
    const data = queue.splice(0);
    const mailDeps: MailDeps = {
      db: app.db,
      cipher,
      storage,
      brand: async () => "X",
      resolveTransport: async () => null,
    };
    await sendMailJob.handler(mailDeps, data[0]!, { retryCount: 0 } as never);
    await syncDispatches(app.db, id);
    const rec = await list(u, id);
    expect(rec[0]).toMatchObject({ status: "failed" });
    expect(rec[0]!.error).toMatch(/není nastavené/);
  });

  it("fronta nedostupná: záznam skončí „selhalo“, uživatel dostane hlášku a příloha se neuloží", async () => {
    const u = await office();
    const { id } = await issued(u, await newJob());
    const p = await prepare(u, id, "invoice");
    queueFails = true;
    try {
      await expect(run("fakturace.mail.send", u.ctx, sendInput(p, id, "invoice"))).rejects.toThrow(
        /nepodařilo zařadit/,
      );
    } finally {
      queueFails = false;
    }
    const rec = await list(u, id);
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ status: "failed" });
  });

  it("neplatné adresy a prázdný text se odmítnou", async () => {
    const u = await office();
    const { id } = await issued(u, await newJob());
    const p = await prepare(u, id, "invoice");
    await expect(
      run("fakturace.mail.send", u.ctx, sendInput(p, id, "invoice", { to: "není e-mail" })),
    ).rejects.toThrow();
    await expect(
      run("fakturace.mail.send", u.ctx, sendInput(p, id, "invoice", { cc: ["a@b.cz", "špatně"] })),
    ).rejects.toThrow();
    await expect(
      run("fakturace.mail.send", u.ctx, sendInput(p, id, "invoice", { body: "  " })),
    ).rejects.toThrow();
    expect(await list(u, id)).toEqual([]);
  });
});

describe("upomínka po splatnosti", () => {
  it("jde poslat jen po splatnosti neuhrazené faktury; eviduje počet upomínek a datum poslední", async () => {
    const u = await office();
    const j = await newJob();
    const onTime = await issued(u, j, 10);
    expect((await prepare(u, onTime.id, "reminder")).blocker).toMatch(/po splatnosti/);
    await expect(
      run(
        "fakturace.mail.send",
        u.ctx,
        sendInput(await prepare(u, onTime.id, "invoice"), onTime.id, "reminder"),
      ),
    ).rejects.toThrow(/po splatnosti/);

    const late = await issued(u, j, -5);
    const p = await prepare(u, late.id, "reminder");
    expect(p.blocker).toBeNull();
    expect(p.subject).toBe(`Upomínka: Faktura ${late.number} po splatnosti`);
    expect(p.body).toContain("5 dní");
    expect(p.body).toContain(supplier.bankAccount);
    expect(p.body).toContain("12 100 Kč");

    await run("fakturace.mail.send", u.ctx, sendInput(p, late.id, "reminder"));
    const sent: Sent[] = [];
    await deliver(okTransport(sent));
    expect(sent[0]!.attachments![0]!.filename).toBe(`${late.number}.pdf`);
    await syncDispatches(app.db, late.id);
    let [inv] = await app.db.select().from(invoice).where(eq(invoice.id, late.id));
    expect(inv).toMatchObject({ reminderCount: 1, lastReminderOn: todayIso(), sentOn: null });
    expect((await prepare(u, late.id, "reminder")).lastReminderAt).not.toBeNull();

    await run(
      "fakturace.mail.send",
      u.ctx,
      sendInput(await prepare(u, late.id, "reminder"), late.id, "reminder"),
    );
    await deliver(okTransport(sent));
    await syncDispatches(app.db, late.id);
    [inv] = await app.db.select().from(invoice).where(eq(invoice.id, late.id));
    expect(inv!.reminderCount).toBe(2);
    expect(await list(u, late.id)).toHaveLength(2);

    // po úhradě už upomínku poslat nejde
    await addPayment.handler(
      u.ctx,
      addPayment.input.parse({ invoiceId: late.id, date: todayIso(), amountMinor: 12_100_00 }),
      deps(),
    );
    expect((await prepare(u, late.id, "reminder")).blocker).toMatch(/uhrazený/);
  });

  it("neúspěšná upomínka se do počtu upomínek nepočítá", async () => {
    const u = await office();
    const late = await issued(u, await newJob(), -3);
    await run(
      "fakturace.mail.send",
      u.ctx,
      sendInput(await prepare(u, late.id, "reminder"), late.id, "reminder"),
    );
    const r = await deliver(brokenTransport, 0);
    queue.push(sendMailJob.schema.parse(r.pending[0]));
    await deliver(brokenTransport, 5);
    await syncDispatches(app.db, late.id);
    const [inv] = await app.db.select().from(invoice).where(eq(invoice.id, late.id));
    expect(inv!.reminderCount).toBe(0);
    expect((await list(u, late.id))[0]!.status).toBe("failed");
  });
});

describe("hromadné odeslání", () => {
  it("výsledek je po jednotlivých dokladech; koncept a doklad bez e-mailu se přeskočí, ostatní odejdou", async () => {
    const u = await office();
    const good = await issued(u, await newJob());
    const good2 = await issued(u, await newJob({ personEmail: "p@odberatel.example" }));
    const noMail = await issued(u, await newJob({ email: null }));
    const j = await newJob();
    const draft = await createFromJob.handler(
      u.ctx,
      createFromJob.input.parse({ jobId: j.id, kind: "partial", percent: 10 }),
      deps(),
    );
    const ids = [good.id, good2.id, noMail.id, draft.id];

    const pv = await run<{
      smtpConfigured: boolean;
      items: { invoiceId: string; to: string; blocker: string | null }[];
    }>("fakturace.mail.bulkPreview", u.ctx, { invoiceIds: ids, kind: "invoice" });
    expect(pv.smtpConfigured).toBe(true);
    expect(pv.items.map((i) => !!i.blocker)).toEqual([false, false, true, true]);

    const out = await run<
      { invoiceId: string; ok: boolean; error: string | null; to: string | null }[]
    >("fakturace.mail.bulk", u.ctx, { invoiceIds: ids, kind: "invoice" });
    expect(out.map((r) => r.ok)).toEqual([true, true, false, false]);
    expect(out[2]!.error).toMatch(/nemají vyplněný e-mail/);
    expect(out[3]!.error).toMatch(/Koncept/);
    expect(queue).toHaveLength(2);
    const sent: Sent[] = [];
    await deliver(okTransport(sent));
    expect(sent.map((m) => m.to).sort()).toEqual([out[0]!.to, "p@odberatel.example"].sort());
    expect(await list(u, noMail.id)).toEqual([]);
  });

  it("bez SMTP se hromadné odeslání odmítne celé; limit 50 dokladů", async () => {
    const u = await office();
    const a = await issued(u, await newJob());
    smtpOn = false;
    try {
      await expect(
        run("fakturace.mail.bulk", u.ctx, { invoiceIds: [a.id], kind: "invoice" }),
      ).rejects.toThrow(/není nastavené/);
    } finally {
      smtpOn = true;
    }
    await expect(
      run("fakturace.mail.bulk", u.ctx, {
        invoiceIds: Array.from({ length: 51 }, () => crypto.randomUUID()),
        kind: "invoice",
      }),
    ).rejects.toThrow();
  });
});

describe("oprávnění", () => {
  it("montér a mistr (bez fakturace.write) příkazy nespustí; čtenář vidí jen evidenci", async () => {
    const u = await office();
    const { id } = await issued(u, await newJob());
    const worker = await makeUser(app.db, [["zakazky.read", "own"]]);
    const foreman = await makeUser(app.db, [
      ["zakazky.read", "all"],
      ["kontakty.read", "all"],
    ]);
    const reader = await makeUser(app.db, [["fakturace.read", "all"]]);
    for (const who of [worker, foreman]) {
      for (const name of [
        "fakturace.mail.prepare",
        "fakturace.mail.send",
        "fakturace.mail.bulk",
        "fakturace.mail.bulkPreview",
        "fakturace.mail.list",
      ])
        expect(() => assertCommandPermission(who.ctx, cmd(name)), name).toThrow(PermissionError);
    }
    for (const name of [
      "fakturace.mail.prepare",
      "fakturace.mail.send",
      "fakturace.mail.bulk",
      "fakturace.mail.bulkPreview",
    ])
      expect(() => assertCommandPermission(reader.ctx, cmd(name)), name).toThrow(PermissionError);
    expect(() => assertCommandPermission(reader.ctx, cmd("fakturace.mail.list"))).not.toThrow();
    await expect(list(reader, id)).resolves.toEqual([]);

    // i s oprávněním v příkazu: zápis do cizí faktury (rozsah „jen moje“) handler odmítne
    const own = await makeUser(app.db, [
      ["fakturace.read", "own"],
      ["fakturace.write", "own"],
      ["kontakty.read", "all"],
      ["zakazky.read", "all"],
    ]);
    await expect(prepare(own, id, "invoice")).rejects.toThrow();
    await expect(
      run("fakturace.mail.send", own.ctx, {
        invoiceId: id,
        kind: "invoice",
        to: "x@example.cz",
        subject: "S",
        body: "B",
      }),
    ).rejects.toThrow();
    expect(queue).toHaveLength(0);
  });

  it("neznámá faktura a koncept: srozumitelné chyby", async () => {
    const u = await office();
    await expect(prepare(u, crypto.randomUUID(), "invoice")).rejects.toThrow();
    void UserError;
  });
});

afterAll(async () => {
  // doklady testu zůstávají v testovací databázi (každý běh ji zakládá znovu); evidence ale odkazuje na ně
  void invoiceDispatch;
});
