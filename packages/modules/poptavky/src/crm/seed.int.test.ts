import { randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { ensurePipeline, getPipeline } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import { connectAppDb } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { job } from "@rebar/zakazky/schema";
import { crmActivityType, inquiry } from "../schema";
import { ensureCrmDefaults } from "./seed";

const app = connectAppDb();
afterAll(() => app.close());

/** Stavy před CRM: pipeline zakázek se stavy „Poptávka“ a „Nabídka“, pipeline poptávek se šesti stavy. */
const LEGACY_JOB = [
  { name: "Poptávka", color: "gray", phase: "inquiry" },
  { name: "Nabídka", color: "purple", phase: "offer" },
  { name: "Vlastní stav klienta", color: "teal", phase: "offer" },
  { name: "Příprava", color: "blue", phase: "preparation" },
  { name: "Realizace", color: "orange", phase: "execution" },
  { name: "Prohráno", color: "red", phase: "lost", kind: "lost" as const },
];
const LEGACY_INQUIRY = [
  { name: "Nová", color: "gray" },
  { name: "Kvalifikace", color: "blue" },
  { name: "Nabídka odeslána", color: "purple" },
  { name: "Vyjednávání", color: "orange" },
  { name: "Vyhráno", color: "green", kind: "won" as const },
  { name: "Prohráno", color: "red", kind: "lost" as const },
];

describe("ensureCrmDefaults: stávající instance před CRM", () => {
  it("přejmenuje staré stavy, doplní obchodní stavy, zredukuje poptávky a je idempotentní", async () => {
    await ensurePipeline(app.db, {
      entityType: "job",
      key: "default",
      name: "Zakázky",
      stages: LEGACY_JOB,
    });
    await ensurePipeline(app.db, {
      entityType: "inquiry",
      key: "default",
      name: "Poptávky",
      stages: LEGACY_INQUIRY,
    });
    const jobPipeline = (await getPipeline(app.db, "job", "default"))!;
    const legacyOf = (n: string) => jobPipeline.stages.find((s) => s.name === n)!;
    const [c] = await app.db
      .insert(company)
      .values({ name: `Firma ${randomBytes(3).toString("hex")}` })
      .returning();
    const mkJob = async (stageName: string, phase: string, value: number) =>
      (
        await app.db
          .insert(job)
          .values({
            number: `T-${randomBytes(4).toString("hex")}`,
            title: "Stará zakázka",
            companyId: c!.id,
            stageId: legacyOf(stageName).id,
            phase,
            valueMinor: value,
            sumContractMinor: value,
          })
          .returning()
      )[0]!;
    const inqPipeline = (await getPipeline(app.db, "inquiry", "default"))!;
    const inqStage = (n: string) => inqPipeline.stages.find((s) => s.name === n)!;
    const mkInquiry = async (stageName: string) =>
      (
        await app.db
          .insert(inquiry)
          .values({ title: `Poptávka ${stageName}`, stageId: inqStage(stageName).id })
          .returning()
      )[0]!;

    const inquiryJob = await mkJob("Poptávka", "inquiry", 500_000);
    const offerJob = await mkJob("Nabídka", "offer", 1_000_000);
    const customJob = await mkJob("Vlastní stav klienta", "offer", 200_000);
    const wonJob = await mkJob("Realizace", "execution", 300_000);
    const lostJob = await mkJob("Prohráno", "lost", 400_000);
    const iNew = await mkInquiry("Nová");
    const iQual = await mkInquiry("Kvalifikace");
    const iNeg = await mkInquiry("Vyjednávání");
    const iWon = await mkInquiry("Vyhráno");
    const iLost = await mkInquiry("Prohráno");

    const first = await ensureCrmDefaults(app.db);
    expect(first).toMatchObject({
      activityTypesAdded: 6,
      jobStagesRenamed: 2,
      jobStagesAdded: 4,
      inquiryStagesRenamed: 2,
      inquiryStagesRemoved: 3,
    });

    // stavy zakázek: staré přejmenované (zakázky v nich zůstaly), nové doplněné, pořadí podle fází
    const after = (await getPipeline(app.db, "job", "default"))!;
    expect(after.stages.map((s) => s.name)).toEqual([
      "Nová poptávka",
      "Kontaktováno",
      "Obhlídka",
      "Nabídka v přípravě",
      "Nabídka odeslána",
      "Jednání",
      "Vlastní stav klienta",
      "Příprava",
      "Realizace",
      "Prohráno",
    ]);
    const byName = new Map(after.stages.map((s) => [s.name, s]));
    expect(byName.get("Nová poptávka")!.id).toBe(legacyOf("Poptávka").id);
    expect(byName.get("Nabídka v přípravě")!.id).toBe(legacyOf("Nabídka").id);
    expect(byName.get("Nová poptávka")).toMatchObject({ probabilityPct: 10, rottingDays: 3 });
    expect(byName.get("Jednání")).toMatchObject({
      probabilityPct: 80,
      rottingDays: 7,
      phase: "offer",
    });
    expect(byName.get("Vlastní stav klienta")).toMatchObject({
      probabilityPct: null,
      rottingDays: null,
    });
    expect(byName.get("Příprava")!.probabilityPct).toBeNull();
    const rows = await app.db
      .select({ id: job.id, stageId: job.stageId, weighted: job.crmWeightedMinor })
      .from(job)
      .where(inArray(job.id, [inquiryJob.id, offerJob.id, customJob.id, wonJob.id, lostJob.id]));
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(inquiryJob.id)!.stageId).toBe(byName.get("Nová poptávka")!.id);
    // přepočet vážené hodnoty po nasazení: 10 %, 50 %, bez pravděpodobnosti = 0, vyhráno = 100 %, prohráno = 0
    expect(byId.get(inquiryJob.id)!.weighted).toBe(50_000);
    expect(byId.get(offerJob.id)!.weighted).toBe(500_000);
    expect(byId.get(customJob.id)!.weighted).toBe(0);
    expect(byId.get(wonJob.id)!.weighted).toBe(300_000);
    expect(byId.get(lostJob.id)!.weighted).toBe(0);

    // schránka poptávek: Nová / Kvalifikovaná / Zamítnutá, poptávky ze zrušených stavů v Nová
    const inq = (await getPipeline(app.db, "inquiry", "default"))!;
    expect(inq.stages.map((s) => [s.name, s.kind])).toEqual([
      ["Nová", "open"],
      ["Kvalifikovaná", "won"],
      ["Zamítnutá", "lost"],
    ]);
    expect(inq.stages.map((s) => s.position)).toEqual([0, 1, 2]);
    const inqRows = await app.db
      .select({ id: inquiry.id, stageId: inquiry.stageId })
      .from(inquiry)
      .where(inArray(inquiry.id, [iNew.id, iQual.id, iNeg.id, iWon.id, iLost.id]));
    const stageOfInq = new Map(inqRows.map((r) => [r.id, r.stageId]));
    const nova = inq.stages.find((s) => s.name === "Nová")!.id;
    expect(stageOfInq.get(iNew.id)).toBe(nova);
    expect(stageOfInq.get(iQual.id)).toBe(nova);
    expect(stageOfInq.get(iNeg.id)).toBe(nova);
    expect(stageOfInq.get(iWon.id)).toBe(inq.stages.find((s) => s.kind === "won")!.id);
    expect(stageOfInq.get(iLost.id)).toBe(inq.stages.find((s) => s.kind === "lost")!.id);

    // typy aktivit
    const types = await app.db.select().from(crmActivityType);
    expect(types.map((t) => t.key).sort()).toEqual(
      ["call", "deadline", "email", "meeting", "site_visit", "task"].sort(),
    );

    // druhé volání nic nemění (včetně úprav správce)
    await app.db
      .update(schema.pipelineStage)
      .set({ probabilityPct: 42 })
      .where(eq(schema.pipelineStage.id, byName.get("Obhlídka")!.id));
    const second = await ensureCrmDefaults(app.db);
    expect(second).toMatchObject({
      activityTypesAdded: 0,
      jobStagesAdded: 0,
      jobStagesRenamed: 0,
      inquiryStagesRemoved: 0,
      inquiryStagesRenamed: 0,
    });
    const final = (await getPipeline(app.db, "job", "default"))!;
    expect(final.stages.find((s) => s.name === "Obhlídka")!.probabilityPct).toBe(42);
    expect(final.stages.map((s) => s.name)).toEqual(after.stages.map((s) => s.name));
  });
});
