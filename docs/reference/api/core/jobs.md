# @rebar/core/jobs

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/jobs` (soubor `packages/core/src/jobs/index.ts`). Exportů: 14, z toho s popisem 9.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`createQueueClient`](#createqueueclient) | function | Klient fronty pro odesílání (web) i zpracování (worker). |  |
| [`defineJob`](#definejob) | function |  |  |
| [`installQueues`](#installqueues) | function | Krok migrací: nainstaluje schéma pg-boss (pod uživatelem migrací) a založí fronty. Fronty mají vlastní tabulky, takže je aplikační role (bez práv DDL) sama zakládat nesmí. |  |
| [`registerWorkers`](#registerworkers) | function | Zaregistruje zpracování všech úloh a jejich plány. Volá worker po startu klienta fronty. |  |
| [`coreJobs`](#corejobs) | const | Úlohy jádra. Moduly přidávají své (připomínky apod.) přes manifest. |  |
| [`dispatchJob`](#dispatchjob) | const | Každou minutu a navíc hned po vzniku upozornění (worker poslouchá NOTIFY): odešle upozornění, jejichž čas nadešel (push, e-mail), opakuje selhaná doručení s prodlevou a uvolňuje zdržená po tichých hodinách a shrnutí. |  |
| [`heartbeatJob`](#heartbeatjob) | const | Každou hodinu: stav instance agentuře (jen verze a stav, bez osobních údajů). |  |
| [`notificationCleanupJob`](#notificationcleanupjob) | const | Denně v noci: smaže stará upozornění a jejich protokol doručení. |  |
| [`purgeFilesJob`](#purgefilesjob) | const | Denně v noci: úklid souborů, které nikdo nepřipojil k záznamu. |  |
| [`thumbnailJob`](#thumbnailjob) | const |  |  |
| [`CoreJobDeps`](#corejobdeps) | type |  |  |
| [`JobDef`](#jobdef) | type | Úloha na pozadí. `name` je název fronty; data se validují Zodem při odeslání i při zpracování. Úlohy deklaruje jádro i moduly, běží ve workeru (samostatný proces téže image, bez Redisu — fronta je v Postgresu). |  |
| [`QueueClient`](#queueclient) | type |  |  |
| [`QueueClientOptions`](#queueclientoptions) | type |  |  |

### createQueueClient

function · `packages/core/src/jobs/jobs.ts`

Klient fronty pro odesílání (web) i zpracování (worker).

```ts
function createQueueClient({ connectionString, migrate = false, supervise = false, schedule = false, }: QueueClientOptions): QueueClient
```

### defineJob

function · `packages/core/src/jobs/jobs.ts`

_Bez popisu._

```ts
function defineJob<S extends ZodType, Deps = unknown>(def: JobDef<S, Deps>): JobDef<S, Deps>
```

### installQueues

function · `packages/core/src/jobs/jobs.ts`

Krok migrací: nainstaluje schéma pg-boss (pod uživatelem migrací) a založí fronty. Fronty mají vlastní
tabulky, takže je aplikační role (bez práv DDL) sama zakládat nesmí.

```ts
async function installQueues(migratorUrl: string, jobs: readonly Pick<JobDef, "name" | "retryLimit" | "keepCompletedSeconds">[]): Promise<void>
```

### registerWorkers

function · `packages/core/src/jobs/jobs.ts`

Zaregistruje zpracování všech úloh a jejich plány. Volá worker po startu klienta fronty.

```ts
async function registerWorkers<Deps>(client: QueueClient, jobs: readonly JobDef<ZodType, Deps>[], deps: Deps, opts: { pollingIntervalSeconds?: number } = {}): Promise<void>
```

### coreJobs

const · `packages/core/src/jobs/core-jobs.ts`

Úlohy jádra. Moduly přidávají své (připomínky apod.) přes manifest.

```ts
const coreJobs: readonly JobDef<z.ZodType, CoreJobDeps>[]
```

### dispatchJob

const · `packages/core/src/jobs/core-jobs.ts`

Každou minutu a navíc hned po vzniku upozornění (worker poslouchá NOTIFY): odešle upozornění, jejichž čas nadešel
(push, e-mail), opakuje selhaná doručení s prodlevou a uvolňuje zdržená po tichých hodinách a shrnutí.

```ts
const dispatchJob: JobDef<z.ZodObject<Record<string, never>, z.core.$strip>, CoreJobDeps>
```

### heartbeatJob

const · `packages/core/src/jobs/core-jobs.ts`

Každou hodinu: stav instance agentuře (jen verze a stav, bez osobních údajů).

```ts
const heartbeatJob: JobDef<z.ZodObject<Record<string, never>, z.core.$strip>, CoreJobDeps>
```

### notificationCleanupJob

const · `packages/core/src/jobs/core-jobs.ts`

Denně v noci: smaže stará upozornění a jejich protokol doručení.

```ts
const notificationCleanupJob: JobDef<z.ZodObject<Record<string, never>, z.core.$strip>, CoreJobDeps>
```

### purgeFilesJob

const · `packages/core/src/jobs/core-jobs.ts`

Denně v noci: úklid souborů, které nikdo nepřipojil k záznamu.

```ts
const purgeFilesJob: JobDef<z.ZodObject<Record<string, never>, z.core.$strip>, CoreJobDeps>
```

### thumbnailJob

const · `packages/core/src/jobs/core-jobs.ts`

_Bez popisu._

```ts
const thumbnailJob: JobDef<z.ZodObject<{ fileId: z.ZodUUID; }, z.core.$strip>, CoreJobDeps>
```

### CoreJobDeps

type · `packages/core/src/jobs/core-jobs.ts`

_Bez popisu._

```ts
type CoreJobDeps = MailDeps &
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
```

### JobDef

type · `packages/core/src/jobs/jobs.ts`

Úloha na pozadí. `name` je název fronty; data se validují Zodem při odeslání i při zpracování.
Úlohy deklaruje jádro i moduly, běží ve workeru (samostatný proces téže image, bez Redisu — fronta je v Postgresu).

```ts
type JobDef<S extends ZodType = ZodType, Deps = unknown> = {
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
```

### QueueClient

type · `packages/core/src/jobs/jobs.ts`

_Bez popisu._

```ts
type QueueClient = {
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
```

### QueueClientOptions

type · `packages/core/src/jobs/jobs.ts`

_Bez popisu._

```ts
type QueueClientOptions = {
  connectionString: string;
  /** Instalace schématu a front řeší krok migrací (`installQueues`), aplikace běží jen s právy k datům. */
  migrate?: boolean;
  /** Worker spouští plánovač a údržbu; webová aplikace jen odesílá. */
  supervise?: boolean;
  schedule?: boolean;
};
```
