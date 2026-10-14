import { bootstrapOwner } from "@rebar/core/auth";
import { saveEmployee } from "@rebar/core/employees";
import { loadActor, createCtx } from "@rebar/core/rbac";
import { runSeed } from "@rebar/core/seed";
import { ensureSeedViews } from "@rebar/core/views";
import { sql } from "drizzle-orm";
import opsysSeed from "./index";
import { seedContacts } from "./contacts";
import { Kit, type DemoServices, type SeedOptions } from "./kit";
import {
  businessRowCount,
  demoMarker,
  markedTables,
  unmarkedRowCount,
  wipeBusinessData,
  writeDemoMarker,
} from "./reset";
import { DEMO_PASSWORD, DEMO_USERS, type DemoUserKey } from "./users";
import type { Member, World } from "./world";

export type SeedReport = {
  counts: Record<string, number>;
  users: { email: string; role: string; name: string }[];
  seconds: number;
};

/** Tabulky, jejichž počty seed hlásí (jen ty, které v databázi existují). */
const COUNT_TABLES = ["company", "person", "job", "inquiry", "deal", "event", "time_entry", "task"];

type Row = Record<string, unknown>;

/** Demo uživatelé jsou ve stejné databázi jako obchodní data; reset je nemaže. */
async function ensureUsers(s: DemoServices, opts: SeedOptions, log: (m: string) => void) {
  if (!opts.keep2fa) {
    // demo data se přihlašují jen heslem (instance s vedením má 2FA povinné)
    await s.db.execute(
      sql`update role set require_2fa = false where key in (${sql.join(
        DEMO_USERS.map((u) => sql`${u.role}`),
        sql`, `,
      )})`,
    );
    log("2FA: pro role demo uživatelů vypnuto (přepínač --keep-2fa ho ponechá).");
  }
  // role založené dřívější verzí seedu dostanou nově přidaná oprávnění (jen doplnění)
  for (const def of opsysSeed.roles ?? []) {
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

/**
 * Nasype do databáze minimální demo data: tři uživatele podle rolí a ukázkové firmy a osoby. Obsah dalších modulů
 * (obchody, zakázky, hodiny, kalendář) se přidá, až budou hotové; vždy přes příkazy a entity modulů, ne holým SQL.
 */
export async function seedDemo(s: DemoServices, opts: SeedOptions = {}): Promise<SeedReport> {
  const started = Date.now();
  const log = opts.log ?? (() => {});

  // 1) co už v databázi je
  const rows = await businessRowCount(s);
  const mark = await demoMarker(s);
  const marker = mark.exists;
  if (rows > 0 || marker) {
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
          : "Databáze už obsahuje kontakty nebo zakázky, které nejsou demo data. Seed nic nepřepsal. " +
              "Použijte --wipe jen ve vývojové databázi (smaže VŠECHNA obchodní data).",
      );
    }
  }

  // 2) výchozí data klienta (role, pipeline, číselníky, řady) a demo uživatelé
  const moduleSeeds = s.modules.flatMap((m) => (m.seed ? [m.seed] : []));
  // značka „rozpracováno“: přerušený seed jde potom smazat přepínačem --reset
  await writeDemoMarker(s, false);
  await runSeed(s.db, opsysSeed, { config: s.config, catalog: s.catalog, moduleSeeds });
  for (const ensure of s.ensure ?? []) await ensure(s.db);
  const cast = await ensureUsers(s, opts, log);
  await ensureSeedViews(
    s.db,
    moduleSeeds.flatMap((m) => m.views ?? []),
  );
  log(`Uživatelé: ${DEMO_USERS.length}.`);

  // 3) obsah
  const kit = new Kit(s, log);
  const contacts = await seedContacts(kit, cast.owner.ctx);
  log(
    `Kontakty: ${Object.keys(contacts.company).length} firem, ${Object.keys(contacts.person).length} osob.`,
  );
  const w: World = { kit, cast, contacts };

  // 4) označení demo dat
  await finish(s, w);

  const existing = new Set(
    (
      (await s.db.execute(
        sql`select table_name from information_schema.tables where table_schema = 'public'`,
      )) as unknown as { table_name: string }[]
    ).map((r) => r.table_name),
  );
  const counts: Record<string, number> = {};
  for (const t of COUNT_TABLES) {
    if (!existing.has(t)) continue;
    const [r] = (await s.db.execute(
      sql.raw(
        `select count(*)::int as n from "${t}"${(await markedTables(s)).includes(t) ? " where deleted_at is null" : ""}`,
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

async function finish(s: DemoServices, _w: World) {
  for (const t of await markedTables(s))
    await s.db.execute(sql.raw(`update "${t}" set custom = custom || '{"demo": true}'::jsonb`));
  await writeDemoMarker(s, true);
  // odvozené údaje modulů (např. výchozí stavy) po založení dat
  for (const ensure of s.ensure ?? []) await ensure(s.db);
}
