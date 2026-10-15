import { sql } from "drizzle-orm";
import type { Executor } from "@rebar/core/db";
import { templatePayload, type TemplatePayloadInput } from "../contract";
import { jobTemplate } from "../schema";
import type { BillingModelCode, JobType } from "../shared";

/*
  Výchozí šablony zakázek (ZAK-04, ZAK-12): počáteční nastavení, které se upravuje v Nastavení → Šablony zakázek.
  Částky jsou v haléřích (7 000 Kč = 700 000), termíny v dnech od startu zakázky.
*/

type Task = [phaseIndex: number, title: string, dueOffsetDays: number | null, typeKey?: string];

const tasks = (items: Task[]): TemplatePayloadInput["tasks"] =>
  items.map(([phaseIndex, title, dueOffsetDays, typeKey]) => ({
    phaseIndex,
    title,
    typeKey: typeKey ?? "task",
    priority: "medium" as const,
    assignee: { rule: "owner" as const },
    dueOffsetDays,
    estimateMin: null,
    description: null,
  }));

const phase = (
  name: string,
  offsetDays: number,
  durationDays: number,
  role: "intro_evaluation" | "retainer" | null = null,
) => ({ name, role, offsetDays, durationDays });

/** Definice jedné výchozí šablony. */
export type DefaultTemplate = {
  name: string;
  type: JobType;
  description: string;
  defaultBillingModel: BillingModelCode;
  isDefault: boolean;
  payload: TemplatePayloadInput;
};

/** Výchozí šablony: Web, Marketing – úvodní fáze (výchozí pro marketing), Marketing – retainer, Systémy. */
export const DEFAULT_TEMPLATES: readonly DefaultTemplate[] = [
  {
    name: "Web",
    type: "web",
    description: "Nový web od podkladů po předání klientovi.",
    defaultBillingModel: "one_off",
    isDefault: true,
    payload: {
      v: 1,
      phases: [
        phase("Podklady", 0, 7),
        phase("Návrh", 7, 10),
        phase("Vývoj", 17, 21),
        phase("Revize klienta", 38, 7),
        phase("Spuštění", 45, 3),
        phase("Předání", 48, 4),
      ],
      tasks: tasks([
        [0, "Získat od klienta podklady (texty, fotografie, logo)", 7],
        [0, "Domluvit přístupy k doméně a hostingu", 5],
        [1, "Připravit návrh designu", 14],
        [1, "Schválit návrh s klientem", 17, "meeting"],
        [2, "Naprogramovat web", 35],
        [2, "Otestovat web na mobilu a v prohlížečích", 38],
        [3, "Poslat web klientovi k revizi", 38],
        [3, "Zapracovat připomínky klienta", 44],
        [4, "Spustit web na ostré doméně", 47],
        [4, "Nastavit měření a přesměrování", 48],
        [5, "Předat klientovi přístupy a zaškolit ho", 52, "meeting"],
      ]),
      payments: [],
    },
  },
  {
    name: "Marketing – úvodní fáze",
    type: "marketing",
    description:
      "Poptávkové kampaně: úvodní fáze za 2 × 7 000 Kč (první fakturuje vlastník zakázky, druhou druhý partner), pak retainer.",
    defaultBillingModel: "intro_then_retainer",
    isDefault: true,
    payload: {
      v: 1,
      phases: [
        phase("Onboarding (přístupy, Business Manager, pixel)", 0, 7),
        phase("Tvorba kreativ a videí", 7, 10),
        phase("Spuštění kampaní", 17, 4),
        phase("Optimalizace", 21, 21),
        phase("Vyhodnocení úvodní fáze", 42, 3, "intro_evaluation"),
        phase("Retainer", 45, 0, "retainer"),
      ],
      tasks: tasks([
        [0, "Získat přístupy do Business Manageru a reklamního účtu", 3],
        [0, "Nainstalovat Meta pixel a ověřit události", 7],
        [1, "Připravit scénáře a kreativy reklam", 10],
        [1, "Natočit nebo vygenerovat videa a fotografie", 17],
        [2, "Spustit poptávkové kampaně", 21],
        [3, "Týdenní kontrola kampaní a rozpočtů", 28],
        [3, "Optimalizovat cílení a kreativy", 35],
        [4, "Připravit vyhodnocení úvodní fáze pro klienta", 42],
        [4, "Schůzka s klientem: pokračovat na retainer?", 44, "meeting"],
      ]),
      payments: [
        {
          description: "Úvodní fáze – 1. platba",
          kind: "intro",
          amountMinor: 700_000,
          issuer: { rule: "owner" },
          dueOffsetDays: 14,
        },
        {
          description: "Úvodní fáze – 2. platba",
          kind: "intro",
          amountMinor: 700_000,
          issuer: { rule: "other" },
          dueOffsetDays: 45,
        },
      ],
    },
  },
  {
    name: "Marketing – retainer",
    type: "marketing",
    description: "Poptávkové kampaně rovnou na měsíční retainer, bez úvodní fáze a vyhodnocení.",
    defaultBillingModel: "retainer",
    isDefault: false,
    payload: {
      v: 1,
      phases: [
        phase("Onboarding (přístupy, Business Manager, pixel)", 0, 7),
        phase("Tvorba kreativ a videí", 7, 10),
        phase("Spuštění kampaní", 17, 4),
        phase("Optimalizace", 21, 21),
        phase("Retainer", 42, 0, "retainer"),
      ],
      tasks: tasks([
        [0, "Získat přístupy do Business Manageru a reklamního účtu", 3],
        [0, "Nainstalovat Meta pixel a ověřit události", 7],
        [1, "Připravit scénáře a kreativy reklam", 10],
        [2, "Spustit poptávkové kampaně", 21],
        [3, "Týdenní kontrola kampaní a rozpočtů", 28],
      ]),
      payments: [],
    },
  },
  {
    name: "Systémy",
    type: "systemy",
    description: "Systém na míru od analýzy po nasazení a podporu.",
    defaultBillingModel: "one_off",
    isDefault: true,
    payload: {
      v: 1,
      phases: [
        phase("Analýza", 0, 10),
        phase("Specifikace", 10, 10),
        phase("Vývoj", 20, 42),
        phase("Testování", 62, 14),
        phase("Nasazení", 76, 3),
        phase("Podpora", 79, 0),
      ],
      tasks: tasks([
        [0, "Zmapovat procesy a potřeby klienta", 7, "meeting"],
        [1, "Napsat specifikaci a odsouhlasit ji s klientem", 20],
        [2, "Naprogramovat první verzi systému", 45],
        [3, "Otestovat systém s klientem", 72, "meeting"],
        [4, "Nasadit systém do ostrého provozu", 78],
        [5, "Předat dokumentaci a domluvit podporu", 82],
      ]),
      payments: [],
    },
  },
];

/**
 * Založí výchozí šablony, ale jen když je tabulka šablon úplně prázdná (i bez smazaných): správce si šablony
 * upravuje a smazané se nemají vracet. Idempotentní; vrací počet založených šablon.
 */
export async function ensureDefaultTemplates(db: Executor): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(jobTemplate);
  if ((r?.n ?? 0) > 0) return 0;
  await db.insert(jobTemplate).values(
    DEFAULT_TEMPLATES.map((t) => ({
      name: t.name,
      type: t.type,
      description: t.description,
      defaultBillingModel: t.defaultBillingModel,
      isDefault: t.isDefault,
      payload: templatePayload.parse(t.payload),
    })),
  );
  return DEFAULT_TEMPLATES.length;
}
