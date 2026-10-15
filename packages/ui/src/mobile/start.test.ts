import { describe, expect, it } from "vitest";
import { installState, shouldOpenStartSearch } from "./start";

const base = { pathname: "/prehled", phone: true, alreadyStarted: false };

describe("Hledat po otevření aplikace (MOB-01)", () => {
  it("na telefonu a na úvodní stránce se otevře jednou", () => {
    expect(shouldOpenStartSearch(base)).toBe(true);
    expect(shouldOpenStartSearch({ ...base, pathname: "/" })).toBe(true);
    expect(shouldOpenStartSearch({ ...base, alreadyStarted: true })).toBe(false);
  });
  it("na počítači ani na hlubokém odkazu se nic nevnucuje", () => {
    expect(shouldOpenStartSearch({ ...base, phone: false })).toBe(false);
    expect(shouldOpenStartSearch({ ...base, pathname: "/klienti" })).toBe(false);
    expect(shouldOpenStartSearch({ ...base, suppressed: true })).toBe(false);
  });
});

describe("instalace na plochu (MOB-10)", () => {
  const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
  const IOS_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120 Mobile/15E148 Safari/604.1";
  const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";
  it("spuštěno jako aplikace", () => {
    expect(installState({ standalone: true, userAgent: IOS, hasPrompt: false })).toBe("installed");
  });
  it("Android nabídne tlačítko, iPhone Safari návod, ostatní nic", () => {
    expect(installState({ standalone: false, userAgent: ANDROID, hasPrompt: true })).toBe("prompt");
    expect(installState({ standalone: false, userAgent: IOS, hasPrompt: false })).toBe("ios");
    expect(installState({ standalone: false, userAgent: IOS_CHROME, hasPrompt: false })).toBe("unsupported");
    expect(installState({ standalone: false, userAgent: ANDROID, hasPrompt: false })).toBe("unsupported");
  });
});
