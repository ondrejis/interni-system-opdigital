/*
  Parser rychlého zadání úkolu (UKO-05): „zavolat Novákovi zítra 10:00“ → Hovor, zítra 10:00, název „Zavolat Novákovi“.
  Čistá funkce (žádný server ani databáze, čas dostává jako parametr), běží v UI (náhled rozpoznání) i na serveru.
  Rozumí českým datům a času bez ohledu na diakritiku a velikost písmen.

  Pravidla (pro testy i pro uživatele):
  - Datum: dnes, zítra, pozítří, dny v týdnu („v pátek“, „ve středu“, „příští pondělí“; vždy nejbližší den PO dnešku,
    „dnes“ se píše výslovně), „za 3 dny“, „za týden“, „za 2 týdny“, „za měsíc“, „příští týden“ (pondělí), „konec týdne“
    (pátek), „konec měsíce“, „15. 10.“, „15.10.2026“, „15. října“, „2026-10-15“. Datum bez roku v minulosti = příští rok.
  - Čas: „10:00“, „v 14“, „ve 3“, „14 hod“, „v 14.30“, „půl 3“, ráno (8:00), dopoledne (10:00), v poledne (12:00),
    odpoledne (14:00), večer (18:00). Holá hodina 1–6 se čte jako odpolední („ve 3“ = 15:00), zápis s minutami
    („3:30“) se bere doslova. Je-li zadaný jen čas, termín je dnes, a už uplynul-li, zítra. „za 2 hodiny“ = teď + 2 h.
  - Délka: „na 30 min“, „na hodinu“, „na 1,5 h“, „na půl hodiny“, „30 minut“.
  - Priorita: „!“ střední, „!!“ vysoká, „!!!“ nebo „urgentní“ urgentní, „důležité“ vysoká.
  - Typ podle prvního slova: zavolat/volat/hovor → Hovor; schůzka/sejít se/setkání/porada/konzultace → Schůzka;
    e-mail, „napsat/poslat e-mail“ → E-mail; termín/deadline → Termín; jinak Úkol. Vlastní typ se pozná podle názvu
    na začátku („Návštěva: …“ nebo „Návštěva u klienta“). Zápis „Typ: text“ typ vždy určí a z názvu se odstraní.
*/
import {
  addDaysIso,
  addMonthsIso,
  isoWeekday,
  localParts,
  todayIso,
  weekStartIso,
} from "@rebar/core/time";
import { SYSTEM_TYPES, TASK_PRIORITY_LABELS, type TaskPriority } from "../constants";
import { normalizeTime } from "./due";

/** Typ úkolu, jak ho parser potřebuje znát (klíč a název z Nastavení). */
export type QuickTaskType = { key: string; name: string };

/** Jedna rozpoznaná část textu (pro náhled „co systém rozpoznal“). */
export type QuickTaskToken = {
  kind: "type" | "date" | "time" | "duration" | "priority";
  /** Co uživatel napsal. */
  text: string;
  /** Jak tomu systém rozumí („Hovor“, „zítra (čt 15. 10.)“, „10:00“). */
  label: string;
};

/** Výsledek rozboru rychlého zadání. */
export type QuickTaskParse = {
  /** Název bez rozpoznaných částí, s velkým počátečním písmenem; prázdný, když zbylo jen datum a čas. */
  title: string;
  typeKey: string;
  dueDate: string | null;
  dueTime: string | null;
  durationMin: number | null;
  priority: TaskPriority;
  recognized: QuickTaskToken[];
};

const DEFAULT_TYPES: readonly QuickTaskType[] = SYSTEM_TYPES.map((t) => ({
  key: t.key,
  name: t.name,
}));

/** Písmena bez diakritiky a malá, znak po znaku (délka textu se nemění, takže pozice sedí na původní text). */
function fold(text: string): string {
  let out = "";
  for (const ch of text) {
    const f = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    out += f.length === ch.length ? f : ch.toLowerCase();
  }
  return out;
}

const NUMBER_WORDS: Record<string, number> = {
  jeden: 1,
  jednu: 1,
  jedno: 1,
  dva: 2,
  dve: 2,
  tri: 3,
  ctyri: 4,
  pet: 5,
  sest: 6,
  sedm: 7,
  osm: 8,
  devet: 9,
  deset: 10,
};
const NUM = "\\d+(?:[.,]\\d+)?|jeden|jednu|jedno|dva|dve|tri|ctyri|pet|sest|sedm|osm|devet|deset";
const toNumber = (s: string): number => NUMBER_WORDS[s] ?? Number(s.replace(",", "."));

const MONTHS: Record<string, number> = {
  ledna: 1,
  unora: 2,
  brezna: 3,
  dubna: 4,
  kvetna: 5,
  cervna: 6,
  cervence: 7,
  srpna: 8,
  zari: 9,
  rijna: 10,
  listopadu: 11,
  prosince: 12,
};
const MONTH_RE = Object.keys(MONTHS).join("|");

const WEEKDAY_FORMS: [RegExp, number][] = [
  [/^pondel/, 1],
  [/^uter/, 2],
  [/^stred/, 3],
  [/^ctvrt/, 4],
  [/^patek|^patk|^patku/, 5],
  [/^sobot/, 6],
  [/^nedel/, 7],
];
const WEEKDAY_RE =
  "pondeli|pondelku|utery|uterku|streda|stredu|stredy|ctvrtek|ctvrtku|patek|patku|sobota|sobotu|soboty|nedele|nedeli";
const WEEKDAY_SHORT: Record<string, number> = { ut: 2, ct: 4, pa: 5 };

const weekdayOf = (word: string): number => {
  const short = WEEKDAY_SHORT[word];
  if (short) return short;
  return WEEKDAY_FORMS.find(([re]) => re.test(word))?.[1] ?? 1;
};

const WD_NAMES = ["po", "út", "st", "čt", "pá", "so", "ne"];
const pad = (n: number) => String(n).padStart(2, "0");

/** „čt 15. 10.“ pro popisek rozpoznaného data. */
function dateLabel(iso: string): string {
  const [, m, d] = iso.split("-").map(Number) as [number, number, number];
  return `${WD_NAMES[isoWeekday(iso) - 1]} ${d}. ${m}.`;
}

const isRealDate = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

/** Hodina z holého zápisu bez minut: 1–6 se čte odpoledne. */
const bareHour = (h: number) => (h >= 1 && h <= 6 ? h + 12 : h);

/**
 * Rozebere rychlé zadání. `now` je „teď“ (rozhoduje o „zítra“, „v pátek“, uplynulém času), `types` jsou typy úkolů
 * z Nastavení (výchozí je pět systémových). Nikdy nevyhodí chybu: co nepozná, zůstane v názvu.
 */
export function parseQuickTask(
  text: string,
  now: Date = new Date(),
  types: readonly QuickTaskType[] = DEFAULT_TYPES,
): QuickTaskParse {
  const original = text.replace(/\s+/g, " ").trim();
  const f = fold(original);
  let w = f; // pracovní kopie: rozpoznané části se přepisují mezerami
  const consumed: [number, number][] = [];
  const recognized: QuickTaskToken[] = [];

  const today = todayIso("Europe/Prague", now);
  const nowParts = localParts(now);

  const hasType = (key: string) => types.some((t) => t.key === key);
  const typeName = (key: string) => types.find((t) => t.key === key)?.name ?? key;

  /** Najde první výskyt v nespotřebovaném textu; `groupOffset` = pozice, od které se vyřízne i předložka. */
  const take = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(w);
    if (!m) return null;
    const start = m.index;
    const end = start + m[0].length;
    w = w.slice(0, start) + " ".repeat(end - start) + w.slice(end);
    consumed.push([start, end]);
    return m;
  };
  const said = (m: RegExpExecArray) => original.slice(m.index, m.index + m[0].length).trim();

  /* ---------- typ ---------- */
  let typeKey = "task";
  let typeFixed = false;
  // 1) výslovný zápis „Typ: text“ (název nebo klíč typu)
  const prefix = /^([^:]{2,40}):\s*/.exec(f);
  if (prefix) {
    const hit = types.find(
      (t) => fold(t.name) === prefix[1]!.trim() || fold(t.key) === prefix[1]!.trim(),
    );
    if (hit) {
      typeKey = hit.key;
      typeFixed = true;
      w = " ".repeat(prefix[0].length) + w.slice(prefix[0].length);
      consumed.push([0, prefix[0].length]);
      recognized.push({
        kind: "type",
        text: original.slice(0, prefix[1]!.length),
        label: hit.name,
      });
    }
  }
  // 2) vlastní typ podle názvu na začátku (systémové se poznají slovesem níže)
  if (!typeFixed) {
    const custom = types
      .filter((t) => !SYSTEM_TYPES.some((s) => s.key === t.key))
      .sort((a, b) => b.name.length - a.name.length)
      .find((t) => {
        const n = fold(t.name);
        return n.length > 1 && (f === n || f.startsWith(`${n} `));
      });
    if (custom) {
      typeKey = custom.key;
      typeFixed = true;
      recognized.push({
        kind: "type",
        text: original.slice(0, custom.name.length),
        label: custom.name,
      });
    }
  }
  // 3) systémové typy podle prvního slova
  if (!typeFixed) {
    const rules: [RegExp, string][] = [
      [
        /^(?:zavolat|zavolej|zavolam|volat|volej|telefonovat|zatelefonovat|zatelefonuj|hovor|call)\b/,
        "call",
      ],
      [
        /^(?:schuzk\w*|sejit|setkani|setkat|sraz|meeting|porada|konzultace|videohovor)\b/,
        "meeting",
      ],
      [/^(?:e-?mail\w*|mail\w*|mailovat)\b/, "email"],
      [
        /^(?:napsat|napis|poslat|posli|odeslat|odesli)\s+(?:\S+\s+)?(?:e-?mail\w*|mail\w*)\b/,
        "email",
      ],
      [/^(?:termin|deadline)\b/, "deadline"],
    ];
    for (const [re, key] of rules) {
      const m = re.exec(f);
      if (m && hasType(key)) {
        typeKey = key;
        recognized.push({
          kind: "type",
          text: original.slice(0, m[0].length).trim(),
          label: typeName(key),
        });
        break;
      }
    }
  }

  /* ---------- priorita ---------- */
  let priority: TaskPriority = "none";
  const prioMark = take(/(?<![\w!])!{1,3}(?![\w!])/);
  if (prioMark) {
    priority = (["medium", "high", "urgent"] as const)[prioMark[0].length - 1]!;
    recognized.push({
      kind: "priority",
      text: said(prioMark),
      label: TASK_PRIORITY_LABELS[priority],
    });
  } else {
    const word = take(/\b(urgentn\w*|nalehav\w*|dulezit\w*)\b/);
    if (word) {
      priority = /^dulezit/.test(word[0]) ? "high" : "urgent";
      recognized.push({
        kind: "priority",
        text: said(word),
        label: TASK_PRIORITY_LABELS[priority],
      });
    }
  }

  /* ---------- relativní čas „za N minut/hodin“ ---------- */
  let dueDate: string | null = null;
  let dueTime: string | null = null;

  const inTime = take(new RegExp(`\\bza\\s+(?:(${NUM}|pul)\\s+)?(minut\\w*|hodin\\w*)`));
  if (inTime) {
    const unit = inTime[2]!.startsWith("min") ? 1 : 60;
    const n = inTime[1] === "pul" ? 0.5 : inTime[1] ? toNumber(inTime[1]) : 1;
    const target = new Date(now.getTime() + n * unit * 60_000);
    const rounded = new Date(Math.round(target.getTime() / 300_000) * 300_000);
    const p = localParts(rounded);
    dueDate = p.date;
    dueTime = p.time;
    recognized.push({
      kind: "time",
      text: said(inTime),
      label: `${p.time} (${dateLabel(p.date)})`,
    });
  }

  /* ---------- délka ---------- */
  let durationMin: number | null = null;
  const durNa = take(
    new RegExp(`\\bna\\s+(?:(${NUM}|pul)\\s*)?(min(?:ut\\w*)?|m|h|hod(?:in\\w*)?)\\b`),
  );
  const durBare = durNa ? null : take(new RegExp(`\\b(${NUM})\\s*(min(?:ut\\w*)?)\\b`));
  const dur = durNa ?? durBare;
  if (dur) {
    const isMin = dur[2]!.startsWith("m");
    const n = dur[1] === "pul" ? 0.5 : dur[1] ? toNumber(dur[1]) : 1;
    durationMin = Math.max(1, Math.min(1440, Math.round(n * (isMin ? 1 : 60))));
    recognized.push({ kind: "duration", text: said(dur), label: `${durationMin} min` });
  }

  /* ---------- datum ---------- */
  const setDate = (iso: string, m: RegExpExecArray, label?: string) => {
    dueDate = iso;
    recognized.push({
      kind: "date",
      text: said(m),
      label: label ?? dateLabel(iso),
    });
  };
  const PREP = "(?:(?:do|na|v|ve|dne|k)\\s+)?";

  if (!dueDate) {
    // ISO 2026-10-15
    const iso = take(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (iso) {
      if (isRealDate(+iso[1]!, +iso[2]!, +iso[3]!)) setDate(`${iso[1]}-${iso[2]}-${iso[3]}`, iso);
      else restore(iso);
    }
  }
  if (!dueDate) {
    // 15. října [2026]
    const longForm = take(
      new RegExp(`\\b${PREP}(\\d{1,2})\\.?\\s*(${MONTH_RE})(?:\\s+(\\d{4}))?\\b`),
    );
    if (longForm) {
      const d = +longForm[1]!;
      const mo = MONTHS[longForm[2]!]!;
      const iso = resolveDayMonth(d, mo, longForm[3] ? +longForm[3] : null, today);
      if (iso) setDate(iso, longForm);
      else restore(longForm);
    }
  }
  if (!dueDate) {
    // 15. 10. | 15.10.2026
    const numeric = take(
      new RegExp(`\\b${PREP}(\\d{1,2})\\.\\s*(\\d{1,2})\\.(?:\\s*(\\d{4}))?(?!\\d)`),
    );
    if (numeric) {
      const iso = resolveDayMonth(
        +numeric[1]!,
        +numeric[2]!,
        numeric[3] ? +numeric[3] : null,
        today,
      );
      if (iso) setDate(iso, numeric);
      else restore(numeric);
    }
  }
  if (!dueDate) {
    const rel = take(/\b(?:(?:na|do|v|ve)\s+)?(dnes|dneska|zitra|pozitri|pozitrejsi)\b/);
    if (rel) {
      const k = rel[1]!;
      const days = k.startsWith("dnes") ? 0 : k === "zitra" ? 1 : 2;
      const iso = addDaysIso(today, days);
      setDate(
        iso,
        rel,
        days === 0 ? "dnes" : `${k.startsWith("po") ? "pozítří" : "zítra"} (${dateLabel(iso)})`,
      );
    }
  }
  if (!dueDate) {
    const za = take(
      new RegExp(
        `\\bza\\s+(?:(${NUM})\\s+)?(den|dny|dni|dnu|tyden|tydny|tydnu|mesic|mesice|mesicu)\\b`,
      ),
    );
    if (za) {
      const n = za[1] ? toNumber(za[1]) : 1;
      const unit = za[2]!;
      const iso = unit.startsWith("t")
        ? addDaysIso(today, 7 * n)
        : unit.startsWith("m")
          ? addMonthsIso(today, n)
          : addDaysIso(today, n);
      setDate(iso, za, dateLabel(iso));
    }
  }
  if (!dueDate) {
    const nextWeek = take(/\b(?:(?:na|do|v|ve)\s+)?pristi\s+tyden\b/);
    if (nextWeek) setDate(addDaysIso(weekStartIso(today), 7), nextWeek);
  }
  if (!dueDate) {
    const end = take(
      /\b(?:(?:na|do|v|ve)\s+)?(?:konec|konci|konce)\s+(tydne|tyden|mesice|mesic)\b/,
    );
    if (end) {
      if (end[1]!.startsWith("t")) {
        const monday = weekStartIso(today);
        const friday = addDaysIso(monday, 4);
        setDate(friday < today ? addDaysIso(friday, 7) : friday, end);
      } else {
        const [y, mo] = today.split("-").map(Number) as [number, number];
        const last = `${y}-${pad(mo)}-${pad(new Date(Date.UTC(y, mo, 0)).getUTCDate())}`;
        setDate(last, end);
      }
    }
  }
  if (!dueDate) {
    const wd =
      take(new RegExp(`\\b(?:(?:na|do|v|ve)\\s+)?(pristi\\s+|dalsi\\s+)?(${WEEKDAY_RE})\\b`)) ??
      takeShortWeekday();
    if (wd) {
      const next = !!wd[1];
      const target = weekdayOf(wd[2]!);
      let iso: string;
      if (next) iso = addDaysIso(weekStartIso(today), 7 + target - 1);
      else {
        const cur = isoWeekday(today);
        iso = addDaysIso(today, (target - cur + 7) % 7 || 7);
      }
      setDate(iso, wd);
    }
  }

  function takeShortWeekday(): RegExpExecArray | null {
    const m = take(/\b(?:(?:na|do|v|ve)\s+)(pristi\s+|dalsi\s+)?(ut|ct|pa)\b/);
    return m;
  }
  /** Zpět do pracovní kopie (nepodařilo se ověřit datum, zůstane v názvu). */
  function restore(m: RegExpExecArray) {
    consumed.pop();
    w =
      w.slice(0, m.index) +
      f.slice(m.index, m.index + m[0].length) +
      w.slice(m.index + m[0].length);
  }

  /* ---------- čas ---------- */
  let shifted = false; // hodina z holého zápisu byla posunuta na odpoledne („ve 3“ = 15:00)
  const setTime = (h: number, min: number, m: RegExpExecArray, wasShifted = false) => {
    shifted = wasShifted;
    dueTime = `${pad(h)}:${pad(min)}`;
    recognized.push({ kind: "time", text: said(m), label: dueTime });
  };
  if (!dueTime) {
    const half = take(/\b(?:(?:v|ve)\s+)?pul\s+(\d{1,2})\b(?!\s*[.:])/);
    if (half) {
      let base = Number(half[1]) - 1;
      if (base <= 0) base = 12;
      if (base <= 6) base += 12;
      if (base <= 23) setTime(base, 30, half, Number(half[1]) - 1 <= 6);
      else restore(half);
    }
  }
  if (!dueTime) {
    const colon = take(
      /\b(?:(?:v|ve|na|od|do|kolem|cca)\s+)?([01]?\d|2[0-3]):([0-5]\d)(?:\s*(?:hod\w*|h))?\b/,
    );
    if (colon) setTime(Number(colon[1]), Number(colon[2]), colon);
  }
  if (!dueTime) {
    const dot = take(/\b(?:v|ve|kolem|cca)\s+([01]?\d|2[0-3])\.([0-5]\d)\b/);
    if (dot) setTime(Number(dot[1]), Number(dot[2]), dot);
  }
  if (!dueTime) {
    const hours = take(
      /\b(?:(?:v|ve|kolem|cca|od|do)\s+)?([01]?\d|2[0-3])\s*(?:h|hod|hodin|hodiny|hodine)\b/,
    );
    if (hours)
      setTime(
        bareHour(Number(hours[1])),
        0,
        hours,
        bareHour(Number(hours[1])) !== Number(hours[1]),
      );
  }
  if (!dueTime) {
    const bare = take(/\b(?:v|ve)\s+([01]?\d|2[0-3])\b(?!\s*[.:/-]?\s*\d)(?!\s*\.)/);
    if (bare)
      setTime(bareHour(Number(bare[1])), 0, bare, bareHour(Number(bare[1])) !== Number(bare[1]));
  }
  {
    // část dne; spolu s hodinou ji jen upřesní, samotná dá výchozí čas
    const part = take(/\b(?:(?:v|ve|na)\s+)?(rano|dopoledne|poledne|odpoledne|vecer)\b/);
    if (part) {
      const k = part[1]!;
      const defaults: Record<string, string> = {
        rano: "08:00",
        dopoledne: "10:00",
        poledne: "12:00",
        odpoledne: "14:00",
        vecer: "18:00",
      };
      const dayPart = k === "odpoledne" || k === "vecer" ? "pm" : "am";
      if (!dueTime) {
        dueTime = defaults[k]!;
        recognized.push({ kind: "time", text: said(part), label: dueTime });
      } else {
        const h = Number(dueTime.slice(0, 2));
        if (dayPart === "pm" && h < 12) dueTime = `${pad(h + 12)}:${dueTime.slice(3)}`;
        if (dayPart === "am" && shifted) dueTime = `${pad(h - 12)}:${dueTime.slice(3)}`;
        const last = recognized.findLast((t) => t.kind === "time");
        if (last) {
          last.label = dueTime;
          last.text = `${last.text} ${said(part)}`;
        }
      }
    }
  }

  /* ---------- jen čas bez data ---------- */
  if (dueTime && !dueDate) {
    dueDate = dueTime > nowParts.time ? today : addDaysIso(today, 1);
    const last = recognized.findLast((t) => t.kind === "time");
    if (last) last.label = `${dueTime} (${dateLabel(dueDate)})`;
  }

  /* ---------- název ---------- */
  const keep: string[] = [];
  let cursor = 0;
  const ranges = [...consumed].sort((a, b) => a[0] - b[0]);
  for (const [s, e] of ranges) {
    if (s > cursor) keep.push(original.slice(cursor, s));
    cursor = Math.max(cursor, e);
  }
  keep.push(original.slice(cursor));
  let title = keep
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
  // zbylé předložky na konci a čárky/pomlčky na okrajích
  for (;;) {
    const next = title
      .replace(/(?:^|\s)(?:v|ve|na|do|od|k|ke|za|dne|kolem|cca)$/iu, "")
      .replace(/^[\s,.;:–-]+|[\s,;:–-]+$/gu, "")
      .trim();
    if (next === title) break;
    title = next;
  }
  title = title.charAt(0).toLocaleUpperCase("cs") + title.slice(1);

  return {
    title,
    typeKey,
    dueDate,
    dueTime: normalizeTime(dueTime),
    durationMin,
    priority,
    recognized,
  };
}

/** Den a měsíc (a případně rok) → ISO datum; bez roku v minulosti = příští rok; neexistující datum `null`. */
function resolveDayMonth(d: number, m: number, year: number | null, today: string): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const thisYear = Number(today.slice(0, 4));
  if (year !== null) return isRealDate(year, m, d) ? `${year}-${pad(m)}-${pad(d)}` : null;
  if (!isRealDate(thisYear, m, d)) return null;
  const candidate = `${thisYear}-${pad(m)}-${pad(d)}`;
  if (candidate >= today) return candidate;
  return isRealDate(thisYear + 1, m, d) ? `${thisYear + 1}-${pad(m)}-${pad(d)}` : null;
}
