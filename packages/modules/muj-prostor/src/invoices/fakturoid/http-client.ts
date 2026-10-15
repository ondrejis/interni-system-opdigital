import {
  FakturoidError,
  type FakturoidClient,
  type FakturoidConfig,
  type FakturoidInvoice,
  type FakturoidInvoiceInput,
  type FakturoidSubject,
  type FakturoidSubjectInput,
} from "./client";

/** Kořen API v3 Fakturoidu. */
export const FAKTUROID_API = "https://app.fakturoid.cz/api/v3";

type Json = Record<string, unknown>;

/** Volitelné závislosti (testy je nahrazují; v provozu se použije globální `fetch` a reálný čas). */
export type HttpClientOptions = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Časový limit jednoho požadavku (ms), výchozí 15 000. */
  timeoutMs?: number;
  /** Nejvíc opakování při 429 / 5xx / výpadku sítě (u zápisu jen při 429 a 503), výchozí 2. */
  maxRetries?: number;
  baseUrl?: string;
};

const str = (v: unknown): string | null =>
  typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});

/** URL-safe Base64 (se zachovanými `=`), jak ho vyžaduje hlavička Basic pro získání tokenu. */
const b64url = (s: string): string =>
  Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_");

/** Srozumitelná hláška z chyby 422 (`errors` = pole → zprávy). */
function validationMessage(body: Json): string {
  const errors = obj(body.errors);
  const parts = Object.entries(errors).map(
    ([field, msgs]) => `${field}: ${[msgs].flat().map(String).join(", ")}`,
  );
  return parts.length ? `Fakturoid odmítl údaje (${parts.join("; ")}).` : "Fakturoid odmítl údaje.";
}

function toSubject(raw: unknown): FakturoidSubject {
  const r = obj(raw);
  return {
    id: str(r.id) ?? "",
    name: str(r.name) ?? "",
    registrationNo: str(r.registration_no),
  };
}

/**
 * Reálný klient Fakturoidu přes `fetch`: token z `POST /oauth/token` (client credentials, platí ~2 h, drží se v paměti),
 * hlavička `User-Agent` s kontaktem, časový limit, opakování při 429 a výpadcích a mapování chyb na `FakturoidError`.
 * Zápis (POST) se opakuje jen tam, kde požadavek jistě nebyl zpracován (429, 503); po časovém limitu se neopakuje,
 * duplicitě brání vyhledání faktury podle `custom_id` před dalším pokusem (řeší volající).
 */
export function createHttpFakturoidClient(
  config: FakturoidConfig,
  opts: HttpClientOptions = {},
): FakturoidClient {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxRetries = opts.maxRetries ?? 2;
  const base = opts.baseUrl ?? FAKTUROID_API;
  const account = `${base}/accounts/${encodeURIComponent(config.account)}`;
  const userAgent = `OPSYS (${config.contactEmail})`;
  let token: { value: string; expiresAt: number } | null = null;

  async function send(
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
  ): Promise<Response> {
    try {
      return await doFetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "TimeoutError" || name === "AbortError")
        throw new FakturoidError("timeout", "Fakturoid neodpověděl včas.");
      throw new FakturoidError("network", "Fakturoid se nepodařilo zavolat (chyba sítě).");
    }
  }

  async function errorOf(res: Response): Promise<FakturoidError> {
    let body: Json = {};
    try {
      body = obj(await res.json());
    } catch {
      /* tělo není JSON */
    }
    const s = res.status;
    if (s === 401)
      return new FakturoidError(
        "auth",
        "Fakturoid odmítl přihlášení. Zkontrolujte Client ID a Client Secret.",
        s,
      );
    if (s === 402)
      return new FakturoidError(
        "payment_required",
        "Účet ve Fakturoidu je zablokovaný kvůli neuhrazené faktuře Fakturoidu.",
        s,
      );
    if (s === 403)
      return new FakturoidError(
        "forbidden",
        "Fakturoid operaci nepovolil (limit odběratelů, chybějící bankovní účet nebo oprávnění).",
        s,
      );
    if (s === 404) return new FakturoidError("not_found", "Záznam ve Fakturoidu neexistuje.", s);
    if (s === 422) return new FakturoidError("validation", validationMessage(body), s);
    if (s === 429)
      return new FakturoidError(
        "rate_limit",
        "Fakturoid omezil počet požadavků, zkuste to později.",
        s,
      );
    if (s === 503 || s >= 500)
      return new FakturoidError("unavailable", "Fakturoid je dočasně nedostupný.", s);
    const detail = str(body.error_description) ?? str(body.error);
    return new FakturoidError(
      "unknown",
      `Fakturoid vrátil chybu ${s}${detail ? `: ${detail}` : ""}.`,
      s,
    );
  }

  async function ensureToken(force = false): Promise<string> {
    if (!force && token && token.expiresAt > now() + 60_000) return token.value;
    const res = await send(`${base}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${b64url(`${config.clientId}:${config.clientSecret}`)}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": userAgent,
      },
      body: JSON.stringify({ grant_type: "client_credentials" }),
    });
    if (!res.ok) {
      const e = await errorOf(res);
      throw e.code === "unknown" || e.status === 400
        ? new FakturoidError(
            "auth",
            "Fakturoid odmítl přihlášení. Zkontrolujte Client ID a Client Secret.",
            res.status,
          )
        : e;
    }
    const body = obj(await res.json());
    const value = str(body.access_token);
    if (!value) throw new FakturoidError("auth", "Fakturoid nevrátil přístupový token.");
    const ttl = typeof body.expires_in === "number" ? body.expires_in : 7200;
    token = { value, expiresAt: now() + ttl * 1000 };
    return value;
  }

  /** Jedno volání API s opakováním; vrací rozparsované JSON (nebo `null` při 204). */
  async function request(
    method: "GET" | "POST",
    path: string,
    o: { query?: Record<string, string>; body?: unknown } = {},
  ): Promise<unknown> {
    const qs = o.query ? `?${new URLSearchParams(o.query).toString()}` : "";
    const url = `${account}${path}${qs}`;
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      let res: Response | null = null;
      let failure: FakturoidError | null = null;
      try {
        const bearer = await ensureToken();
        res = await send(url, {
          method,
          headers: {
            Authorization: `Bearer ${bearer}`,
            Accept: "application/json",
            "User-Agent": userAgent,
            ...(o.body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          ...(o.body !== undefined ? { body: JSON.stringify(o.body) } : {}),
        });
      } catch (e) {
        failure = e instanceof FakturoidError ? e : new FakturoidError("network", "Chyba sítě.");
      }
      if (res && res.ok) {
        if (res.status === 204) return null;
        try {
          return await res.json();
        } catch {
          throw new FakturoidError("unknown", "Fakturoid vrátil nečitelnou odpověď.", res.status);
        }
      }
      if (res && res.status === 401 && !refreshed) {
        refreshed = true;
        token = null;
        continue;
      }
      const err = failure ?? (await errorOf(res!));
      const safeToRetry =
        method === "GET"
          ? err.code === "rate_limit" || err.code === "unavailable" || err.code === "network"
          : err.code === "rate_limit" || err.status === 503;
      if (!safeToRetry || attempt >= maxRetries) throw err;
      const retryAfter = Number(res?.headers.get("retry-after"));
      await sleep(Math.min(10_000, retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt));
    }
  }

  const toInvoice = (raw: unknown): FakturoidInvoice => {
    const r = obj(raw);
    const id = str(r.id) ?? "";
    return {
      id,
      number: str(r.number) ?? "",
      htmlUrl:
        str(r.html_url) ??
        `https://app.fakturoid.cz/${encodeURIComponent(config.account)}/invoices/${id}`,
      issuedOn: str(r.issued_on) ?? "",
      dueOn: str(r.due_on),
      total: Number(r.total ?? 0) || 0,
      customId: str(r.custom_id),
    };
  };

  return {
    async testConnection() {
      const a = obj(await request("GET", "/account.json"));
      return { account: str(a.subdomain) ?? config.account, name: str(a.name) ?? config.account };
    },
    async findSubjectByCustomId(customId) {
      const list = await request("GET", "/subjects.json", { query: { custom_id: customId } });
      const first = Array.isArray(list) ? list[0] : null;
      return first ? toSubject(first) : null;
    },
    async findSubjectByRegistrationNo(ico) {
      const list = await request("GET", "/subjects/search.json", { query: { query: ico } });
      const hit = (Array.isArray(list) ? list : [])
        .map(toSubject)
        .find((s) => s.registrationNo === ico);
      return hit ?? null;
    },
    async createSubject(input: FakturoidSubjectInput) {
      const body: Json = { name: input.name, custom_id: input.customId };
      const set = (k: string, v: string | null | undefined) => {
        if (v) body[k] = v;
      };
      set("registration_no", input.registrationNo);
      set("vat_no", input.vatNo);
      set("street", input.street);
      set("city", input.city);
      set("zip", input.zip);
      set("country", input.country);
      set("email", input.email);
      return toSubject(await request("POST", "/subjects.json", { body }));
    },
    async findInvoiceByCustomId(customId) {
      const list = await request("GET", "/invoices.json", { query: { custom_id: customId } });
      const first = Array.isArray(list) ? list[0] : null;
      return first ? toInvoice(first) : null;
    },
    async createInvoice(input: FakturoidInvoiceInput) {
      const body: Json = {
        subject_id: Number(input.subjectId),
        custom_id: input.customId,
        issued_on: input.issuedOn,
        currency: input.currency,
        lines: input.lines.map((l) => ({
          name: l.name,
          quantity: l.quantity,
          ...(l.unitName ? { unit_name: l.unitName } : {}),
          unit_price: l.unitPrice,
          vat_rate: l.vatRate,
        })),
        ...(input.note ? { note: input.note } : {}),
        ...(input.privateNote ? { private_note: input.privateNote } : {}),
      };
      const created = toInvoice(await request("POST", "/invoices.json", { body }));
      if (!created.id) throw new FakturoidError("unknown", "Fakturoid nevrátil id faktury.");
      return created;
    },
    async getInvoice(id) {
      try {
        return toInvoice(await request("GET", `/invoices/${encodeURIComponent(id)}.json`));
      } catch (e) {
        if (e instanceof FakturoidError && e.code === "not_found") return null;
        throw e;
      }
    },
  };
}
