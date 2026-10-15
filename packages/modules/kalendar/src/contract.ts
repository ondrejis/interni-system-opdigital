/*
  Kontrakt příkazů modulu „kalendar“: zod vstupy a TypeScript tvary výstupů (M1 agenta KAL-A). Soubor je klientsky
  bezpečný (žádné importy serveru a databáze), čte ho server, UI (KAL-B) i testy: `@rebar/kalendar/contract`.

  Model: každý uživatel si připojí vlastní Google účet (`kalendar.connect.start`), vybere zobrazované kalendáře
  a kalendář pro zápis. Události z Googlu jsou zrcadlo (zdroj pravdy je Google); schůzky a hovory z modulu `ukoly`
  se do Googlu zapisují jako události navázané na úkol (`taskId`). Cizí soukromé události se ukazují jen jako „Obsazeno“.
*/
import { z } from "zod";

/* ---------- konstanty ---------- */

/** Název, pod kterým se druhému uživateli ukáže soukromá událost (bez místa, účastníků a vazeb). */
export const BUSY_TITLE = "Obsazeno";
/** Časová zóna, ve které kalendář pracuje. */
export const CALENDAR_TIME_ZONE = "Europe/Prague";
/** Pracovní doba zvýrazněná v kalendáři (KAL-03). */
export const WORK_HOURS = { from: "08:00", to: "18:00" } as const;
/** Nejdelší okno, které `kalendar.range` vrátí najednou (dny). */
export const MAX_RANGE_DAYS = 400;
/** Stav propojení účtu: `ok`, `reauth` (je třeba souhlas obnovit), `error` (poslední volání selhalo). */
export const ACCOUNT_STATUSES = ["ok", "reauth", "error"] as const;
/** Stav propojení účtu s Googlem. */
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
/** Oprávnění ke kalendáři v Googlu. */
export const ACCESS_ROLES = ["owner", "writer", "reader", "freeBusyReader"] as const;
/** Oprávnění ke kalendáři v Googlu. */
export type AccessRole = (typeof ACCESS_ROLES)[number];
/** Odkud událost pochází: z Googlu, nebo z úkolu v OPSYS (schůzka, hovor). */
export const ITEM_SOURCES = ["google", "opsys"] as const;
/** Odkud událost pochází. */
export type ItemSource = (typeof ITEM_SOURCES)[number];
/** Druh položky v kalendáři (stejné druhy jako dřívější kalendář, řadí je `day-order`). */
export const ITEM_KINDS = ["event", "busy", "layer", "holiday"] as const;
/** Druh položky v kalendáři. */
export type ItemKind = (typeof ITEM_KINDS)[number];

/* ---------- stavební kameny ---------- */

const id = z.uuid();
const isoDate = z.iso.date("Vyplňte datum.");
/** Okamžik (ISO 8601 s posunem nebo `Z`); ukládá se jako UTC. */
const instant = z.iso.datetime({ offset: true });
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v ? v : null));

/** Účastník události z Googlu (zrcadlo odpovědi API, bez tajemství). */
export type EventAttendee = {
  email: string;
  name?: string;
  responseStatus?: "accepted" | "declined" | "tentative" | "needsAction";
  self?: boolean;
  organizer?: boolean;
};

/* ---------- vstupy příkazů ---------- */

/** `kalendar.range`: položky kalendáře v okně (události, obsazeno, vrstvy ostatních modulů, svátky). */
export const rangeInput = z.object({
  from: isoDate,
  to: isoDate,
  /** `me` = jen moje kalendáře; `all` = i kalendáře ostatních (jen s rozsahem „vše“, cizí soukromé jako „Obsazeno“). */
  who: z.enum(["me", "all"]).default("me"),
  /** Klíče vrstev ostatních modulů; bez zadání všechny. */
  layers: z.array(z.string().max(80)).max(30).optional(),
});
/** Vstup `kalendar.range`. */
export type RangeInput = z.input<typeof rangeInput>;

/** `kalendar.account`: stav mého propojení a zdroje ostatních (bez vstupu). */
export const accountInput = z.object({});

/** `kalendar.connect.start`: adresa, na kterou se přesměruje souhlas Googlu. */
export const connectStartInput = z.object({
  /** Relativní cesta, kam se uživatel po návratu vrátí (výchozí `/nastaveni/google-kalendar`). */
  returnTo: z
    .string()
    .max(200)
    .regex(/^\/(?!\/)[A-Za-z0-9/_\-?=&%.]*$/, "Neplatná cesta.")
    .optional(),
});

/** `kalendar.disconnect`: odpojí můj Google účet (zastaví push, smaže zrcadlo událostí a tokeny). */
export const disconnectInput = z.object({});

/** `kalendar.calendars.refresh`: znovu načte seznam kalendářů z Googlu. */
export const refreshCalendarsInput = z.object({});

/** `kalendar.toggleCalendar`: zobrazit/skrýt kalendář (skrytý se nesynchronizuje). */
export const toggleCalendarInput = z.object({ calendarId: id, visible: z.boolean() });

/** `kalendar.setWriteTarget`: kalendář, do kterého se zapisují nové schůzky a hovory z OPSYS. */
export const setWriteTargetInput = z.object({ calendarId: id });

/** `kalendar.sync`: ruční synchronizace („Synchronizovat teď“). */
export const syncInput = z.object({});

/** `kalendar.test`: ověří, že uložený přístup k Googlu funguje (NFR-13). */
export const testInput = z.object({});

/** `kalendar.createMeeting`: schůzka z kalendáře (tažením). S modulem `ukoly` vznikne úkol typu Schůzka, jinak jen událost v Googlu. */
export const createMeetingInput = z
  .object({
    title: z.string().trim().min(1, "Vyplňte název schůzky.").max(300),
    startsAt: instant,
    endsAt: instant,
    allDay: z.boolean().optional(),
    place: optText(300),
    description: optText(20000),
    /** E-maily účastníků. */
    attendeeEmails: z.array(z.email().max(200)).max(50).optional(),
    /** „Poslat pozvánky“: výchozí vypnuto (O-8); bez přepínače se účastníci do Googlu nezapisují vůbec. */
    sendInvites: z.boolean().optional(),
    /** Založit odkaz na Google Meet. */
    addMeet: z.boolean().optional(),
    /** Řešitel (výchozí já); schůzka se zapíše do Google kalendáře řešitele. */
    assigneeId: id.nullish(),
    dealId: id.nullish(),
    companyId: id.nullish(),
    personId: id.nullish(),
    jobId: id.nullish(),
    /** Soukromá schůzka: v Googlu s příznakem „soukromé“ (druhý uživatel vidí jen „Obsazeno“). */
    isPrivate: z.boolean().optional(),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), "Konec musí být po začátku.");
/** Vstup `kalendar.createMeeting`. */
export type CreateMeetingInput = z.input<typeof createMeetingInput>;

/** `kalendar.move`: přesun nebo změna délky události tažením (propíše se do Googlu; u úkolu i do úkolu). */
export const moveInput = z
  .object({
    eventId: id,
    startsAt: instant,
    endsAt: instant,
    allDay: z.boolean().optional(),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), "Konec musí být po začátku.");
/** Vstup `kalendar.move`. */
export type MoveInput = z.input<typeof moveInput>;

/** `kalendar.delete`: smaže událost v Googlu (u události navázané na úkol i úkol, do koše). */
export const deleteEventInput = z.object({ eventId: id });

/** `kalendar.link`: vazba události na obchod, organizaci, kontakt (`null` vazbu odebere, nezadáno ji ponechá). */
export const linkInput = z.object({
  eventId: id,
  dealId: id.nullish(),
  companyId: id.nullish(),
  personId: id.nullish(),
});
/** Vstup `kalendar.link`. */
export type LinkInput = z.input<typeof linkInput>;

/** `kalendar.suggestLinks`: návrh vazeb podle shody e-mailu účastníka s kontaktem. */
export const suggestLinksInput = z.object({ eventId: id });

/** `kalendar.forRecord`: události navázané na obchod, organizaci nebo kontakt (záložky, historie). */
export const forRecordInput = z
  .object({
    dealId: id.optional(),
    companyId: id.optional(),
    personId: id.optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .refine((v) => !!(v.dealId || v.companyId || v.personId), "Zadejte obchod, firmu nebo kontakt.");

/** `kalendar.settings.get`: nastavení Google OAuth klienta a pravidel zápisu (jen správce). */
export const settingsGetInput = z.object({});

/** `kalendar.settings.save`: uloží nastavení; prázdné tajemství znamená „ponechat uložené“. */
export const settingsSaveInput = z.object({
  clientId: z.string().trim().max(300).optional(),
  clientSecret: z.string().trim().max(300).optional(),
  /** R-14: soukromá schůzka se do Googlu zapíše s příznakem „soukromé“ (jinak se vůbec nezapisuje). */
  privateMeetingsToGoogle: z.boolean().optional(),
});
/** Vstup `kalendar.settings.save`. */
export type SettingsSaveInput = z.input<typeof settingsSaveInput>;

/* ---------- výstupy příkazů ---------- */

/** Kalendář z Google účtu pro UI (výběr zobrazovaných a cíl zápisu). */
export type CalendarDto = {
  id: string;
  googleId: string;
  name: string;
  color: string | null;
  visible: boolean;
  isWriteTarget: boolean;
  isPrimary: boolean;
  accessRole: AccessRole;
  /** Do kalendáře jde zapisovat (`owner`/`writer`). */
  canWrite: boolean;
  /** Push kanál běží (změny z Googlu dorazí hned); jinak jen pravidelná synchronizace. */
  push: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
};

/** Propojený Google účet uživatele. */
export type AccountDto = {
  id: string;
  userId: string;
  googleEmail: string;
  status: AccountStatus;
  lastSyncAt: string | null;
  lastError: string | null;
  calendars: CalendarDto[];
};

/** Kalendáře jiného uživatele, které smím vidět (vrstva „Patrikovy kalendáře“). */
export type SourceDto = {
  userId: string;
  userName: string;
  calendars: { id: string; name: string; color: string | null }[];
};

/** Odpověď `kalendar.account`. */
export type AccountState = {
  /** Google OAuth klient je v nastavení vyplněný (jinak se nedá připojit). */
  configured: boolean;
  /** Můj účet, nebo `null` (bez Googlu kalendář ukazuje jen úkoly a schůzky z OPSYS, KAL-09). */
  mine: AccountDto | null;
  /** Kalendáře ostatních uživatelů (jen s rozsahem „vše“). */
  others: SourceDto[];
  canWrite: boolean;
  canSeeAll: boolean;
};

/** Odkaz na jiný záznam (obchod, organizace, kontakt) s názvem; soukromý nebo nedostupný záznam se nevrací. */
export type LinkRef = { id: string; title: string | null };

/**
 * Položka kalendáře. Tvar odpovídá dřívějšímu kalendáři (`kind`, místní `start`/`end`), takže ho zná `day-order`.
 * Soukromá cizí událost má `kind: "busy"`, `title: "Obsazeno"` a prázdné místo, účastníky, odkazy a vazby.
 */
export type CalendarItemDto = {
  /** `calendar_event.id` u událostí, `<vrstva>:<id>` u vrstev, `holiday:<datum>` u svátků. */
  id: string;
  kind: ItemKind;
  layer: string | null;
  title: string;
  /** Celodenní: `YYYY-MM-DD`; jinak místní `YYYY-MM-DDTHH:mm` (Europe/Prague). */
  start: string;
  /** Celodenní: poslední den včetně; jinak místní konec. */
  end: string;
  allDay: boolean;
  /** Přesný začátek a konec jako ISO okamžik (jen události; u vrstev `null`). */
  startsAt: string | null;
  endsAt: string | null;
  color: string;
  href: string | null;
  eventId: string | null;
  /** Úkol (schůzka, hovor) v modulu `ukoly`, ke kterému událost patří. */
  taskId: string | null;
  location: string | null;
  meetUrl: string | null;
  description: string | null;
  calendarId: string | null;
  calendarName: string | null;
  owner: string | null;
  ownerId: string | null;
  /** Událost je z mého kalendáře (v přeplněném dni se řadí přednostně). */
  own: boolean;
  attendees: EventAttendee[];
  recurring: boolean;
  /** Smím událost přesouvat a upravovat (oprávnění, rozsah a role v Googlu). */
  canEdit: boolean;
  source: ItemSource | null;
  deal: LinkRef | null;
  company: LinkRef | null;
  person: LinkRef | null;
  /** Odkaz na událost v Google Kalendáři. */
  htmlLink: string | null;
};

/** Vrstva ostatního modulu (úkoly s termínem, termíny zakázek…). */
export type LayerMetaDto = { key: string; label: string; color: string };

/** Odpověď `kalendar.range`. */
export type RangeResult = {
  items: CalendarItemDto[];
  layers: LayerMetaDto[];
  canWrite: boolean;
  canSeeAll: boolean;
  /** Mám připojený Google účet (jinak jsou vidět jen úkoly a schůzky z OPSYS). */
  connected: boolean;
};

/** Odpověď `kalendar.connect.start`. */
export type ConnectStartResult = { url: string };

/** Odpověď `kalendar.sync`. */
export type SyncResult = { calendars: number; changed: number; errors: string[] };

/** Odpověď `kalendar.test`. */
export type TestResult = { ok: boolean; message: string; status: AccountStatus | null };

/** Odpověď `kalendar.createMeeting`. */
export type CreateMeetingResult = {
  taskId: string | null;
  eventId: string | null;
  /** Schůzka je zatím jen v OPSYS (Google není připojený nebo zápis čeká na zpracování). */
  pending: boolean;
};

/** Návrh vazby: kontakt (a jeho organizace, otevřené obchody) podle e-mailu účastníka. */
export type LinkSuggestion = {
  email: string;
  personId: string;
  personName: string;
  companyId: string | null;
  companyName: string | null;
  deals: { id: string; title: string }[];
};

/** Odpověď `kalendar.suggestLinks`. */
export type SuggestLinksResult = { suggestions: LinkSuggestion[] };

/** Odpověď `kalendar.settings.get` (tajemství se nikdy nevrací, jen zda je vyplněné). */
export type CalendarSettingsDto = {
  clientId: string;
  clientSecretSet: boolean;
  privateMeetingsToGoogle: boolean;
  /** Adresa, kterou je třeba zadat v Google Cloud Console jako „Authorized redirect URI“. */
  redirectUri: string;
  /** Adresa push kanálů; jen `https` (jinak se používá jen pravidelná synchronizace). */
  webhookUrl: string;
  /** Adresa aplikace je `https`, takže Google může volat webhook. */
  pushAvailable: boolean;
};
