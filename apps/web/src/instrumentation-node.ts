import { getRuntime } from "@/server/bootstrap";

// Neplatná konfigurace = aplikace nenastartuje (kontejner skončí a v logu je důvod).
try {
  const { config, modules } = getRuntime();
  console.info(`[start] klient „${config.slug}“, moduly: ${modules.map((m) => m.id).join(", ")}`);
} catch (err) {
  console.error(
    `[start] Aplikace nemůže nastartovat.\n${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
}
