/** Rozměry po zmenšení na nejdelší stranu `max` se zachováním poměru; menší obrázek se nezvětšuje. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const k = max / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/**
 * Zmenší fotku z telefonu před odesláním (typicky z 5–10 MB na ~300 kB), aby prošla i slabým signálem.
 * Respektuje otočení z EXIF. Cokoli, co zmenšit nejde (jiný formát, chybí podpora prohlížeče), vrátí beze změny.
 */
export async function compressImage(
  file: File,
  opts: { maxSide?: number; quality?: number; keepBelowBytes?: number } = {},
): Promise<Blob> {
  const { maxSide = 1600, quality = 0.8, keepBelowBytes = 400_000 } = opts;
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide);
    if (width === bitmap.width && file.size <= keepBelowBytes && file.type === "image/jpeg") {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
