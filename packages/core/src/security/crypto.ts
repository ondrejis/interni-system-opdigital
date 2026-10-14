import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/*
  Šifrování citlivých hodnot v DB (heslo SMTP, tokeny, adresy kalendářů). AES-256-GCM.
  Klíč je samostatný (`APP_ENCRYPTION_KEY`), ne odvozený z tajemství přihlašování, takže rotace
  jednoho neznehodnotí druhé. Formát: v2.<id klíče>.<iv>.<tag>.<data> (base64url).
  Rotace: `APP_ENCRYPTION_KEYS="2:<nový>,1:<starý>"` — první je aktuální, ostatní jen dešifrují.
*/

export type KeyRing = { current: string; keys: ReadonlyMap<string, Buffer> };

function parseKey(id: string, base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) {
    throw new Error(
      `Šifrovací klíč „${id}“ musí mít 32 bajtů v base64 (vygenerujte: openssl rand -base64 32).`,
    );
  }
  return key;
}

export function parseKeyRing(env: {
  APP_ENCRYPTION_KEY?: string | undefined;
  APP_ENCRYPTION_KEYS?: string | undefined;
}): KeyRing {
  const keys = new Map<string, Buffer>();
  let current: string | undefined;
  if (env.APP_ENCRYPTION_KEYS) {
    for (const part of env.APP_ENCRYPTION_KEYS.split(",")
      .map((p) => p.trim())
      .filter(Boolean)) {
      const i = part.indexOf(":");
      if (i < 1) throw new Error("APP_ENCRYPTION_KEYS má tvar „id:klíč,id:klíč“.");
      const id = part.slice(0, i);
      if (!/^[a-z0-9]+$/i.test(id)) throw new Error(`Neplatné id šifrovacího klíče „${id}“.`);
      keys.set(id, parseKey(id, part.slice(i + 1)));
      current ??= id;
    }
  } else if (env.APP_ENCRYPTION_KEY) {
    keys.set("1", parseKey("1", env.APP_ENCRYPTION_KEY));
    current = "1";
  }
  if (!current) throw new Error("Chybí APP_ENCRYPTION_KEY (openssl rand -base64 32).");
  return { current, keys };
}

export type Cipher = {
  encrypt(plain: string): string;
  /** `null`, když hodnotu nejde dešifrovat (neznámý klíč, poškozená data). */
  decrypt(value: string | null | undefined): string | null;
};

export function createCipher(ring: KeyRing): Cipher {
  return {
    encrypt(plain) {
      const key = ring.keys.get(ring.current)!;
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", key, iv);
      const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
      return [
        "v2",
        ring.current,
        iv.toString("base64url"),
        c.getAuthTag().toString("base64url"),
        data.toString("base64url"),
      ].join(".");
    },
    decrypt(value) {
      if (!value) return null;
      try {
        const [v, id, iv, tag, data] = value.split(".");
        const key = id ? ring.keys.get(id) : undefined;
        if (v !== "v2" || !key || !iv || !tag || !data) return null;
        const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
        d.setAuthTag(Buffer.from(tag, "base64url"));
        return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString(
          "utf8",
        );
      } catch {
        return null;
      }
    },
  };
}

/** Náhodný token (např. odkaz). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
