import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  SIGNATURE_TOLERANCE_SECONDS,
  computeSignature,
  parseSignatureHeader,
  signatureHeader,
  verifySignature,
} from "./signature";

const SECRET = "whsec_test_secret_value";
const BODY = '{"id":"e1","event":"deal.won","data":{"název":"Žluťoučký kůň"}}';
const NOW = Date.UTC(2026, 9, 14, 10, 0, 0);

describe("podpis webhooku (HMAC-SHA256 z „t.tělo“)", () => {
  it("odpovídá definici: hex HMAC-SHA256(tajemství, t + '.' + tělo)", () => {
    const t = Math.floor(NOW / 1000);
    const expected = createHmac("sha256", SECRET).update(`${t}.${BODY}`).digest("hex");
    expect(computeSignature(SECRET, t, BODY)).toBe(expected);
    expect(signatureHeader(SECRET, BODY, NOW)).toBe(`t=${t},v1=${expected}`);
  });

  it("platný podpis projde, změněné tělo nebo jiné tajemství ne", () => {
    const header = signatureHeader(SECRET, BODY, NOW);
    expect(verifySignature({ secrets: [SECRET], header, body: BODY, nowMs: NOW })).toEqual({
      ok: true,
    });
    expect(verifySignature({ secrets: [SECRET], header, body: `${BODY} `, nowMs: NOW })).toEqual({
      ok: false,
      reason: "mismatch",
    });
    expect(verifySignature({ secrets: ["jine"], header, body: BODY, nowMs: NOW })).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("časová značka: přesně ±5 minut ještě projde, o sekundu víc ne (obě strany)", () => {
    const header = signatureHeader(SECRET, BODY, NOW);
    const at = (deltaS: number) =>
      verifySignature({ secrets: [SECRET], header, body: BODY, nowMs: NOW + deltaS * 1000 });
    expect(SIGNATURE_TOLERANCE_SECONDS).toBe(300);
    expect(at(300).ok).toBe(true);
    expect(at(-300).ok).toBe(true);
    expect(at(301)).toEqual({ ok: false, reason: "expired" });
    expect(at(-301)).toEqual({ ok: false, reason: "expired" });
  });

  it("časová značka je součástí podpisu: přepsání `t` na čerstvé znehodnotí podpis", () => {
    const old = signatureHeader(SECRET, BODY, NOW - 3_600_000);
    const sig = old.split(",v1=")[1]!;
    const forged = `t=${Math.floor(NOW / 1000)},v1=${sig}`;
    expect(verifySignature({ secrets: [SECRET], header: forged, body: BODY, nowMs: NOW })).toEqual(
      { ok: false, reason: "mismatch" },
    );
  });

  it("chybějící a poškozená hlavička se rozliší", () => {
    const base = { secrets: [SECRET], body: BODY, nowMs: NOW };
    expect(verifySignature({ ...base, header: null })).toEqual({ ok: false, reason: "missing" });
    expect(verifySignature({ ...base, header: "" })).toEqual({ ok: false, reason: "missing" });
    expect(verifySignature({ ...base, header: "nesmysl" })).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(verifySignature({ ...base, header: "t=abc,v1=00" })).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(
      verifySignature({ ...base, header: `t=${Math.floor(NOW / 1000)},v1=${"z".repeat(64)}` }),
    ).toEqual({ ok: false, reason: "malformed" });
  });

  it("rotace: stačí, když podpis odpovídá kterémukoli z platných tajemství, nebo kterémukoli v1", () => {
    const t = Math.floor(NOW / 1000);
    const header = signatureHeader("stare", BODY, NOW);
    expect(
      verifySignature({ secrets: [SECRET, "stare"], header, body: BODY, nowMs: NOW }).ok,
    ).toBe(true);
    const both = `t=${t},v1=${computeSignature("x".repeat(8), t, BODY)},v1=${computeSignature(SECRET, t, BODY)}`;
    expect(verifySignature({ secrets: [SECRET], header: both, body: BODY, nowMs: NOW }).ok).toBe(
      true,
    );
  });

  it("parseSignatureHeader tolerantně přečte mezery a velká písmena v hex", () => {
    const t = 1_700_000_000;
    const sig = computeSignature(SECRET, t, BODY).toUpperCase();
    expect(parseSignatureHeader(`t=${t}, v1=${sig}`)).toEqual({
      timestamp: t,
      signatures: [sig.toLowerCase()],
    });
  });

  it("prázdné tajemství nikdy nic neověří", () => {
    const header = signatureHeader("", BODY, NOW);
    expect(verifySignature({ secrets: [""], header, body: BODY, nowMs: NOW }).ok).toBe(false);
  });
});
