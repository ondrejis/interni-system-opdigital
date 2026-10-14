import { NextResponse, type NextRequest } from "next/server";

/**
 * Neplatné kódování adresy (`/zakazky/%E0%A4%A`) by Next.js odbyl anglickou stránkou „400: Bad Request“.
 * Proxy poznává jen adresy s procentovým kódováním a pro ty vrátí českou odpověď.
 */
export function proxy(request: NextRequest) {
  const raw = request.nextUrl.pathname;
  if (!raw.includes("%")) return NextResponse.next();
  try {
    decodeURIComponent(raw);
  } catch {
    return new NextResponse(
      '<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Neplatná adresa</title></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:4rem 1rem"><h1>Neplatná adresa</h1><p>Adresa obsahuje nesprávně zapsané znaky. Zkontrolujte odkaz a zkuste to znovu.</p><p><a href="/">Zpět na úvodní stránku</a></p></body></html>',
      {
        status: 400,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      },
    );
  }
  return NextResponse.next();
}

export const config = {
  // statické soubory Next.js a obrázky proxy neprochází
  matcher: "/((?!_next/static|_next/image).*)",
};
