/*
  Sdílené konstanty modulu „obchody“ bez závislosti na databázi a na Reactu: používá je schéma, kontrakt příkazů
  (zod), čistá logika i UI (OBC-B). Hodnoty kódů jsou anglicky snake_case, popisky česky (D §0).
*/

/** Výsledek obchodu: otevřený, vyhraný, prohraný (fáze pipeline jsou jen `open`, výsledek je tady). */
export const DEAL_RESULTS = ["open", "won", "lost"] as const;
/** Výsledek obchodu. */
export type DealResult = (typeof DEAL_RESULTS)[number];

/** Zdroj obchodu. */
export const DEAL_SOURCES = ["manual", "meta", "web_form", "referral", "other"] as const;
/** Zdroj obchodu. */
export type DealSource = (typeof DEAL_SOURCES)[number];

/** Typy služeb (stejné hodnoty jako `ServiceType` z `@rebar/core/contracts`). */
export const SERVICE_TYPES = ["web", "marketing", "systemy"] as const;

/** Entita a klíč výchozí pipeline obchodů (`pipeline.entity_type = "deal"`, `key = "default"`). */
export const DEAL_PIPELINE = { entityType: "deal", key: "default" } as const;
/** Číselník důvodů prohry obchodu (seed v manifestu, upravitelný v Nastavení). */
export const LOST_REASON_LOOKUP = "deal.lost_reason";

/** Popisky výsledků obchodu. */
export const DEAL_RESULT_LABELS: Record<DealResult, string> = {
  open: "Otevřený",
  won: "Vyhraný",
  lost: "Prohraný",
};
/** Popisky zdrojů obchodu. */
export const DEAL_SOURCE_LABELS: Record<DealSource, string> = {
  manual: "Ručně",
  meta: "Meta (formulář)",
  web_form: "Webový formulář",
  referral: "Doporučení",
  other: "Jiný",
};
