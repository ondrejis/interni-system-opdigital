/** Relativní jas barvy `#RRGGBB` (0–1) pro volbu čitelného textu na akcentu. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Akcentová barva klienta do CSS proměnných. Text na akcentu je bílý, nebo tmavý podle toho, který má vyšší kontrast
 * (u středně světlých barev, třeba oranžové, vychází lépe tmavý; bílý by nesplnil WCAG AA 4,5 : 1).
 */
export function brandStyle(accentColor: string): Record<`--${string}`, string> {
  const l = luminance(accentColor);
  const onWhite = 1.05 / (l + 0.05);
  const onDark = (l + 0.05) / (luminance("#111111") + 0.05);
  return {
    "--accent": accentColor,
    "--accent-fg": onDark > onWhite ? "#111111" : "#ffffff",
  };
}
