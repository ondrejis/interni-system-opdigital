/** Čitelný popis zařízení z hlavičky User-Agent (jen to, co uživatel pozná: prohlížeč, systém, typ zařízení). */
export type DeviceInfo = {
  browser: string;
  os: string;
  device: "mobile" | "tablet" | "desktop";
  /** Např. „Chrome 141 na macOS“. */
  label: string;
};

const BROWSERS: { name: string; re: RegExp }[] = [
  { name: "Edge", re: /\b(?:Edg|EdgA|EdgiOS)\/(\d+)/ },
  { name: "Opera", re: /\b(?:OPR|OPT)\/(\d+)/ },
  { name: "Samsung Internet", re: /\bSamsungBrowser\/(\d+)/ },
  { name: "Firefox", re: /\b(?:Firefox|FxiOS)\/(\d+)/ },
  { name: "Chrome", re: /\b(?:Chrome|CriOS)\/(\d+)/ },
  { name: "Safari", re: /\bVersion\/(\d+)[\d.]*.*Safari\// },
];

function detectOs(ua: string): string {
  if (/\b(iPhone|iPod)\b/.test(ua)) return "iOS";
  if (/\biPad\b/.test(ua)) return "iPadOS";
  if (/\bAndroid\b/.test(ua)) return "Android";
  if (/\bWindows\b/.test(ua)) return "Windows";
  if (/\bCrOS\b/.test(ua)) return "ChromeOS";
  if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) return "macOS";
  if (/\bLinux\b|\bX11\b/.test(ua)) return "Linux";
  return "neznámý systém";
}

/** Rozpozná prohlížeč, systém a typ zařízení. Neznámý nebo prázdný text vrátí obecný popis, nikdy nevyhodí chybu. */
export function describeUserAgent(ua: string | null | undefined): DeviceInfo {
  const text = (ua ?? "").slice(0, 400);
  const os = detectOs(text);
  let browser = "neznámý prohlížeč";
  for (const b of BROWSERS) {
    const m = b.re.exec(text);
    if (m) {
      browser = `${b.name} ${m[1]}`;
      break;
    }
  }
  const device: DeviceInfo["device"] =
    os === "iPadOS" || (os === "Android" && !/\bMobile\b/.test(text))
      ? "tablet"
      : os === "iOS" || os === "Android"
        ? "mobile"
        : "desktop";
  const label =
    browser === "neznámý prohlížeč" && os === "neznámý systém"
      ? "Neznámé zařízení"
      : `${browser} na ${os}`;
  return { browser, os, device, label };
}

/**
 * Zkrácená adresa pro zobrazení uživateli: IPv4 bez poslední části, IPv6 jen první tři bloky.
 * Úplná adresa zůstává v databázi (historie přihlášení pro správce), ale uživateli se neukazuje celá.
 */
export function maskIp(ip: string | null | undefined): string | null {
  const v = ip?.trim();
  if (!v) return null;
  const mapped = /^(?:::ffff:)(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(v);
  const addr = mapped?.[1] ?? v;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(addr)) return `${addr.split(".").slice(0, 3).join(".")}.•••`;
  if (addr === "::1") return addr;
  if (addr.includes(":")) {
    const groups = addr.split(":").filter(Boolean).slice(0, 3);
    return groups.length ? `${groups.join(":")}:•••` : null;
  }
  return null;
}
