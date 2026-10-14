import { UserError } from "../rbac/errors";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export type FileKind = "image" | "document";
export type DetectedFile = { mime: string; kind: FileKind; ext: string };

const startsWith = (b: Buffer, bytes: number[], offset = 0) =>
  bytes.every((v, i) => b[offset + i] === v);

/** Poznání typu podle obsahu (ne podle přípony ani hlavičky od klienta). */
function sniff(data: Buffer): { mime: string; kind: FileKind; family: string } | null {
  if (startsWith(data, [0xff, 0xd8, 0xff]))
    return { mime: "image/jpeg", kind: "image", family: "jpeg" };
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return { mime: "image/png", kind: "image", family: "png" };
  if (startsWith(data, [0x52, 0x49, 0x46, 0x46]) && startsWith(data, [0x57, 0x45, 0x42, 0x50], 8))
    return { mime: "image/webp", kind: "image", family: "webp" };
  if (
    startsWith(data, [0x47, 0x49, 0x46, 0x38]) &&
    (data[4] === 0x37 || data[4] === 0x39) &&
    data[5] === 0x61
  )
    return { mime: "image/gif", kind: "image", family: "gif" };
  if (startsWith(data, [0x25, 0x50, 0x44, 0x46, 0x2d]))
    return { mime: "application/pdf", kind: "document", family: "pdf" };
  if (startsWith(data, [0x50, 0x4b, 0x03, 0x04]))
    return { mime: "application/zip", kind: "document", family: "zip" };
  return null;
}

const OOXML: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const EXTENSIONS: Record<string, string[]> = {
  jpeg: ["jpg", "jpeg"],
  png: ["png"],
  webp: ["webp"],
  gif: ["gif"],
  pdf: ["pdf"],
};

function looksLikeText(data: Buffer): boolean {
  if (data.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(data);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ověří soubor: velikost, skutečný typ podle obsahu a shodu s příponou. Povolené jsou obrázky
 * (JPEG, PNG, WebP, GIF), PDF, dokumenty Office (docx, xlsx, pptx) a prostý text (txt, csv).
 * SVG a HTML se odmítají (mohou obsahovat skripty).
 */
export function detectFile(name: string, data: Buffer): DetectedFile {
  if (data.length === 0) throw new UserError("Soubor je prázdný.");
  if (data.length > MAX_FILE_BYTES)
    throw new UserError(`Soubor je příliš velký (maximum ${MAX_FILE_BYTES / 1024 / 1024} MB).`);
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  const found = sniff(data);

  if (found && found.family !== "zip") {
    if (!EXTENSIONS[found.family]?.includes(ext))
      throw new UserError("Přípona souboru neodpovídá jeho obsahu.");
    return { mime: found.mime, kind: found.kind, ext: ext === "jpeg" ? "jpg" : ext };
  }
  if (found?.family === "zip") {
    const mime = OOXML[ext];
    if (!mime)
      throw new UserError(
        "Archivy ani neznámé dokumenty nelze nahrát. Povoleno: obrázky, PDF, Word, Excel, PowerPoint, TXT, CSV.",
      );
    return { mime, kind: "document", ext };
  }
  if (ext === "txt" || ext === "csv") {
    if (!looksLikeText(data)) throw new UserError("Přípona souboru neodpovídá jeho obsahu.");
    return { mime: ext === "csv" ? "text/csv" : "text/plain", kind: "document", ext };
  }
  throw new UserError(
    "Tento typ souboru nelze nahrát. Povoleno: obrázky, PDF, Word, Excel, PowerPoint, TXT, CSV.",
  );
}

// Řídicí znaky a znaky nepovolené v názvech souborů (záměrně i znaky \u0000–\u001f).
// eslint-disable-next-line no-control-regex
const UNSAFE_NAME_CHARS = /[\u0000-\u001f\u007f<>:"|?*]/g;

/** Bezpečný název souboru pro zobrazení a stažení (bez cesty a řídicích znaků). */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "soubor";
  const cleaned = base.replace(UNSAFE_NAME_CHARS, "").trim().replace(/^\.+/, "");
  const limited = cleaned.length > 150 ? cleaned.slice(-150) : cleaned;
  return limited || "soubor";
}

/** Hlavička Content-Disposition s českým názvem (RFC 5987) a vynuceným typem zobrazení. */
export function contentDisposition(name: string, inline: boolean): string {
  const safe = sanitizeFileName(name);
  const ascii = safe.replace(/[^ -~]/g, "_").replace(/"/g, "");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
