import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Telefon ve tvaru E.164 (`+420777123456`), nebo `null`, když to není platné číslo. Číslo bez předvolby se čte
 * v zemi `cc` (výchozí CZ), číslo s `+` nebo `00` si zemi nese samo. Ukládá se do `person_contact_point.value_norm`.
 */
export function toE164(raw: string, cc: string = "CZ"): string | null {
  const text = raw.trim().replace(/^00(?=\d)/, "+");
  if (!text) return null;
  const parsed = parsePhoneNumberFromString(text, cc as CountryCode);
  return parsed?.isValid() ? parsed.number : null;
}

/**
 * Klíče pro hledání telefonu (`search_document.search_text`): jen číslice bez předvolby, tedy posledních 9 číslic
 * (celé číslo, když je kratší). Hledaný text se normalizuje stejně a hledá se podčástí, takže „777 12“ najde
 * „+420 777 123 456“. Číslo s méně než třemi číslicemi se neindexuje.
 */
export function phoneSearchKeys(raw: string): string[] {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 3) return [];
  return [digits.length > 9 ? digits.slice(-9) : digits];
}
