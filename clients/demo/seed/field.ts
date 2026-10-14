import { attachPng } from "./jobs";
import { sql } from "./kit";
import { book } from "./timesheets";
import type { DemoUserKey } from "./users";
import type { DemoJob, World } from "./world";
import { money } from "./world";

export type DiarySpec = {
  date: string;
  by: DemoUserKey;
  work: string;
  events?: string;
  weather: { label: string; code: number; min: number; max: number; rain?: number; wind?: number };
  workers: [DemoUserKey, number][];
  machines?: [string, number, string?][];
  /** [název, množství, jednotka, dodavatel, cena za jednotku v Kč (volitelně)] */
  materials?: [string, string, string, string, number?][];
  incidents?: { kind: "incident" | "defect"; text: string }[];
  photos?: number;
  sign?: boolean;
  forInvestor?: boolean;
};

const PALETTE: [number, number, number][][] = [
  [
    [196, 206, 214],
    [120, 132, 120],
  ],
  [
    [222, 205, 180],
    [140, 120, 96],
  ],
  [
    [170, 190, 210],
    [96, 110, 130],
  ],
  [
    [205, 205, 200],
    [110, 115, 118],
  ],
];

/** Zápis do stavebního deníku: stavbyvedoucí zapíše den, kancelář doplní ceny materiálu (vznikne náklad zakázky). */
export async function diary(w: World, j: DemoJob, s: DiarySpec) {
  const author = w.cast[s.by];
  const photoIds: string[] = [];
  for (let n = 0; n < (s.photos ?? 0); n++) {
    const pair = PALETTE[(n + s.date.length + Number(s.date.slice(-2))) % PALETTE.length]!;
    const top = pair[0]!;
    const bottom = pair[1]!;
    photoIds.push(
      await attachPng(
        w,
        author.ctx,
        j,
        `denik-${s.date}-${n + 1}.png`,
        { top, bottom, seed: n + 2 },
        [800, 520],
      ),
    );
  }
  const rows = (s.materials ?? []).map(([name, qty, unit, supplier, price], i) => ({
    id: `m-${s.date}-${i + 1}`,
    name,
    qty,
    unit,
    supplier,
    unitPriceMinor: price ? money(price) : null,
    source: "manual" as const,
  }));
  const input = {
    jobId: j.id,
    date: s.date,
    autoWeather: false,
    weatherData: {
      code: s.weather.code,
      label: s.weather.label,
      tempMin: s.weather.min,
      tempMax: s.weather.max,
      precipMm: s.weather.rain ?? 0,
      windKmh: s.weather.wind ?? 10,
      source: "manual" as const,
    },
    work: s.work,
    ...(s.events ? { events: s.events } : {}),
    workers: s.workers.map(([k, hours]) => ({
      userId: w.cast[k].id,
      name: w.cast[k].name,
      hours,
      source: "attendance" as const,
    })),
    ...(s.machines
      ? {
          machineRows: s.machines.map(([name, hours, note]) => ({
            name,
            hours,
            note: note ?? null,
            source: "manual" as const,
          })),
        }
      : {}),
    ...(rows.length ? { materialRows: rows.map((r) => ({ ...r, unitPriceMinor: null })) } : {}),
    ...(s.incidents
      ? {
          incidents: s.incidents.map((x, i) => ({
            id: `i-${s.date}-${i + 1}`,
            kind: x.kind,
            text: x.text,
          })),
        }
      : {}),
    ...(photoIds.length ? { photoIds } : {}),
    ...(s.forInvestor ? { forInvestor: true } : {}),
  };
  const saved = await w.kit.run<{ id: string }>(author.ctx, "realizace.diary.save", input);
  if (rows.some((r) => r.unitPriceMinor))
    await w.kit.run(w.cast.office.ctx, "realizace.diary.save", {
      jobId: j.id,
      date: s.date,
      autoWeather: false,
      materialRows: rows,
    });
  // docházka pracovníků, kteří jsou v deníku (stejné hodiny); kdo už ten den jinde odpracoval, podruhé se nezapisuje
  for (const [k, hours] of s.workers) {
    const taken = (await w.kit.s.db.execute(
      sql`select 1 from time_entry where user_id = ${w.cast[k].id} and date = ${s.date} and deleted_at is null limit 1`,
    )) as unknown as unknown[];
    if (!taken.length) await book(w, k, s.date, hours, { job: j });
  }
  if (s.sign) {
    const sig = await attachPng(
      w,
      author.ctx,
      j,
      `podpis-${s.date}.png`,
      {
        top: [250, 250, 250],
        bottom: [225, 228, 235],
        seed: 3,
      },
      [320, 120],
    );
    await w.kit.run(author.ctx, "realizace.diary.sign", {
      id: saved.id,
      signatureFileId: sig,
      name: author.name,
    });
  }
  return saved;
}

/** Počasí do deníku. */
export const WEATHER = {
  sun: { label: "Jasno", code: 0, min: 12, max: 22, rain: 0, wind: 9 },
  part: { label: "Polojasno", code: 2, min: 9, max: 17, rain: 0, wind: 14 },
  cloud: { label: "Zataženo", code: 3, min: 8, max: 14, rain: 0, wind: 12 },
  rain: { label: "Mírný déšť", code: 61, min: 7, max: 11, rain: 4.2, wind: 18 },
  cold: { label: "Oblačno, chladno", code: 3, min: 3, max: 8, rain: 0.2, wind: 16 },
} as const;
