import { createHmac } from "node:crypto";
import { createAuth } from "../auth/create-auth";
import type { AuthMail, Mailer } from "../auth/mailer";
import type { Db } from "../db/client";

export function fakeMailer(): Mailer & {
  sent: AuthMail[];
  last(template?: AuthMail["template"]): AuthMail | undefined;
} {
  const sent: AuthMail[] = [];
  return {
    sent,
    async send(mail) {
      sent.push(mail);
    },
    last: (template) => [...sent].reverse().find((m) => !template || m.template === template),
  };
}

export function createTestAuth(db: Db, mailer: Mailer, over: { idleTimeoutMinutes?: number } = {}) {
  return createAuth({
    db,
    baseURL: "http://localhost:3000",
    secret: "test-secret-test-secret-test-secret-0123456789",
    appName: "Testovací systém",
    idleTimeoutMinutes: over.idleTimeoutMinutes ?? 480,
    mailer,
  });
}

/** Z hlaviček `Set-Cookie` odpovědi složí hlavičku `Cookie` pro další požadavek. */
export function cookieHeader(responseHeaders: Headers, previous = ""): Headers {
  const jar = new Map<string, string>();
  for (const part of previous.split(/;\s*/).filter(Boolean)) {
    const i = part.indexOf("=");
    jar.set(part.slice(0, i), part.slice(i + 1));
  }
  for (const line of responseHeaders.getSetCookie()) {
    const [pair = ""] = line.split(";");
    const i = pair.indexOf("=");
    const name = pair.slice(0, i);
    const value = pair.slice(i + 1);
    if (!value || /max-age=0/i.test(line)) jar.delete(name);
    else jar.set(name, value);
  }
  return new Headers({ cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") });
}

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of input.replace(/=+$/, "").toUpperCase())
    bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** TOTP podle RFC 6238 (SHA-1, 6 číslic, 30 s) z tajemství v base32 — nezávisle na Better Auth. */
export function totpCode(secretBase32: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", base32Decode(secretBase32)).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  const code = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(code % 1_000_000).padStart(6, "0");
}

export function secretFromTotpUri(uri: string): string {
  const secret = new URL(uri).searchParams.get("secret");
  if (!secret) throw new Error("TOTP URI bez tajemství");
  return secret;
}
