/*
  Reakce modulu „disk“ na doménové události (D §1.2, DRV-02). Handlery běží v transakci emitenta; chyba Disku
  nikdy nesmí zrušit uložení klienta nebo zakázky (NFR-13), proto každý běží ve vnořené transakci (savepoint) a
  chyba se jen nahlásí.

  | Událost                         | Co se stane                                                                        |
  | `client.status_changed`         | Lead/Aktivní bez složky → založit; Bývalý → Archiv; návrat z Bývalého → zpět       |
  | `client.service_added`          | existuje-li složka klienta, dovytvoří se složka služby                             |
  | `client.renamed`                | existuje-li složka klienta, přejmenuje se                                          |
  | `project.created`               | složka zakázky (a před ní složka klienta, když ještě není)                         |
  | `visibility.changed` → veřejné  | záznam, který byl soukromý, dostane složku, jako by byl nový (R-13)                |
  | `drive.*`                       | jen zapíše ID obálky události k požadavku (párování s doručením webhooku)          |
*/
import { eq } from "drizzle-orm";
import type { DomainEventName } from "@rebar/core/contracts";
import type { ModuleServer } from "@rebar/core/module-server";
import { captureError } from "@rebar/core/observability";
import type { Ctx } from "@rebar/core/rbac";
import { clientFolderFacts, jobFolderKnown } from "./facts";
import type { DiskEnv } from "./payload";
import { readClient, readJob } from "./entity-reader";
import { createRequest } from "./requests";
import { driveRequest } from "./schema";
import { isDriveEnabled } from "./settings";
import { planClientFolder } from "./state";

type Handlers = NonNullable<ModuleServer["eventHandlers"]>;

/** Spustí `fn` ve vnořené transakci; chyba se nahlásí a nepřeruší transakci emitenta. */
async function safely(ctx: Ctx, name: string, fn: (ctx: Ctx) => Promise<void>): Promise<void> {
  try {
    await ctx.db.transaction((tx) => fn({ ...ctx, db: tx }));
  } catch (err) {
    captureError(err, { where: `disk.${name}` });
  }
}

/** Založí složku zakázky (a před ní složku klienta, když ještě není); vrací, zda vznikl nějaký požadavek. */
export async function autoCreateJobFolder(
  ctx: Ctx,
  env: DiskEnv,
  jobId: string,
  opts: { jobIsPrivate: boolean },
): Promise<boolean> {
  const job = await readJob(ctx.db, env.registry, jobId);
  if (!job) return false;
  const client = await readClient(ctx.db, env.registry, job.companyId);
  if (!client) return false;
  if (opts.jobIsPrivate || job.isPrivate) return false; // R-13
  if (await jobFolderKnown(ctx.db, jobId)) return false;
  const facts = await clientFolderFacts(ctx.db, client.id);
  // složka klienta v Archivu: nejdřív je nutné vrátit klienta ze stavu Bývalý (tím se složka obnoví)
  if (facts.archived) return false;
  if (!facts.known) {
    if (client.isPrivate) return false; // složku soukromého klienta sama nezakládám (R-13)
    await createRequest(ctx, env, {
      kind: "client.create",
      entityType: "company",
      entityId: client.id,
      clientId: client.id,
    });
  }
  await createRequest(ctx, env, {
    kind: "project.create",
    entityType: "job",
    entityId: jobId,
    clientId: client.id,
  });
  return true;
}

/** Obsluhy událostí modulu; `envOf` dodá služby aplikace z `ModuleDeps`. */
export const eventHandlers: Handlers = {
  async "client.status_changed"(ctx, event, deps) {
    await safely(ctx, "client.status_changed", async (c) => {
      if (!(await isDriveEnabled(deps.settings, c.db))) return;
      const clientId = event.data.client.id;
      const facts = await clientFolderFacts(c.db, clientId);
      const action = planClientFolder({
        to: event.data.to,
        isPrivate: event.entity.isPrivate,
        folder: { known: facts.known, archived: facts.archived },
      });
      if (action === "none") return;
      await createRequest(c, deps, {
        kind: `client.${action}`,
        entityType: "company",
        entityId: clientId,
        clientId,
      });
    });
  },

  async "client.renamed"(ctx, event, deps) {
    await safely(ctx, "client.renamed", async (c) => {
      if (!(await isDriveEnabled(deps.settings, c.db))) return;
      const { clientId } = event.data;
      const facts = await clientFolderFacts(c.db, clientId);
      if (!facts.known) return; // není co přejmenovat
      await createRequest(c, deps, {
        kind: "client.rename",
        entityType: "company",
        entityId: clientId,
        clientId,
      });
    });
  },

  async "client.service_added"(ctx, event, deps) {
    await safely(ctx, "client.service_added", async (c) => {
      if (!(await isDriveEnabled(deps.settings, c.db))) return;
      const { clientId } = event.data;
      const facts = await clientFolderFacts(c.db, clientId);
      // složka se teprve zakládá: chybějící služby doplní `reconcileServices` po jejím dokončení
      if (!facts.ready) return;
      await createRequest(c, deps, {
        kind: "client.add_service",
        entityType: "company",
        entityId: clientId,
        clientId,
      });
    });
  },

  async "project.created"(ctx, event, deps) {
    await safely(ctx, "project.created", async (c) => {
      if (!(await isDriveEnabled(deps.settings, c.db))) return;
      await autoCreateJobFolder(c, deps, event.data.project.id, {
        jobIsPrivate: event.entity.isPrivate,
      });
    });
  },

  async "visibility.changed"(ctx, event, deps) {
    const { entityType, id, isPrivate } = event.data;
    if (isPrivate || (entityType !== "company" && entityType !== "job")) return;
    await safely(ctx, "visibility.changed", async (c) => {
      if (!(await isDriveEnabled(deps.settings, c.db))) return;
      if (entityType === "job") {
        await autoCreateJobFolder(c, deps, id, { jobIsPrivate: false });
        return;
      }
      // záznam, který byl soukromý a nemá složku, se chová jako nový klient se stavem Lead/Aktivní
      const client = await readClient(c.db, deps.registry, id);
      if (!client || (client.status !== "lead" && client.status !== "active")) return;
      const facts = await clientFolderFacts(c.db, id);
      if (facts.known || facts.archived) return;
      await createRequest(c, deps, {
        kind: "client.create",
        entityType: "company",
        entityId: id,
        clientId: id,
      });
    });
  },

  ...Object.fromEntries(
    [
      "drive.client.create",
      "drive.client.add_service",
      "drive.client.rename",
      "drive.client.archive",
      "drive.client.restore",
      "drive.project.create",
    ].map((name) => [
      name,
      async (ctx: Ctx, event: { id: string; data: { requestId: string } }): Promise<void> => {
        await ctx.db
          .update(driveRequest)
          .set({ eventId: event.id })
          .where(eq(driveRequest.id, event.data.requestId));
      },
    ]),
  ),
};

/** Názvy událostí, na které modul reaguje (pro dokumentaci a test). */
export const HANDLED_EVENTS: readonly DomainEventName[] = [
  "client.status_changed",
  "client.renamed",
  "client.service_added",
  "project.created",
  "visibility.changed",
  "drive.client.create",
  "drive.client.add_service",
  "drive.client.rename",
  "drive.client.archive",
  "drive.client.restore",
  "drive.project.create",
];
