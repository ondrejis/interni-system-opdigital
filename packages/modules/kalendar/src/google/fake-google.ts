import {
  GOOGLE_SCOPES,
  GoogleAuthError,
  GoogleConflictError,
  GoogleGoneError,
  GoogleNotFoundError,
  GooglePreconditionError,
  type GoogleCalendarClient,
  type GoogleCalendarInfo,
  type GoogleEvent,
  type GoogleEventInput,
  type GoogleEventPatch,
  type GoogleTokens,
  type WriteOptions,
} from "./client";

/*
  `fake-google`: Google Calendar v paměti pro testy (implementuje `GoogleCalendarClient`). Chová se jako API tam, kde
  na tom modul stojí: tokeny s vypršením a obnovou, `syncToken` (přírůstky včetně smazaných, vypršení = 410), `etag`
  a `If-Match`, smazaná událost zůstává jako náhrobek (409 při znovuvložení stejného id), push kanály, odkaz na Meet
  a záznam všech volání (`calls`), takže test ověří např. že se bez „Poslat pozvánky“ nic neodeslalo (`sendUpdates`).
  Výskyty opakovaných událostí si test vloží sám (jako je vrací `singleEvents=true`).
*/

type StoredEvent = GoogleEvent & { _seq: number };
type FakeCalendar = { info: GoogleCalendarInfo; events: Map<string, StoredEvent> };
type FakeAccount = {
  email: string;
  refreshToken: string;
  refreshValid: boolean;
  accessTokens: Map<string, number>;
  calendars: Map<string, FakeCalendar>;
};

/** Zaznamenané volání zápisu. */
export type FakeCall = {
  op: "insert" | "patch" | "delete" | "watch" | "stop" | "list";
  calendarId: string;
  eventId?: string;
  sendUpdates?: "all" | "none";
  conference?: boolean;
  syncToken?: string | undefined;
};

/** Hlavičky, které by Google poslal na webhook (`X-Goog-*`). */
export type FakePing = Record<string, string>;

/** Fake Google: klient a ovládání (účty, kalendáře, události „zvenku“, push, vypršení tokenů). */
export type FakeGoogle = ReturnType<typeof createFakeGoogle>;

/** Založí prázdný fake Google. `now` lze nahradit řízenými hodinami. */
export function createFakeGoogle(opts: { now?: () => number } = {}) {
  const now = opts.now ?? (() => Date.now());
  const accounts = new Map<string, FakeAccount>();
  const calls: FakeCall[] = [];
  const channels = new Map<
    string,
    {
      calendarId: string;
      email: string;
      token: string;
      resourceId: string;
      address: string;
      expiration: number;
    }
  >();
  const stopped: string[] = [];
  let seq = 0;
  let tokenCounter = 0;
  let minValidSeq = 0; // sync tokeny starší než tato hodnota jsou „vypršelé“
  let idCounter = 0;

  const iso = () => new Date(now()).toISOString();
  const etagOf = (n: number) => `"fake-${n}"`;

  function accountByAccess(token: string): FakeAccount {
    for (const a of accounts.values()) {
      const exp = a.accessTokens.get(token);
      if (exp !== undefined) {
        if (exp <= now()) throw new GoogleAuthError("Přístupový token vypršel.");
        return a;
      }
    }
    throw new GoogleAuthError("Neznámý přístupový token.");
  }
  function cal(token: string, calendarId: string) {
    const a = accountByAccess(token);
    const c = a.calendars.get(calendarId);
    if (!c) throw new GoogleNotFoundError("Kalendář neexistuje.");
    return { a, c };
  }
  function issue(a: FakeAccount, withRefresh: boolean): GoogleTokens {
    const accessToken = `fake-at-${a.email}-${++tokenCounter}`;
    const expiresAt = now() + 3600_000;
    a.accessTokens.set(accessToken, expiresAt);
    return {
      accessToken,
      ...(withRefresh ? { refreshToken: a.refreshToken } : {}),
      expiresAt,
      scope: GOOGLE_SCOPES.join(" "),
    };
  }
  const overlaps = (e: GoogleEvent, min?: string, max?: string) => {
    const s = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00Z` : "");
    const en = e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00Z` : s);
    if (min && new Date(en) <= new Date(min)) return false;
    if (max && new Date(s) >= new Date(max)) return false;
    return true;
  };
  function touch(c: FakeCalendar, e: StoredEvent) {
    e._seq = ++seq;
    e.etag = etagOf(e._seq);
    e.updated = iso();
    c.events.set(e.id, e);
  }
  function applyInput(
    e: StoredEvent,
    input: GoogleEventPatch | GoogleEventInput,
    conference?: boolean,
  ) {
    for (const [k, v] of Object.entries(input)) {
      if (v === null) delete (e as Record<string, unknown>)[k];
      else if (k === "extendedProperties")
        e.extendedProperties = {
          ...e.extendedProperties,
          private: {
            ...e.extendedProperties?.private,
            ...(v as { private?: Record<string, string> }).private,
          },
        };
      else if (k === "attendees")
        e.attendees = (v as { email: string; displayName?: string }[]).map((a) => ({
          email: a.email,
          ...(a.displayName ? { displayName: a.displayName } : {}),
          responseStatus: "needsAction" as const,
        }));
      else (e as Record<string, unknown>)[k] = v;
    }
    if (conference && !e.hangoutLink) {
      e.hangoutLink = `https://meet.google.com/fake-${++idCounter}`;
      e.conferenceData = { entryPoints: [{ entryPointType: "video", uri: e.hangoutLink }] };
    }
  }

  const client: GoogleCalendarClient = {
    authUrl: ({ state, redirectUri, loginHint }) =>
      `https://fake.google.test/auth?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}${loginHint ? `&login_hint=${encodeURIComponent(loginHint)}` : ""}`,
    async exchangeCode(code) {
      const email = code.startsWith("fake-code:") ? code.slice("fake-code:".length) : null;
      const a = email ? accounts.get(email) : undefined;
      if (!a) throw new GoogleAuthError("Neplatný autorizační kód.");
      a.refreshValid = true;
      return issue(a, true);
    },
    async refresh(refreshToken) {
      const a = [...accounts.values()].find((x) => x.refreshToken === refreshToken);
      if (!a || !a.refreshValid) throw new GoogleAuthError("invalid_grant");
      return issue(a, true);
    },
    async revoke(token) {
      for (const a of accounts.values())
        if (token === a.refreshToken || a.accessTokens.has(token)) a.refreshValid = false;
    },
    async listCalendars(token) {
      return [...accountByAccess(token).calendars.values()].map((c) => c.info);
    },
    async listEvents(token, calendarId, o) {
      const { c } = cal(token, calendarId);
      calls.push({ op: "list", calendarId, syncToken: o.syncToken });
      let items: StoredEvent[];
      if (o.syncToken) {
        const since = Number(o.syncToken.replace("st-", ""));
        if (!Number.isFinite(since) || since < minValidSeq) throw new GoogleGoneError();
        items = [...c.events.values()].filter((e) => e._seq > since);
      } else {
        items = [...c.events.values()].filter(
          (e) => e.status !== "cancelled" && overlaps(e, o.timeMin, o.timeMax),
        );
      }
      items.sort((a, b) => a._seq - b._seq);
      const start = o.pageToken ? Number(o.pageToken) : 0;
      const pageSize = 50;
      const slice = items.slice(start, start + pageSize);
      const more = start + pageSize < items.length;
      return {
        events: slice.map(({ _seq: _s, ...e }) => structuredClone(e)),
        ...(more ? { nextPageToken: String(start + pageSize) } : { nextSyncToken: `st-${seq}` }),
      };
    },
    async insertEvent(token, calendarId, event, o: WriteOptions) {
      const { c } = cal(token, calendarId);
      const id = event.id ?? `fake${++idCounter}`;
      calls.push({
        op: "insert",
        calendarId,
        eventId: id,
        sendUpdates: o.sendUpdates,
        ...(o.conference ? { conference: true } : {}),
      });
      if (c.events.has(id)) throw new GoogleConflictError();
      const { id: _id, ...input } = event;
      const e: StoredEvent = {
        id,
        status: "confirmed",
        _seq: 0,
        htmlLink: `https://calendar.google.test/e/${id}`,
      };
      applyInput(e, input, o.conference);
      if (!e.organizer) e.organizer = { email: accountByAccess(token).email, self: true };
      touch(c, e);
      const { _seq: _s, ...out } = e;
      return structuredClone(out);
    },
    async patchEvent(token, calendarId, eventId, patch, o) {
      const { c } = cal(token, calendarId);
      calls.push({
        op: "patch",
        calendarId,
        eventId,
        sendUpdates: o.sendUpdates,
        ...(o.conference ? { conference: true } : {}),
      });
      const e = c.events.get(eventId);
      if (!e) throw new GoogleNotFoundError();
      if (o.ifMatch && o.ifMatch !== e.etag) throw new GooglePreconditionError();
      applyInput(e, patch, o.conference);
      touch(c, e);
      const { _seq: _s, ...out } = e;
      return structuredClone(out);
    },
    async deleteEvent(token, calendarId, eventId, o) {
      const { c } = cal(token, calendarId);
      calls.push({ op: "delete", calendarId, eventId, sendUpdates: o.sendUpdates });
      const e = c.events.get(eventId);
      if (!e || e.status === "cancelled") return;
      e.status = "cancelled";
      touch(c, e);
    },
    async watch(token, calendarId, channel) {
      const { a } = cal(token, calendarId);
      calls.push({ op: "watch", calendarId });
      const resourceId = `res-${channel.id.slice(0, 8)}`;
      const expiration = now() + channel.ttlSeconds * 1000;
      channels.set(channel.id, {
        calendarId,
        email: a.email,
        token: channel.token,
        resourceId,
        address: channel.address,
        expiration,
      });
      return { resourceId, expiration: new Date(expiration) };
    },
    async stopChannel(token, channel) {
      accountByAccess(token);
      calls.push({ op: "stop", calendarId: channel.id });
      stopped.push(channel.id);
      channels.delete(channel.id);
    },
  };

  /** Autorizační kód, který `exchangeCode` přijme (simulace návratu ze souhlasu). */
  const codeFor = (email: string) => `fake-code:${email}`;

  return {
    client,
    calls,
    stoppedChannels: stopped,
    codeFor,
    /** Založí Google účet s primárním kalendářem (id = e-mail). */
    addAccount(email: string, calendarName = email) {
      accounts.set(email, {
        email,
        refreshToken: `fake-rt-${email}`,
        refreshValid: true,
        accessTokens: new Map(),
        calendars: new Map([
          [
            email,
            {
              info: {
                id: email,
                summary: calendarName,
                accessRole: "owner",
                primary: true,
                timeZone: "Europe/Prague",
                backgroundColor: "#4285f4",
              },
              events: new Map(),
            },
          ],
        ]),
      });
      return codeFor(email);
    },
    addCalendar(
      email: string,
      info: Partial<GoogleCalendarInfo> & { id: string; summary: string },
    ) {
      accounts.get(email)!.calendars.set(info.id, {
        info: { accessRole: "owner", ...info },
        events: new Map(),
      });
    },
    /** Událost vytvořená nebo změněná „v Googlu“ (mimo OPSYS). */
    putEvent(email: string, calendarId: string, event: GoogleEvent) {
      const c = accounts.get(email)!.calendars.get(calendarId)!;
      const prev = c.events.get(event.id);
      const e: StoredEvent = {
        status: "confirmed",
        organizer: { email, self: true },
        ...prev,
        ...event,
        _seq: 0,
      };
      if (!e.htmlLink) e.htmlLink = `https://calendar.google.test/e/${e.id}`;
      touch(c, e);
      return structuredClone({ ...e, _seq: undefined });
    },
    /** Smazání „v Googlu“. */
    removeEvent(email: string, calendarId: string, eventId: string) {
      const c = accounts.get(email)!.calendars.get(calendarId)!;
      const e = c.events.get(eventId);
      if (!e) return;
      e.status = "cancelled";
      touch(c, e);
    },
    getEvent(email: string, calendarId: string, eventId: string): GoogleEvent | undefined {
      const e = accounts.get(email)?.calendars.get(calendarId)?.events.get(eventId);
      if (!e) return undefined;
      const { _seq: _s, ...out } = e;
      return structuredClone(out);
    },
    /** Živé (nesmazané) události kalendáře. */
    events(email: string, calendarId = email): GoogleEvent[] {
      return [...accounts.get(email)!.calendars.get(calendarId)!.events.values()]
        .filter((e) => e.status !== "cancelled")
        .map(({ _seq: _s, ...e }) => structuredClone(e));
    },
    /** Všechny dosud vydané synchronizační tokeny přestanou platit (410). */
    expireSyncTokens() {
      minValidSeq = seq + 1;
    },
    /** Přístupové tokeny účtu vyprší (příští volání skončí 401 a klient obnoví token). */
    expireAccessTokens(email: string) {
      for (const t of accounts.get(email)!.accessTokens.keys())
        accounts.get(email)!.accessTokens.set(t, 0);
    },
    /** Uživatel odvolal souhlas: obnova tokenu skončí `invalid_grant`. */
    revokeConsent(email: string) {
      const a = accounts.get(email)!;
      a.refreshValid = false;
      for (const t of a.accessTokens.keys()) a.accessTokens.set(t, 0);
    },
    channelsOf(email: string, calendarId = email) {
      return [...channels.entries()]
        .filter(([, c]) => c.email === email && c.calendarId === calendarId)
        .map(([id, c]) => ({ id, ...c }));
    },
    /** Hlavičky, které by Google poslal na webhook po změně kalendáře (první aktivní kanál). */
    ping(email: string, calendarId = email, state: "exists" | "sync" = "exists"): FakePing | null {
      const ch = this.channelsOf(email, calendarId)[0];
      if (!ch) return null;
      return {
        "x-goog-channel-id": ch.id,
        "x-goog-channel-token": ch.token,
        "x-goog-resource-id": ch.resourceId,
        "x-goog-resource-state": state,
      };
    },
    clearCalls() {
      calls.length = 0;
    },
  };
}
