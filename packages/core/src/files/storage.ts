import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";

/** Úložiště souborů. Dnes lokální disk, později S3-kompatibilní — služby znají jen toto rozhraní. */
export interface StorageDriver {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

const SAFE_KEY = /^[a-z0-9][a-z0-9/_.-]*$/;

/**
 * Soubory na lokálním disku mimo veřejnou složku. Klíč smí mít jen bezpečné znaky a nesmí
 * vyjít z kořene (ochrana před `../`). Soubory se zakládají s právy jen pro vlastníka procesu.
 */
export class LocalDiskStorage implements StorageDriver {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
    const publicDir = path.resolve(process.cwd(), "public");
    if (this.root === publicDir || this.root.startsWith(publicDir + path.sep)) {
      throw new Error("Úložiště souborů nesmí být ve veřejné složce.");
    }
  }

  private resolve(key: string): string {
    if (!SAFE_KEY.test(key) || key.includes("..") || key.includes("//"))
      throw new Error(`Neplatný klíč souboru: ${key}`);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep))
      throw new Error(`Klíč souboru mimo úložiště: ${key}`);
    return full;
  }

  async put(key: string, data: Buffer) {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
    await fs.writeFile(full, data, { mode: 0o600, flag: "wx" });
  }

  async get(key: string) {
    const full = this.resolve(key);
    await fs.access(full);
    return createReadStream(full);
  }

  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }

  async exists(key: string) {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}

/** Klíč v úložišti: rozdělený do podsložek podle začátku id, ať jich v jedné nejsou tisíce. */
export function storageKey(id: string, suffix = ""): string {
  const clean = id.replace(/-/g, "");
  return `${clean.slice(0, 2)}/${clean.slice(2, 4)}/${id}${suffix}`;
}
