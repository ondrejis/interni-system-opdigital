import * as prettier from "prettier";
import path from "node:path";
import { ROOT } from "./paths";

let config: prettier.Options | null = null;

/** Zformátuje markdown Prettierem podle konfigurace repozitáře (stejně jako `pnpm format:check`). */
export async function formatMarkdown(md: string): Promise<string> {
  config ??= (await prettier.resolveConfig(path.join(ROOT, "docs/INDEX.md"))) ?? {};
  return prettier.format(md, { ...config, parser: "markdown" });
}
