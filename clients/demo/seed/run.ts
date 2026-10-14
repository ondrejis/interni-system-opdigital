import { bootstrapOwner } from "@rebar/core/auth";
import { saveEmployee } from "@rebar/core/employees";
import { saveMyPreferences } from "@rebar/core/notifications";
import { loadActor, createCtx } from "@rebar/core/rbac";
import { companySetting } from "@rebar/core/settings";
import { runSeed, DEFAULT_ROLES, ACCOUNTANT_ROLE } from "@rebar/core/seed";
import { ensureSeedViews } from "@rebar/core/views";
import { sql } from "drizzle-orm";
import demoSeed from "./index";
import { seedContacts } from "./contacts";
import { icoFrom } from "./ico";
import { Kit, type DemoServices, type SeedOptions } from "./kit";
import {
  businessRowCount,
  demoMarker,
  writeDemoMarker,
  MARKED_TABLES,
  unmarkedRowCount,
  wipeBusinessData,
} from "./reset";
import { DEMO_PASSWORD, DEMO_USERS, type DemoUserKey } from "./users";
import type { Member, World } from "./world";
import { runStories } from "./stories";
import { runOperations } from "./operations";

export type SeedReport = {
  counts: Record<string, number>;
  users: { email: string; role: string; name: string }[];
  seconds: number;
};

const COUNT_TABLES = [
  "company",
  "person",
  "inquiry",
  "job",
  "budget_item",
  "job_change",
  "work_statement",
  "job_order",
  "received_invoice",
  "invoice",
  "payment",
  "job_phase",
  "site_diary",
  "defect",
  "handover_protocol",
  "time_entry",
  "stock_item",
  "stock_doc",
  "asset",
  "asset_log",
  "asset_fuel",
  "event",
  "task",
  "comment",
  "notification",
  "saved_view",
];

type Row = Record<string, unknown>;

/** Uživatelé demo klienta jsou ve stejné databázi jako obchodní data; reset je nemaže. */
async function ensureUsers(s: DemoServices, opts: SeedOptions, log: (m: string) => void) {
  const roles = ["owner", "office", "accountant", "foreman", "worker"];
  if (!opts.keep2fa) {
    // demo klient se přihlašuje bez 2FA (produkční klienti ho mají u vedení povinné)
    await s.db.execute(
      sql`update role set require_2fa = false where key in (${sql.join(
        roles.map((r) => sql`${r}`),
        sql`, `,
      )})`,
    );
    log("2FA: pro role demo uživatelů vypnuto (přepínač --keep-2fa ho ponechá).");
  }
  // role založené dřívější verzí seedu dostanou nově přidaná oprávnění výchozích rolí (jen doplnění)
  for (const def of [...DEFAULT_ROLES, ACCOUNTANT_ROLE]) {
    if (def.isSystem) continue;
    const [role] = (await s.db.execute(
      sql`select id from role where key = ${def.key} and deleted_at is null`,
    )) as unknown as { id: string }[];
    if (!role) continue;
    for (const [permission, scope] of Object.entries(def.permissions ?? {})) {
      if (!s.catalog.has(permission)) continue;
      await s.db.execute(sql`
        insert into role_permission (role_id, permission, scope)
        values (${role.id}, ${permission}, ${scope === true ? "all" : scope})
        on conflict do nothing`);
    }
  }

  const cast = {} as Record<DemoUserKey, Member>;
  for (const u of DEMO_USERS) {
    const res = await bootstrapOwner(
      { auth: s.auth, db: s.db },
      { email: u.email, name: u.name, password: DEMO_PASSWORD, roleKey: u.role },
    );
    const actor = await loadActor(s.db, res.userId, { catalog: s.catalog });
    if (!actor) throw new Error(`Uživatel ${u.email} se nenačetl.`);
    // seed jedná za uživatele i když má role povinné 2FA (omezení se týká přihlášení, ne seedu)
    cast[u.key] = {
      id: res.userId,
      name: u.name,
      ctx: createCtx(s.db, { ...actor, restriction: null }),
    };
  }
  for (const u of DEMO_USERS)
    await saveEmployee(cast.owner.ctx, cast[u.key].id, {
      jobTitle: u.jobTitle,
      phone: u.phone,
      employmentType: "hpp",
      workload: 1,
      hourlyCostMinor: u.hourlyCostMinor,
      startDate: "2022-03-01",
    });
  return cast;
}

async function ensureCompanySettings(s: DemoServices, owner: Member) {
  // údaje vystavovatele faktur; co už správce vyplnil, se nepřepisuje
  const current = await s.settings.get(s.db, companySetting);
  if (current.name.trim()) return;
  await s.settings.set(owner.ctx, companySetting, {
    name: "Demo firma s.r.o.",
    ico: icoFrom(2999001),
    dic: `CZ${icoFrom(2999001)}`,
    street: "Rokycanská 1",
    city: "Plzeň",
    zip: "31200",
    email: "info@demo-firma.example",
    phone: "+420 377 000 000",
    web: "demo-firma.example",
    bankAccount: "19-2000145399/0800",
  });
}

/**
 * Nasype do databáze realistická demo data stavební firmy. Všechno vzniká příkazy a entitami modulů
 * (číslování z řad, hooky fází, audit, souhrny zakázek), ne holými SQL vloženými řádky.
 */
export async function seedDemo(s: DemoServices, opts: SeedOptions = {}): Promise<SeedReport> {
  const started = Date.now();
  const log = opts.log ?? (() => {});

  // 1) co už v databázi je
  const jobs = await businessRowCount(s);
  const mark = await demoMarker(s);
  const marker = mark.exists;
  if (jobs > 0 || marker) {
    if (opts.wipe) {
      log("--wipe: mažu všechna obchodní data.");
      await wipeBusinessData(s, opts.migratorUrl, log);
    } else if (opts.reset) {
      const foreign = await unmarkedRowCount(s);
      if (!marker || (mark.complete && foreign > 0))
        throw new Error(
          `Databáze obsahuje ${foreign} záznamů, které nejsou označené jako demo. --reset smaže jen demo data. ` +
            `Pro vývojovou databázi se zkušebními daty použijte --wipe (smaže VŠECHNA obchodní data).`,
        );
      log("--reset: mažu dřívější demo data.");
      await wipeBusinessData(s, opts.migratorUrl, log);
    } else {
      throw new Error(
        marker
          ? "Demo data už v databázi jsou. Pro nové nasazení spusťte s --reset (smaže jen demo data)."
          : "Databáze už obsahuje zakázky nebo kontakty, které nejsou demo data. Seed nic nepřepsal. " +
              "Použijte --wipe jen v vývojové databázi (smaže VŠECHNA obchodní data).",
      );
    }
  }

  // 2) výchozí data klienta (role, pipeline, číselníky, řady) a demo uživatelé
  const moduleSeeds = s.modules.flatMap((m) => (m.seed ? [m.seed] : []));
  // značka „rozpracováno“: přerušený seed jde potom smazat přepínačem --reset
  await writeDemoMarker(s, false);
  await runSeed(s.db, demoSeed, { config: s.config, catalog: s.catalog, moduleSeeds });
  for (const ensure of s.ensure ?? []) await ensure(s.db);
  const cast = await ensureUsers(s, opts, log);
  await ensureSeedViews(
    s.db,
    moduleSeeds.flatMap((m) => m.views ?? []),
  );
  await ensureCompanySettings(s, cast.owner);
  log(`Uživatelé: ${DEMO_USERS.length}.`);

  // 3) obsah
  const kit = new Kit(s, log);
  const contacts = await seedContacts(kit, cast.office.ctx);
  log(
    `Kontakty: ${Object.keys(contacts.company).length} firem, ${Object.keys(contacts.person).length} osob.`,
  );
  const w: World = { kit, cast, contacts, jobs: {}, jobList: [], dateFixes: [] };
  await runStories(w);
  await runOperations(w);

  // 4) označení demo dat, zpětné datování, souhrny
  await finish(s, w);

  const counts: Record<string, number> = {};
  for (const t of COUNT_TABLES) {
    const [r] = (await s.db.execute(
      sql.raw(
        `select count(*)::int as n from "${t}"${["company", "person", "job", "inquiry", "stock_item", "asset", "event"].includes(t) ? " where deleted_at is null" : ""}`,
      ),
    )) as unknown as Row[];
    counts[t] = Number(r?.n ?? 0);
  }
  return {
    counts,
    users: DEMO_USERS.map((u) => ({ email: u.email, role: u.role, name: u.name })),
    seconds: Math.round((Date.now() - started) / 100) / 10,
  };
}

/**
 * Předvolby upozornění ukázkových uživatelů, ať je v Nastavení → Upozornění co ukázat: mistr má vlastní tiché hodiny
 * a shrnutí místo okamžitých zpráv o harmonogramu, kancelář nechce push o přidělených úkolech a má jiné časy shrnutí,
 * montér dostává zmínky i e-mailem.
 */
async function seedNotificationPrefs(w: World) {
  const { cast } = w;
  await saveMyPreferences(cast.foreman1.ctx, {
    events: { "job.schedule": { push: "digest" }, "task.due_today": { push: "digest" } },
    quiet: { enabled: true, start: "21:00", end: "05:30" },
    digestTimes: ["07:00", "12:00"],
  });
  await saveMyPreferences(cast.office.ctx, {
    events: { "task.assigned": { push: "off" } },
    digestTimes: ["08:00", "15:00"],
  });
  await saveMyPreferences(cast.worker1.ctx, { events: { "comment.mention": { email: true } } });
}

async function finish(s: DemoServices, w: World) {
  const q = (text: string) => s.db.execute(sql.raw(text));
  for (const f of w.dateFixes) {
    const set: string[] = [];
    if (f.createdAt) set.push(`created_at = '${f.createdAt}T08:00:00+02'::timestamptz`);
    if (f.wonAt) set.push(`won_at = '${f.wonAt}'`);
    if (f.handoverAt) set.push(`handover_at = '${f.handoverAt}'`);
    if (f.closedAt) set.push(`closed_at = '${f.closedAt}'`);
    if (f.warrantyUntil) set.push(`warranty_until = '${f.warrantyUntil}'`);
    if (f.phaseChangedAt)
      set.push(`phase_changed_at = '${f.phaseChangedAt}T09:00:00+02'::timestamptz`);
    if (set.length) await q(`update job set ${set.join(", ")} where id = '${f.jobId}'`);
    // historie stavů (dny ve stavu na kartě a v pásu fází) se zpětně posune stejně jako zakázka
    const entered = f.phaseChangedAt
      ? `${f.phaseChangedAt}T09:00:00+02`
      : f.createdAt
        ? `${f.createdAt}T08:00:00+02`
        : null;
    if (entered) {
      const created = f.createdAt ? `${f.createdAt}T08:00:00+02` : entered;
      await q(
        `update job_stage_history set left_at = '${entered}'::timestamptz, entered_at = '${created}'::timestamptz where job_id = '${f.jobId}' and left_at is not null`,
      );
      await q(
        `update job_stage_history set entered_at = '${entered}'::timestamptz where job_id = '${f.jobId}' and left_at is null`,
      );
      await q(
        `update job set crm_stage_entered_at = '${entered}'::timestamptz where id = '${f.jobId}'`,
      );
    }
  }
  for (const t of MARKED_TABLES)
    await q(`update "${t}" set custom = custom || '{"demo": true}'::jsonb`);
  // Inbox: starší upozornění jsou přečtená (zůstane sedm nejnovějších nepřečtených na uživatele) a nikdy se nerozesílají jako push
  await q(`update notification set pushed_at = now() where pushed_at is null`);
  await q(
    `update notification_delivery set status = 'skipped', reason = 'seed' where status in ('queued', 'held', 'retry')`,
  );
  await seedNotificationPrefs(w);
  await q(
    `update notification set read_at = now() where read_at is null and id not in (
       select id from (select id, row_number() over (partition by user_id order by created_at desc) as rn from notification) x where rn <= 7)`,
  );
  await writeDemoMarker(s, true);
  // souhrny zakázek přepočítá až tady (zpětné datování mění termíny, docházka a sklad zakázky nevolají)
  for (const j of w.jobList) await w.kit.run(w.cast.owner.ctx, "zakazky.summary", { jobId: j.id });
  // odvozené údaje CRM (vážená hodnota, hnití) po zpětném datování a přepočtu souhrnů
  for (const ensure of s.ensure ?? []) await ensure(s.db);
}
