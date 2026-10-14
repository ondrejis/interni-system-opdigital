"use client";

/**
 * Chyba v kořenovém rozvržení (mimo aplikační rámec): bez závislosti na stylech a komponentách, které mohly selhat.
 * Kód chyby (`digest`) se dá dohledat v logu serveru.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="cs">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "#fff",
          color: "#111",
        }}
      >
        <div role="alert" style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Něco se nepovedlo</h1>
          <p style={{ margin: "0 0 16px", color: "#444" }}>
            Aplikaci se nepodařilo zobrazit. Zkuste to prosím znovu
            {error.digest ? ` (kód chyby: ${error.digest})` : ""}.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ height: 40, padding: "0 16px", borderRadius: 6, border: "1px solid #888" }}
          >
            Zkusit znovu
          </button>
        </div>
      </body>
    </html>
  );
}
