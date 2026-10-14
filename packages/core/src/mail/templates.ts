import { UserError } from "../rbac/errors";

export type MailTemplateName =
  "invitation" | "password-reset" | "test" | "document" | "notification";
export type RenderedMail = { subject: string; text: string; html: string };

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const need = (vars: Record<string, string>, key: string) => {
  const v = vars[key];
  if (!v) throw new UserError(`E-mailu chybí proměnná „${key}“.`);
  return v;
};

function wrap(
  brand: string,
  paragraphs: string[],
  action?: { label: string; url: string },
): { text: string; html: string } {
  const text = [...paragraphs, ...(action ? ["", action.url] : []), "", `— ${brand}`].join("\n");
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px">${escapeHtml(p)}</p>`).join("");
  const button = action
    ? `<p style="margin:22px 0"><a href="${escapeHtml(action.url)}" style="background:#2563eb;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(action.label)}</a></p><p style="margin:0 0 14px;color:#6b7280;font-size:13px">Nefunguje tlačítko? Zkopírujte tento odkaz do prohlížeče:<br>${escapeHtml(action.url)}</p>`
    : "";
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111827;max-width:560px">${body}${button}<p style="margin:22px 0 0;color:#6b7280">${escapeHtml(brand)}</p></div>`;
  return { text, html };
}

/**
 * Šablony systémových e-mailů v češtině. Název systému je vždy název klienta (branding),
 * nikdy interní název jádra.
 */
export function renderMail(
  template: MailTemplateName,
  vars: Record<string, string>,
  brand: string,
): RenderedMail {
  switch (template) {
    case "invitation": {
      const url = need(vars, "url");
      const days = vars.expiresInDays ?? "7";
      return {
        subject: `Pozvánka do systému ${brand}`,
        ...wrap(
          brand,
          [
            `Dobrý den, byli jste pozváni do systému ${brand}.`,
            `Přihlášení si nastavíte na odkazu níže. Odkaz platí ${days} dní.`,
          ],
          { label: "Nastavit přístup", url },
        ),
      };
    }
    case "password-reset": {
      const url = need(vars, "url");
      return {
        subject: `Nastavení hesla — ${brand}`,
        ...wrap(
          brand,
          [
            `Dobrý den${vars.name ? `, ${vars.name}` : ""},`,
            "pro váš účet bylo vyžádáno nastavení hesla. Odkaz platí 1 hodinu.",
            "Pokud jste o nic nežádali, e-mail ignorujte — nic se nezmění.",
          ],
          { label: "Nastavit heslo", url },
        ),
      };
    }
    case "document": {
      // doklad (faktura, upomínka…): předmět i text už složil volající ze šablony, podpis je součástí textu
      const subject = need(vars, "subject")
        .replace(/[\r\n]+/g, " ")
        .slice(0, 200);
      const body = need(vars, "body");
      const paragraphs = body
        .split(/\r?\n\r?\n/)
        .map((p) => p.trim())
        .filter(Boolean);
      const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111827;max-width:560px">${paragraphs
        .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\r?\n/g, "<br>")}</p>`)
        .join("")}</div>`;
      return { subject, text: body, html };
    }
    case "notification": {
      // upozornění ze systému: předmět je titulek, v textu je podtitulek a odkaz do aplikace (volitelný)
      const subject = need(vars, "subject")
        .replace(/[\r\n]+/g, " ")
        .slice(0, 200);
      const paragraphs = (vars.body ?? "")
        .split(/\r?\n\r?\n/)
        .map((p) => p.trim())
        .filter(Boolean);
      return {
        subject,
        ...wrap(
          brand,
          paragraphs.length ? paragraphs : [subject],
          vars.url ? { label: "Otevřít v systému", url: vars.url } : undefined,
        ),
      };
    }
    case "test":
      return {
        subject: `Test odesílání e-mailů — ${brand}`,
        ...wrap(brand, ["Tento testovací e-mail potvrzuje, že odesílání ze systému funguje."]),
      };
  }
}
