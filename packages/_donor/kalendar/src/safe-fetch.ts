import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request } from "node:https";
import { isIP } from "node:net";

/*
  Bezpečné stahování cizích kalendářů (ochrana před SSRF): jen https na portu 443, žádná adresa z interní sítě,
  adresa se ověřuje při každém přesměrování a hlavně v okamžiku připojení (vlastní `lookup`), takže ji nelze obejít
  přepsáním DNS mezi kontrolou a připojením. Limit velikosti a času.
*/

export class FetchBlockedError extends Error {}

/** Rozloží IPv6 na osm šestnáctibitových částí (podporuje „::“ i zapsané IPv4 na konci). */
function hextets(ip: string): number[] | null {
  let v = ip.toLowerCase().split("%")[0]!;
  const tail4 = v.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail4) {
    const p = tail4[1]!.split(".").map(Number);
    if (p.some((n) => n > 255)) return null;
    v = v.replace(
      tail4[1]!,
      `${((p[0]! << 8) | p[1]!).toString(16)}:${((p[2]! << 8) | p[3]!).toString(16)}`,
    );
  }
  const halves = v.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves[1] !== undefined && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const all = [...head, ...Array<string>(fill).fill("0"), ...rest].map((h) => parseInt(h, 16));
  return all.length === 8 && all.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff)
    ? all
    : null;
}

function isPrivateV4(a: number, b: number, c: number): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

/** Zda je adresa interní, rezervovaná nebo jinak nesmí být cílem stahování. Neplatný zápis se bere jako zakázaný. */
export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip.split("%")[0]!);
  if (kind === 4) {
    const [a, b, c] = ip.split(".").map(Number) as [number, number, number];
    return isPrivateV4(a, b, c);
  }
  if (kind === 6) {
    const h = hextets(ip);
    if (!h) return true;
    // ::ffff:a.b.c.d (IPv4 zabalené do IPv6) a ::a.b.c.d se posuzují podle IPv4
    if (h.slice(0, 5).every((x) => x === 0) && (h[5] === 0xffff || h[5] === 0)) {
      if (h[5] === 0 && h[6] === 0 && h[7]! <= 1) return true; // :: a ::1
      return isPrivateV4(h[6]! >> 8, h[6]! & 255, h[7]! >> 8);
    }
    const first = h[0]!;
    return (
      (first & 0xfe00) === 0xfc00 || // fc00::/7 unikátní lokální
      (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
      (first & 0xff00) === 0xff00 || // multicast
      (first === 0x2001 && h[1] === 0x0db8) || // dokumentační
      (first === 0x0064 && h[1] === 0xff9b) // NAT64
    );
  }
  return true;
}

/** Ověří adresu kalendáře a vrátí ji jako `URL`. `webcal://` se bere jako `https://`. */
export function parsePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcal:\/\//i, "https://"));
  } catch {
    throw new FetchBlockedError("Neplatná adresa kalendáře.");
  }
  if (url.protocol !== "https:")
    throw new FetchBlockedError("Adresa musí začínat https:// nebo webcal://.");
  if (url.username || url.password)
    throw new FetchBlockedError("Adresa nesmí obsahovat přihlašovací údaje.");
  if (url.port && url.port !== "443") throw new FetchBlockedError("Tato adresa není povolená.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    (isIP(host) && isPrivateIp(host)) ||
    (!host.includes(".") && !isIP(host))
  )
    throw new FetchBlockedError("Tato adresa není povolená.");
  return url;
}

/** `lookup` pro připojení: přeloží jméno a odmítne, pokud vede kamkoli do interní sítě. */
export function safeLookup(
  hostname: string,
  options: { all?: boolean; family?: number } | number | undefined,
  cb: (err: Error | null, address?: string | LookupAddress[], family?: number) => void,
): void {
  const opts = typeof options === "object" ? options : {};
  dnsLookup(hostname, { all: true, family: opts.family ?? 0 }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address)))
      return cb(new FetchBlockedError("Tato adresa není povolená."));
    if (opts.all) return cb(null, addrs);
    return cb(null, addrs[0]!.address, addrs[0]!.family);
  });
}

export type TransportResult = { status: number; location?: string | undefined; body?: string };
export type Transport = (
  url: URL,
  opts: { timeoutMs: number; maxBytes: number },
) => Promise<TransportResult>;

/** Skutečné připojení přes https s kontrolou adresy při připojení. */
export const httpsTransport: Transport = (url, { timeoutMs, maxBytes }) =>
  new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        lookup: safeLookup as never,
        timeout: timeoutMs,
        headers: { "user-agent": "Kalendar/1.0", accept: "text/calendar" },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location });
        }
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > maxBytes) {
          req.destroy();
          return reject(new FetchBlockedError("Kalendář je příliš velký."));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            req.destroy();
            return reject(new FetchBlockedError("Kalendář je příliš velký."));
          }
          chunks.push(c);
        });
        res.on("end", () => resolve({ status, body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new FetchBlockedError("Server kalendáře neodpovídá.")));
    req.on("error", reject);
    req.end();
  });

/**
 * Stáhne iCalendar z veřejné adresy: nejvýš tři přesměrování (každé znovu ověřené), 10 s, 5 MB.
 * Chyby, které smí vidět uživatel, jsou `FetchBlockedError`; ostatní se mu ukážou jako obecné selhání.
 */
export async function fetchCalendarText(
  raw: string,
  opts: {
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
    transport?: Transport;
  } = {},
): Promise<string> {
  const {
    timeoutMs = 10_000,
    maxBytes = 5_000_000,
    maxRedirects = 3,
    transport = httpsTransport,
  } = opts;
  let url = parsePublicUrl(raw);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let res: TransportResult;
    try {
      res = await transport(url, { timeoutMs, maxBytes });
    } catch (err) {
      if (err instanceof FetchBlockedError) throw err;
      throw new FetchBlockedError("Kalendář se nepodařilo stáhnout.");
    }
    if (res.status >= 300 && res.status < 400 && res.location) {
      url = parsePublicUrl(new URL(res.location, url).toString());
      continue;
    }
    if (res.status < 200 || res.status >= 300)
      throw new FetchBlockedError(`Server kalendáře odpověděl chybou ${res.status}.`);
    const text = res.body ?? "";
    if (text.length > maxBytes) throw new FetchBlockedError("Kalendář je příliš velký.");
    if (!text.includes("BEGIN:VCALENDAR"))
      throw new FetchBlockedError("Na adrese není kalendář ve formátu iCal (.ics).");
    return text;
  }
  throw new FetchBlockedError("Příliš mnoho přesměrování.");
}
