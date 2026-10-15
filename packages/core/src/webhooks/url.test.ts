import { describe, expect, it } from "vitest";
import { UserError } from "../rbac/errors";
import { parseWebhookUrl } from "./url";

describe("adresa webhooku", () => {
  it("veřejná adresa jen přes https", () => {
    expect(parseWebhookUrl(" https://n8n.firma.cz/webhook/opsys ").hostname).toBe("n8n.firma.cz");
    expect(() => parseWebhookUrl("http://n8n.firma.cz/webhook")).toThrow(UserError);
  });

  it("interní síť smí i http (n8n doma nebo v docker síti)", () => {
    for (const u of [
      "http://localhost:5678/webhook/x",
      "http://127.0.0.1:5678/x",
      "http://192.168.1.20:5678/x",
      "http://10.0.0.5/x",
      "http://n8n:5678/x",
      "http://nas.local/x",
      "http://[::1]:5678/x",
    ])
      expect(() => parseWebhookUrl(u), u).not.toThrow();
  });

  it("odmítne cizí protokoly, přihlašovací údaje v adrese a adresy správy cloudu", () => {
    for (const u of [
      "ftp://n8n.firma.cz/x",
      "javascript:alert(1)",
      "https://uzivatel:heslo@n8n.firma.cz/x",
      "http://169.254.169.254/latest/meta-data",
      "https://169.254.1.1/x",
      "http://metadata.google.internal/x",
      "http://0.0.0.0/x",
      "neni adresa",
      "",
    ])
      expect(() => parseWebhookUrl(u), u).toThrow(UserError);
  });
});
