import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { auditColumnsWith } from "../columns";
import { user } from "./identity";

/** Sloupce `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` pro každou tabulku mimo identitu. */
export const audit = () => auditColumnsWith((): AnyPgColumn => user.id);
