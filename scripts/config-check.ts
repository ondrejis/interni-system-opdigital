import path from "node:path";
import { ALL_MODULES } from "../apps/web/src/modules";
import { checkClients } from "./lib/check-clients";

const root = path.resolve(import.meta.dirname, "..");
const results = await checkClients(root, ALL_MODULES);

let failed = false;
for (const r of results) {
  if (r.ok) {
    console.log(`✓ clients/${r.dir}`);
  } else {
    failed = true;
    console.error(`✗ clients/${r.dir}`);
    for (const p of r.problems) console.error(`    - ${p}`);
  }
}
process.exit(failed ? 1 : 0);
