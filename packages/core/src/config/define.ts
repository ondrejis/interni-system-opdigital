import "../zod-locale";
import { clientConfigSchema, type ClientConfig, type ClientConfigInput } from "./schema";

export class ClientConfigError extends Error {
  constructor(
    public readonly slug: string,
    public readonly issues: string[],
  ) {
    super(`Neplatná konfigurace klienta „${slug}“:\n - ${issues.join("\n - ")}`);
    this.name = "ClientConfigError";
  }
}

/**
 * Ověří konfiguraci klienta. Neplatná konfigurace = výjimka se srozumitelným
 * výpisem všech chyb (aplikace při startu nenastartuje).
 */
export function defineClientConfig(input: ClientConfigInput): ClientConfig {
  const result = clientConfigSchema.safeParse(input);
  if (!result.success) {
    const slug = typeof input?.slug === "string" ? input.slug : "?";
    const issues = result.error.issues.map((i) => {
      const path = i.path.join(".") || "(kořen)";
      return `${path}: ${i.message}`;
    });
    throw new ClientConfigError(slug, issues);
  }
  return result.data;
}
