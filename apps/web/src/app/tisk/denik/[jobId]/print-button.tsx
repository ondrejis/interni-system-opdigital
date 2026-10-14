"use client";

/** Tlačítko Tisk: otevře tisk prohlížeče, z něj jde uložit PDF. Tisk se nespouští sám (nerušil by práci s odkazem). */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-neutral-400 px-3 py-1.5 text-sm print:hidden"
    >
      Vytisknout / uložit jako PDF
    </button>
  );
}
