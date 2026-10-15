import { describe, expect, it } from "vitest";
import { trustedDeviceIdentifier } from "./trusted-devices";

describe("označení aktuálního důvěryhodného zařízení z cookie", () => {
  const id = "trust-device-AbC123xyz";

  it("najde identifikátor v podepsané cookie (i s předponou __Secure-)", () => {
    const value = encodeURIComponent(`token!${id}.podpis`);
    expect(trustedDeviceIdentifier(`a=1; better-auth.trust_device=${value}; b=2`)).toBe(id);
    expect(trustedDeviceIdentifier(`__Secure-better-auth.trust_device=${value}`)).toBe(id);
  });

  it("bez cookie nebo s cizí cookie vrátí null", () => {
    expect(trustedDeviceIdentifier(null)).toBeNull();
    expect(trustedDeviceIdentifier("")).toBeNull();
    expect(trustedDeviceIdentifier("session_token=abc")).toBeNull();
    expect(trustedDeviceIdentifier("better-auth.trust_device=bez-identifikatoru")).toBeNull();
  });
});
