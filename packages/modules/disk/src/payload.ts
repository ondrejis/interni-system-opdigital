/*
  Sestavení těla události `drive.*` pro n8n (D §2.2, DRV-03). Tělo se sestavuje vždy znovu v okamžiku odeslání, takže
  obsahuje aktuální názvy, služby a ID už založených složek. Popis tvaru pro workflow v n8n je v docs/moduly/disk.md.
*/
import type { DriveEventData } from "@rebar/core/contracts";
import { UserError } from "@rebar/core/rbac";
import type { Executor } from "@rebar/core/db";
import type { EntityRegistry } from "@rebar/core/entities";
import type { SettingsService } from "@rebar/core/settings";
import { readClient, readJob, type ClientFacts, type JobFacts } from "./entity-reader";
import { loadFolders } from "./facts";
import { clientFolderName, jobFolderName } from "./naming";
import { loadStructure } from "./settings";
import { defaultStructure, resolveNodes, sanitizeFolderName, serviceNode } from "./tree";
import { DRIVE_SERVICES, type DriveEntityType, type DriveRequestKind } from "./types";

/** Co modul „disk“ potřebuje z aplikace (podmnožina `ModuleDeps` i `ModuleJobDeps`). */
export type DiskEnv = {
  registry: EntityRegistry;
  settings: SettingsService;
  baseURL: string;
};

/** Adresa, na kterou n8n posílá výsledek (`POST`, podepsaná, viz C2). */
export const callbackUrlOf = (baseURL: string): string =>
  `${baseURL.replace(/\/+$/, "")}/api/ingest/drive`;

/** Hotové tělo události a údaje o záznamu, které se z něj odvodily. */
export type BuiltEvent = {
  data: DriveEventData;
  /** Klient (u zakázky její klient). */
  clientId: string;
  /** Událost se týká soukromého klienta nebo zakázky (jen webhooky „Doručovat i soukromé“). */
  isPrivate: boolean;
  /** Pro `add_service`: služby, které na Disku ještě chybí (prázdné = není co dělat). */
  missingServices: string[];
};

/** Složky služeb, které mají na Disku vlastní ID (kořen klienta má podklíč ''). */
const serviceFolderIds = (folders: Map<string, string>) =>
  Object.fromEntries(DRIVE_SERVICES.filter((s) => folders.has(s)).map((s) => [s, folders.get(s)!]));

/**
 * Tělo události pro požadavek. Vyhodí `UserError`, když klient nebo zakázka už neexistuje (smazaný záznam se na Disku
 * neřeší: požadavek skončí chybou, nic se nemaže).
 */
export async function buildEvent(
  db: Executor,
  env: DiskEnv,
  req: { id: string; kind: DriveRequestKind; entityType: DriveEntityType; entityId: string },
  now: Date = new Date(),
): Promise<BuiltEvent> {
  let job: JobFacts | null = null;
  let client: ClientFacts | null;
  if (req.kind === "project.create") {
    job = await readJob(db, env.registry, req.entityId);
    if (!job) throw new UserError("Zakázka neexistuje.");
    client = await readClient(db, env.registry, job.companyId);
  } else {
    client = await readClient(db, env.registry, req.entityId);
  }
  if (!client) throw new UserError("Klient neexistuje.");

  const { structure } = await loadStructure(env.settings, db);
  const folders = await loadFolders(db, "company", client.id);
  const rootId = folders.get("") ?? null;
  const clientFolder = { name: clientFolderName(client.name) };
  const base = {
    version: 1,
    kind: `drive.${req.kind}`,
    clientsRoot: sanitizeFolderName(structure.clientsRoot),
    archiveRoot: sanitizeFolderName(structure.archiveRoot),
    known: {
      clientFolderId: rootId,
      serviceFolderIds: serviceFolderIds(folders),
      archived: folders.has("archive"),
    },
  };
  const fallback = defaultStructure();
  const serviceFolder = (service: (typeof DRIVE_SERVICES)[number]) => {
    const n = serviceNode(structure, service) ?? serviceNode(fallback, service)!;
    return { service, name: sanitizeFolderName(n.name), children: resolveNodes(n.children) };
  };

  let missingServices: string[] = [];
  let body: Record<string, unknown>;
  switch (req.kind) {
    case "client.create":
      body = {
        ...base,
        clientFolder: {
          ...clientFolder,
          children: resolveNodes(structure.client, client.services),
        },
      };
      break;
    case "client.add_service": {
      missingServices = client.services.filter((s) => !folders.has(s));
      body = {
        ...base,
        clientFolder,
        services: missingServices.map((s) => serviceFolder(s as never)),
      };
      break;
    }
    case "client.rename":
    case "client.archive":
    case "client.restore":
      body = { ...base, clientFolder };
      break;
    case "project.create": {
      const j = job!;
      const svc = serviceFolder(j.type);
      body = {
        ...base,
        clientFolder,
        serviceFolder: {
          service: svc.service,
          name: svc.name,
          folderId: folders.get(j.type) ?? null,
        },
        jobFolder: {
          name: jobFolderName(structure.jobFolderName, j, now),
          children: resolveNodes(structure.job[j.type]),
        },
      };
      break;
    }
  }

  const data: DriveEventData = {
    requestId: req.id,
    client: { id: client.id, name: client.name, ico: client.ico, folderId: rootId },
    ...(job
      ? {
          project: {
            id: job.id,
            code: job.number,
            name: job.title,
            type: job.type,
            startDate: job.startDate,
            folderId: (await loadFolders(db, "job", job.id)).get("") ?? null,
          },
        }
      : {}),
    structure: body,
    callbackUrl: callbackUrlOf(env.baseURL),
  };
  return {
    data,
    clientId: client.id,
    isPrivate: client.isPrivate || (job?.isPrivate ?? false),
    missingServices,
  };
}
