import { eq } from "drizzle-orm";
import { z } from "zod";
import "../zod-locale";
import type { AuthMail, Mailer } from "../auth/mailer";
import { schema, type Db, type Executor } from "../db/client";
import type { StorageDriver } from "../files/storage";
import { defineJob, type JobDef, type QueueClient } from "../jobs/jobs";
import type { Cipher } from "../security/crypto";
import { renderMail, type MailTemplateName } from "./templates";
import type { MailAttachment, MailTransport, OutgoingMail } from "./transport";

const sendPayload = z.object({
  logId: z.uuid(),
  to: z.string(),
  template: z.enum(["invitation", "password-reset", "test", "document", "notification"]),
  /** Proměnné šablony (mohou obsahovat tajný odkaz) — v úloze jsou jen zašifrované. */
  varsEnc: z.string(),
  cc: z.array(z.string()).max(10).optional(),
  replyTo: z.string().optional(),
  /** Přílohy leží v úložišti souborů (klíč `mail/<logId>/…`); úloha je po odeslání nebo definitivním selhání smaže. */
  attachments: z
    .array(z.object({ key: z.string(), name: z.string(), mime: z.string() }))
    .max(10)
    .optional(),
});

/** Kolikrát se odeslání zopakuje po chybě přenosu; po vyčerpání je e-mail v logu „failed“. */
const RETRY_LIMIT = 5;

export type MailDeps = {
  db: Db;
  cipher: Cipher;
  /** Vybere dopravu podle aktuálního nastavení; `null` = odesílání není nastavené. */
  resolveTransport: () => Promise<{ transport: MailTransport; from: string } | null>;
  /** Název systému klienta pro šablony. */
  brand: () => Promise<string>;
  /** Úložiště příloh (e-maily s doklady); bez něj se e-mail s přílohou neodešle. */
  storage?: StorageDriver | undefined;
};

async function readAll(stream: AsyncIterable<Buffer | string>): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const c of stream) parts.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(parts);
}

/** Jméno odesílatele „Firma <adresa>“, když je v nastavení jen holá adresa; hotové jméno se nemění. */
function withDisplayName(from: string, brand: string): string {
  const name = brand.replace(/["<>\r\n]/g, "").trim();
  return !name || from.includes("<") ? from : `"${name}" <${from}>`;
}

/** Úloha „odeslat e-mail“. Opakuje se s prodlevou; stav a poslední chyba jsou v `email_log` (bez těla zprávy). */
export const sendMailJob: JobDef<typeof sendPayload, MailDeps> = defineJob({
  name: "mail.send",
  schema: sendPayload,
  retryLimit: RETRY_LIMIT,
  keepCompletedSeconds: 600,
  async handler(deps, data, job) {
    const fail = async (error: string) => {
      await deps.db
        .update(schema.emailLog)
        .set({ status: "failed", error })
        .where(eq(schema.emailLog.id, data.logId));
      await dropAttachments(deps, data.attachments);
    };
    // pg-boss doručuje alespoň jednou: po pádu workeru po odeslání se úloha spustí znovu. E-mail, který už odešel,
    // se nesmí poslat podruhé (a chybějící příloha, kterou odeslání uklidilo, ho nesmí přepsat na „failed“).
    const [existing] = await deps.db
      .select({ status: schema.emailLog.status })
      .from(schema.emailLog)
      .where(eq(schema.emailLog.id, data.logId));
    if (existing?.status === "sent") return;
    const vars = JSON.parse(deps.cipher.decrypt(data.varsEnc) ?? "null") as Record<
      string,
      string
    > | null;
    if (!vars) throw new Error("Proměnné e-mailu nejdou dešifrovat (změněný šifrovací klíč?).");
    const resolved = await deps.resolveTransport();
    if (!resolved) {
      await fail("Odesílání e-mailů není nastavené (SMTP).");
      return; // opakování nepomůže, dokud admin SMTP nenastaví
    }
    const brand = await deps.brand();
    const mail = renderMail(data.template, vars, brand);
    const attachments: MailAttachment[] = [];
    for (const a of data.attachments ?? []) {
      try {
        if (!deps.storage) throw new Error("bez úložiště");
        attachments.push({
          filename: a.name,
          contentType: a.mime,
          content: await readAll(await deps.storage.get(a.key)),
        });
      } catch {
        await fail(`Příloha „${a.name}“ už není k dispozici, odeslání zopakujte.`);
        return;
      }
    }
    const out: OutgoingMail = {
      from: data.template === "document" ? withDisplayName(resolved.from, brand) : resolved.from,
      to: data.to,
      ...mail,
      ...(data.cc?.length ? { cc: data.cc } : {}),
      ...(data.replyTo ? { replyTo: data.replyTo } : {}),
      ...(attachments.length ? { attachments } : {}),
    };
    try {
      await resolved.transport.send(out);
      await deps.db
        .update(schema.emailLog)
        .set({ status: "sent", sentAt: new Date(), error: null })
        .where(eq(schema.emailLog.id, data.logId));
      await dropAttachments(deps, data.attachments);
    } catch (err) {
      const message = err instanceof Error ? err.message.slice(0, 500) : "chyba";
      const last = (job?.retryCount ?? 0) >= RETRY_LIMIT;
      await deps.db
        .update(schema.emailLog)
        .set({ status: last ? "failed" : "queued", error: message })
        .where(eq(schema.emailLog.id, data.logId));
      if (last) await dropAttachments(deps, data.attachments);
      throw err; // pg-boss zkusí znovu
    }
  },
});

async function dropAttachments(
  deps: Pick<MailDeps, "storage">,
  attachments: readonly { key: string }[] | undefined,
) {
  for (const a of attachments ?? []) await deps.storage?.delete(a.key).catch(() => {});
}

/**
 * `Mailer` pro autentizaci a další služby: zapíše záznam do logu (bez těla) a předá odeslání frontě.
 * Tajný odkaz je ve frontě jen zašifrovaný, v logu není vůbec.
 */
export function createQueuedMailer(opts: {
  db: Db;
  queue: Pick<QueueClient, "send">;
  cipher: Cipher;
  brand: () => Promise<string>;
}): Mailer {
  return {
    async send(mail: AuthMail) {
      const rendered = renderMail(mail.template as MailTemplateName, mail.vars, await opts.brand());
      const [log] = await opts.db
        .insert(schema.emailLog)
        .values({
          toEmail: mail.to,
          template: mail.template,
          subject: rendered.subject,
          status: "queued",
        })
        .returning({ id: schema.emailLog.id });
      await opts.queue.send(sendMailJob, {
        logId: log!.id,
        to: mail.to,
        template: mail.template,
        varsEnc: opts.cipher.encrypt(JSON.stringify(mail.vars)),
      });
    },
  };
}

/** E-mail s dokladem: předmět a text jsou hotové (šablona s dosazenými proměnnými), přílohy jdou přes úložiště. */
export type DocumentMail = {
  to: string;
  cc?: readonly string[];
  replyTo?: string | undefined;
  subject: string;
  body: string;
  attachments?: readonly { name: string; mime: string; data: Buffer }[];
  /** Záznam, ke kterému e-mail patří (faktura); ukáže se v logu odeslaných e-mailů. */
  entity?: { type: string; id: string };
};

export type DocumentMailDeps = {
  queue: Pick<QueueClient, "send">;
  cipher: Cipher;
  storage: StorageDriver;
};

/** Krok 1: záznam v `email_log` (volá se v transakci příkazu, ať je evidence atomická se zápisem u dokladu). */
export async function logDocumentMail(db: Executor, mail: DocumentMail): Promise<string> {
  const [log] = await db
    .insert(schema.emailLog)
    .values({
      toEmail: mail.to,
      template: "document",
      subject: mail.subject.replace(/[\r\n]+/g, " ").slice(0, 200),
      status: "queued",
      entityType: mail.entity?.type ?? null,
      entityId: mail.entity?.id ?? null,
    })
    .returning({ id: schema.emailLog.id });
  return log!.id;
}

/**
 * Krok 2 (po potvrzení transakce): uloží přílohy a zařadí odeslání do fronty. Při chybě frontu i úložiště uklidí,
 * záznam v logu označí jako selhaný a chybu vyhodí dál, ať ji volající zapíše do evidence.
 */
export async function enqueueDocumentMail(
  deps: DocumentMailDeps & { db: Executor },
  logId: string,
  mail: DocumentMail,
): Promise<void> {
  const stored: { key: string; name: string; mime: string }[] = [];
  try {
    for (const [i, a] of (mail.attachments ?? []).entries()) {
      const key = `mail/${logId}/${i}.bin`;
      await deps.storage.put(key, a.data);
      stored.push({ key, name: a.name, mime: a.mime });
    }
    await deps.queue.send(sendMailJob, {
      logId,
      to: mail.to,
      template: "document",
      varsEnc: deps.cipher.encrypt(JSON.stringify({ subject: mail.subject, body: mail.body })),
      ...(mail.cc?.length ? { cc: [...mail.cc] } : {}),
      ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
      ...(stored.length ? { attachments: stored } : {}),
    });
  } catch (err) {
    await dropAttachments(deps, stored);
    await deps.db
      .update(schema.emailLog)
      .set({ status: "failed", error: "Zařazení do fronty se nepodařilo, zkuste to znovu." })
      .where(eq(schema.emailLog.id, logId));
    throw err;
  }
}

/**
 * E-mail s upozorněním (kanál „e-mail“ katalogu upozornění): záznam v logu a zařazení do fronty. Odkaz je jen
 * cesta v aplikaci, k adrese systému ji dosadí volající.
 */
export async function queueNotificationMail(
  opts: {
    db: Db;
    queue: Pick<QueueClient, "send">;
    cipher: Cipher;
    baseURL: string;
  },
  mail: { to: string; subject: string; body: string; url: string | null },
): Promise<void> {
  const vars: Record<string, string> = {
    subject: mail.subject,
    body: mail.body,
    ...(mail.url && mail.url.startsWith("/")
      ? { url: new URL(mail.url, opts.baseURL).toString() }
      : {}),
  };
  const [log] = await opts.db
    .insert(schema.emailLog)
    .values({
      toEmail: mail.to,
      template: "notification",
      subject: mail.subject.replace(/[\r\n]+/g, " ").slice(0, 200),
      status: "queued",
    })
    .returning({ id: schema.emailLog.id });
  await opts.queue.send(sendMailJob, {
    logId: log!.id,
    to: mail.to,
    template: "notification",
    varsEnc: opts.cipher.encrypt(JSON.stringify(vars)),
  });
}
