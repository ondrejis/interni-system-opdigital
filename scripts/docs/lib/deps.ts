import { createRequire } from "node:module";
import type * as ZodNs from "zod";
import type * as DrizzleNs from "drizzle-orm";
import type * as DrizzlePgNs from "drizzle-orm/pg-core";
import path from "node:path";
import { ROOT } from "./paths";

/*
  Kořen repozitáře nemá zod ani drizzle-orm ve vlastních závislostech (mají je balíčky). Generátor je proto bere
  z balíčku jádra, ze kterého je používají i moduly, takže nepotřebuje žádnou novou závislost ani zásah do lockfile.
*/
const fromCore = createRequire(path.join(ROOT, "packages/core/package.json"));

/** Zod z balíčku jádra (kvůli `toJSONSchema` a introspekci schémat). */
export const zod = fromCore("zod") as typeof ZodNs;

/** Drizzle ORM z balíčku jádra (čtení definice tabulek). */
export const drizzle = fromCore("drizzle-orm") as typeof DrizzleNs;

/** Část drizzle pro PostgreSQL (`getTableConfig`, `PgTable`). */
export const drizzlePg = fromCore("drizzle-orm/pg-core") as typeof DrizzlePgNs;
