import { isIP } from "node:net";
import { UserError } from "../rbac/errors";

/*
  Adresa webhooku nastavuje správce (n8n). n8n může běžet i v domácí nebo firemní síti, proto jsou povolené i interní
  adresy, ale jen přes http(s) bez přihlašovacích údajů v adrese a s výjimkou adres, na kterých běží správa cloudu
  (link-local 169.254.0.0/16, metadata). Veřejná adresa musí být https; prosté http je jen pro interní síť a vývoj.
*/

type HostKind = "public" | "internal" | "blocked";

function classifyV4(a: number, b: number): HostKind {
  if (a === 169 && b === 254) return "blocked";
  if (a === 0 || a >= 224) return "blocked";
  if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))
    return "internal";
  if (a === 100 && b >= 64 && b <= 127) return "internal";
  return "public";
}

function classifyHost(rawHost: string): HostKind {
  const host = rawHost.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "metadata.google.internal") return "blocked";
  const kind = isIP(host);
  if (kind === 4) {
    const [a, b] = host.split(".").map(Number) as [number, number];
    return classifyV4(a, b);
  }
  if (kind === 6) {
    if (host === "::" || host.startsWith("fe80:")) return "blocked";
    if (host === "::1" || host.startsWith("fc") || host.startsWith("fd")) return "internal";
    const mapped = host.match(/^::ffff:(\d+)\.(\d+)\.\d+\.\d+$/);
    if (mapped) return classifyV4(Number(mapped[1]), Number(mapped[2]));
    return "public";
  }
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan") ||
    !host.includes(".") // jednoslovné jméno (např. služba v docker síti)
  )
    return "internal";
  return "public";
}

/** Ověří adresu webhooku a vrátí ji jako `URL`; neplatnou odmítne srozumitelnou chybou (`UserError`). */
export function parseWebhookUrl(raw: string): URL {
  const text = raw.trim();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new UserError(
      "Adresa webhooku není platná. Zadejte celou adresu, např. https://n8n.firma.cz/webhook/opsys.",
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new UserError("Adresa webhooku musí začínat https:// (nebo http:// v interní síti).");
  if (url.username || url.password)
    throw new UserError("Adresa nesmí obsahovat jméno ani heslo. Ověření řeší podpis webhooku.");
  const kind = classifyHost(url.hostname);
  if (kind === "blocked") throw new UserError("Tato adresa není povolená.");
  if (url.protocol === "http:" && kind === "public")
    throw new UserError("Veřejná adresa musí používat šifrované spojení (https://).");
  if (text.length > 2000) throw new UserError("Adresa je příliš dlouhá.");
  return url;
}
