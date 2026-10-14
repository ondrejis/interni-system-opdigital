import { describe, expect, it } from "vitest";
import { describeUserAgent, maskIp } from "./user-agent";

const UA = {
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  safariIpad:
    "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
};

describe("describeUserAgent", () => {
  it.each([
    [UA.chromeMac, "Chrome 141 na macOS", "desktop"],
    [UA.safariIphone, "Safari 18 na iOS", "mobile"],
    [UA.safariIpad, "Safari 18 na iPadOS", "tablet"],
    [UA.chromeAndroid, "Chrome 140 na Android", "mobile"],
    [UA.edgeWindows, "Edge 141 na Windows", "desktop"],
    [UA.firefoxLinux, "Firefox 130 na Linux", "desktop"],
  ])("%#", (ua, label, device) => {
    expect(describeUserAgent(ua)).toMatchObject({ label, device });
  });

  it("prázdný, chybějící a nesmyslný text vrátí obecný popis", () => {
    for (const ua of [null, undefined, "", "curl/8.4.0 (x"]) {
      const d = describeUserAgent(ua);
      expect(d.browser).toBe("neznámý prohlížeč");
    }
    expect(describeUserAgent(null).label).toBe("Neznámé zařízení");
  });

  it("extrémně dlouhý vstup nevadí", () => {
    expect(describeUserAgent("a".repeat(100_000)).label).toBe("Neznámé zařízení");
  });
});

describe("maskIp", () => {
  it("zkrátí IPv4 i IPv6, IPv4 v zápisu IPv6 také", () => {
    expect(maskIp("203.0.113.45")).toBe("203.0.113.•••");
    expect(maskIp("::ffff:10.1.2.3")).toBe("10.1.2.•••");
    expect(maskIp("2001:db8:85a3:8d3:1319:8a2e:370:7344")).toBe("2001:db8:85a3:•••");
    expect(maskIp("::1")).toBe("::1");
  });
  it("prázdné a neplatné hodnoty nevrací", () => {
    expect(maskIp(null)).toBeNull();
    expect(maskIp("")).toBeNull();
    expect(maskIp("nesmysl")).toBeNull();
  });
});
