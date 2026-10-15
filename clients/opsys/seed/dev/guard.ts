/**
 * Pojistka vývojového seedu (`pnpm dev:seed`): smyšlená data se smí zapsat jen do lokální vývojové databáze.
 * Odmítne běžet v produkci a testu (`NODE_ENV`), proti databázi, která neběží na tomto počítači, a při veřejné
 * adrese aplikace (`APP_URL` jinde než na localhostu). Čistá funkce, aby šla otestovat bez databáze.
 */
export type DevEnvInput = {
  nodeEnv: string | undefined;
  databaseUrl: string | undefined;
  appUrl?: string | undefined;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", ""]);

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    // `postgres:///db?host=/tmp/sock` (unixový socket) nemá hostitele
    return u.searchParams.has("host") ? "" : u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Vrátí důvody, proč vývojový seed odmítnout (prázdné pole = smí běžet). */
export function devSeedProblems(env: DevEnvInput): string[] {
  const problems: string[] = [];
  if (env.nodeEnv !== undefined && env.nodeEnv !== "development")
    problems.push(`NODE_ENV je „${env.nodeEnv}“, vývojový seed běží jen ve „development“.`);
  if (!env.databaseUrl) problems.push("Chybí DATABASE_URL.");
  else {
    const host = hostOf(env.databaseUrl);
    if (host === null) problems.push("DATABASE_URL nejde přečíst.");
    else if (!LOCAL_HOSTS.has(host))
      problems.push(`Databáze běží na „${host}“, vývojový seed zapisuje jen do lokální databáze.`);
  }
  if (env.appUrl) {
    const host = hostOf(env.appUrl);
    if (host === null || !(LOCAL_HOSTS.has(host) || host.endsWith(".localhost")))
      problems.push(`APP_URL míří na „${host ?? env.appUrl}“, ne na localhost.`);
  }
  return problems;
}

/** Vyhodí chybu, když prostředí není lokální vývoj. */
export function assertDevEnvironment(env: DevEnvInput): void {
  const problems = devSeedProblems(env);
  if (problems.length) throw new Error(`Vývojový seed odmítnut:\n - ${problems.join("\n - ")}`);
}
