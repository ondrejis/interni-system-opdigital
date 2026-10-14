import { timeEntry } from "@rebar/dochazka/schema";
import type { FixtureEnv } from "./env";

/** Docházka: výkaz hodin externisty A na jeho zakázce a výkaz externisty B na cizí zakázce. */
export async function dochazkaPart(env: FixtureEnv, jobA: { id: string }, jobB: { id: string }) {
  const { db, people } = env;
  const [entryA] = await db
    .insert(timeEntry)
    .values({ userId: people.externistaA.id, date: "2026-09-15", jobId: jobA.id, minutes: 480 })
    .returning();
  const [entryB] = await db
    .insert(timeEntry)
    .values({ userId: people.externistaB.id, date: "2026-09-15", jobId: jobB.id, minutes: 240 })
    .returning();
  return { timeEntryA: entryA!.id, timeEntryB: entryB!.id };
}
