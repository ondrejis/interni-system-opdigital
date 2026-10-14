import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/schema.ts", "./src/schema/*.ts"],
  out: "./drizzle",
  strict: true,
});
