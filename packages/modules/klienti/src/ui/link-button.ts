/** Třídy odkazu vzhledem jako tlačítko `secondary` (`Button` neumí `asChild`); `large` = velká dotyková plocha (mobil). */
export const linkButton = (large = false): string =>
  [
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-line-strong bg-bg font-medium text-fg transition-colors duration-150 hover:bg-hover [&_svg]:size-4 [&_svg]:shrink-0",
    large ? "h-11 flex-1 px-3 text-base" : "h-8 px-3 text-base",
  ].join(" ");
