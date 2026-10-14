import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { ts } from "../columns";
import { user } from "./identity";

/**
 * Zápis odeslaný z mobilního terminálu (i z offline fronty). Identifikátor vytváří zařízení při zápisu, takže stejná akce
 * odeslaná podruhé (opakování po výpadku signálu, dvojí ťuknutí) se nevykoná znovu a vrátí původní výsledek.
 * Řádek vzniká ve stejné transakci jako vlastní zápis (selže-li zápis, řádek nezůstane).
 */
export const terminalOp = pgTable(
  "terminal_op",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    command: text("command").notNull(),
    result: jsonb("result"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("terminal_op_created_idx").on(t.createdAt)],
);
