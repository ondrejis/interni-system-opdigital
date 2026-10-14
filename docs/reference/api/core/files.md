# @rebar/core/files

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/files` (soubor `packages/core/src/files/index.ts`). Exportů: 22, z toho s popisem 15.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`attachFile`](#attachfile) | function | Připojí už nahraný soubor k záznamu (vyžaduje právo zápisu na záznam a vlastnictví souboru). |  |
| [`contentDisposition`](#contentdisposition) | function | Hlavička Content-Disposition s českým názvem (RFC 5987) a vynuceným typem zobrazení. |  |
| [`detachAttachment`](#detachattachment) | function | Odpojí přílohu od záznamu (soubor se uklidí, až nebude připojen nikde). Právo zápisu na záznam. |  |
| [`detectFile`](#detectfile) | function | Ověří soubor: velikost, skutečný typ podle obsahu a shodu s příponou. Povolené jsou obrázky (JPEG, PNG, WebP, GIF), PDF, dokumenty Office (docx, xlsx, pptx) a prostý text (txt, csv). SVG a HTML se odmítají (mohou obsahovat skripty). |  |
| [`generateThumbnail`](#generatethumbnail) | function | Vyrobí náhled obrázku (volá se z fronty úloh po nahrání). Neobrázky přeskočí. |  |
| [`listAttachments`](#listattachments) | function | Přílohy záznamu (čte ten, kdo záznam vidí). |  |
| [`makeThumbnail`](#makethumbnail) | function | Náhled 320 px ve formátu WebP. |  |
| [`normalizeImage`](#normalizeimage) | function | Fotky z telefonu: natočí podle EXIF, odstraní metadata (poloha apod.; poloha se ukládá odděleně se souhlasem) a zmenší na delší stranu 2560 px. GIF zůstává beze změny (animace). |  |
| [`openFile`](#openfile) | function | Otevře soubor (nebo jeho náhled) ke stažení. Oprávnění se ověřuje vždy zde, ne podle znalosti adresy. |  |
| [`purgeOrphanFiles`](#purgeorphanfiles) | function | Úklid: soubory, které nejsou připojeny nikam a jsou starší než `olderThanHours`, se smažou (měkce v DB, natvrdo v úložišti). Spouští se jako plánovaná úloha. |  |
| [`sanitizeFileName`](#sanitizefilename) | function | Bezpečný název souboru pro zobrazení a stažení (bez cesty a řídicích znaků). |  |
| [`storageKey`](#storagekey) | function | Klíč v úložišti: rozdělený do podsložek podle začátku id, ať jich v jedné nejsou tisíce. |  |
| [`uploadFile`](#uploadfile) | function | Nahraje soubor. Typ se pozná z obsahu, fotky se natočí, zbaví metadat a zmenší. Je-li zadána vazba na záznam, uživatel k němu musí mít právo zápisu; bez vazby je soubor „volný“ (vidí ho jen nahrávající, dokud se nepřipojí) a nepřipojené soubory se po 24 hodinách uklidí. |  |
| [`LocalDiskStorage`](#localdiskstorage) | class | Soubory na lokálním disku mimo veřejnou složku. Klíč smí mít jen bezpečné znaky a nesmí vyjít z kořene (ochrana před `../`). Soubory se zakládají s právy jen pro vlastníka procesu. |  |
| [`MAX_FILE_BYTES`](#max_file_bytes) | const |  |  |
| [`MAX_IMAGE_SIDE`](#max_image_side) | const |  |  |
| [`THUMB_SIDE`](#thumb_side) | const |  |  |
| [`StorageDriver`](#storagedriver) | interface | Úložiště souborů. Dnes lokální disk, později S3-kompatibilní — služby znají jen toto rozhraní. |  |
| [`AttachTo`](#attachto) | type |  |  |
| [`DetectedFile`](#detectedfile) | type |  |  |
| [`FileKind`](#filekind) | type |  |  |
| [`FilesDeps`](#filesdeps) | type |  |  |

### attachFile

function · `packages/core/src/files/service.ts`

Připojí už nahraný soubor k záznamu (vyžaduje právo zápisu na záznam a vlastnictví souboru).

```ts
async function attachFile(ctx: Ctx, fileId: string, to: AttachTo): Promise<string>
```

### contentDisposition

function · `packages/core/src/files/validate.ts`

Hlavička Content-Disposition s českým názvem (RFC 5987) a vynuceným typem zobrazení.

```ts
function contentDisposition(name: string, inline: boolean): string
```

### detachAttachment

function · `packages/core/src/files/service.ts`

Odpojí přílohu od záznamu (soubor se uklidí, až nebude připojen nikde). Právo zápisu na záznam.

```ts
async function detachAttachment(ctx: Ctx, attachmentId: string): Promise<void>
```

### detectFile

function · `packages/core/src/files/validate.ts`

Ověří soubor: velikost, skutečný typ podle obsahu a shodu s příponou. Povolené jsou obrázky
(JPEG, PNG, WebP, GIF), PDF, dokumenty Office (docx, xlsx, pptx) a prostý text (txt, csv).
SVG a HTML se odmítají (mohou obsahovat skripty).

```ts
function detectFile(name: string, data: Buffer): DetectedFile
```

### generateThumbnail

function · `packages/core/src/files/service.ts`

Vyrobí náhled obrázku (volá se z fronty úloh po nahrání). Neobrázky přeskočí.

```ts
async function generateThumbnail(db: Executor, deps: FilesDeps, fileId: string): Promise<boolean>
```

### listAttachments

function · `packages/core/src/files/service.ts`

Přílohy záznamu (čte ten, kdo záznam vidí).

```ts
async function listAttachments(ctx: Ctx, entityType: string, entityId: string): Promise<{ id: string; fileId: string; name: string; mime: string; size: number; kind: string; width: number | null; height: number | null; hasThumb: boolean; takenAt: Date | null; geo: schema.Geo | null; note: string | null; createdAt: Dat…
```

### makeThumbnail

function · `packages/core/src/files/images.ts`

Náhled 320 px ve formátu WebP.

```ts
async function makeThumbnail(data: Buffer): Promise<Buffer>
```

### normalizeImage

function · `packages/core/src/files/images.ts`

Fotky z telefonu: natočí podle EXIF, odstraní metadata (poloha apod.; poloha se ukládá odděleně se
souhlasem) a zmenší na delší stranu 2560 px. GIF zůstává beze změny (animace).

```ts
async function normalizeImage(data: Buffer, mime: string): Promise<NormalizedImage>
```

### openFile

function · `packages/core/src/files/service.ts`

Otevře soubor (nebo jeho náhled) ke stažení. Oprávnění se ověřuje vždy zde, ne podle znalosti adresy.

```ts
async function openFile(ctx: Ctx, deps: FilesDeps, fileId: string, opts: { thumb?: boolean } = {}): Promise<{ name: string; mime: string; size: number | null; stream: Readable; }>
```

### purgeOrphanFiles

function · `packages/core/src/files/service.ts`

Úklid: soubory, které nejsou připojeny nikam a jsou starší než `olderThanHours`, se smažou (měkce v DB,
natvrdo v úložišti). Spouští se jako plánovaná úloha.

```ts
async function purgeOrphanFiles(db: Executor, deps: FilesDeps, olderThanHours = 24): Promise<number>
```

### sanitizeFileName

function · `packages/core/src/files/validate.ts`

Bezpečný název souboru pro zobrazení a stažení (bez cesty a řídicích znaků).

```ts
function sanitizeFileName(name: string): string
```

### storageKey

function · `packages/core/src/files/storage.ts`

Klíč v úložišti: rozdělený do podsložek podle začátku id, ať jich v jedné nejsou tisíce.

```ts
function storageKey(id: string, suffix = ""): string
```

### uploadFile

function · `packages/core/src/files/service.ts`

Nahraje soubor. Typ se pozná z obsahu, fotky se natočí, zbaví metadat a zmenší. Je-li zadána vazba na
záznam, uživatel k němu musí mít právo zápisu; bez vazby je soubor „volný“ (vidí ho jen nahrávající,
dokud se nepřipojí) a nepřipojené soubory se po 24 hodinách uklidí.

```ts
async function uploadFile(ctx: Ctx, deps: FilesDeps, input: { name: string; data: Buffer; attachTo?: AttachTo }): Promise<{ file: { name: string; id: string; kind: "image" | "document"; createdAt: Date; updatedAt: Date; createdBy: string | null; updatedBy: string | null; deletedAt: Date | null; sha256: string; size: number; storageKey: string; mime: s…
```

### LocalDiskStorage

class · `packages/core/src/files/storage.ts`

Soubory na lokálním disku mimo veřejnou složku. Klíč smí mít jen bezpečné znaky a nesmí
vyjít z kořene (ochrana před `../`). Soubory se zakládají s právy jen pro vlastníka procesu.

```ts
class LocalDiskStorage implements StorageDriver {
  constructor(root: string);
  put(key: string, data: Buffer);
  get(key: string);
  delete(key: string);
  exists(key: string);
}
```

### MAX_FILE_BYTES

const · `packages/core/src/files/validate.ts`

_Bez popisu._

```ts
const MAX_FILE_BYTES: number
```

### MAX_IMAGE_SIDE

const · `packages/core/src/files/images.ts`

_Bez popisu._

```ts
const MAX_IMAGE_SIDE: 2560
```

### THUMB_SIDE

const · `packages/core/src/files/images.ts`

_Bez popisu._

```ts
const THUMB_SIDE: 320
```

### StorageDriver

interface · `packages/core/src/files/storage.ts`

Úložiště souborů. Dnes lokální disk, později S3-kompatibilní — služby znají jen toto rozhraní.

```ts
interface StorageDriver {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
```

### AttachTo

type · `packages/core/src/files/service.ts`

_Bez popisu._

```ts
type AttachTo = {
  entityType: string;
  entityId: string;
  /** Druh přílohy (`photo`, `document`, `protocol`…). */
  kind?: string;
  takenAt?: Date | null;
  geo?: Geo | null;
  note?: string | null;
};
```

### DetectedFile

type · `packages/core/src/files/validate.ts`

_Bez popisu._

```ts
type DetectedFile = { mime: string; kind: FileKind; ext: string };
```

### FileKind

type · `packages/core/src/files/validate.ts`

_Bez popisu._

```ts
type FileKind = "image" | "document";
```

### FilesDeps

type · `packages/core/src/files/service.ts`

_Bez popisu._

```ts
type FilesDeps = { storage: StorageDriver };
```
