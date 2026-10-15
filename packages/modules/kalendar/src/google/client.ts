/*
  Rozhraní adaptéru Google Kalendáře (`GoogleCalendarClient`), tvary dat Google Calendar API v3 a chyby. Skutečný klient
  (`real-client.ts`, `fetch` k Google API) a `fake-google.ts` (paměť, pro testy) ho implementují stejně. Zbytek modulu
  zná jen toto rozhraní, takže se dá celý tok (OAuth, synchronizace, push, konflikty) ověřit bez Googlu.
*/

/** Přístupové tokeny po výměně autorizačního kódu nebo obnově. `refreshToken` Google při obnově obvykle nevrací. */
export type GoogleTokens = {
  accessToken: string;
  refreshToken?: string;
  /** Okamžik vypršení přístupového tokenu (ms od epochy). */
  expiresAt: number;
  scope?: string;
};

/** Kalendář z `calendarList`. */
export type GoogleCalendarInfo = {
  id: string;
  summary: string;
  backgroundColor?: string;
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
  primary?: boolean;
  timeZone?: string;
};

/** Čas události: celodenní `date` (konec je výlučný), jinak `dateTime` s posunem. */
export type GoogleEventTime = { date?: string; dateTime?: string; timeZone?: string };

/** Účastník události v API. */
export type GoogleAttendee = {
  email: string;
  displayName?: string;
  responseStatus?: "accepted" | "declined" | "tentative" | "needsAction";
  self?: boolean;
  organizer?: boolean;
};

/** Událost tak, jak ji vrací API (jen pole, která modul čte). */
export type GoogleEvent = {
  id: string;
  status?: "confirmed" | "tentative" | "cancelled";
  etag?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  visibility?: "default" | "public" | "private" | "confidential";
  attendees?: GoogleAttendee[];
  organizer?: { email?: string; self?: boolean };
  /** U výskytu opakované události (`singleEvents=true`): hlavní událost a původní začátek výskytu. */
  recurringEventId?: string;
  originalStartTime?: GoogleEventTime;
  eventType?: string;
  extendedProperties?: { private?: Record<string, string>; shared?: Record<string, string> };
  /** Poslední změna v Googlu (RFC 3339). */
  updated?: string;
};

/** Co modul do Googlu zapisuje. */
export type GoogleEventInput = {
  summary?: string;
  description?: string | null;
  location?: string | null;
  start: GoogleEventTime;
  end: GoogleEventTime;
  visibility?: "default" | "public" | "private" | "confidential";
  attendees?: { email: string; displayName?: string }[];
  extendedProperties?: { private?: Record<string, string> };
  /** U obnovení smazané události (`confirmed`). */
  status?: "confirmed" | "cancelled";
};

/** Částečná změna události: `null` pole vymaže. */
export type GoogleEventPatch = {
  [K in keyof GoogleEventInput]?: GoogleEventInput[K] | null;
};

/** Možnosti zápisu. `sendUpdates: "none"` = Google nikomu nepošle e-mail (výchozí chování OPSYS, O-8). */
export type WriteOptions = {
  sendUpdates: "all" | "none";
  /** Založit odkaz na Google Meet. */
  conference?: boolean;
  /** Podmíněný zápis: pokud se `etag` mezitím změnil, Google vrátí 412. */
  ifMatch?: string;
};

/** Výsledek `events.list`. */
export type GoogleEventsPage = {
  events: GoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
};

/** Parametry `events.list`. Se `syncToken` se okno nezadává (API to zakazuje). */
export type ListEventsOptions = {
  syncToken?: string;
  timeMin?: string;
  timeMax?: string;
  pageToken?: string;
};

/** Push kanál (`events.watch`). */
export type WatchChannel = { id: string; address: string; token: string; ttlSeconds: number };

/** Potvrzený push kanál: `resourceId` je potřeba k jeho zastavení. */
export type WatchResult = { resourceId: string; expiration: Date };

/**
 * Adaptér Google Calendar API. Všechny metody po autorizaci berou přístupový token jako první parametr (token řeší
 * `accounts.ts`: dešifrování, obnova). Chyby jsou typované (`GoogleApiError` a potomci), aby volající rozlišil
 * „souhlas je třeba obnovit“ (`GoogleAuthError`) od „sync token vypršel“ (`GoogleGoneError`) a od dočasné chyby.
 */
export interface GoogleCalendarClient {
  /** Adresa souhlasu Googlu (`state` ověří návrat, `loginHint` předvyplní účet). */
  authUrl(input: { state: string; redirectUri: string; loginHint?: string }): string;
  /** Vymění autorizační kód za tokeny. */
  exchangeCode(code: string, redirectUri: string): Promise<GoogleTokens>;
  /** Obnoví přístupový token z obnovovacího; `GoogleAuthError` při `invalid_grant` (souhlas odvolán). */
  refresh(refreshToken: string): Promise<GoogleTokens>;
  /** Odvolá token (odpojení účtu); chyby se ignorují. */
  revoke(token: string): Promise<void>;
  listCalendars(accessToken: string): Promise<GoogleCalendarInfo[]>;
  /** Jedna stránka událostí (výskyty opakovaných jsou rozbalené). Neplatný `syncToken` = `GoogleGoneError`. */
  listEvents(
    accessToken: string,
    calendarId: string,
    options: ListEventsOptions,
  ): Promise<GoogleEventsPage>;
  /** Založí událost; existující `id` (i smazaná událost) = `GoogleConflictError`. */
  insertEvent(
    accessToken: string,
    calendarId: string,
    event: GoogleEventInput & { id?: string },
    options: WriteOptions,
  ): Promise<GoogleEvent>;
  patchEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    patch: GoogleEventPatch,
    options: WriteOptions,
  ): Promise<GoogleEvent>;
  /** Smaže událost; už smazanou nebo neexistující bere jako hotovo. */
  deleteEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    options: Pick<WriteOptions, "sendUpdates">,
  ): Promise<void>;
  watch(accessToken: string, calendarId: string, channel: WatchChannel): Promise<WatchResult>;
  stopChannel(accessToken: string, channel: { id: string; resourceId: string }): Promise<void>;
}

/** Společný předek chyb Google API. */
export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}
/** 401 nebo `invalid_grant`: přístup je neplatný, uživatel musí souhlas obnovit. */
export class GoogleAuthError extends GoogleApiError {
  constructor(message = "Přístup ke Google účtu už neplatí.", status = 401) {
    super(message, status, "auth");
    this.name = "GoogleAuthError";
  }
}
/** 410: sync token vypršel, je třeba úplná synchronizace. */
export class GoogleGoneError extends GoogleApiError {
  constructor(message = "Synchronizační token vypršel.") {
    super(message, 410, "gone");
    this.name = "GoogleGoneError";
  }
}
/** 409: událost s tímto id už existuje (i smazaná). */
export class GoogleConflictError extends GoogleApiError {
  constructor(message = "Událost s tímto id už existuje.") {
    super(message, 409, "duplicate");
    this.name = "GoogleConflictError";
  }
}
/** 412: událost se mezitím změnila (neshoda `etag`). */
export class GooglePreconditionError extends GoogleApiError {
  constructor(message = "Událost se mezitím změnila.") {
    super(message, 412, "conditionNotMet");
    this.name = "GooglePreconditionError";
  }
}
/** 404: kalendář nebo událost neexistuje. */
export class GoogleNotFoundError extends GoogleApiError {
  constructor(message = "Záznam v Googlu neexistuje.") {
    super(message, 404, "notFound");
    this.name = "GoogleNotFoundError";
  }
}
/** 429 a 403 s limitem: dočasné, opakovat později. */
export class GoogleRateLimitError extends GoogleApiError {
  constructor(message = "Google dočasně omezil počet požadavků.", status = 429) {
    super(message, status, "rateLimit");
    this.name = "GoogleRateLimitError";
  }
}

/** Rozsahy oprávnění, o které se žádá: události (čtení i zápis) a seznam kalendářů. Nic víc. */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
] as const;
