import { deflateSync } from "node:zlib";

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};

/** Jednoduchý PNG (svislý přechod dvou barev s „okny“), aby ukázkové fotky a podpisy nebyly prázdné. */
export function demoPng(
  width: number,
  height: number,
  top: [number, number, number],
  bottom: [number, number, number],
  seed = 1,
): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    const t = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const stripe = ((x >> 5) + (y >> 5) + seed) % 7 === 0 ? 14 : 0;
      for (let c = 0; c < 3; c++)
        raw[row + 1 + x * 3 + c] = Math.min(
          255,
          Math.round(top[c]! * (1 - t) + bottom[c]! * t) + stripe,
        );
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
