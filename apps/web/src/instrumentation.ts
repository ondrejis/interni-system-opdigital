export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}

/**
 * Neočekávaná chyba při vykreslení stránky nebo v route handleru: zapíše se do logu / error trackingu i s kódem
 * (`digest`), který uživatel vidí na chybové stránce. Očekávané chyby (oprávnění, nenalezeno) sem nedojdou.
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routeType: string },
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // klient zavřel kartu nebo přešel jinam uprostřed odpovědi: to není chyba aplikace
  if (
    /destination stream errored|aborted|ECONNRESET|socket hang up/i.test(
      String((err as Error)?.message),
    )
  )
    return;
  const { captureError } = await import("@rebar/core/observability");
  const digest = (err as { digest?: string } | null)?.digest;
  captureError(err, {
    ...(digest ? { errorId: digest } : {}),
    path: request.path.split("?")[0] ?? "",
    method: request.method,
    routeType: context.routeType,
  });
}
