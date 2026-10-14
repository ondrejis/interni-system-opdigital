import { v7 } from "uuid";

/** Nové ID záznamu: UUID v7 (časově řazené). PostgreSQL 17 `uuidv7()` nemá, generuje aplikace (ADR 002). */
export function newId(): string {
  return v7();
}
