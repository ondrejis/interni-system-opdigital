import sharp from "sharp";

// Na 1 vCPU / 4 GB nesmí zpracování fotek sežrat server.
sharp.concurrency(1);
sharp.cache(false);

export const MAX_IMAGE_SIDE = 2560;
export const THUMB_SIDE = 320;

export type NormalizedImage = { data: Buffer; mime: string; width: number; height: number };

/**
 * Fotky z telefonu: natočí podle EXIF, odstraní metadata (poloha apod.; poloha se ukládá odděleně se
 * souhlasem) a zmenší na delší stranu 2560 px. GIF zůstává beze změny (animace).
 */
export async function normalizeImage(data: Buffer, mime: string): Promise<NormalizedImage> {
  if (mime === "image/gif") {
    const meta = await sharp(data).metadata();
    return { data, mime, width: meta.width ?? 0, height: meta.height ?? 0 };
  }
  const pipeline = sharp(data, { failOn: "error", limitInputPixels: 100_000_000 }).rotate().resize({
    width: MAX_IMAGE_SIDE,
    height: MAX_IMAGE_SIDE,
    fit: "inside",
    withoutEnlargement: true,
  });
  const out =
    mime === "image/png"
      ? pipeline.png({ compressionLevel: 9 })
      : mime === "image/webp"
        ? pipeline.webp({ quality: 82 })
        : pipeline.jpeg({ quality: 82, mozjpeg: false });
  const { data: buf, info } = await out.toBuffer({ resolveWithObject: true });
  return { data: buf, mime, width: info.width, height: info.height };
}

/** Náhled 320 px ve formátu WebP. */
export async function makeThumbnail(data: Buffer): Promise<Buffer> {
  return sharp(data, { failOn: "error", limitInputPixels: 100_000_000 })
    .rotate()
    .resize({ width: THUMB_SIDE, height: THUMB_SIDE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer();
}
