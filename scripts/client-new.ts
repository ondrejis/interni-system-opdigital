import path from "node:path";
import { createClient } from "./lib/client-new";

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--"));
const nameIdx = args.indexOf("--name");
const name = nameIdx >= 0 ? args[nameIdx + 1] : undefined;

if (!slug) {
  console.error('Použití: pnpm client:new <slug> [--name "Název systému klienta"]');
  process.exit(1);
}

try {
  const root = path.resolve(import.meta.dirname, "..");
  const target = createClient({ slug, name, root });
  console.log(`Vytvořeno: ${path.relative(root, target)}`);
  console.log("Další kroky: pnpm install · upravit config.ts · pnpm config:check");
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
