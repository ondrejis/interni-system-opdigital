/*
  Katalog událostí upozornění. Událost je datový popis (klíč, český popis, příjemci, závažnost, kanály, šablona textu);
  logika doručení je jedna, v jádru. Moduly své události deklarují v manifestu (`notifications`), jádro je nezná.
  Definice jsou čistá data bez závislostí, takže manifest smí zůstat lehký a bezpečný pro prohlížeč.
*/

export const CHANNELS = ["push", "bell", "email"] as const;
/** `bell` = zvoneček (Inbox v aplikaci), `push` = upozornění do zařízení, `email` = e-mail. */
export type Channel = (typeof CHANNELS)[number];
export type ChannelFlags = Record<Channel, boolean>;

export const CHANNEL_LABELS: Record<Channel, string> = {
  push: "Do telefonu",
  bell: "Zvoneček",
  email: "E-mail",
};

/** `urgent` prosadí tiché hodiny i shrnutí a má vyšší prioritu u push služby. */
export type Severity = "normal" | "urgent";

export const SEVERITY_LABELS: Record<Severity, string> = {
  normal: "Běžné",
  urgent: "Naléhavé",
};

export type ParamDef = {
  /** Co hodnota znamená (ukáže se správci při úpravě textu). */
  label: string;
  /** Ukázková hodnota do náhledu šablony. */
  example: string;
  /**
   * Citlivá hodnota: dostane ji jen příjemce s oprávněním. `"money"` = částky (oprávnění viz `MONEY_PERMISSIONS`),
   * pole = stačí kterékoli z uvedených oprávnění. Ostatním se z textu vynechá i s okolním oddělovačem.
   */
  sensitive?: "money" | readonly string[];
};

export type NotificationTemplate = {
  /** Text s `{parametry}`. Titulek je krátký, vejde se do jednoho řádku upozornění. */
  title: string;
  /** Podtitulek (volitelný); řádek, který obsahuje nedostupný parametr, se vynechá. */
  body?: string;
  /** Odkaz v aplikaci: musí začínat `/`. Parametry se do něj vkládají zakódované; navíc je k dispozici `{entityId}`. */
  url: string;
};

/** Kdy se stejná událost nesmí vytvořit dvakrát: `record` = jednou pro záznam, `day` = jednou za den a záznam. */
export type DedupeMode = "none" | "record" | "day";

export type NotificationEventDef<
  K extends string = string,
  P extends string = string,
  A extends string = string,
> = {
  /** Stabilní klíč, např. `comment.mention`, `stroje.deadline`. Na klíč se odkazují nastavení klienta i předvolby uživatelů. */
  key: K;
  /** Krátký název do nastavení: „Přidělen úkol“. */
  label: string;
  /** Kdy a komu upozornění přijde (česky, jednou větou). */
  description: string;
  /** Skupina v nastavení: „Úkoly“, „Zakázky“, „Stroje“… */
  group: string;
  severity: Severity;
  /** Výchozí kanály (klient i uživatel je mohou změnit). */
  channels: Partial<ChannelFlags>;
  /** Pojmenované skupiny příjemců, které při vyvolání události dodá volající (např. `assignee`, `team`). */
  audiences: Record<A, string>;
  /**
   * Výchozí příjemci: názvy skupin z `audiences`, `perm:<oprávnění>` (všichni s oprávněním) nebo `role:<klíč role>`.
   * Správce klienta je v Nastavení může změnit.
   */
  recipients: readonly string[];
  params: Record<P, ParamDef>;
  template: NotificationTemplate;
  /**
   * Typ záznamu, kterého se událost týká (`job`, `invoice`…). Příjemce, který záznam nesmí číst, upozornění nedostane.
   * Volající může typ upřesnit (komentář k libovolnému záznamu).
   */
  entity?: string;
  /** Oprávnění, které musí příjemce mít (kterékoli z nich), když událost nemá záznam s politikou přístupu. */
  access?: string | readonly string[];
  dedupe?: DedupeMode;
  /**
   * Slučování: nepřečtené upozornění téže události a záznamu se po tuto dobu aktualizuje místo přidání dalšího
   * (20 změn harmonogramu = 1 upozornění „… (20×)“). Bez hodnoty se neslučuje.
   */
  mergeWindowSeconds?: number;
  /** Zdržení push zprávy, aby se bouřka změn stihla sloučit. */
  debounceSeconds?: number;
  /** Jak dlouho push služba drží zprávu pro vypnuté zařízení; po uplynutí zprávu zahodí. */
  ttlSeconds?: number;
  /** Událost nejde vypnout (výchozí; správce klienta to může změnit u každé události). */
  mandatory?: boolean;
  /** Na push se nabídne akce „Odložit“ (připomene se za hodinu). */
  snooze?: boolean;
  /** Událost vzniká jen plánovaně (ranní přehled…); v nastavení se označí. */
  scheduled?: boolean;
  /** Technická událost (zkušební upozornění): v nastavení se nenabízí. */
  internal?: boolean;
};

/** Zkratka pro libovolnou definici (pole, mapy). */
export type AnyEventDef = NotificationEventDef<string, string, string>;

export type ParamsOf<D> = D extends NotificationEventDef<string, infer P, string> ? P : never;
export type AudiencesOf<D> = D extends NotificationEventDef<string, string, infer A> ? A : never;

/** Hodnoty parametrů šablony; hotové texty (data a částky formátuje volající). */
export type ParamValue = string | number | null | undefined;

export type NotifyInput<D extends AnyEventDef> = {
  params: Record<ParamsOf<D>, ParamValue>;
  /** Příjemci podle skupin události (`audiences`); prázdné a chybějící hodnoty se přeskočí. */
  to?: { [K in AudiencesOf<D>]?: readonly (string | null | undefined)[] };
  /** Záznam, kterého se událost týká; podle něj se ověřuje přístup, skládá odkaz (`{entityId}`) a klíč sloučení. */
  record?: { type?: string; id: string } | null;
  /** Přepíše odkaz ze šablony (celá cesta v aplikaci). */
  url?: string;
  /** Kdo změnu udělal: tomu se upozornění neposílá. */
  actorId?: string | null;
  /** Doplní klíč idempotence (např. datum nebo verze), kterým se rozliší opakování téže události. */
  dedupe?: string;
  /** Okamžik události (testy, plánované úlohy); výchozí teď. */
  at?: Date;
};

export function defineNotificationEvent<
  const K extends string,
  const P extends string,
  const A extends string,
>(def: NotificationEventDef<K, P, A>): NotificationEventDef<K, P, A> {
  return def;
}

export const EVENT_KEY = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
export const AUDIENCE_TOKEN = /^(?:[a-z][a-z0-9_]*|perm:[a-z][a-z0-9_.]*|role:[a-z][a-z0-9_-]*)$/;
export const PARAM_NAME = /^[a-zA-Z][a-zA-Z0-9]*$/;

/** Parametry, které jsou v každé šabloně k dispozici bez deklarace. */
export const BUILTIN_PARAMS = ["entityId", "count"] as const;
