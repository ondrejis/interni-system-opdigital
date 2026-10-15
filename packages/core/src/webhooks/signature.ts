import { createHmac, timingSafeEqual } from "node:crypto";

/*
  Podpis odchozích webhooků i příchozích požadavků (ingest). Stejný formát v obou směrech:

    X-Opsys-Signature: t=<unix sekundy>,v1=<hex HMAC-SHA256(tajemství, t + "." + tělo)>

  Tělo je přesně ten řetězec bajtů, který se odesílá (u příchozích „syrové“ tělo před parsováním JSON). Časová značka
  chrání proti opakování (replay): přijímač odmítne požadavek, jehož `t` se od jeho hodin liší o víc než 5 minut.
  Při každém pokusu o doručení se podepisuje znovu s aktuální časovou značkou, takže opakování po hodině projde.
*/

/** Hlavička s podpisem. */
export const SIGNATURE_HEADER = "x-opsys-signature";
/** Povolená odchylka časové značky v sekundách (±5 minut). */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Hodnota hex HMAC-SHA256 z `t + "." + tělo`. */
export function computeSignature(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** Celá hodnota hlavičky `X-Opsys-Signature` (`t=…,v1=…`). */
export function signatureHeader(secret: string, body: string, nowMs = Date.now()): string {
  const t = Math.floor(nowMs / 1000);
  return `t=${t},v1=${computeSignature(secret, t, body)}`;
}

/** Rozloží hlavičku na časovou značku a podpisy `v1` (víc podpisů umožňuje rotaci tajemství); neplatný tvar = `null`. */
export function parseSignatureHeader(
  header: string | null | undefined,
): { timestamp: number; signatures: string[] } | null {
  if (!header) return null;
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === "t" && /^\d{1,12}$/.test(value)) timestamp = Number(value);
    else if (key === "v1" && /^[0-9a-f]{64}$/i.test(value)) signatures.push(value.toLowerCase());
  }
  return timestamp !== null && signatures.length ? { timestamp, signatures } : null;
}

/** Výsledek ověření podpisu; `reason` rozlišuje, proč se požadavek odmítl (do protokolu, ne do odpovědi). */
export type SignatureCheck =
  | { ok: true }
  | { ok: false; reason: "missing" | "malformed" | "expired" | "mismatch" };

/**
 * Ověří podpis těla jedním nebo více tajemstvími (aktuální + předchozí při rotaci). Porovnání v konstantním čase,
 * časová značka se kontroluje před počítáním HMAC.
 */
export function verifySignature(opts: {
  secrets: readonly string[];
  header: string | null | undefined;
  body: string;
  nowMs?: number;
  toleranceSeconds?: number;
}): SignatureCheck {
  const { secrets, header, body, nowMs = Date.now(), toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS } =
    opts;
  if (!header) return { ok: false, reason: "missing" };
  const parsed = parseSignatureHeader(header);
  if (!parsed) return { ok: false, reason: "malformed" };
  if (Math.abs(Math.floor(nowMs / 1000) - parsed.timestamp) > toleranceSeconds)
    return { ok: false, reason: "expired" };
  for (const secret of secrets) {
    if (!secret) continue;
    const expected = Buffer.from(computeSignature(secret, parsed.timestamp, body), "hex");
    for (const sig of parsed.signatures) {
      const given = Buffer.from(sig, "hex");
      if (given.length === expected.length && timingSafeEqual(given, expected)) return { ok: true };
    }
  }
  return { ok: false, reason: "mismatch" };
}
