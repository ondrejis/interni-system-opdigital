import { randomBytes } from "node:crypto";
import { getPipeline } from "@rebar/core/config-data";
import { crmActivity, crmActivityType, crmNote, inquiry } from "@rebar/poptavky/schema";
import type { FixtureEnv } from "./env";

/** Poptávky a CRM: poptávka, typ aktivity, aktivita a poznámka na cizí zakázce (B). */
export async function poptavkyPart(env: FixtureEnv, jobB: { id: string }) {
  const { db, people } = env;
  const stage = (await getPipeline(db, "inquiry", "default"))!.stages[0]!;
  const [inq] = await db
    .insert(inquiry)
    .values({ title: "Poptávka", stageId: stage.id })
    .returning();
  const [actType] = await db
    .insert(crmActivityType)
    .values({ key: `sonda_${randomBytes(3).toString("hex")}`, name: "Sonda" })
    .returning();
  const [act] = await db
    .insert(crmActivity)
    .values({
      typeId: actType!.id,
      subject: "Aktivita na cizí zakázce",
      assigneeId: people.externistaB.id,
      jobId: jobB.id,
    })
    .returning();
  const [note] = await db
    .insert(crmNote)
    .values({
      body: "Poznámka k cizí zakázce",
      entityType: "job",
      entityId: jobB.id,
      authorId: people.externistaB.id,
    })
    .returning();
  return {
    inquiry: inq!.id,
    crmActivity: act!.id,
    crmNote: note!.id,
    crmActivityType: actType!.id,
  };
}
