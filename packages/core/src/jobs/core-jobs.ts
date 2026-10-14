import { z } from "zod";
import "../zod-locale";
import type { Db } from "../db/client";
import { generateThumbnail, purgeOrphanFiles, type FilesDeps } from "../files";
import { getHealth, sendHeartbeat } from "../health/health";
import { exportJobs, type ExportJobDeps } from "../export/jobs";
import { sendMailJob, type MailDeps } from "../mail/service";
import {
  cleanupNotifications,
  dispatchDue,
  sendTaskDigests,
  type EmailMessage,
} from "../notifications";
import type { PushSender } from "../push/push";
import { defineJob, type JobDef } from "./jobs";

export type CoreJobDeps = MailDeps &
  FilesDeps &
  ExportJobDeps & {
    db: Db;
    /** Identifikátor instance pro heartbeat (slug klienta). */
    instance: string;
    version: string;
    dataDir: string;
    backupStatusFile?: string | undefined;
    heartbeatUrl?: string | undefined;
    /** Odesílač push upozornění; bez klíčů VAPID je `null` a push se přeskakuje (s důvodem v protokolu doručení). */
    push?: PushSender | null | undefined;
    /** Odešle e-mail s upozorněním; bez nastaveného SMTP je `null`. */
    notifyEmail?: ((mail: EmailMessage) => Promise<void>) | null | undefined;
  };

export const thumbnailJob = defineJob<z.ZodObject<{ fileId: z.ZodUUID }>, CoreJobDeps>({
  name: "file.thumbnail",
  schema: z.object({ fileId: z.uuid() }),
  keepCompletedSeconds: 600,
  async handler(deps, { fileId }) {
    await generateThumbnail(deps.db, deps, fileId);
  },
});

/** Denně v noci: úklid souborů, které nikdo nepřipojil k záznamu. */
export const purgeFilesJob = defineJob<z.ZodObject<Record<string, never>>, CoreJobDeps>({
  name: "files.purge",
  schema: z.object({}),
  cron: "30 3 * * *",
  retryLimit: 2,
  async handler(deps) {
    await purgeOrphanFiles(deps.db, deps, 24);
  },
});

/** Každou hodinu: stav instance agentuře (jen verze a stav, bez osobních údajů). */
export const heartbeatJob = defineJob<z.ZodObject<Record<string, never>>, CoreJobDeps>({
  name: "health.heartbeat",
  schema: z.object({}),
  cron: "0 * * * *",
  retryLimit: 3,
  keepCompletedSeconds: 600,
  async handler(deps) {
    if (!deps.heartbeatUrl) return;
    const report = await getHealth({
      db: deps.db,
      dataDir: deps.dataDir,
      version: deps.version,
      backupStatusFile: deps.backupStatusFile,
    });
    await sendHeartbeat(deps.heartbeatUrl, report, deps.instance);
  },
});

/**
 * Každou minutu a navíc hned po vzniku upozornění (worker poslouchá NOTIFY): odešle upozornění, jejichž čas nadešel
 * (push, e-mail), opakuje selhaná doručení s prodlevou a uvolňuje zdržená po tichých hodinách a shrnutí.
 */
export const dispatchJob = defineJob<z.ZodObject<Record<string, never>>, CoreJobDeps>({
  name: "notification.dispatch",
  schema: z.object({}),
  cron: "* * * * *",
  retryLimit: 1,
  keepCompletedSeconds: 120,
  async handler(deps) {
    await dispatchDue({ db: deps.db, push: deps.push ?? null, email: deps.notifyEmail ?? null });
  },
});

/** Pracovní dny v 7:00 (Europe/Prague): ranní přehled úkolů. */
export const taskDigestJob = defineJob<z.ZodObject<Record<string, never>>, CoreJobDeps>({
  name: "notification.taskDigest",
  schema: z.object({}),
  cron: "0 7 * * 1-5",
  retryLimit: 2,
  keepCompletedSeconds: 600,
  async handler(deps) {
    await sendTaskDigests(deps.db);
  },
});

/** Denně v noci: smaže stará upozornění a jejich protokol doručení. */
export const notificationCleanupJob = defineJob<z.ZodObject<Record<string, never>>, CoreJobDeps>({
  name: "notification.cleanup",
  schema: z.object({}),
  cron: "20 3 * * *",
  retryLimit: 1,
  keepCompletedSeconds: 600,
  async handler(deps) {
    await cleanupNotifications(deps.db);
  },
});

/** Úlohy jádra. Moduly přidávají své (připomínky apod.) přes manifest. */
export const coreJobs: readonly JobDef<z.ZodType, CoreJobDeps>[] = [
  sendMailJob as JobDef<z.ZodType, CoreJobDeps>,
  thumbnailJob,
  purgeFilesJob,
  heartbeatJob,
  dispatchJob,
  taskDigestJob,
  notificationCleanupJob,
  ...(exportJobs as readonly JobDef<z.ZodType, CoreJobDeps>[]),
];
