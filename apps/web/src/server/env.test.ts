import { describe, expect, it } from "vitest";
import { EnvError, loadEnv } from "./env";

const base = {
  DATABASE_URL: "postgres://app:x@localhost:5432/db",
  APP_URL: "http://localhost:3000",
  AUTH_SECRET: "x".repeat(32),
  APP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
};

describe("loadEnv", () => {
  it("přijme minimální platné nastavení a doplní výchozí hodnoty", () => {
    const env = loadEnv(base);
    expect(env.FILES_DIR).toBe("./.data/files");
    expect(env.NODE_ENV).toBe("development");
    expect(env.HEALTH_TOKEN).toBeUndefined();
  });

  it("v produkci odmítne ukázkové tajemství ze vzoru, ve vývoji ho nechá", () => {
    const sample = { ...base, AUTH_SECRET: "zmen-me-na-nahodny-retezec-alespon-32-znaku" };
    expect(() => loadEnv({ ...sample, NODE_ENV: "production", APP_URL: "https://a.cz" })).toThrow(
      /AUTH_SECRET/,
    );
    expect(() => loadEnv(sample)).not.toThrow();
  });

  it("prázdné volitelné hodnoty se berou jako nenastavené", () => {
    const env = loadEnv({
      ...base,
      HEALTH_TOKEN: "",
      HEARTBEAT_URL: "",
      SENTRY_DSN: "",
      BACKUP_STATUS_FILE: "",
    });
    expect(env.HEARTBEAT_URL).toBeUndefined();
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it("vypíše všechny chyby najednou", () => {
    try {
      loadEnv({
        DATABASE_URL: "mysql://x",
        APP_URL: "adresa",
        AUTH_SECRET: "krátké",
        APP_ENCRYPTION_KEY: base.APP_ENCRYPTION_KEY,
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EnvError);
      const text = (err as EnvError).problems.join("\n");
      expect(text).toContain("DATABASE_URL");
      expect(text).toContain("APP_URL");
      expect(text).toContain("AUTH_SECRET");
    }
  });

  it("vyžaduje šifrovací klíč", () => {
    expect(() => loadEnv({ ...base, APP_ENCRYPTION_KEY: undefined })).toThrow(/APP_ENCRYPTION_KEY/);
    expect(
      loadEnv({
        ...base,
        APP_ENCRYPTION_KEY: undefined,
        APP_ENCRYPTION_KEYS: `2:${base.APP_ENCRYPTION_KEY}`,
      }),
    ).toBeTruthy();
  });

  it("v produkci vyžaduje https a příliš krátký health token odmítne", () => {
    expect(() => loadEnv({ ...base, NODE_ENV: "production" })).toThrow(/https/);
    expect(
      loadEnv({ ...base, NODE_ENV: "production", APP_URL: "https://system.klient.cz" }).NODE_ENV,
    ).toBe("production");
    expect(() => loadEnv({ ...base, HEALTH_TOKEN: "kratky" })).toThrow(/HEALTH_TOKEN/);
    expect(loadEnv({ ...base, NODE_ENV: "production", APP_ALLOW_HTTP: "1" }).NODE_ENV).toBe(
      "production",
    ); // jen pro e2e testy
  });
});
