import { PgBoss, type Job, type SendOptions } from "pg-boss";
import type { ZodType, z } from "zod";
import "../zod-locale";

/**
 * Úloha na pozadí. `name` je název fronty; data se validují Zodem při odeslání i při zpracování.
 * Úlohy deklaruje jádro i moduly, běží ve workeru (samostatný proces téže image, bez Redisu — fronta je v Postgresu).
 */
export type JobDef<S extends ZodType = ZodType, Deps = unknown> = {
  name: string;
  schema: S;
  /** Zpracování jedné úlohy. Vyhozená výjimka = opakování s prodlevou, po vyčerpání pokusů „failed“. */
  handler: (deps: Deps, data: z.output<S>, job: Job<unknown>) => Promise<void>;
  /** Kolikrát opakovat po chybě (výchozí 5, s exponenciální prodlevou). */
  retryLimit?: number;
  /** Plán opakování (cron, časová zóna Europe/Prague). Bez něj se úloha jen posílá. */
  cron?: string;
  /** Jak dlouho se uchovávají dokončené úlohy (sekundy). Výchozí 1 hodina — data úloh mohou být citlivá. */
  keepCompletedSeconds?: number;
};

export function defineJob<S extends ZodType, Deps = unknown>(
  def: JobDef<S, Deps>,
): JobDef<S, Deps> {
  return def;
}

export type QueueClient = {
  boss: PgBoss;
  /** Odešle úlohu do fronty. */
  send<S extends ZodType>(
    job: Pick<JobDef<S>, "name" | "schema">,
    data: z.input<S>,
    options?: SendOptions,
  ): Promise<string | null>;
  start(): Promise<void>;
  stop(): Promise<void>;
};

export type QueueClientOptions = {
  connectionString: string;
  /** Instalace schématu a front řeší krok migrací (`installQueues`), aplikace běží jen s právy k datům. */
  migrate?: boolean;
  /** Worker spouští plánovač a údržbu; webová aplikace jen odesílá. */
  supervise?: boolean;
  schedule?: boolean;
};

/** Klient fronty pro odesílání (web) i zpracování (worker). */
export function createQueueClient({
  connectionString,
  migrate = false,
  supervise = false,
  schedule = false,
}: QueueClientOptions): QueueClient {
  const boss = new PgBoss({
    connectionString,
    migrate,
    createSchema: migrate,
    supervise,
    schedule,
    max: 4,
  });
  return {
    boss,
    async send(job, data, options) {
      return boss.send(job.name, job.schema.parse(data) as object, options);
    },
    start: async () => void (await boss.start()),
    stop: () => boss.stop({ graceful: true, timeout: 10_000 }),
  };
}

/**
 * Krok migrací: nainstaluje schéma pg-boss (pod uživatelem migrací) a založí fronty. Fronty mají vlastní
 * tabulky, takže je aplikační role (bez práv DDL) sama zakládat nesmí.
 */
export async function installQueues(
  migratorUrl: string,
  jobs: readonly Pick<JobDef, "name" | "retryLimit" | "keepCompletedSeconds">[],
): Promise<void> {
  const boss = new PgBoss({
    connectionString: migratorUrl,
    migrate: true,
    createSchema: true,
    supervise: false,
    schedule: false,
    max: 2,
  });
  await boss.start();
  try {
    for (const j of jobs) {
      await boss.createQueue(j.name, {
        retryLimit: j.retryLimit ?? 5,
        retryBackoff: true,
        deleteAfterSeconds: j.keepCompletedSeconds ?? 3600,
        retentionSeconds: 7 * 86_400,
      });
    }
  } finally {
    await boss.stop({ graceful: true, timeout: 5_000 });
  }
}

/** Zaregistruje zpracování všech úloh a jejich plány. Volá worker po startu klienta fronty. */
export async function registerWorkers<Deps>(
  client: QueueClient,
  jobs: readonly JobDef<ZodType, Deps>[],
  deps: Deps,
  opts: { pollingIntervalSeconds?: number } = {},
): Promise<void> {
  for (const job of jobs) {
    await client.boss.work(
      job.name,
      { batchSize: 1, pollingIntervalSeconds: opts.pollingIntervalSeconds ?? 2 },
      async ([item]) => {
        if (!item) return;
        const data = job.schema.parse(item.data);
        await job.handler(deps, data, item);
      },
    );
    if (job.cron) await client.boss.schedule(job.name, job.cron, {}, { tz: "Europe/Prague" });
  }
}
