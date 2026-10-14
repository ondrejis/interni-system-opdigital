import nodemailer from "nodemailer";

export type MailAttachment = { filename: string; content: Buffer; contentType: string };

export type OutgoingMail = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Kopie (e-maily dokladů). */
  cc?: string[];
  /** Adresa pro odpověď (kontakt firmy klienta). */
  replyTo?: string;
  attachments?: MailAttachment[];
};
export type MailTransport = { send(mail: OutgoingMail): Promise<void> };

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string | null;
  from: string;
};

/** Odesílání přes SMTP (nastavení v administraci, heslo zašifrované v DB). */
export function smtpTransport(cfg: SmtpConfig): MailTransport {
  const t = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.password ?? "" } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return { send: async (m) => void (await t.sendMail(m)) };
}

/** Ověří spojení se serverem bez odeslání zprávy. */
export async function verifySmtp(
  cfg: SmtpConfig,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await nodemailer
      .createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: cfg.user ? { user: cfg.user, pass: cfg.password ?? "" } : undefined,
        connectionTimeout: 10_000,
      })
      .verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
