# @rebar/core/health

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/health` (soubor `packages/core/src/health/index.ts`). Exportů: 5, z toho s popisem 2.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`getHealth`](#gethealth) | function | Stav systému pro `GET /api/health` a heartbeat: databáze, volné místo, záloha, zpoždění fronty. |  |
| [`sendHeartbeat`](#sendheartbeat) | function | Heartbeat pro agenturu: jen identifikátor instance, verze a stav — žádné osobní údaje ani obsah dat. Vyhodí chybu při síťové chybě nebo odpovědi mimo 2xx (úloha se zopakuje). |  |
| [`HealthDeps`](#healthdeps) | type |  |  |
| [`HealthReport`](#healthreport) | type |  |  |
| [`HealthStatus`](#healthstatus) | type |  |  |

### getHealth

function · `packages/core/src/health/health.ts`

Stav systému pro `GET /api/health` a heartbeat: databáze, volné místo, záloha, zpoždění fronty.

```ts
async function getHealth(deps: HealthDeps): Promise<HealthReport>
```

### sendHeartbeat

function · `packages/core/src/health/health.ts`

Heartbeat pro agenturu: jen identifikátor instance, verze a stav — žádné osobní údaje ani obsah dat.
Vyhodí chybu při síťové chybě nebo odpovědi mimo 2xx (úloha se zopakuje).

```ts
async function sendHeartbeat(url: string, report: Pick<HealthReport, "status" | "version" | "problems">, instance: string, fetchFn: typeof fetch = fetch): Promise<void>
```

### HealthDeps

type · `packages/core/src/health/health.ts`

_Bez popisu._

```ts
type HealthDeps = {
  db: Db;
  /** Složka, jejíž disk se hlídá (úložiště souborů). */
  dataDir: string;
  version: string;
  /**
   * Soubor JSON `{"lastSuccessAt": "<ISO>", "restoreTest": {"at": "<ISO>", "ok": true, "detail": "…"}}`, který zálohovací
   * skript zapisuje po úspěšné záloze a po zkoušce obnovy.
   */
  backupStatusFile?: string | undefined;
  now?: () => Date;
};
```

### HealthReport

type · `packages/core/src/health/health.ts`

_Bez popisu._

```ts
type HealthReport = {
  status: HealthStatus;
  version: string;
  checkedAt: string;
  db: { ok: boolean; latencyMs: number | null };
  disk: { freeBytes: number; totalBytes: number; freePercent: number } | null;
  backup: {
    lastSuccessAt: string | null;
    ageHours: number | null;
    /** Poslední měsíční zkouška obnovy (jen když už nějaká proběhla). */
    restoreTest?: { at: string; ok: boolean; detail: string | null };
  } | null;
  queue: { oldestReadySeconds: number | null; failedLast24h: number | null } | null;
  problems: string[];
};
```

### HealthStatus

type · `packages/core/src/health/health.ts`

_Bez popisu._

```ts
type HealthStatus = "ok" | "degraded" | "fail";
```
