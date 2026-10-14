import type { EventRule, NotificationsConfig, QuietHours, UserPrefs } from "./config";
import { inQuietHours, nextDailyTime, quietEnd } from "./times";
import type { AnyEventDef, ChannelFlags, Severity } from "./types";

/** Událost po složení katalogu, konfigurace klienta a úprav správce. */
export type EffectiveEvent = {
  def: AnyEventDef;
  enabled: boolean;
  mandatory: boolean;
  severity: Severity;
  channels: ChannelFlags;
  recipients: string[];
  title: string;
  body: string | undefined;
  /** Čím byla událost změněna oproti katalogu (pro označení v Nastavení). */
  overridden: { config: boolean; admin: boolean };
};

const isEmpty = (r: EventRule | undefined) => !r || Object.keys(r).length === 0;

/** Pořadí vrstev: katalog → konfigurace klienta → úpravy správce (nejvyšší přednost). */
export function resolveEvent(
  def: AnyEventDef,
  fromConfig?: EventRule,
  fromAdmin?: EventRule,
): EffectiveEvent {
  const layers = [fromConfig, fromAdmin];
  const pick = <T>(get: (r: EventRule) => T | undefined, base: T): T => {
    let v = base;
    for (const l of layers) {
      const x = l ? get(l) : undefined;
      if (x !== undefined) v = x;
    }
    return v;
  };
  const channels: ChannelFlags = {
    push: def.channels.push ?? true,
    bell: def.channels.bell ?? true,
    email: def.channels.email ?? false,
  };
  for (const l of layers)
    for (const c of ["push", "bell", "email"] as const) {
      const x = l?.channels?.[c];
      if (x !== undefined) channels[c] = x;
    }
  const body = pick((r) => r.body, def.template.body ?? "");
  return {
    def,
    enabled: pick((r) => r.enabled, true),
    mandatory: pick((r) => r.mandatory, def.mandatory ?? false),
    severity: pick((r) => r.severity, def.severity),
    channels,
    recipients: pick((r) => r.recipients, [...def.recipients]),
    title: pick((r) => r.title, def.template.title),
    body: body || undefined,
    overridden: { config: !isEmpty(fromConfig), admin: !isEmpty(fromAdmin) },
  };
}

export type PushPlan =
  | { deliver: false; reason: "event_off" | "user_off" }
  | { deliver: true; mode: "instant" | "digest" | "quiet"; releaseAt: Date };

export type DeliveryPlan = {
  bell: boolean;
  push: PushPlan;
  email: boolean;
};

export type PlanContext = {
  now: Date;
  timezone: string;
  config: Pick<NotificationsConfig, "quietHours" | "digestTimes">;
  /** Úpravy správce přepisují výchozí hodnoty klienta. */
  rules?: { quietHours?: QuietHours | undefined; digestTimes?: string[] | undefined } | undefined;
};

/** Platné tiché hodiny a časy shrnutí uživatele: jeho vlastní → správce → konfigurace klienta. */
export function effectiveTimes(prefs: UserPrefs | null | undefined, ctx: PlanContext) {
  return {
    quiet: prefs?.quiet ?? ctx.rules?.quietHours ?? ctx.config.quietHours,
    digestTimes: prefs?.digestTimes ?? ctx.rules?.digestTimes ?? ctx.config.digestTimes,
  };
}

/**
 * Rozhodne, kudy a kdy se upozornění uživateli doručí. Čistá funkce (čas dostává parametrem), proto jde snadno testovat.
 *
 * - Vypnutá událost se nedoručí vůbec (řeší volající). Povinná událost ignoruje vypnutí a shrnutí z předvoleb.
 * - Naléhavé upozornění prosadí tiché hodiny i shrnutí.
 * - V tichých hodinách se push zdrží do jejich konce (nezahodí se); zvoneček a e-mail jdou hned.
 */
export function planDelivery(
  eff: EffectiveEvent,
  prefs: UserPrefs | null | undefined,
  ctx: PlanContext,
): DeliveryPlan {
  const pref = prefs?.events?.[eff.def.key];
  const urgent = eff.severity === "urgent";
  const forced = eff.mandatory;

  const bell = eff.channels.bell && (forced || pref?.bell !== false);
  const email = forced ? eff.channels.email : (pref?.email ?? eff.channels.email);

  let push: PushPlan;
  const mode = forced ? "instant" : (pref?.push ?? (eff.channels.push ? "instant" : "off"));
  if (mode === "off")
    push = {
      deliver: false,
      reason: eff.channels.push || pref?.push === "off" ? "user_off" : "event_off",
    };
  else {
    const { quiet, digestTimes } = effectiveTimes(prefs, ctx);
    const debounced = new Date(ctx.now.getTime() + (eff.def.debounceSeconds ?? 0) * 1000);
    if (urgent) push = { deliver: true, mode: "instant", releaseAt: ctx.now };
    else if (mode === "digest")
      push = {
        deliver: true,
        mode: "digest",
        releaseAt: nextDailyTime(ctx.now, digestTimes, ctx.timezone),
      };
    else if (inQuietHours(ctx.now, quiet, ctx.timezone)) {
      const end = quietEnd(ctx.now, quiet, ctx.timezone);
      push = { deliver: true, mode: "quiet", releaseAt: end > debounced ? end : debounced };
    } else push = { deliver: true, mode: "instant", releaseAt: debounced };
  }
  return { bell, push, email };
}
