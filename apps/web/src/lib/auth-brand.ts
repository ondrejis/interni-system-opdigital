import { getServices } from "@/server/services";

/**
 * Značka pro přihlašovací stránky. Soubory (logo) se podávají jen přihlášeným,
 * proto tu logo není a ukáže se monogram z názvu systému.
 */
export async function authBrand(): Promise<{ name: string }> {
  const { name } = await getServices().getBranding();
  return { name };
}
