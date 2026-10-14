import type { ErrorEvent } from "@sentry/node";
import { describe, expect, it } from "vitest";
import { scrubError, scrubEvent, scrubText } from "./scrub";

describe("scrubText", () => {
  it("odstraní e-maily, telefony, tokeny a UUID", () => {
    const out = scrubText(
      "Uživatel jana.novakova@firma.cz volal na +420 777 123 456, token 3f9aZ8kQp1mV7xLw2RtYb6NcHd4JsUe0Ga a záznam 0198f0c0-1111-7222-8333-444455556666 selhal",
    );
    expect(out).toBe("Uživatel [e-mail] volal na [číslo], token [token] a záznam [id] selhal");
  });

  it("běžné technické texty nechá být", () => {
    expect(scrubText("TypeError: Cannot read properties of undefined (reading 'name')")).toContain(
      "Cannot read properties",
    );
    expect(scrubText("HTTP 500 na /api/health po 120 ms")).toBe(
      "HTTP 500 na /api/health po 120 ms",
    );
  });
});

describe("scrubEvent", () => {
  it("smaže uživatele, hlavičky, cookies, tělo, query string a osobní údaje v textech", () => {
    const event = {
      type: undefined,
      user: { id: "u1", email: "a@b.cz", ip_address: "1.2.3.4" },
      server_name: "interni-host",
      request: {
        url: "https://system.example.cz/zakazky?q=Novak&token=abcdefghijklmnopqrstuvwxyz0123456789",
        method: "POST",
        headers: { cookie: "session=x", authorization: "Bearer y" },
        cookies: { session: "x" },
        data: { password: "p" },
        query_string: "q=Novak",
      },
      exception: { values: [{ type: "Error", value: "Chyba pro jana@firma.cz" }] },
      message: "Zákazník +420 777 123 456",
      extra: { note: "kontakt petr@firma.cz", nested: { phone: "777 123 456 789" } },
      breadcrumbs: [
        { category: "console", message: "tajné" },
        { category: "http", message: "GET /x" },
        { category: "navigation", message: "z /a na /b/jana@firma.cz", data: { to: "/b" } },
      ],
    } as unknown as ErrorEvent;

    const out = scrubEvent(event);
    expect(out.user).toBeUndefined();
    expect(out.server_name).toBeUndefined();
    expect(out.request).toEqual({ url: "https://system.example.cz/zakazky", method: "POST" });
    expect(out.exception?.values?.[0]?.value).toBe("Chyba pro [e-mail]");
    expect(out.message).toBe("Zákazník [číslo]");
    expect(out.extra).toEqual({ note: "kontakt [e-mail]", nested: { phone: "[číslo]" } });
    expect(out.breadcrumbs).toHaveLength(1);
    expect(out.breadcrumbs?.[0]).toMatchObject({
      category: "navigation",
      message: "z /a na /b/[e-mail]",
    });
    expect(out.breadcrumbs?.[0]?.data).toBeUndefined();
    expect(JSON.stringify(out)).not.toMatch(/jana@|petr@|Bearer|password|session=/);
  });
});

describe("tajemství v chybách a logu", () => {
  it("parametry SQL dotazu, přihlašovací údaje v adrese a páry klíč=hodnota se skryjí", () => {
    const orm =
      'Failed query: insert into "user" ("password_hash") values ($1)\nparams: $argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaGhhc2g,secret-token-value';
    const out = scrubText(orm);
    expect(out).toContain("params: [skryto]");
    expect(out).not.toMatch(/argon2id|secret-token-value/);
    expect(scrubText("connect postgres://rebar_app:SuperHeslo123@db:5432/x")).toBe(
      "connect postgres://[skryto]@db:5432/x",
    );
    expect(scrubText("password=hunter2 a token: abc123")).toBe(
      "password=[skryto] a token: [skryto]",
    );
    expect(scrubText("Authorization: Bearer abcdef")).not.toContain("abcdef");
    expect(scrubText("cookie=session=abcd")).not.toContain("abcd");
  });

  it("chyba pro log nese i příčinu, ale bez tajemství", () => {
    const cause = new Error("Failed query: select 1\nparams: tajne-heslo");
    const err = new Error("Dotaz selhal pro jana@firma.cz", { cause });
    const out = scrubError(err);
    expect(out).toContain("Dotaz selhal pro [e-mail]");
    expect(out).toContain("caused by");
    expect(out).not.toMatch(/tajne-heslo|jana@/);
  });
});
