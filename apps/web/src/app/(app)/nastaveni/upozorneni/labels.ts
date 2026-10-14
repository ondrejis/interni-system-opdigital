import { formatInstant } from "@rebar/core/time";

/** České popisy stavů a důvodů doručení upozornění (protokol doručení pro uživatele i správce). */
export const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  queued: { label: "Zařazeno", color: "blue" },
  held: { label: "Čeká", color: "orange" },
  retry: { label: "Zkusí se znovu", color: "orange" },
  sending: { label: "Odesílá se", color: "blue" },
  sent: { label: "Odesláno", color: "green" },
  failed: { label: "Chyba", color: "red" },
  skipped: { label: "Přeskočeno", color: "gray" },
};

export const REASON_LABEL: Record<string, string> = {
  user_off: "vypnuto v předvolbách",
  event_off: "kanál je u události vypnutý",
  no_device: "není zapnuté žádné zařízení",
  already_read: "už přečtené",
  expired: "zastaralé, už se neposílá",
  merged: "sloučeno s novější zprávou",
  user_inactive: "účet je neaktivní",
  push_not_configured: "push není na serveru zapnutý (chybí klíče VAPID)",
  email_not_configured: "odesílání e-mailů není nastavené",
  rate_limited: "příliš mnoho zpráv najednou, odloženo",
  summary: "odesláno ve shrnutí",
  summarized: "odesláno ve shrnutí",
  push_rejected: "push služba zprávu odmítla (zkontrolujte klíče VAPID)",
  retries_exhausted: "push služba je nedostupná, opakování vyčerpáno",
  snoozed: "odloženo",
  seed: "ukázková data, neodesílá se",
};

export const MODE_LABEL: Record<string, string> = {
  instant: "ihned",
  digest: "ve shrnutí",
  quiet: "po tichých hodinách",
};

export const CHANNEL_NAME: Record<string, string> = { push: "telefon", email: "e-mail" };

/** „8. 10. 14:30“ v české zóně, stejný text na serveru i v prohlížeči (jinak by se stránka nehydratovala). */
export const when = (iso: string) => formatInstant(iso);
