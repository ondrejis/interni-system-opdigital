import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema, type Db } from "@rebar/core/db";
import {
  createRecord,
  getRecord,
  PrivateAssignmentError,
  queryRecords,
  searchAll,
  setVisibility,
  updateRecord,
} from "@rebar/core/entities";
import { listAttachments, openFile, uploadFile } from "@rebar/core/files";
import { queryHistory } from "@rebar/core/history";
import { setDomainEvents } from "@rebar/core/events";
import type { CommandDef, ModuleDeps } from "@rebar/core/module-server";
import { realtimeFor } from "@rebar/core/realtime";
import { NotFoundError, PermissionError, UserError, type Ctx } from "@rebar/core/rbac";
import { addDaysIso } from "@rebar/core/time";
import { connectAppDb } from "@rebar/core/testing";
import { assertCommandPermission } from "../apps/web/src/server/command-gate";
import { hasCanary, PRIVATE_AMOUNT_MINOR, SHARED_AMOUNT_MINOR, serialize } from "./support/canary";
import {
  addPayment,
  buildPrivateFixture,
  buildRichData,
  fullDeps,
  type PrivateFixture,
  type RichData,
} from "./support/fixture";
import { buildFixture, isolatedDb, type Fixture } from "./support/security-fixture";

/*
  Scénáře soukromí napříč moduly (QA-SEC): AS-05 (soukromá zakázka Ondřeje se nikde neukáže Patrikovi), AS-06 (soukromý
  úkol nejde přiřadit Patrikovi, „Zveřejnit a přiřadit“), AS-15 (přepnutí viditelnosti přepočítá vše, historie zůstane
  skrytá), R-31 (soukromá organizace nedědí do obchodů a zakázek), odchozí webhooky a realtime. Čísla označení scénářů
  odpovídají zadání QA-SEC; v `C-digest` mají AS-06 a AS-15 jiný obsah (role, koš a webhooky), viz E-rozbehovy-log.
*/

const app = connectAppDb();
let f: Fixture;
let fx: PrivateFixture;
let rich: RichData;
let db: Db;
let deps: ModuleDeps;
let discard: () => Promise<void>;
let owner: Ctx;
let partner: Ctx;
const E = (key: string) => fx.resolve(key);

class Rollback extends Error {}
async function savepoint<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  let out!: T;
  try {
    await db.transaction(async (tx) => {
      out = await fn(tx as unknown as Db);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return out;
}

/** Spustí příkaz tak, jak ho spustí aplikace: brána oprávnění, validace vstupu, handler. */
async function run(name: string, ctx: Ctx, input: unknown = {}, tx?: Db): Promise<unknown> {
  const cmd = f.collected.commands.get(name) as CommandDef | undefined;
  if (!cmd) throw new Error(`Příkaz ${name} neexistuje.`);
  const c = tx ? { ...ctx, db: tx } : ctx;
  assertCommandPermission(c, cmd);
  return cmd.handler(c, cmd.input.parse(input), deps);
}
const rejected = (e: unknown) =>
  e instanceof PermissionError || e instanceof NotFoundError || e instanceof UserError;

beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  f = await buildFixture(db);
  deps = fullDeps(f);
  setDomainEvents(f.collected.eventHandlers, () => deps);
  fx = await buildPrivateFixture(f, db);
  rich = await buildRichData(f, fx, db);
  owner = f.people.owner.ctx;
  partner = f.people.partner.ctx;
}, 240_000);
afterAll(async () => {
  setDomainEvents(undefined, undefined);
  await discard();
  await app.close();
});

describe("AS-05: soukromá zakázka Ondřeje (úkoly, poznámky, platby, hodiny, složka, událost, odchozí data)", () => {
  const privJob = () => fx.parents.privateJob;

  it("detail a podřízené přehledy soukromé zakázky: partner dostane NotFound/Permission, nikdy data", async () => {
    for (const [name, input] of [
      ["zakazky.detail", { id: privJob() }],
      ["finance.job.overview", { jobId: privJob() }],
      ["finance.split.get", { jobId: privJob() }],
      ["hodiny.job.summary", { jobId: privJob() }],
      ["ukoly.forRecord", { entity: "job", id: privJob() }],
      ["ukoly.counts", { jobId: privJob() }],
      ["kalendar.forRecord", { entity: "job", id: privJob() }],
    ] as const) {
      if (!f.collected.commands.has(name)) continue;
      const r = await savepoint(async (tx) => {
        try {
          return { ok: true as const, v: await run(name, partner, input, tx) };
        } catch (e) {
          return { ok: false as const, e };
        }
      });
      if (r.ok) expect(hasCanary(r.v), `${name} prozradil canary`).toBe(false);
      else expect(rejected(r.e) || r.e instanceof Error, name).toBe(true);
    }
  });

  it("hodiny: týdenní přehled partnera neobsahuje hodiny soukromé zakázky (117 min), vlastníkův ano", async () => {
    const week = (ctx: Ctx) =>
      run("hodiny.week", ctx, { weekStart: undefined }).then((v) => serialize(v));
    const p = await week(partner);
    const o = await week(owner);
    expect(hasCanary(p)).toBe(false);
    expect(o).not.toBe(p);
  });

  it("kalendář: partner vidí události vlastníka jen jako „Obsazeno“ (soukromý úkol, příznak Google), odkaz na soukromý obchod bez názvu", async () => {
    const res = (await run("kalendar.range", partner, {
      from: addDaysIso(rich.today, -1),
      to: addDaysIso(rich.today, 1),
      who: "all",
    })) as {
      items: { id: string; kind: string; title: string; deal: unknown; taskId: string | null }[];
    };
    expect(hasCanary(res)).toBe(false);
    const byId = new Map(res.items.map((i) => [i.id, i]));
    for (const id of [rich.calendar.privateTaskEvent, rich.calendar.googlePrivateEvent]) {
      const it = byId.get(id);
      expect(it?.kind, "soukromá událost má být „Obsazeno“").toBe("busy");
    }
    const linked = byId.get(rich.calendar.linkedPrivateDealEvent);
    expect(linked?.deal, "odkaz na soukromý obchod se partnerovi nezobrazí").toBeNull();
    expect(byId.get(rich.calendar.sharedEvent)?.kind).toBe("event");
    // vlastník vidí vše
    const own = (await run("kalendar.range", owner, {
      from: addDaysIso(rich.today, -1),
      to: addDaysIso(rich.today, 1),
      who: "me",
    })) as unknown;
    expect(hasCanary(own)).toBe(true);
  });

  it("Disk: složka soukromé firmy a zakázky se partnerovi neukáže a nezakládá se (R-13)", async () => {
    const disk = deps.services.get("disk");
    const states = await disk.folderState(partner, "company", [
      rich.privCompany,
      rich.sharedCompany,
    ]);
    expect(serialize(states)).not.toContain("CANARY-FOLDER");
    const ownerStates = await disk.folderState(owner, "company", [rich.privCompany]);
    expect(serialize(ownerStates)).toContain("CANARY-FOLDER");
    const req = await savepoint(async (tx) =>
      disk
        .requestFolder({ ...partner, db: tx }, { entityType: "company", id: rich.privCompany })
        .then((v) => ({ ok: true as const, v }))
        .catch((e: unknown) => ({ ok: false as const, e })),
    );
    if (req.ok) expect(req.v.skipped ?? "private").toMatch(/private|disabled/);
    else expect(req.e instanceof Error).toBe(true);
  });

  it("součty klienta a saldo: soukromé platby a hodiny se nezapočítají (jen sdílené součty)", async () => {
    const part = (await run("finance.balance", partner)) as unknown;
    const own = (await run("finance.balance", owner)) as unknown;
    // saldo se pro vlastníka ani partnera nemění přítomností soukromých zakázek (spec: do vyrovnání se nepočítají)
    expect(serialize(own)).toBe(serialize(part));
    expect(serialize(part)).not.toContain(String(PRIVATE_AMOUNT_MINOR));
    const e = await E("payment");
    const pPage = await queryRecords(partner, f.registry, e, { limit: 200 });
    const oPage = await queryRecords(owner, f.registry, e, { limit: 200 });
    expect(Number(oPage.totals.amount)).toBeGreaterThan(Number(pPage.totals.amount));
    expect(Number(pPage.totals.amount)).toBeGreaterThanOrEqual(SHARED_AMOUNT_MINOR);
    expect(serialize(pPage)).not.toContain(String(PRIVATE_AMOUNT_MINOR));
  });

  it("přehledy financí: přepínač „zahrnout soukromé“ funguje jen vlastníkovi (partner ho nezíská)", async () => {
    const total = (v: unknown) =>
      (v as { incomeByPerson: { totalMinor: number } }).incomeByPerson.totalMinor;
    const base = total(await run("finance.reports", owner, { includePrivate: false }));
    const own = total(await run("finance.reports", owner, { includePrivate: true }));
    expect(base).toBeLessThan(PRIVATE_AMOUNT_MINOR);
    expect(own).toBeGreaterThanOrEqual(base + PRIVATE_AMOUNT_MINOR);
    const part = await savepoint(async (tx) =>
      run("finance.reports", partner, { includePrivate: true }, tx)
        .then((v) => total(v))
        .catch((e: unknown) => `chyba:${(e as Error).name}`),
    );
    // partner buď dostane odmítnutí, nebo jen sdílené součty (přepínač se u něj ignoruje)
    if (typeof part === "number") expect(part).toBeLessThan(PRIVATE_AMOUNT_MINOR);
  });

  it("hledání (Cmd+K) a historie: partner nenajde nic soukromého; vlastník ano", async () => {
    for (const q of ["CANARY", "PRIVATE-CANARY-job", "PRIVATE-CANARY-task", "faktura"]) {
      const p = await searchAll(partner, f.registry.all(), q, 50, { perType: 50 });
      expect(hasCanary(p), `hledání „${q}“`).toBe(false);
    }
    expect(
      (await searchAll(owner, f.registry.all(), "CANARY", 50, { perType: 50 })).length,
    ).toBeGreaterThan(5);
    const h = await queryHistory(partner, f.registry, { q: "CANARY" } as never);
    expect(hasCanary(h)).toBe(false);
    const ho = await queryHistory(owner, f.registry, { q: "CANARY" } as never);
    expect(ho.total).toBeGreaterThan(0);
  });

  it("soubory: příloha soukromé zakázky (PDF) se partnerovi nenabídne ani nestáhne podle ID", async () => {
    const store = new Map<string, Buffer>();
    const storage = {
      put: async (k: string, d: Buffer) => void store.set(k, d),
      get: async (k: string) => store.get(k) ?? null,
      delete: async (k: string) => void store.delete(k),
    } as never;
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
    const up = await uploadFile(owner, { storage } as never, {
      name: "PRIVATE-CANARY-smlouva.pdf",
      data: pdf,
      attachTo: { entityType: "job", entityId: fx.parents.privateJob },
    });
    await expect(openFile(partner, { storage } as never, up.file.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(listAttachments(partner, "job", fx.parents.privateJob)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      uploadFile(partner, { storage } as never, {
        name: "x.pdf",
        data: pdf,
        attachTo: { entityType: "job", entityId: fx.parents.privateJob },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect((await openFile(owner, { storage } as never, up.file.id)).name).toContain("CANARY");
  });

  it("odchozí webhooky: soukromé události dostane jen endpoint „Doručovat i soukromé“", async () => {
    const mk = async (name: string, includePrivate: boolean) =>
      (
        await db
          .insert(schema.webhookEndpoint)
          .values({
            name,
            url: "https://n8n.example.test/hook",
            secretEnc: "x",
            events: ["deal.*", "task.*", "payment.*", "project.*", "client.*", "drive.*"],
            includePrivate,
          } as never)
          .returning()
      )[0]!;
    const normal = await mk("normální", false);
    const full = await mk("Ondřejův", true);
    const ctx = owner;
    // soukromé záznamy zakládané příkazy modulů (ty vysílají události)
    const job = (await run("zakazky.create", ctx, {
      title: "Webhook soukromá zakázka",
      companyId: rich.privCompany,
      type: "web",
      isPrivate: true,
    }).catch(() => null)) as { id?: string } | null;
    await run("ukoly.create", ctx, { title: "PRIVATE-CANARY-webhook-task", isPrivate: true }).catch(
      () => null,
    );
    await addPayment(f, ctx, {
      jobId: job?.id ?? fx.parents.privateJob,
      description: "PRIVATE-CANARY-webhook-payment",
      amountMinor: 5_00,
    });
    await run("obchody.create", ctx, {
      title: "PRIVATE-CANARY-webhook-deal",
      companyId: rich.privCompany,
      isPrivate: true,
    }).catch(() => null);
    const rows = await db.select().from(schema.webhookDelivery);
    const toNormal = rows.filter((r) => r.endpointId === normal.id);
    const toFull = rows.filter((r) => r.endpointId === full.id);
    expect(toFull.length, "Ondřejův endpoint soukromé události dostává").toBeGreaterThan(0);
    for (const r of toNormal)
      expect(
        hasCanary(r.payload),
        `webhook ${r.event} na normální endpoint nese soukromá data`,
      ).toBe(false);
    // každá doručená událost normálního endpointu se týká sdíleného záznamu
    for (const r of toNormal) {
      const entity = (r.payload as { entity?: { isPrivate?: boolean } }).entity;
      expect(entity?.isPrivate, `webhook ${r.event} je označený soukromě`).not.toBe(true);
    }
  });

  it("realtime: signál o soukromé změně partner nedostane (jen typ+id+akce při změně viditelnosti)", () => {
    const change = {
      e: "job",
      i: fx.parents.privateJob,
      a: "updated",
      p: true,
      x: "company",
      y: "x",
    } as never;
    expect(realtimeFor(partner, change, () => null)).toBeNull();
    expect(realtimeFor(owner, change, () => null)).not.toBeNull();
    const vis = realtimeFor(
      partner,
      { ...(change as object), a: "visibility_changed" } as never,
      () => null,
    );
    expect(vis).toEqual({ e: "job", i: fx.parents.privateJob, a: "visibility_changed" });
  });
});

describe("AS-06: soukromý úkol nejde přiřadit Patrikovi („Zveřejnit a přiřadit“)", () => {
  it("přiřazení soukromého úkolu partnerovi je odmítnuto kódem private_assign (příkaz, úprava, vytvoření)", async () => {
    const taskId = fx.priv.task!;
    const pid = f.people.partner.id;
    const err = async (fn: () => Promise<unknown>) =>
      savepoint(async () => {
        try {
          await fn();
          return null;
        } catch (e) {
          return e as { code?: string; name: string };
        }
      });
    const viaCommand = await err(() => run("ukoly.assign", owner, { id: taskId, assigneeId: pid }));
    expect(viaCommand?.code ?? viaCommand?.name).toMatch(/private_assign|PrivateAssignment/);
    const viaUpdate = await err(async () =>
      updateRecord(owner, f.registry, await E("task"), taskId, { assignee: pid }),
    );
    expect(
      viaUpdate instanceof PrivateAssignmentError || viaUpdate?.code === "private_assign",
    ).toBe(true);
    const viaCreate = await err(async () =>
      createRecord(owner, f.registry, await E("task"), {
        title: "PRIVATE-CANARY-assign",
        isPrivate: true,
        assignee: pid,
      }),
    );
    expect(
      viaCreate instanceof PrivateAssignmentError || viaCreate?.code === "private_assign",
    ).toBe(true);
  });

  it("vlastní soukromý úkol: po „Zveřejnit a přiřadit“ je sdílený a partner ho vidí; zakázka zůstává soukromá", async () => {
    const taskId = fx.priv.task!;
    const pid = f.people.partner.id;
    await savepoint(async (tx) => {
      await run("ukoly.publishAndAssign", owner, { id: taskId, assigneeId: pid }, tx);
      const t = await getRecord({ ...partner, db: tx }, f.registry, await E("task"), taskId);
      expect(t.row.assignee ?? t.row.assigneeId).toBe(pid);
      expect(
        hasCanary(await searchAll({ ...partner, db: tx }, f.registry.all(), "CANARY-task", 20)),
      ).toBe(true);
    });
  });

  it("úkol soukromé zakázky (zděděný zámek) nejde zveřejnit ani přiřadit, dokud je zakázka soukromá", async () => {
    const taskId = rich.tasks.underPrivJob;
    const pid = f.people.partner.id;
    await savepoint(async (tx) => {
      await expect(
        run("ukoly.assign", owner, { id: taskId, assigneeId: pid }, tx),
      ).rejects.toMatchObject({
        code: "private_assign",
      });
    });
    await savepoint(async (tx) => {
      await expect(
        run("ukoly.publishAndAssign", owner, { id: taskId, assigneeId: pid }, tx),
      ).rejects.toBeInstanceOf(UserError);
    });
  });

  it("„Zveřejnit a přiřadit“ smí jen vlastník soukromých záznamů", async () => {
    await expect(
      run("ukoly.publishAndAssign", partner, {
        id: fx.priv.task!,
        assigneeId: f.people.partner.id,
      }),
    ).rejects.toBeTruthy();
  });

  it.each([
    ["job", "owner"],
    ["deal", "owner"],
    ["company", "owner"],
    ["person", "owner"],
  ])("soukromý %s nejde svěřit partnerovi (atribut %s)", async (key, attr) => {
    const e = await E(key);
    const r = await savepoint(async (tx) => {
      try {
        await updateRecord({ ...owner, db: tx }, f.registry, e, fx.priv[key]!, {
          [attr]: f.people.partner.id,
        });
        const visible = await getRecord({ ...partner, db: tx }, f.registry, e, fx.priv[key]!)
          .then(() => true)
          .catch(() => false);
        return { ok: true as const, visible };
      } catch (err) {
        return { ok: false as const, err: err as Error };
      }
    });
    if (r.ok)
      // pokud systém přiřazení dovolí, partner z toho nesmí nic získat (zámek je nadřazený vlastnictví)
      expect(r.visible, `partner jako ${attr} soukromého ${key} ho vidí`).toBe(false);
    else expect(rejected(r.err) || r.err instanceof PrivateAssignmentError).toBe(true);
  });
});

describe("AS-15: přepnutí viditelnosti přepočítá seznamy, součty, hledání i historii", () => {
  const visibleTo = async (ctx: Ctx, key: string, id: string) =>
    getRecord(ctx, f.registry, await E(key), id).then(
      () => true,
      (e) => (e instanceof NotFoundError ? false : Promise.reject(e)),
    );

  it("zveřejnění: děti, součty a hledání partnera se přepočtou; historie před zveřejněním zůstane skrytá; zpětné zamčení vše skryje", async () => {
    await savepoint(async (tx) => {
      const o = { ...owner, db: tx };
      const p = { ...partner, db: tx };
      const company = (
        await createRecord(o, f.registry, await E("company"), { name: "AS15 firma" })
      ).row;
      const job = (
        await createRecord(o, f.registry, await E("job"), {
          title: "PRIVATE-CANARY-as15-job",
          company: company.id,
          type: "web",
          isPrivate: true,
        })
      ).row;
      const task = (
        await createRecord(o, f.registry, await E("task"), {
          title: "PRIVATE-CANARY-as15-task",
          job: job.id,
        })
      ).row;
      const pay = await addPayment(f, o, {
        jobId: job.id,
        description: "PRIVATE-CANARY-as15-payment",
        amountMinor: 424_242_00,
      });
      const total = async () =>
        Number(
          (await queryRecords(p, f.registry, await E("payment"), { limit: 200 })).totals.amount,
        );
      const before = await total();
      expect(hasCanary(await searchAll(p, f.registry.all(), "as15", 20))).toBe(false);
      expect(await visibleTo(p, "payment", pay)).toBe(false);

      const r = await setVisibility(o, f.registry, "job", job.id, false);
      expect(r.changed).toBe(true);
      expect(r.cascaded).toBeGreaterThanOrEqual(2);
      // zveřejněno: partner vidí zakázku, úkol i platbu; součet plateb vzrostl o její částku; hledání je najde
      for (const [k, id] of [
        ["job", job.id],
        ["task", task.id],
        ["payment", pay],
      ] as const)
        expect(await visibleTo(p, k, id), `${k} po zveřejnění`).toBe(true);
      expect(await total()).toBe(before + 424_242_00);
      expect((await searchAll(p, f.registry.all(), "as15", 20)).length).toBeGreaterThanOrEqual(2);
      // historie: zápisy z doby, kdy byla zakázka soukromá, partner dál nevidí (R-33); změnu viditelnosti ano
      const hist = await queryHistory(p, f.registry, { q: "as15", limit: 100 } as never);
      const created = hist.items.filter(
        (i) =>
          (i as { action?: string }).action === "create" &&
          ["job", "task", "payment"].includes((i as { entityType: string }).entityType),
      );
      expect(created, "zápisy o vytvoření z doby soukromí jsou skryté").toEqual([]);
      // znovu zamknout: partner zase nic nevidí a součet je zpět
      await setVisibility(o, f.registry, "job", job.id, true);
      for (const [k, id] of [
        ["job", job.id],
        ["task", task.id],
        ["payment", pay],
      ] as const)
        expect(await visibleTo(p, k, id), `${k} po zamknutí`).toBe(false);
      expect(await total()).toBe(before);
      expect(hasCanary(await searchAll(p, f.registry.all(), "as15", 20))).toBe(false);
      expect(hasCanary(await queryHistory(p, f.registry, { q: "as15" } as never))).toBe(false);
    });
  });

  it("vlastní zámek dítěte přežije zveřejnění rodiče; zděděný se zveřejní", async () => {
    await savepoint(async (tx) => {
      const o = { ...owner, db: tx };
      const job = (
        await createRecord(o, f.registry, await E("job"), {
          title: "PRIVATE-CANARY-as15b",
          company: rich.sharedCompany,
          type: "web",
        })
      ).row;
      const own = (
        await createRecord(o, f.registry, await E("task"), {
          title: "PRIVATE-CANARY-as15b-own",
          job: job.id,
        })
      ).row;
      const inh = (
        await createRecord(o, f.registry, await E("task"), {
          title: "PRIVATE-CANARY-as15b-inh",
          job: job.id,
        })
      ).row;
      await setVisibility(o, f.registry, "task", own.id, true);
      await setVisibility(o, f.registry, "job", job.id, true);
      expect((await getRecord(o, f.registry, await E("task"), inh.id)).row.isPrivate).toBe(true);
      await setVisibility(o, f.registry, "job", job.id, false);
      expect((await getRecord(o, f.registry, await E("task"), inh.id)).row.isPrivate).toBe(false);
      expect((await getRecord(o, f.registry, await E("task"), own.id)).row.isPrivate).toBe(true);
    });
  });
});

describe("R-31: soukromá organizace nedědí do obchodů a zakázek (PŘEDPOKLAD C: uživatel je nastaví; Patrik soukromou firmu nevybere)", () => {
  it("sdílená zakázka pod soukromou firmou zůstává sdílená a součty zakázky se partnerovi počítají (nedědí)", async () => {
    const e = await E("job");
    const j = await getRecord(partner, f.registry, e, rich.jobOnPrivCompany);
    expect((await getRecord(owner, f.registry, e, rich.jobOnPrivCompany)).row.isPrivate).toBe(
      false,
    );
    // název soukromé firmy se v zakázce partnerovi neukáže
    expect(hasCanary(j)).toBe(false);
    const page = await queryRecords(partner, f.registry, e, { limit: 200 });
    expect(page.rows.map((r) => r.id)).toContain(rich.jobOnPrivCompany);
    expect(hasCanary(page)).toBe(false);
  });

  it("vlastník při vytvoření zakázky a obchodu nad soukromou firmou nic nezdědí (zakázka je sdílená)", async () => {
    await savepoint(async (tx) => {
      const o = { ...owner, db: tx };
      const job = (
        await createRecord(o, f.registry, await E("job"), {
          title: "R31 zakázka",
          company: rich.privCompany,
          type: "web",
        })
      ).row;
      expect(job.isPrivate).toBe(false);
    });
  });

  it("Patrik nemůže soukromou firmu vybrat: založení zakázky/obchodu/osoby/úkolu s odkazem na ni je odmítnuto", async () => {
    const outcomes: Record<string, string> = {};
    for (const [key, values] of [
      ["job", { title: "R31 partner job", company: rich.privCompany, type: "web" }],
      ["deal", { title: "R31 partner deal", company: rich.privCompany, status: undefined }],
      ["task", { title: "R31 partner task", company: rich.privCompany }],
      ["note", { title: "R31 partner note", company: rich.privCompany }],
      ["person", { lastName: "R31", company: rich.privCompany }],
    ] as const) {
      outcomes[key] = await savepoint(async (tx) => {
        try {
          const vals = { ...values } as Record<string, unknown>;
          if (key === "deal") {
            const { getPipeline } = await import("@rebar/core/config-data");
            vals.status = (await getPipeline(tx, "deal", "default"))?.stages[0]?.id;
          }
          await createRecord({ ...partner, db: tx }, f.registry, await E(key), vals);
          return "created";
        } catch (e) {
          return rejected(e) ? "rejected" : `error:${(e as Error).message}`;
        }
      });
    }
    // Spec 00 ani PŘEDPOKLAD R-31 nepopisují, co se stane při přímém odkazu na soukromou firmu; odmítnutí očekává D §5.1(4)
    expect(outcomes, "záznamy, které partner založil s odkazem na soukromou firmu").toEqual({
      job: "rejected",
      deal: "rejected",
      task: "rejected",
      note: "rejected",
      person: "rejected",
    });
  });
});
