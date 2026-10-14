import { randomBytes } from "node:crypto";
import { getPipeline } from "@rebar/core/config-data";
import { indexRecord } from "@rebar/core/entities";
import { job, jobMember, jobTemplate } from "@rebar/zakazky/schema";
import { MONEY } from "./fixture";
import type { FixtureEnv } from "./env";

/**
 * Zakázky: A patří externistovi A, B externistovi B (cizí zakázka z pohledu A). Vyplňují se jen povinné sloupce,
 * aby fixtura přežila přepracování modelu zakázky.
 */
export async function zakazkyPart(env: FixtureEnv, clientId: string) {
  const { db, people } = env;
  const stage = (await getPipeline(db, "job", "default"))!.stages[0]!;
  async function makeJob(tag: string, managerId: string, memberId: string) {
    const [j] = await db
      .insert(job)
      .values({
        number: `SEC-${tag}-${randomBytes(2).toString("hex")}`,
        title: `Zakázka ${tag}`,
        companyId: clientId,
        stageId: stage.id,
        managerId,
        valueMinor: MONEY.value,
        startDate: "2026-09-01",
        endDate: "2026-12-01",
      })
      .returning();
    await db.insert(jobMember).values({ jobId: j!.id, userId: memberId });
    await indexRecord(db, { def: env.entityDef("job") }, j!);
    return { id: j!.id, number: j!.number, title: j!.title };
  }
  const jobA = await makeJob("A", people.externistaA.id, people.externistaA.id);
  const jobB = await makeJob("B", people.externistaB.id, people.externistaB.id);
  const [tpl] = await db.insert(jobTemplate).values({ name: "Šablona", payload: {} }).returning();
  return { jobA, jobB, template: tpl!.id };
}
