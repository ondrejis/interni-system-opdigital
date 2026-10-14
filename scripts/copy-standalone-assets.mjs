// `output: standalone` nekopíruje statické soubory; doplníme je vedle server.js.
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const target = path.join(app, ".next", "standalone", "apps", "web");
if (!fs.existsSync(target)) {
  console.error(`Chybí ${target}. Spouští se po "next build" v apps/web.`);
  process.exit(1);
}
fs.cpSync(path.join(app, ".next", "static"), path.join(target, ".next", "static"), {
  recursive: true,
});
if (fs.existsSync(path.join(app, "public"))) {
  fs.cpSync(path.join(app, "public"), path.join(target, "public"), { recursive: true });
}
