const nfPct = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 });
const nfShare = new Intl.NumberFormat("cs-CZ", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Celé procento s nezlomitelnou mezerou: „120 %“. */
export function formatShareText(pct: number): string {
  return `${nfPct.format(pct)}\u00a0%`;
}

/** Podíl 0–1 jako procento na jedno desetinné místo: „12,5 %“, drobné podíly „< 0,1 %“. */
export function formatShare(share: number): string {
  const pct = share * 100;
  if (pct > 0 && pct < 0.1) return "< 0,1\u00a0%";
  return `${nfShare.format(pct)}\u00a0%`;
}
