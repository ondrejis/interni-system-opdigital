/** IP klienta za důvěryhodnou proxy (Caddy): první adresa z X-Forwarded-For. */
export function clientIp(headers: Headers): string | null {
  const fwd = headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || headers.get("x-real-ip") || null;
}
