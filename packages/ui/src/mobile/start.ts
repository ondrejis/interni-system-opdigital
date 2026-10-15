/*
  Co se stane po otevření aplikace na telefonu (MOB-01): ukáže se Hledat s posledními záznamy a připravenou
  klávesnicí. Rozhodnutí je čistá funkce, aby šlo otestovat bez prohlížeče.
*/

/** Klíč v `sessionStorage`: hledání se při jednom spuštění aplikace otevře samo jen jednou. */
export const START_SEARCH_KEY = "opsys.mobile.start";

/**
 * Stránka, na které se aplikace „otevře“: Přehled (adresa `/` na něj přesměruje a přesměrování je pro prohlížeč nové
 * načtení, takže na `/` se Hledat neotvírá). Jiná adresa je konkrétní odkaz a nic se uživateli nevnucuje.
 */
const START_PATHS = new Set(["/prehled"]);

/** Má se po otevření aplikace samo otevřít Hledat? */
export function shouldOpenStartSearch(input: {
  pathname: string;
  /** Užší než `md` a dotykové zařízení. */
  phone: boolean;
  /** Už se při tomto spuštění otevřelo. */
  alreadyStarted: boolean;
  /** Adresa nese `?bez-hledani` (např. odkaz z notifikace nebo testy). */
  suppressed?: boolean;
}): boolean {
  return (
    input.phone && !input.alreadyStarted && !input.suppressed && START_PATHS.has(input.pathname)
  );
}

/** Stav instalace na plochu: nainstalováno, nabídka prohlížeče, návod pro iPhone, nepodporováno. */
export type InstallState = "installed" | "prompt" | "ios" | "unsupported";

/**
 * Jak nabídnout instalaci na plochu (MOB-10): spuštěno jako aplikace = „installed“; prohlížeč nabídl
 * `beforeinstallprompt` = „prompt“ (tlačítko); iPhone/iPad Safari = „ios“ (návod Sdílet → Přidat na plochu).
 */
export function installState(input: {
  standalone: boolean;
  userAgent: string;
  hasPrompt: boolean;
}): InstallState {
  if (input.standalone) return "installed";
  if (input.hasPrompt) return "prompt";
  const ua = input.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua));
  if (ios && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua)) return "ios";
  return "unsupported";
}
