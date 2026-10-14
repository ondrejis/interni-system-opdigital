import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensureLookup, ensurePipeline } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  createRecord,
  registerEntityPolicies,
  resolveEntity,
  setPhaseHooks,
  type EntityRegistry,
} from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { manifest as kontaktyManifest } from "@rebar/kontakty";
import { company, person } from "@rebar/kontakty/schema";
import { companyEntity, kontaktyApi, personEntity } from "@rebar/kontakty/server";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import { job, jobCost, jobParticipant } from "@rebar/zakazky/schema";
import { jobEntity, server as zakazkyServer } from "@rebar/zakazky/server";
import { manifest } from "../../index";
import { crmActivity, crmActivityType, crmNote, inquiry } from "../../schema";
import { inquiryEntity } from "../../server";
import { crmHooks } from "../hooks";
import { ensureCrmDefaults } from "../seed";
import { participantAddCommand, quickAddCommand } from "./index";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
const deps = () => ({ registry, baseURL: "http://localhost" }) as unknown as ModuleDeps;

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, inquiryEntity, jobEntity]);
  registerEntityPolicies(registry);
  for (const m of [manifest, zakazkyManifest, kontaktyManifest]) {
    for (const p of "pipelines" in m.seed ? (m.seed.pipelines ?? []) : [])
      await ensurePipeline(app.db, p);
    for (const l of "lookups" in m.seed ? m.seed.lookups : []) await ensureLookup(app.db, l);
    if ("series" in m.seed) await ensureSeries(app.db, m.seed.series);
  }
  await ensureCrmDefaults(app.db);
});
beforeEach(() => setPhaseHooks([...(zakazkyServer.phaseHooks ?? []), ...crmHooks]));

const tag = () => randomBytes(3).toString("hex");
const boss = () =>
  makeUser(
    app.db,
    (
      [
        "poptavky.read",
        "poptavky.write",
        "poptavky.convert",
        "zakazky.read",
        "zakazky.write",
        "kontakty.read",
        "kontakty.write",
        "kontakty.merge",
      ] as const
    ).map((k) => [k, "all"] as [string, "all"]),
  );

/** Kolik živých řádků v celé databázi ještě ukazuje na `id` přes zjištěné odkazy (cizí klíče, měkké vazby, polymorfní). */
async function stillPointingAt(entity: "company" | "person", id: string) {
  const refs = await kontaktyApi.discoverReferences(app.db, entity);
  const out: string[] = [];
  for (const c of refs.columns) {
    const r = (await app.db.execute(
      sql`select count(*)::int as n from ${sql.identifier(c.table)} where ${sql.identifier(c.column)} = ${id}::uuid`,
    )) as unknown as { n: number }[];
    if (r[0]!.n) out.push(`${c.table}.${c.column}: ${r[0]!.n}`);
  }
  for (const p of refs.poly) {
    const r = (await app.db.execute(
      sql`select count(*)::int as n from ${sql.identifier(p.table)} where ${sql.identifier(p.typeColumn)} = ${entity} and ${sql.identifier(p.idColumn)} = ${id}::uuid`,
    )) as unknown as { n: number }[];
    if (r[0]!.n) out.push(`${p.table}: ${r[0]!.n}`);
  }
  return out;
}

describe("sloučení kontaktů přepojí odkazy napříč moduly", () => {
  it("katalog: žádný sloupec s názvem firma/osoba/dodavatel/odběratel není mimo zjištěné odkazy", async () => {
    for (const entity of ["company", "person"] as const) {
      const refs = await kontaktyApi.discoverReferences(app.db, entity);
      const known = new Set(refs.columns.map((c) => `${c.table}.${c.column}`));
      const rows = (await app.db.execute(sql`
        select table_name as t, column_name as c from information_schema.columns
        where table_schema = 'public' and data_type = 'uuid'
          and column_name ~ '(company|person|supplier|customer|client|contact|investor)(_id)?$'`)) as unknown as {
        t: string;
        c: string;
      }[];
      // sloupce, které patří k jinému typu záznamu než k tomuto (firma × osoba), se tu nehledají
      const mine = rows.filter((r) =>
        entity === "company" ? !/person/.test(r.c) : /person|contact/.test(r.c),
      );
      const missing = mine
        .map((r) => `${r.t}.${r.c}`)
        .filter((k) => !known.has(k) && !["company.parent_company_id"].includes(k));
      expect(missing, `neznámý odkaz na ${entity}`).toEqual([]);
    }
  });

  it("firma: zakázky, poptávky, aktivity, poznámky, komentáře, úkoly, soubory, náklady, osoby, hierarchie", async () => {
    const u = await boss();
    const t = tag();
    const [source] = await app.db
      .insert(company)
      .values({ name: `Zdroj ${t}` })
      .returning();
    const [target] = await app.db
      .insert(company)
      .values({ name: `Cíl ${t}` })
      .returning();
    const sid = source!.id;
    const tid = target!.id;

    const deal = await quickAddCommand.handler(
      u.ctx,
      quickAddCommand.input.parse({ company: { companyId: sid }, skipFirstActivity: true }),
      deps(),
    );
    const inq = await createRecord(u.ctx, registry, await resolveEntity(app.db, inquiryEntity), {
      title: `Poptávka ${t}`,
      company: sid,
    });
    const [type] = await app.db.select().from(crmActivityType).limit(1);
    await app.db
      .insert(crmActivity)
      .values({ typeId: type!.id, subject: "Zavolat", companyId: sid });
    await app.db.insert(crmNote).values({ body: "poznámka", entityType: "company", entityId: sid });
    await app.db
      .insert(schema.comment)
      .values({ entityType: "company", entityId: sid, authorId: u.id, body: "komentář" });
    await app.db
      .insert(schema.task)
      .values({ title: "úkol", assigneeId: u.id, entityType: "company", entityId: sid });
    const [f] = await app.db
      .insert(schema.file)
      .values({
        storageKey: `k-${t}`,
        name: "a.pdf",
        mime: "application/pdf",
        size: 1,
        sha256: "x",
        kind: "document",
      })
      .returning();
    // stejný soubor je připojený ke zdroji i k cíli: po sloučení zůstane jedno připojení
    await app.db.insert(schema.attachment).values([
      { fileId: f!.id, entityType: "company", entityId: sid },
      { fileId: f!.id, entityType: "company", entityId: tid },
    ]);
    await app.db.insert(jobCost).values({
      jobId: deal.jobId,
      date: "2026-10-01",
      category: "other",
      title: "náklad",
      supplierId: sid,
      amountMinor: 100,
    });
    await app.db.execute(
      sql`insert into stock_item (id, code, name, supplier_id) values (gen_random_uuid(), ${`K-${t}`}, 'Položka', ${sid}::uuid)`,
    );
    const [kid] = await app.db
      .insert(person)
      .values({ name: `Kontakt ${t}`, companyId: sid })
      .returning();
    const [child] = await app.db
      .insert(company)
      .values({ name: `Dcera ${t}`, parentId: sid })
      .returning();

    expect((await stillPointingAt("company", sid)).length).toBeGreaterThan(8);
    const res = await kontaktyApi.mergeContacts(u.ctx, "company", sid, tid);
    expect(res.moved).toBeGreaterThanOrEqual(10);

    expect(await stillPointingAt("company", sid)).toEqual([]);
    expect((await app.db.select().from(job).where(eq(job.id, deal.jobId)))[0]!.companyId).toBe(tid);
    expect(
      (await app.db.select().from(inquiry).where(eq(inquiry.id, inq.row.id)))[0]!.companyId,
    ).toBe(tid);
    expect((await app.db.select().from(person).where(eq(person.id, kid!.id)))[0]!.companyId).toBe(
      tid,
    );
    expect(
      (await app.db.select().from(company).where(eq(company.id, child!.id)))[0]!.parentId,
    ).toBe(tid);
    const att = await app.db
      .select()
      .from(schema.attachment)
      .where(and(eq(schema.attachment.entityId, tid), isNull(schema.attachment.deletedAt)));
    expect(att).toHaveLength(1);
    expect(
      (await app.db.select().from(company).where(eq(company.id, sid)))[0]!.deletedAt,
    ).not.toBeNull();
  });

  it("osoba: hlavní kontakt zakázek, poptávky, účastníci (i konflikt na téže zakázce), aktivity, poznámky", async () => {
    const u = await boss();
    const t = tag();
    const [source] = await app.db
      .insert(person)
      .values({ name: `Osoba zdroj ${t}` })
      .returning();
    const [target] = await app.db
      .insert(person)
      .values({ name: `Osoba cíl ${t}` })
      .returning();
    const sid = source!.id;
    const tid = target!.id;
    const deal = await quickAddCommand.handler(
      u.ctx,
      quickAddCommand.input.parse({
        company: { name: `Fa ${t}` },
        contact: { personId: sid },
        skipFirstActivity: true,
      }),
      deps(),
    );
    const other = await quickAddCommand.handler(
      u.ctx,
      quickAddCommand.input.parse({ company: { name: `Fb ${t}` }, skipFirstActivity: true }),
      deps(),
    );
    // zdroj i cíl jsou účastníky téže zakázky (konflikt), zdroj ještě jiné zakázky
    await participantAddCommand.handler(
      u.ctx,
      { jobId: deal.jobId, personId: sid, role: "TDI" },
      deps(),
    );
    await participantAddCommand.handler(
      u.ctx,
      { jobId: deal.jobId, personId: tid, role: "investor" },
      deps(),
    );
    await participantAddCommand.handler(
      u.ctx,
      { jobId: other.jobId, personId: sid, role: "projektant" },
      deps(),
    );
    await createRecord(u.ctx, registry, await resolveEntity(app.db, inquiryEntity), {
      title: `P ${t}`,
      person: sid,
    });
    const [type] = await app.db.select().from(crmActivityType).limit(1);
    await app.db.insert(crmActivity).values({ typeId: type!.id, subject: "Hovor", personId: sid });
    await app.db.insert(crmNote).values({ body: "x", entityType: "person", entityId: sid });

    await kontaktyApi.mergeContacts(u.ctx, "person", sid, tid);
    expect(await stillPointingAt("person", sid)).toEqual([]);
    expect((await app.db.select().from(job).where(eq(job.id, deal.jobId)))[0]!.personId).toBe(tid);
    const parts = await app.db
      .select()
      .from(jobParticipant)
      .where(and(isNull(jobParticipant.deletedAt), eq(jobParticipant.personId, tid)));
    // zakázka s konfliktem: zůstává role cíle; druhá zakázka přešla na cíl
    expect(parts.map((p) => `${p.jobId === deal.jobId ? "A" : "B"}:${p.role}`).sort()).toEqual([
      "A:investor",
      "B:projektant",
    ]);
  });

  it("selže-li sloučení, nezůstane nic napůl (transakce)", async () => {
    const u = await boss();
    const t = tag();
    const [source] = await app.db
      .insert(company)
      .values({ name: `Rb zdroj ${t}` })
      .returning();
    const [kid] = await app.db
      .insert(person)
      .values({ name: `Rb ${t}`, companyId: source!.id })
      .returning();
    // cílový záznam neexistuje: sloučení se zamítne dřív, než se cokoli přepojí
    await expect(
      kontaktyApi.mergeContacts(u.ctx, "company", source!.id, crypto.randomUUID()),
    ).rejects.toThrow();
    expect((await app.db.select().from(person).where(eq(person.id, kid!.id)))[0]!.companyId).toBe(
      source!.id,
    );
    expect(
      (await app.db.select().from(company).where(eq(company.id, source!.id)))[0]!.deletedAt,
    ).toBeNull();
  });
});
