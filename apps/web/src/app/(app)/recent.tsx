"use client";

/**
 * Naposledy otevřené záznamy se od C3 drží na serveru (`recent_record`, zapisuje je akce `getEntityRecord`), takže
 * fungují na všech zařízeních a respektují viditelnost. Komponenta zůstává kvůli stávajícím importům a nic nedělá.
 */
export type RecentRecord = { href: string; title: string; label: string };

/** Nic nedělá (viz výše). */
export function TrackRecent(_props: RecentRecord) {
  return null;
}
