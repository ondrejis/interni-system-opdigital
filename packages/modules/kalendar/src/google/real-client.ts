import {
  GOOGLE_SCOPES,
  GoogleApiError,
  GoogleAuthError,
  GoogleConflictError,
  GoogleGoneError,
  GoogleNotFoundError,
  GooglePreconditionError,
  GoogleRateLimitError,
  type GoogleCalendarClient,
  type GoogleCalendarInfo,
  type GoogleEvent,
  type GoogleTokens,
} from "./client";

/*
  Skutečný klient Google Calendar API přes `fetch`. Žádné klíče v kódu: `clientId` a `clientSecret` dostane z nastavení
  (`settings.ts`, tajemství šifrovaně v DB). Volá se jen na pevně dané hostitele Googlu, takže nehrozí SSRF.
*/

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";
const TIMEOUT_MS = 20_000;

/** Přihlašovací údaje OAuth klienta (z nastavení). */
export type RealClientConfig = {
  clientId: string;
  clientSecret: string;
  /** Náhrada `fetch` (testy transportu). */
  fetch?: typeof fetch;
};

type ApiErrorBody = { error?: { code?: number; message?: string; errors?: { reason?: string }[] } };

/** Skutečný klient Google Calendar API. */
export function createGoogleClient(cfg: RealClientConfig): GoogleCalendarClient {
  const doFetch = cfg.fetch ?? fetch;

  async function raise(res: Response, what: string): Promise<never> {
    const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
    const reason = body.error?.errors?.[0]?.reason;
    const msg = `${what}: ${body.error?.message ?? res.statusText}`;
    if (res.status === 401) throw new GoogleAuthError(msg);
    if (res.status === 404) throw new GoogleNotFoundError(msg);
    if (res.status === 409) throw new GoogleConflictError(msg);
    if (res.status === 410) throw new GoogleGoneError(msg);
    if (res.status === 412) throw new GooglePreconditionError(msg);
    if (res.status === 429 || (res.status === 403 && /rate|quota/i.test(reason ?? "")))
      throw new GoogleRateLimitError(msg, res.status);
    if (res.status === 403) throw new GoogleAuthError(msg, 403);
    throw new GoogleApiError(msg, res.status, reason);
  }

  async function api<T>(
    token: string,
    method: string,
    path: string,
    opts: {
      query?: Record<string, string | undefined>;
      body?: unknown;
      headers?: Record<string, string>;
    } = {},
  ): Promise<T | null> {
    const url = new URL(path.startsWith("http") ? path : `${API}${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {}))
      if (v !== undefined) url.searchParams.set(k, v);
    const res = await doFetch(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
        ...opts.headers,
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return raise(res, `Google ${method} ${url.pathname}`);
    if (res.status === 204) return null;
    return (await res.json().catch(() => null)) as T | null;
  }

  async function tokenRequest(params: Record<string, string>): Promise<GoogleTokens> {
    const res = await doFetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        ...params,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !body.access_token) {
      if (body.error === "invalid_grant" || res.status === 401 || body.error === "invalid_client")
        throw new GoogleAuthError(body.error_description ?? "Souhlas Google účtu už neplatí.");
      throw new GoogleApiError(
        body.error_description ?? `Google token: ${res.status}`,
        res.status,
        body.error,
      );
    }
    return {
      accessToken: body.access_token,
      ...(body.refresh_token ? { refreshToken: body.refresh_token } : {}),
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
      ...(body.scope ? { scope: body.scope } : {}),
    };
  }

  const writeQuery = (o: { sendUpdates: string; conference?: boolean | undefined }) => ({
    sendUpdates: o.sendUpdates,
    conferenceDataVersion: o.conference ? "1" : undefined,
  });

  const conferenceBody = (conference: boolean | undefined) =>
    conference
      ? {
          conferenceData: {
            createRequest: {
              requestId: crypto.randomUUID(),
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }
      : {};

  return {
    authUrl({ state, redirectUri, loginHint }) {
      const u = new URL(AUTH_URL);
      u.search = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: GOOGLE_SCOPES.join(" "),
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state,
        ...(loginHint ? { login_hint: loginHint } : {}),
      }).toString();
      return u.toString();
    },
    exchangeCode: (code, redirectUri) =>
      tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    async refresh(refreshToken) {
      const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
      return { ...t, refreshToken };
    },
    async revoke(token) {
      await doFetch(REVOKE_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }).catch(() => {});
    },
    async listCalendars(token) {
      const out: GoogleCalendarInfo[] = [];
      let pageToken: string | undefined;
      do {
        const page = await api<{ items?: GoogleCalendarInfo[]; nextPageToken?: string }>(
          token,
          "GET",
          "/users/me/calendarList",
          { query: { maxResults: "250", minAccessRole: "freeBusyReader", pageToken } },
        );
        out.push(...(page?.items ?? []));
        pageToken = page?.nextPageToken;
      } while (pageToken);
      return out;
    },
    async listEvents(token, calendarId, o) {
      const page = await api<{
        items?: GoogleEvent[];
        nextPageToken?: string;
        nextSyncToken?: string;
      }>(token, "GET", `/calendars/${encodeURIComponent(calendarId)}/events`, {
        query: {
          singleEvents: "true",
          maxResults: "250",
          syncToken: o.syncToken,
          timeMin: o.syncToken ? undefined : o.timeMin,
          timeMax: o.syncToken ? undefined : o.timeMax,
          pageToken: o.pageToken,
        },
      });
      return {
        events: page?.items ?? [],
        ...(page?.nextPageToken ? { nextPageToken: page.nextPageToken } : {}),
        ...(page?.nextSyncToken ? { nextSyncToken: page.nextSyncToken } : {}),
      };
    },
    async insertEvent(token, calendarId, event, o) {
      const res = await api<GoogleEvent>(
        token,
        "POST",
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          query: writeQuery(o),
          body: { ...event, ...conferenceBody(o.conference) },
        },
      );
      return res!;
    },
    async patchEvent(token, calendarId, eventId, patch, o) {
      const res = await api<GoogleEvent>(
        token,
        "PATCH",
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        {
          query: writeQuery(o),
          body: { ...patch, ...conferenceBody(o.conference) },
          ...(o.ifMatch ? { headers: { "if-match": o.ifMatch } } : {}),
        },
      );
      return res!;
    },
    async deleteEvent(token, calendarId, eventId, o) {
      try {
        await api(
          token,
          "DELETE",
          `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
          { query: { sendUpdates: o.sendUpdates } },
        );
      } catch (e) {
        if (e instanceof GoogleNotFoundError || e instanceof GoogleGoneError) return;
        throw e;
      }
    },
    async watch(token, calendarId, channel) {
      const res = await api<{ resourceId: string; expiration?: string }>(
        token,
        "POST",
        `/calendars/${encodeURIComponent(calendarId)}/events/watch`,
        {
          body: {
            id: channel.id,
            type: "web_hook",
            address: channel.address,
            token: channel.token,
            params: { ttl: String(channel.ttlSeconds) },
          },
        },
      );
      return {
        resourceId: res!.resourceId,
        expiration: new Date(Number(res?.expiration ?? Date.now() + channel.ttlSeconds * 1000)),
      };
    },
    async stopChannel(token, channel) {
      await api(token, "POST", "/channels/stop", { body: channel }).catch(() => {});
    },
  };
}
