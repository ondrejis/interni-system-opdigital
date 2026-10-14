import { defineNotificationEvent, type AnyEventDef } from "@rebar/core/manifest";

/*
  Události upozornění modulu Realizace: harmonogram, deník, předání, vady a plánovaná připomenutí na stavbu.
  Čistá data bez závislostí, aby je mohl číst i manifest v prohlížeči.
*/

/**
 * Skupiny příjemců událostí zakázky (stejné jako `JOB_TEAM_AUDIENCES` u `notifyJobTeam` v modulu Zakázky; tady jsou
 * zopakované, protože manifest nesmí importovat serverový kód).
 */
const JOB_TEAM = {
  team: "Vedoucí a tým zakázky",
  extra: "Další zainteresovaní (odpovědný za fázi)",
} as const;

const NUMBER = { label: "Číslo zakázky", example: "Z-2026-014" } as const;
const PHASE = { label: "Název fáze", example: "Hrubá stavba" } as const;
const DATES = { label: "Termín fáze", example: "2. 11. 2026 – 6. 11. 2026" } as const;

const SCHEDULE_URL = "/zakazky/{entityId}?tab=realizace&sub=harmonogram";

/* ---------- změny na zakázce (vyvolává uživatel) ---------- */

export const JOB_SCHEDULE = defineNotificationEvent({
  key: "job.schedule",
  label: "Změna harmonogramu",
  description:
    "Někdo změnil termíny fáze zakázky (i přetažením v Ganttu) nebo se posunuly navazující fáze. Vedoucí a tým zakázky a odpovědný za fázi. Rychlé změny se sloučí do jednoho upozornění.",
  group: "Realizace",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: JOB_TEAM,
  recipients: ["team", "extra"],
  params: {
    number: NUMBER,
    phase: PHASE,
    dates: DATES,
    shifted: { label: "Kolik navazujících fází se posunulo", example: "Posunuto i 2 navazujících" },
  },
  template: {
    title: "{number}: změna harmonogramu",
    body: "{phase} · {dates}\n{shifted}",
    url: SCHEDULE_URL,
  },
  entity: "job",
  mergeWindowSeconds: 900,
  debounceSeconds: 45,
});

export const PHASE_ADDED = defineNotificationEvent({
  key: "realizace.phase_added",
  label: "Nová fáze harmonogramu",
  description: "Do harmonogramu zakázky přibyla fáze. Vedoucí a tým zakázky a odpovědný za fázi.",
  group: "Realizace",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: JOB_TEAM,
  recipients: ["team", "extra"],
  params: { number: NUMBER, phase: PHASE, dates: DATES },
  template: {
    title: "{number}: nová fáze",
    body: "{phase} · {dates}",
    url: SCHEDULE_URL,
  },
  entity: "job",
  mergeWindowSeconds: 900,
  debounceSeconds: 45,
});

export const PHASE_DONE = defineNotificationEvent({
  key: "realizace.phase_done",
  label: "Fáze dokončena",
  description: "Fáze harmonogramu je hotová (100 %). Vedoucí a tým zakázky a odpovědný za fázi.",
  group: "Realizace",
  severity: "normal",
  channels: { push: false, bell: true },
  audiences: JOB_TEAM,
  recipients: ["team", "extra"],
  params: { number: NUMBER, phase: PHASE },
  template: {
    title: "{number}: {phase} hotovo",
    body: "Fáze dokončena",
    url: SCHEDULE_URL,
  },
  entity: "job",
});

export const JOB_DIARY = defineNotificationEvent({
  key: "job.diary",
  label: "Zahájena realizace",
  description: "Zakázka přešla do realizace a stavební deník je otevřený. Vedoucí a tým zakázky.",
  group: "Realizace",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: JOB_TEAM,
  recipients: ["team", "extra"],
  params: { number: NUMBER },
  template: {
    title: "{number}: zahájena realizace",
    body: "Stavební deník je otevřený, zapisujte do něj denně.",
    url: "/zakazky/{entityId}?tab=realizace&sub=denik",
  },
  entity: "job",
});

export const JOB_HANDOVER = defineNotificationEvent({
  key: "job.handover",
  label: "Předáno zákazníkovi",
  description: "Předávací protokol zakázky byl podepsán. Vedoucí a tým zakázky.",
  group: "Realizace",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: JOB_TEAM,
  recipients: ["team", "extra"],
  params: {
    number: NUMBER,
    protocol: { label: "Číslo protokolu", example: "PP-2026-003" },
    acceptedBy: { label: "Kdo za zákazníka převzal", example: "Jan Novák" },
  },
  template: {
    title: "{number}: předáno zákazníkovi",
    body: "Protokol {protocol} podepsán\nPřevzal: {acceptedBy}",
    url: "/zakazky/{entityId}?tab=realizace&sub=predani",
  },
  entity: "job",
});

/* ---------- vady ---------- */

export const DEFECT_NEW = defineNotificationEvent({
  key: "defect.new",
  label: "Nová vada",
  description: "Na zakázce byla nahlášena vada. Vedoucí a tým zakázky a ten, kdo má vadu řešit.",
  group: "Vady",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: {
    team: "Vedoucí a tým zakázky",
    responsible: "Ten, kdo má vadu řešit",
  },
  recipients: ["team", "responsible"],
  params: {
    number: NUMBER,
    title: { label: "Název vady", example: "Prasklá spára v koupelně" },
    severity: { label: "Závažnost", example: "Závažná" },
    due: { label: "Termín opravy", example: "20. 10. 2026" },
  },
  template: {
    title: "{number}: nová vada",
    body: "{title}\nZávažnost: {severity}\nTermín opravy: {due}",
    url: "/realizace/vady/{entityId}",
  },
  entity: "defect",
  dedupe: "record",
});

export const DEFECT_ASSIGNED = defineNotificationEvent({
  key: "defect.assigned",
  label: "Přidělena vada k řešení",
  description: "Někdo vám přidělil vadu k vyřešení.",
  group: "Vady",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { responsible: "Ten, kdo má vadu řešit" },
  recipients: ["responsible"],
  params: {
    number: NUMBER,
    title: { label: "Název vady", example: "Prasklá spára v koupelně" },
    due: { label: "Termín opravy", example: "20. 10. 2026" },
  },
  template: {
    title: "Máte řešit vadu",
    body: "{title}\nZakázka {number}\nTermín opravy: {due}",
    url: "/realizace/vady/{entityId}",
  },
  entity: "defect",
});

/* ---------- plánovaná připomenutí ---------- */

export const REALIZACE_TODAY = defineNotificationEvent({
  key: "realizace.today",
  label: "Dnes na stavbě",
  description:
    "Ráno v pracovní den přehled zakázek a fází, které dnes běží a týkají se vás (vedete zakázku, jste v týmu nebo máte fázi na starosti).",
  group: "Realizace",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { person: "Vedoucí, člen týmu nebo odpovědný za fázi, která dnes běží" },
  recipients: ["person"],
  params: {
    summary: { label: "Počet zakázek", example: "2 zakázky" },
    list: {
      label: "Výčet zakázek a fází",
      example: "Z-2026-014 · Hrubá stavba\nZ-2026-009 · Elektroinstalace, Omítky",
    },
  },
  template: { title: "Dnes na stavbě: {summary}", body: "{list}", url: "/realizace" },
  access: "realizace.read",
  dedupe: "day",
  scheduled: true,
  snooze: true,
  ttlSeconds: 8 * 3600,
});

export const PHASE_STARTS = defineNotificationEvent({
  key: "realizace.phase_starts",
  label: "Fáze začíná",
  description:
    "V pracovní den ráno, kdy podle harmonogramu začíná fáze, která ještě nezačala. Odpovědný za fázi a vedoucí a tým zakázky.",
  group: "Realizace",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: {
    responsible: "Odpovědný za fázi",
    team: "Vedoucí a tým zakázky",
  },
  recipients: ["responsible", "team"],
  params: { number: NUMBER, phase: PHASE, dates: DATES },
  template: {
    title: "{number}: začíná {phase}",
    body: "Termín: {dates}",
    url: SCHEDULE_URL,
  },
  entity: "job",
  dedupe: "record",
  scheduled: true,
  ttlSeconds: 8 * 3600,
});

export const PHASE_DEADLINE = defineNotificationEvent({
  key: "realizace.phase_deadline",
  label: "Blíží se konec fáze",
  description:
    "Fáze podle harmonogramu končí dnes nebo v nejbližší pracovní den a ještě není hotová. Odpovědný za fázi a vedoucí zakázky.",
  group: "Realizace",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: {
    responsible: "Odpovědný za fázi",
    manager: "Vedoucí zakázky",
  },
  recipients: ["responsible", "manager"],
  params: {
    number: NUMBER,
    phase: PHASE,
    when: { label: "Kdy fáze končí", example: "zítra" },
    dates: DATES,
    progress: { label: "Průběh fáze", example: "60 %" },
  },
  template: {
    title: "{number}: {phase} končí {when}",
    body: "Termín: {dates}\nPrůběh: {progress}",
    url: SCHEDULE_URL,
  },
  entity: "job",
  dedupe: "record",
  scheduled: true,
  snooze: true,
  ttlSeconds: 8 * 3600,
});

export const PHASE_OVERDUE = defineNotificationEvent({
  key: "realizace.phase_overdue",
  label: "Fáze po termínu",
  description:
    "Fáze měla podle harmonogramu skončit a není hotová. Přijde jednou, první pracovní den po termínu. Odpovědný za fázi a vedoucí zakázky.",
  group: "Realizace",
  severity: "urgent",
  channels: { push: true, bell: true },
  audiences: {
    responsible: "Odpovědný za fázi",
    manager: "Vedoucí zakázky",
  },
  recipients: ["responsible", "manager"],
  params: {
    number: NUMBER,
    phase: PHASE,
    end: { label: "Plánovaný konec", example: "6. 11. 2026" },
    progress: { label: "Průběh fáze", example: "60 %" },
  },
  template: {
    title: "{number}: {phase} je po termínu",
    body: "Termín byl {end}\nPrůběh: {progress}",
    url: SCHEDULE_URL,
  },
  entity: "job",
  dedupe: "record",
  scheduled: true,
  snooze: true,
  ttlSeconds: 12 * 3600,
});

export const DIARY_MISSING = defineNotificationEvent({
  key: "realizace.diary_missing",
  label: "Chybí zápis do deníku",
  description:
    "Odpoledne v pracovní den, když zakázka v realizaci, na které se dnes pracuje, nemá zápis ve stavebním deníku. Vedoucí a tým zakázky.",
  group: "Realizace",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { team: "Vedoucí a tým zakázky" },
  recipients: ["team"],
  params: { number: NUMBER },
  template: {
    title: "{number}: chybí zápis do deníku",
    body: "Dnešní zápis ve stavebním deníku zatím není.",
    url: "/zakazky/{entityId}?tab=realizace&sub=denik",
  },
  entity: "job",
  access: "realizace.read",
  dedupe: "day",
  scheduled: true,
  snooze: true,
  ttlSeconds: 4 * 3600,
});

export const REALIZACE_NOTIFICATIONS: AnyEventDef[] = [
  JOB_SCHEDULE,
  PHASE_ADDED,
  PHASE_DONE,
  JOB_DIARY,
  JOB_HANDOVER,
  DEFECT_NEW,
  DEFECT_ASSIGNED,
  REALIZACE_TODAY,
  PHASE_STARTS,
  PHASE_DEADLINE,
  PHASE_OVERDUE,
  DIARY_MISSING,
];
