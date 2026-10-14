import { uploadFile } from "@rebar/core/files";
import { sql } from "./kit";
import type { Ctx } from "@rebar/core/rbac";
import { type BUDGETS, fillBudget, type BudgetDef } from "./budgets";
import { demoPng } from "./png";
import type { DemoUserKey } from "./users";
import type { DemoJob, World } from "./world";

export type Plan = {
  key: string;
  title: string;
  company: string;
  person?: string;
  manager: DemoUserKey;
  members?: DemoUserKey[];
  address: string;
  description?: string;
  budget?: keyof typeof BUDGETS;
  retentionBp?: number;
  vatMode?: "standard" | "reverse_charge";
  warrantyMonths?: number;
  startDate?: string;
  endDate?: string;
  /** Odhad hodnoty z poptávky (původní smluvní cena do vyhrání nabídky). */
  valueKc?: number;
};

export async function createJob(w: World, p: Plan): Promise<DemoJob> {
  const row = await w.kit.create(w.cast.office.ctx, "job", {
    title: p.title,
    company: w.contacts.company[p.company],
    ...(p.person ? { person: w.contacts.person[p.person] } : {}),
    manager: w.cast[p.manager].id,
    address: p.address,
    ...(p.description ? { description: p.description } : {}),
    ...(p.retentionBp ? { retentionBp: p.retentionBp } : {}),
    ...(p.vatMode ? { vatMode: p.vatMode } : {}),
    ...(p.warrantyMonths ? { warrantyMonths: p.warrantyMonths } : {}),
    ...(p.startDate ? { startDate: p.startDate } : {}),
    ...(p.endDate ? { endDate: p.endDate } : {}),
    ...(p.valueKc ? { value: p.valueKc * 100 } : {}),
  });
  const job: DemoJob = {
    key: p.key,
    id: row.id,
    number: row.number,
    title: p.title,
    items: [],
    sections: {},
    manager: p.manager,
    members: p.members ?? [],
  };
  for (const m of job.members)
    await w.kit.run(w.cast.office.ctx, "zakazky.team.add", {
      jobId: job.id,
      userId: w.cast[m].id,
      role: w.cast[m].ctx.actor.roleKey === "foreman" ? "Mistr" : "Řemeslník",
    });
  w.jobs[p.key] = job;
  w.jobList.push(job);
  return job;
}

export async function moveTo(
  w: World,
  j: DemoJob,
  to: string,
  reason?: string,
  by = w.cast.office.ctx,
) {
  return w.kit.run(by, "zakazky.transition", { jobId: j.id, to, ...(reason ? { reason } : {}) });
}

type TreeSection = {
  id: string;
  title: string;
  items: { id: string; title: string }[];
  children: TreeSection[];
};
type Tree = {
  version: { id: string; kind: string; status: string } | null;
  objects: { sections: TreeSection[] }[];
};

/** Načte položky a oddíly aktuální verze rozpočtu (po vyhrání jsou to položky realizace, ne nabídky). */
export async function reloadBudget(w: World, j: DemoJob, ctx: Ctx = w.cast.office.ctx) {
  const tree = await w.kit.run<Tree>(ctx, "zakazky.budget.tree", { jobId: j.id });
  j.items = [];
  j.sections = {};
  const walk = (s: TreeSection) => {
    j.sections[s.title] = s.id;
    for (const i of s.items)
      j.items.push({ id: i.id, title: i.title, sectionId: s.id, section: s.title });
    s.children.forEach(walk);
  };
  tree.objects.forEach((o) => o.sections.forEach(walk));
  return tree;
}

/** Nabídka: vyplní rozpočet nabídkové verze (zakázka už musí být ve fázi nabídka). */
export async function fillOffer(w: World, j: DemoJob, budget: BudgetDef) {
  const c = w.cast.office.ctx;
  const tree = await w.kit.run<Tree>(c, "zakazky.budget.tree", { jobId: j.id });
  if (!tree.version || tree.version.kind !== "offer")
    throw new Error(`Zakázka ${j.number} nemá nabídku.`);
  const built = await fillBudget(w.kit, c, j.id, tree.version.id, budget);
  j.items = built.items;
  j.sections = built.sections;
  return tree.version.id;
}

export async function sendOffer(w: World, j: DemoJob) {
  const tree = await w.kit.run<Tree>(w.cast.office.ctx, "zakazky.budget.tree", { jobId: j.id });
  await w.kit.run(w.cast.office.ctx, "zakazky.budget.version.setStatus", {
    versionId: tree.version!.id,
    status: "sent",
  });
}

/** Nahraje obrázek (fotka, podpis) a připojí ho k zakázce. */
export async function attachPng(
  w: World,
  by: Ctx,
  j: DemoJob,
  name: string,
  colors: { top: [number, number, number]; bottom: [number, number, number]; seed?: number },
  size: [number, number] = [640, 420],
  note?: string,
) {
  const data = demoPng(size[0], size[1], colors.top, colors.bottom, colors.seed ?? 1);
  const res = await uploadFile(
    by,
    { storage: w.kit.s.deps.storage },
    {
      name,
      data,
      attachTo: { entityType: "job", entityId: j.id, kind: "photo", ...(note ? { note } : {}) },
    },
  );
  return res.file.id as string;
}

/** Id stavu pipeline entity podle názvu (např. vady: „Opraveno“). */
export async function stageId(w: World, entityType: string, name: string): Promise<string> {
  const rows = (await w.kit.s.db.execute(
    sql`select ps.id from pipeline_stage ps join pipeline p on p.id = ps.pipeline_id
        where p.entity_type = ${entityType} and ps.name = ${name} and ps.deleted_at is null limit 1`,
  )) as unknown as { id: string }[];
  if (!rows[0]) throw new Error(`Stav „${name}“ pipeline ${entityType} neexistuje.`);
  return rows[0].id;
}

export type DefectSpec = {
  title: string;
  description: string;
  severity: "minor" | "normal" | "major";
  responsible: DemoUserKey;
  foundAt: string;
  dueDate?: string;
  state: "Nahlášená" | "V řešení" | "Opraveno";
  fixedAt?: string;
  by?: DemoUserKey;
};

export async function addDefect(w: World, j: DemoJob, s: DefectSpec) {
  return w.kit.create(w.cast[s.by ?? "office"].ctx, "defect", {
    title: s.title,
    job: j.id,
    description: s.description,
    severity: s.severity,
    responsible: w.cast[s.responsible].id,
    foundAt: s.foundAt,
    ...(s.dueDate ? { dueDate: s.dueDate } : {}),
    stage: await stageId(w, "defect", s.state),
    ...(s.fixedAt ? { fixedAt: s.fixedAt } : {}),
  });
}

export type PhaseSpec = {
  name: string;
  from: string;
  to: string;
  progress: number;
  /** Navazuje na předchozí fázi v seznamu. */
  after?: boolean;
  hours?: number;
  responsible?: DemoUserKey;
  milestone?: boolean;
  actualStart?: string;
  actualEnd?: string;
  note?: string;
};

/** Harmonogram zakázky (fáze s postupem). Skutečné začátky a konce se zadávají, aby nebyly „dnes“. */
export async function addSchedule(w: World, j: DemoJob, phases: PhaseSpec[]) {
  const c = w.cast.office.ctx;
  let prev: string | undefined;
  for (const p of phases) {
    const res = await w.kit.run<{ id: string }>(c, "realizace.phases.save", {
      jobId: j.id,
      name: p.name,
      startDate: p.from,
      endDate: p.to,
      progress: p.progress,
      ...(p.hours ? { plannedHours: p.hours } : {}),
      ...(p.responsible ? { responsibleId: w.cast[p.responsible].id } : {}),
      ...(p.after && prev ? { dependsOnId: prev } : {}),
      milestone: p.milestone ?? false,
      ...(p.note ? { note: p.note } : {}),
      ...(p.actualStart ? { actualStart: p.actualStart } : {}),
      ...(p.actualEnd ? { actualEnd: p.actualEnd } : {}),
      shift: false,
    });
    prev = res.id;
  }
}
