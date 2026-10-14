import { execSync } from "node:child_process";
import path from "node:path";

/** Před testy: doplní seed klienta a založí čistého uživatele (majitele) s náhodným e-mailem. */
export default function globalSetup() {
  const stamp = Math.random().toString(36).slice(2, 10);
  process.env.E2E_EMAIL = `e2e-${stamp}@test.example`;
  process.env.E2E_PASSWORD = `e2e-heslo-${stamp}-12345`;
  // Druhý majitel pro testy uvnitř aplikace (přihlásí se jednou v `auth.setup.ts`); první je určený pro test přihlášení.
  process.env.E2E_APP_EMAIL = `e2e-app-${stamp}@test.example`;
  process.env.E2E_APP_PASSWORD = `e2e-heslo-app-${stamp}-12345`;
  const root = path.resolve(import.meta.dirname, "../../..");
  for (const [email, password, name] of [
    [process.env.E2E_EMAIL, process.env.E2E_PASSWORD, "E2E Majitel"],
    [process.env.E2E_APP_EMAIL, process.env.E2E_APP_PASSWORD, "E2E Aplikace"],
  ] as const) {
    execSync("pnpm db:seed", {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, OWNER_EMAIL: email, OWNER_NAME: name, OWNER_PASSWORD: password },
    });
  }
}
