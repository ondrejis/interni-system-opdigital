import fs from "node:fs";
import path from "node:path";
import base from "./playwright.config";

// Pomocná konfigurace pro kontrolu nezávislosti na pořadí: soubory spec se spustí v náhodném pořadí
// (kopie s náhodnou předponou ve složce e2e-shuffled).
// Použití: E2E_FRESH=1 pnpm test:e2e:local -c playwright.shuffle.config.ts
const src = path.resolve(import.meta.dirname, "e2e");
const dir = path.resolve(import.meta.dirname, "e2e-shuffled");

// konfiguraci načítá hlavní proces i každý worker; složku sestaví jen první (workery dědí příznak z prostředí)
if (!process.env.E2E_SHUFFLE_READY) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const files = fs.readdirSync(src).filter((f) => f.endsWith(".ts"));
  const specs = files.filter((f) => f.endsWith(".spec.ts"));
  for (let i = specs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [specs[i], specs[j]] = [specs[j]!, specs[i]!];
  }
  specs.forEach((f, i) =>
    fs.copyFileSync(path.join(src, f), path.join(dir, `${String(i).padStart(2, "0")}-${f}`)),
  );
  for (const f of files.filter((f) => !f.endsWith(".spec.ts")))
    fs.copyFileSync(path.join(src, f), path.join(dir, f));
  console.log("Pořadí:", specs.join(" "));
  process.env.E2E_SHUFFLE_READY = "1";
}

export default { ...base, testDir: "./e2e-shuffled" };
