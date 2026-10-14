import { calendarImport, calendarResource, event, eventAttendee } from "@rebar/kalendar/schema";
import type { FixtureEnv } from "./env";

/** Kalendář: schůzky externistů A a B (s vazbou na jejich zakázky), zdroj a cizí import iCal. */
export async function kalendarPart(env: FixtureEnv, jobA: { id: string }, jobB: { id: string }) {
  const { db, people } = env;
  const [res] = await db.insert(calendarResource).values({ name: "Zasedačka" }).returning();
  const startsAt = new Date("2026-10-20T08:00:00Z");
  const endsAt = new Date("2026-10-20T09:00:00Z");
  const [evA] = await db
    .insert(event)
    .values({
      title: "Schůzka A",
      startsAt,
      endsAt,
      ownerId: people.externistaA.id,
      jobId: jobA.id,
    })
    .returning();
  const [evB] = await db
    .insert(event)
    .values({
      title: "Schůzka B",
      startsAt,
      endsAt,
      ownerId: people.externistaB.id,
      jobId: jobB.id,
    })
    .returning();
  await db.insert(eventAttendee).values({ eventId: evB!.id, userId: people.externistaB.id });
  const [impB] = await db
    .insert(calendarImport)
    .values({ userId: people.externistaB.id, name: "Cizí kalendář", urlEncrypted: "x" })
    .returning();
  return { eventA: evA!.id, eventB: evB!.id, resource: res!.id, importB: impB!.id };
}
