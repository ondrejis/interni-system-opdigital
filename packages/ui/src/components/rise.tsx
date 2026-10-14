/**
 * Jemný vstup obsahu (průhlednost + posun o pár pixelů, 180 ms). Klíčové snímky jsou tady,
 * aby je komponenty přihlašovacích a účtových stránek měly bez zásahu do globálního CSS.
 * `prefers-reduced-motion` ruší globální pravidlo ve `styles.css`; pro jistotu ho opakujeme.
 */
const CSS = `
@keyframes ui-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.ui-rise{animation:ui-rise 180ms cubic-bezier(.16,1,.3,1) both}
@media (prefers-reduced-motion:reduce){.ui-rise{animation:none}}
`;

export function RiseStyle() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
