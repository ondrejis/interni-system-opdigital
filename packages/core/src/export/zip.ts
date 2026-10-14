import { Readable } from "node:stream";
import { createDeflateRaw, crc32 } from "node:zlib";

/**
 * Minimální streamovaný zápis ZIP (deflate, bez ZIP64; soubor do 4 GB, nejvýš 65 535 položek).
 * Data se komprimují a odesílají po částech, takže se celý archiv ani celá položka nedrží v paměti.
 * Použití: balík faktur pro účetní, soubory XLSX (OOXML je ZIP).
 */
export type ZipEntry = {
  /** Cesta v archivu, lomítka `/`, bez úvodního lomítka. */
  name: string;
  data: Buffer | string | AsyncIterable<Buffer | string> | Iterable<Buffer | string>;
  /** Čas změny (výchozí: teď). */
  modified?: Date;
};

const SIG_LOCAL = 0x04034b50;
const SIG_DESCRIPTOR = 0x08074b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
/** Bit 3: velikosti a CRC jsou až za daty; bit 11: názvy souborů jsou UTF-8. */
const FLAGS = 0x0808;

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

async function* asChunks(data: ZipEntry["data"]): AsyncGenerator<Buffer> {
  if (typeof data === "string") {
    yield Buffer.from(data, "utf8");
    return;
  }
  if (Buffer.isBuffer(data)) {
    yield data;
    return;
  }
  for await (const c of data as AsyncIterable<Buffer | string>)
    yield typeof c === "string" ? Buffer.from(c, "utf8") : c;
}

type Central = {
  name: Buffer;
  crc: number;
  compressed: number;
  size: number;
  offset: number;
  time: number;
  date: number;
};

/** Zapíše archiv po částech. Jméno položky nesmí obsahovat `..` ani začínat `/` (ochrana před zápisem mimo cíl). */
export async function* zipChunks(
  entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>,
): AsyncGenerator<Buffer> {
  const central: Central[] = [];
  let offset = 0;
  const out = (b: Buffer) => {
    offset += b.length;
    return b;
  };
  for await (const entry of entries as AsyncIterable<ZipEntry>) {
    if (entry.name.startsWith("/") || entry.name.split("/").includes(".."))
      throw new Error(`Neplatný název položky archivu: ${entry.name}`);
    const name = Buffer.from(entry.name, "utf8");
    const { time, date } = dosDateTime(entry.modified ?? new Date());
    const start = offset;

    const head = Buffer.alloc(30);
    head.writeUInt32LE(SIG_LOCAL, 0);
    head.writeUInt16LE(20, 4); // verze potřebná k rozbalení
    head.writeUInt16LE(FLAGS, 6);
    head.writeUInt16LE(8, 8); // deflate
    head.writeUInt16LE(time, 10);
    head.writeUInt16LE(date, 12);
    // CRC a velikosti zůstávají 0, jdou do datového popisu za daty
    head.writeUInt16LE(name.length, 26);
    yield out(Buffer.concat([head, name]));

    let crc = 0;
    let size = 0;
    async function* tapped() {
      for await (const c of asChunks(entry.data)) {
        crc = crc32(c, crc);
        size += c.length;
        yield c;
      }
    }
    let compressed = 0;
    const deflate = Readable.from(tapped(), { objectMode: false }).pipe(createDeflateRaw());
    for await (const c of deflate as AsyncIterable<Buffer>) {
      compressed += c.length;
      yield out(c);
    }
    if (size >= 0xffffffff || compressed >= 0xffffffff)
      throw new Error("Položka archivu je příliš velká (nad 4 GB).");

    const desc = Buffer.alloc(16);
    desc.writeUInt32LE(SIG_DESCRIPTOR, 0);
    desc.writeUInt32LE(crc >>> 0, 4);
    desc.writeUInt32LE(compressed, 8);
    desc.writeUInt32LE(size, 12);
    yield out(desc);
    central.push({ name, crc: crc >>> 0, compressed, size, offset: start, time, date });
  }

  if (central.length > 0xfffe) throw new Error("Archiv má příliš mnoho položek.");
  const cdStart = offset;
  for (const c of central) {
    const h = Buffer.alloc(46);
    h.writeUInt32LE(SIG_CENTRAL, 0);
    h.writeUInt16LE(20, 4); // verze, kterou archiv vytvořil
    h.writeUInt16LE(20, 6);
    h.writeUInt16LE(FLAGS, 8);
    h.writeUInt16LE(8, 10);
    h.writeUInt16LE(c.time, 12);
    h.writeUInt16LE(c.date, 14);
    h.writeUInt32LE(c.crc, 16);
    h.writeUInt32LE(c.compressed, 20);
    h.writeUInt32LE(c.size, 24);
    h.writeUInt16LE(c.name.length, 28);
    h.writeUInt32LE(c.offset, 42);
    yield out(Buffer.concat([h, c.name]));
  }
  const cdSize = offset - cdStart;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(SIG_END, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(cdStart, 16);
  yield out(end);
}

/** Webový stream (odpověď route handleru) z částí archivu nebo XLSX; chyba uprostřed streamu ho přeruší. */
export function toWebStream(chunks: AsyncIterable<Buffer>): ReadableStream<Uint8Array> {
  const it = chunks[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const r = await it.next();
        if (r.done) controller.close();
        else controller.enqueue(new Uint8Array(r.value));
      } catch (err) {
        controller.error(err);
      }
    },
    async cancel() {
      await it.return?.(undefined);
    },
  });
}

/** Celý archiv do jednoho bufferu (příloha e-mailu, testy). Pro velká data použijte `zipChunks`. */
export async function zipToBuffer(
  entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>,
): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const c of zipChunks(entries)) parts.push(c);
  return Buffer.concat(parts);
}
