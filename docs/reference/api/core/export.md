# @rebar/core/export

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/export` (soubor `packages/core/src/export/index.ts`). Exportů: 77, z toho s popisem 43.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`assertSpecUsable`](#assertspecusable) | function | Ověří, že aktér entitu smí exportovat a že všechny sloupce existují (a nejsou skryté oprávněním). |  |
| [`cleanupRuns`](#cleanupruns) | function | Denní úklid: soubory po uplynutí doby uchování se smažou, zaseknuté exporty se označí jako neúspěšné. |  |
| [`columnLetter`](#columnletter) | function | Číslo sloupce → písmeno (0 → A, 26 → AA). |  |
| [`computeNextRun`](#computenextrun) | function | Nejbližší spuštění po okamžiku `after` v místním čase Europe/Prague. Den po dni (nejdál rok dopředu), v každém dni se čas převádí na okamžik zvlášť, takže přechod letního času čas nezkreslí (neexistující jarní hodina se posune dopředu, podzimní se bere poprvé). |  |
| [`createQueuedRun`](#createqueuedrun) | function | Založí záznam o exportu na pozadí a pošle úlohu do fronty. |  |
| [`csvCell`](#csvcell) | function |  |  |
| [`csvFormatOf`](#csvformatof) | function | Oddělovač CSV: nastavení v administraci má přednost před konfigurací klienta. |  |
| [`csvLines`](#csvlines) | function | CSV po částech (hlavička a řádky už jako řetězce; zabezpečení vzorců je na volajícím). |  |
| [`csvMoney`](#csvmoney) | function | Částka z haléřů na koruny se dvěma desetinnými místy (`12345` → `123,45`, nebo `123.45`). |  |
| [`csvNumber`](#csvnumber) | function | Číslo pro CSV: desetinná čárka při oddělovači `;`, tečka při `,`. |  |
| [`csvSafeText`](#csvsafetext) | function |  |  |
| [`deleteRunFile`](#deleterunfile) | function | Smaže soubor exportu (záznam o exportu zůstává jako doklad). |  |
| [`deleteSchedule`](#deleteschedule) | function |  |  |
| [`deleteTemplate`](#deletetemplate) | function |  |  |
| [`excelDate`](#exceldate) | function | Datum → pořadové číslo dne v Excelu (1900 systém). Čas se zahodí. |  |
| [`executeRun`](#executerun) | function | Provede export na pozadí s právy uživatele, který ho zadal (jeho aktuální role a oprávnění, ne systému): kdo mezitím přišel o právo, dostane chybu. Soubor se uloží do úložiště do konce doby uchování, uživatel dostane upozornění a případně e-mail. Opakované spuštění téhož exportu nic nezdvojí. |  |
| [`exportColumns`](#exportcolumns) | function | Sloupce exportu: zadané v pořadí, jinak výchozí viditelné. Skryté (bez oprávnění) a neznámé sloupce se odmítnou, takže export nikdy neobsahuje víc než seznam v aplikaci. |  |
| [`exportFileStem`](#exportfilestem) | function | Kmen názvu souboru z volby uživatele (bez přípony, bez nebezpečných znaků), s dnešním datem v české zóně. |  |
| [`exportHeaderOf`](#exportheaderof) | function | Hlavička PDF: název systému a údaje o firmě klienta. |  |
| [`insertQueuedRun`](#insertqueuedrun) | function | Vloží záznam o exportu na pozadí (bez odeslání do fronty, aby šlo volat v transakci). Export téže periody plánu pro téhož uživatele už existuje = `null` (idempotence plánovače). |  |
| [`listRuns`](#listruns) | function | Moje exporty (nebo všechny, s `exports.manage`), nejnovější první. |  |
| [`listSchedules`](#listschedules) | function | Plány, které aktér vidí: vlastní a ty, jejichž je příjemcem (správce exportů vidí všechny). |  |
| [`listTemplates`](#listtemplates) | function | Šablony, které aktér vidí: vlastní a sdílené, jen pro entity, které smí exportovat. |  |
| [`openRunFile`](#openrunfile) | function | Soubor hotového exportu ke stažení. Jen autor exportu: obsah odpovídá jeho oprávněním, cizí (i správce) ho nedostane, ať se data nedostanou k někomu s menšími právy (správce vidí jen záznam o exportu). |  |
| [`parseSpec`](#parsespec) | function |  |  |
| [`periodKeyOf`](#periodkeyof) | function | Klíč periody, do které spuštění patří: pro stejný plán, uživatele a periodu vznikne nejvýš jeden export. |  |
| [`prepareEntityExport`](#prepareentityexport) | function | Export seznamu entity do XLSX nebo CSV. Řádky se čtou ze serveru po stránkách (nikdy celá tabulka naráz), oprávnění a skryté atributy hlídá stejná datová vrstva jako seznam v aplikaci; aktér bez `permissions.export` (nebo čtení) nedostane nic. |  |
| [`renderTablePdf`](#rendertablepdf) | function | PDF tabulka exportu seznamu: A4 na šířku (na výšku do pěti sloupců), hlavička klienta, popis výběru, opakovaná záhlaví tabulky na každé stránce, číslování stran. Texty jdou přes pdfmake bez přístupu k souborům a síti. |  |
| [`runDueSchedules`](#rundueschedules) | function | Spustí plány, kterým nastal čas. Bezpečné proti dvojímu spuštění: řádky plánů se zamykají (`FOR UPDATE SKIP LOCKED`), `next_run_at` se posune ve stejné transakci a každý export periody má jednoznačný klíč (plán, uživatel, perioda), takže opakované volání ve stejné minutě i souběh dvou workerů nevytvoří export dvakrát. Po výpadku se zameškané periody nedohánějí, spustí se jen poslední. |  |
| [`saveSchedule`](#saveschedule) | function |  |  |
| [`saveTemplate`](#savetemplate) | function |  |  |
| [`setScheduleActive`](#setscheduleactive) | function | Zastaví (nebo znovu zapne) plán; autor nebo správce exportů. |  |
| [`specQuery`](#specquery) | function | Dotaz, který se pro export použije: u `all` bez filtrů a řazení. |  |
| [`startExport`](#startexport) | function | Zahájí export seznamu. Malý export se vrací hned jako stream; velký (nad `syncMaxRows`, u PDF nad 1 500 řádků) nebo výslovně vyžádaný na pozadí se zařadí do fronty a hotový soubor čeká v „Moje exporty“. V obou případech vzniká záznam o exportu (kdo, co, kolik řádků, filtry) a audit. |  |
| [`toWebStream`](#towebstream) | function | Webový stream (odpověď route handleru) z částí archivu nebo XLSX; chyba uprostřed streamu ho přeruší. |  |
| [`unsubscribeFromSchedule`](#unsubscribefromschedule) | function | Odhlášení z plánovaného exportu: příjemce se odebere ze seznamu. Plán, který nemá žádného příjemce, se zastaví. Smí kterýkoli příjemce i bez práva plánovat. |  |
| [`xlsxChunks`](#xlsxchunks) | function | XLSX po částech (pro stream odpovědi). |  |
| [`xlsxEntries`](#xlsxentries) | function | Souborová struktura XLSX jako položky ZIP (jeden list = jeden soubor `sheetN.xml`, streamovaný). |  |
| [`zipChunks`](#zipchunks) | function | Zapíše archiv po částech. Jméno položky nesmí obsahovat `..` ani začínat `/` (ochrana před zápisem mimo cíl). |  |
| [`zipToBuffer`](#ziptobuffer) | function | Celý archiv do jednoho bufferu (příloha e-mailu, testy). Pro velká data použijte `zipChunks`. |  |
| [`DEFAULT_CSV_FORMAT`](#default_csv_format) | const |  |  |
| [`EXPORT_FORMATS`](#export_formats) | const |  |  |
| [`EXPORT_MAX_ROWS`](#export_max_rows) | const | Nejvíc řádků jednoho exportu; víc se do souboru nehodí (a Excel jich unese přes milion). |  |
| [`MAIL_ATTACHMENT_MAX_BYTES`](#mail_attachment_max_bytes) | const | Největší soubor, který se pošle e-mailem jako příloha; větší jde jen odkazem na „Moje exporty“. |  |
| [`PDF_MAX_ROWS`](#pdf_max_rows) | const | Nejvíc řádků v PDF tabulce (pdfmake skládá dokument v paměti). |  |
| [`XLSX_MIME`](#xlsx_mime) | const |  |  |
| [`exportCleanupJob`](#exportcleanupjob) | const |  |  |
| [`exportRunJob`](#exportrunjob) | const |  |  |
| [`exportScheduleTickJob`](#exportscheduletickjob) | const |  |  |
| [`exportSetting`](#exportsetting) | const | Nastavení exportů v administraci; `null` = platí hodnota z konfigurace klienta. |  |
| [`exportSpecSchema`](#exportspecschema) | const | Co a jak se exportuje: entita, pohled (filtry, řazení, hledání), sloupce a formát. Základ šablon i plánů. |  |
| [`CsvDelimiter`](#csvdelimiter) | type | CSV pro Excel: výchozí je středník (česká verze Excelu), UTF-8 s BOM, řádky CRLF. Klient může v konfiguraci zvolit čárku (anglická verze Excelu, import do jiných systémů); s čárkou jako oddělovačem se desetinná čárka v číslech mění na tečku, aby se sloupce nerozbily. Excel buňku začínající `=`, `+`, `-`, `@` (nebo tabulátorem / návratem vozíku) vyhodnotí jako vzorec (CSV injection), proto se textům takové znaky neutralizují apostrofem (čísla se nepřepisují). |  |
| [`CsvFormat`](#csvformat) | type |  |  |
| [`Deliver`](#deliver) | type |  |  |
| [`EntityExportOptions`](#entityexportoptions) | type |  |  |
| [`ExportFormat`](#exportformat) | type |  |  |
| [`ExportHeader`](#exportheader) | type | Hlavička exportu: název systému klienta a údaje o firmě. |  |
| [`ExportRuntime`](#exportruntime) | type | Služby exportů: web a worker je skládají každý po svém (stejný kód, jiné spojení). Export se vždy provádí s právy uživatele, ve jménu kterého běží (`loadActor`), nikdy s právy systému. |  |
| [`ExportSource`](#exportsource) | type |  |  |
| [`ExportSpec`](#exportspec) | type |  |  |
| [`ExportSpecInput`](#exportspecinput) | type |  |  |
| [`Frequency`](#frequency) | type |  |  |
| [`PdfTableColumn`](#pdftablecolumn) | type |  |  |
| [`PdfTableInput`](#pdftableinput) | type |  |  |
| [`PreparedExport`](#preparedexport) | type |  |  |
| [`QueuedRunValues`](#queuedrunvalues) | type |  |  |
| [`RunSummary`](#runsummary) | type |  |  |
| [`ScheduleInfo`](#scheduleinfo) | type |  |  |
| [`ScheduleInput`](#scheduleinput) | type |  |  |
| [`ScheduleTiming`](#scheduletiming) | type |  |  |
| [`StartedExport`](#startedexport) | type |  |  |
| [`TemplateInfo`](#templateinfo) | type |  |  |
| [`TemplateInput`](#templateinput) | type |  |  |
| [`XlsxColumn`](#xlsxcolumn) | type |  |  |
| [`XlsxColumnType`](#xlsxcolumntype) | type | Streamovaný zápis XLSX (OOXML) bez závislostí: řádky se serializují a komprimují postupně, takže export velké tabulky nenačítá celou sadu do paměti. Texty jsou `inlineStr` (nikdy se nevyhodnotí jako vzorec), čísla jsou čísla, data mají datový formát, peníze formát měny. |  |
| [`XlsxSheet`](#xlsxsheet) | type |  |  |
| [`ZipEntry`](#zipentry) | type | Minimální streamovaný zápis ZIP (deflate, bez ZIP64; soubor do 4 GB, nejvýš 65 535 položek). Data se komprimují a odesílají po částech, takže se celý archiv ani celá položka nedrží v paměti. Použití: balík faktur pro účetní, soubory XLSX (OOXML je ZIP). |  |

### assertSpecUsable

function · `packages/core/src/export/templates.ts`

Ověří, že aktér entitu smí exportovat a že všechny sloupce existují (a nejsou skryté oprávněním).

```ts
async function assertSpecUsable(ctx: Ctx, rt: Pick<ExportRuntime, "registry">, spec: ExportSpec): Promise<import("../entities").EntityDef>
```

### cleanupRuns

function · `packages/core/src/export/runs.ts`

Denní úklid: soubory po uplynutí doby uchování se smažou, zaseknuté exporty se označí jako neúspěšné.

```ts
async function cleanupRuns(rt: Pick<ExportRuntime, "db" | "storage">): Promise<{ removed: number; stuck: number }>
```

### columnLetter

function · `packages/core/src/export/xlsx.ts`

Číslo sloupce → písmeno (0 → A, 26 → AA).

```ts
function columnLetter(index: number): string
```

### computeNextRun

function · `packages/core/src/export/schedules.ts`

Nejbližší spuštění po okamžiku `after` v místním čase Europe/Prague. Den po dni (nejdál rok dopředu), v každém dni
se čas převádí na okamžik zvlášť, takže přechod letního času čas nezkreslí (neexistující jarní hodina se posune
dopředu, podzimní se bere poprvé).

```ts
function computeNextRun(t: ScheduleTiming, after: Date): Date
```

### createQueuedRun

function · `packages/core/src/export/runs.ts`

Založí záznam o exportu na pozadí a pošle úlohu do fronty.

```ts
async function createQueuedRun(ctx: Ctx, rt: Pick<ExportRuntime, "queue">, v: QueuedRunValues): Promise<string>
```

### csvCell

function · `packages/core/src/export/csv.ts`

_Bez popisu._

```ts
function csvCell(v: string, delimiter: CsvDelimiter = ";"): string
```

### csvFormatOf

function · `packages/core/src/export/runtime.ts`

Oddělovač CSV: nastavení v administraci má přednost před konfigurací klienta.

```ts
async function csvFormatOf(rt: ExportRuntime): Promise<CsvFormat>
```

### csvLines

function · `packages/core/src/export/csv.ts`

CSV po částech (hlavička a řádky už jako řetězce; zabezpečení vzorců je na volajícím).

```ts
async function csvLines(header: readonly string[], rows: AsyncIterable<readonly string[]> | Iterable<readonly string[]>, format: CsvFormat = DEFAULT_CSV_FORMAT): AsyncGenerator<Buffer>
```

### csvMoney

function · `packages/core/src/export/csv.ts`

Částka z haléřů na koruny se dvěma desetinnými místy (`12345` → `123,45`, nebo `123.45`).

```ts
function csvMoney(minor: number, format: CsvFormat = DEFAULT_CSV_FORMAT): string
```

### csvNumber

function · `packages/core/src/export/csv.ts`

Číslo pro CSV: desetinná čárka při oddělovači `;`, tečka při `,`.

```ts
function csvNumber(n: number, format: CsvFormat = DEFAULT_CSV_FORMAT): string
```

### csvSafeText

function · `packages/core/src/export/csv.ts`

_Bez popisu._

```ts
function csvSafeText(text: string): string
```

### deleteRunFile

function · `packages/core/src/export/runs.ts`

Smaže soubor exportu (záznam o exportu zůstává jako doklad).

```ts
async function deleteRunFile(ctx: Ctx, rt: Pick<ExportRuntime, "storage">, id: string): Promise<void>
```

### deleteSchedule

function · `packages/core/src/export/schedules.ts`

_Bez popisu._

```ts
async function deleteSchedule(ctx: Ctx, id: string): Promise<void>
```

### deleteTemplate

function · `packages/core/src/export/templates.ts`

_Bez popisu._

```ts
async function deleteTemplate(ctx: Ctx, id: string): Promise<void>
```

### excelDate

function · `packages/core/src/export/xlsx.ts`

Datum → pořadové číslo dne v Excelu (1900 systém). Čas se zahodí.

```ts
function excelDate(v: string | Date): number | null
```

### executeRun

function · `packages/core/src/export/runs.ts`

Provede export na pozadí s právy uživatele, který ho zadal (jeho aktuální role a oprávnění, ne systému): kdo mezitím
přišel o právo, dostane chybu. Soubor se uloží do úložiště do konce doby uchování, uživatel dostane upozornění
a případně e-mail. Opakované spuštění téhož exportu nic nezdvojí.

```ts
async function executeRun(rt: ExportRuntime, runId: string): Promise<void>
```

### exportColumns

function · `packages/core/src/export/entity-export.ts`

Sloupce exportu: zadané v pořadí, jinak výchozí viditelné. Skryté (bez oprávnění) a neznámé sloupce se odmítnou, takže
export nikdy neobsahuje víc než seznam v aplikaci.

```ts
async function exportColumns(ctx: Ctx, registry: EntityRegistry, entity: ResolvedEntity, columns?: readonly string[]): Promise<{ descriptor: import("../entities/shared").EntityDescriptor; attrs: AttributeDescriptor[]; }>
```

### exportFileStem

function · `packages/core/src/export/spec.ts`

Kmen názvu souboru z volby uživatele (bez přípony, bez nebezpečných znaků), s dnešním datem v české zóně.

```ts
function exportFileStem(wanted: string | undefined, fallback: string, now = new Date()): string
```

### exportHeaderOf

function · `packages/core/src/export/runtime.ts`

Hlavička PDF: název systému a údaje o firmě klienta.

```ts
async function exportHeaderOf(rt: ExportRuntime): Promise<ExportHeader>
```

### insertQueuedRun

function · `packages/core/src/export/runs.ts`

Vloží záznam o exportu na pozadí (bez odeslání do fronty, aby šlo volat v transakci). Export téže periody plánu pro
téhož uživatele už existuje = `null` (idempotence plánovače).

```ts
async function insertQueuedRun(ctx: Ctx, v: QueuedRunValues): Promise<string | null>
```

### listRuns

function · `packages/core/src/export/runs.ts`

Moje exporty (nebo všechny, s `exports.manage`), nejnovější první.

```ts
async function listRuns(ctx: Ctx, opts: { all?: boolean; limit?: number } = {}): Promise<RunSummary[]>
```

### listSchedules

function · `packages/core/src/export/schedules.ts`

Plány, které aktér vidí: vlastní a ty, jejichž je příjemcem (správce exportů vidí všechny).

```ts
async function listSchedules(ctx: Ctx, rt: Pick<ExportRuntime, "registry">): Promise<ScheduleInfo[]>
```

### listTemplates

function · `packages/core/src/export/templates.ts`

Šablony, které aktér vidí: vlastní a sdílené, jen pro entity, které smí exportovat.

```ts
async function listTemplates(ctx: Ctx, rt: Pick<ExportRuntime, "registry">, filter: { entity?: string } = {}): Promise<TemplateInfo[]>
```

### openRunFile

function · `packages/core/src/export/runs.ts`

Soubor hotového exportu ke stažení. Jen autor exportu: obsah odpovídá jeho oprávněním, cizí (i správce) ho
nedostane, ať se data nedostanou k někomu s menšími právy (správce vidí jen záznam o exportu).

```ts
async function openRunFile(ctx: Ctx, rt: Pick<ExportRuntime, "storage" | "db">, id: string): Promise<{ stream: import("stream").Readable; filename: string; mime: string; size: number | null; disposition: string; }>
```

### parseSpec

function · `packages/core/src/export/runs.ts`

_Bez popisu._

```ts
function parseSpec(raw: ExportSpecInput | unknown): ExportSpec
```

### periodKeyOf

function · `packages/core/src/export/schedules.ts`

Klíč periody, do které spuštění patří: pro stejný plán, uživatele a periodu vznikne nejvýš jeden export.

```ts
function periodKeyOf(frequency: Frequency, slot: Date): string
```

### prepareEntityExport

function · `packages/core/src/export/entity-export.ts`

Export seznamu entity do XLSX nebo CSV. Řádky se čtou ze serveru po stránkách (nikdy celá tabulka naráz),
oprávnění a skryté atributy hlídá stejná datová vrstva jako seznam v aplikaci; aktér bez `permissions.export`
(nebo čtení) nedostane nic.

```ts
async function prepareEntityExport(ctx: Ctx, registry: EntityRegistry, entity: ResolvedEntity, opts: EntityExportOptions): Promise<PreparedExport>
```

### renderTablePdf

function · `packages/core/src/export/pdf-table.ts`

PDF tabulka exportu seznamu: A4 na šířku (na výšku do pěti sloupců), hlavička klienta, popis výběru, opakovaná
záhlaví tabulky na každé stránce, číslování stran. Texty jdou přes pdfmake bez přístupu k souborům a síti.

```ts
async function renderTablePdf(input: PdfTableInput): Promise<Buffer>
```

### runDueSchedules

function · `packages/core/src/export/schedules.ts`

Spustí plány, kterým nastal čas. Bezpečné proti dvojímu spuštění: řádky plánů se zamykají (`FOR UPDATE SKIP LOCKED`),
`next_run_at` se posune ve stejné transakci a každý export periody má jednoznačný klíč (plán, uživatel, perioda),
takže opakované volání ve stejné minutě i souběh dvou workerů nevytvoří export dvakrát. Po výpadku se zameškané
periody nedohánějí, spustí se jen poslední.

```ts
async function runDueSchedules(rt: ExportRuntime, now = new Date()): Promise<DueResult>
```

### saveSchedule

function · `packages/core/src/export/schedules.ts`

_Bez popisu._

```ts
async function saveSchedule(ctx: Ctx, rt: ExportRuntime, raw: ScheduleInput): Promise<{ id: string; nextRunAt: string }>
```

### saveTemplate

function · `packages/core/src/export/templates.ts`

_Bez popisu._

```ts
async function saveTemplate(ctx: Ctx, rt: Pick<ExportRuntime, "registry">, raw: TemplateInput): Promise<{ id: string }>
```

### setScheduleActive

function · `packages/core/src/export/schedules.ts`

Zastaví (nebo znovu zapne) plán; autor nebo správce exportů.

```ts
async function setScheduleActive(ctx: Ctx, id: string, active: boolean): Promise<void>
```

### specQuery

function · `packages/core/src/export/spec.ts`

Dotaz, který se pro export použije: u `all` bez filtrů a řazení.

```ts
function specQuery(spec: ExportSpec): { filters?: import("../entities").FilterGroup | undefined; sort?: { attr: string; dir: "asc" | "desc"; }[] | undefined; q?: string | undefined; } | undefined
```

### startExport

function · `packages/core/src/export/runs.ts`

Zahájí export seznamu. Malý export se vrací hned jako stream; velký (nad `syncMaxRows`, u PDF nad 1 500 řádků) nebo
výslovně vyžádaný na pozadí se zařadí do fronty a hotový soubor čeká v „Moje exporty“. V obou případech vzniká záznam
o exportu (kdo, co, kolik řádků, filtry) a audit.

```ts
async function startExport(ctx: Ctx, rt: ExportRuntime, raw: ExportSpecInput, opts: { source?: ExportSource; templateId?: string | null; background?: boolean; label?: string; } = {}): Promise<StartedExport>
```

### toWebStream

function · `packages/core/src/export/zip.ts`

Webový stream (odpověď route handleru) z částí archivu nebo XLSX; chyba uprostřed streamu ho přeruší.

```ts
function toWebStream(chunks: AsyncIterable<Buffer>): ReadableStream<Uint8Array>
```

### unsubscribeFromSchedule

function · `packages/core/src/export/schedules.ts`

Odhlášení z plánovaného exportu: příjemce se odebere ze seznamu. Plán, který nemá žádného příjemce, se zastaví.
Smí kterýkoli příjemce i bez práva plánovat.

```ts
async function unsubscribeFromSchedule(ctx: Ctx, id: string): Promise<void>
```

### xlsxChunks

function · `packages/core/src/export/xlsx.ts`

XLSX po částech (pro stream odpovědi).

```ts
function xlsxChunks(sheets: readonly XlsxSheet[]): AsyncGenerator<Buffer>
```

### xlsxEntries

function · `packages/core/src/export/xlsx.ts`

Souborová struktura XLSX jako položky ZIP (jeden list = jeden soubor `sheetN.xml`, streamovaný).

```ts
function xlsxEntries(sheets: readonly XlsxSheet[]): Generator<ZipEntry>
```

### zipChunks

function · `packages/core/src/export/zip.ts`

Zapíše archiv po částech. Jméno položky nesmí obsahovat `..` ani začínat `/` (ochrana před zápisem mimo cíl).

```ts
async function zipChunks(entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>): AsyncGenerator<Buffer>
```

### zipToBuffer

function · `packages/core/src/export/zip.ts`

Celý archiv do jednoho bufferu (příloha e-mailu, testy). Pro velká data použijte `zipChunks`.

```ts
async function zipToBuffer(entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>): Promise<Buffer>
```

### DEFAULT_CSV_FORMAT

const · `packages/core/src/export/csv.ts`

_Bez popisu._

```ts
const DEFAULT_CSV_FORMAT: CsvFormat
```

### EXPORT_FORMATS

const · `packages/core/src/export/spec.ts`

_Bez popisu._

```ts
const EXPORT_FORMATS: readonly ["csv", "xlsx", "pdf"]
```

### EXPORT_MAX_ROWS

const · `packages/core/src/export/entity-export.ts`

Nejvíc řádků jednoho exportu; víc se do souboru nehodí (a Excel jich unese přes milion).

```ts
const EXPORT_MAX_ROWS: 50000
```

### MAIL_ATTACHMENT_MAX_BYTES

const · `packages/core/src/export/runs.ts`

Největší soubor, který se pošle e-mailem jako příloha; větší jde jen odkazem na „Moje exporty“.

```ts
const MAIL_ATTACHMENT_MAX_BYTES: number
```

### PDF_MAX_ROWS

const · `packages/core/src/export/pdf-table.ts`

Nejvíc řádků v PDF tabulce (pdfmake skládá dokument v paměti).

```ts
const PDF_MAX_ROWS: 5000
```

### XLSX_MIME

const · `packages/core/src/export/xlsx.ts`

_Bez popisu._

```ts
const XLSX_MIME: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
```

### exportCleanupJob

const · `packages/core/src/export/runs.ts`

_Bez popisu._

```ts
const exportCleanupJob: JobDef< z.ZodObject<Record<string, never>>, ExportRuntime >
```

### exportRunJob

const · `packages/core/src/export/runs.ts`

_Bez popisu._

```ts
const exportRunJob: JobDef<z.ZodObject<{ runId: z.ZodUUID }>, ExportRuntime>
```

### exportScheduleTickJob

const · `packages/core/src/export/schedules.ts`

_Bez popisu._

```ts
const exportScheduleTickJob: JobDef< z.ZodObject<Record<string, never>>, ExportRuntime >
```

### exportSetting

const · `packages/core/src/export/runtime.ts`

Nastavení exportů v administraci; `null` = platí hodnota z konfigurace klienta.

```ts
const exportSetting: import("../settings").SettingDef<{ csvDelimiter: ";" | "," | null; }>
```

### exportSpecSchema

const · `packages/core/src/export/spec.ts`

Co a jak se exportuje: entita, pohled (filtry, řazení, hledání), sloupce a formát. Základ šablon i plánů.

```ts
const exportSpecSchema: z.ZodObject<{ entity: z.ZodString; format: z.ZodEnum<{ csv: "csv"; xlsx: "xlsx"; pdf: "pdf"; }>; scope: z.ZodDefault<z.ZodEnum<{ all: "all"; view: "view"; }>>; columns: z.ZodOptional<z.ZodArray<z.ZodString>>; query: z.ZodOptional<z.ZodObje…
```

### CsvDelimiter

type · `packages/core/src/export/csv.ts`

CSV pro Excel: výchozí je středník (česká verze Excelu), UTF-8 s BOM, řádky CRLF. Klient může v konfiguraci zvolit
čárku (anglická verze Excelu, import do jiných systémů); s čárkou jako oddělovačem se desetinná čárka v číslech mění
na tečku, aby se sloupce nerozbily. Excel buňku začínající `=`, `+`, `-`, `@` (nebo tabulátorem / návratem vozíku)
vyhodnotí jako vzorec (CSV injection), proto se textům takové znaky neutralizují apostrofem (čísla se nepřepisují).

```ts
type CsvDelimiter = ";" | ",";
```

### CsvFormat

type · `packages/core/src/export/csv.ts`

_Bez popisu._

```ts
type CsvFormat = {
  delimiter: CsvDelimiter;
};
```

### Deliver

type · `packages/core/src/export/schedules.ts`

_Bez popisu._

```ts
type Deliver = "email" | "myexports" | "both";
```

### EntityExportOptions

type · `packages/core/src/export/entity-export.ts`

_Bez popisu._

```ts
type EntityExportOptions = {
  format: ExportFormat;
  /** Oddělovač CSV (z konfigurace klienta); výchozí středník. */
  csv?: CsvFormat;
  /** Název souboru bez přípony (`{datum}` se nahradí dnešním datem). */
  fileName?: string | undefined;
  /** Hlavička PDF (název systému a údaje o firmě). */
  header?: ExportHeader;
  /** Zápis do auditu (výchozí ano); vypíná se jen tam, kde audit zapisuje volající. */
  audit?: boolean;

  /** Filtr, hledání a řazení z aktuálního pohledu; export vezme celou filtrovanou sadu, ne jen zobrazené řádky. */
  query?: Pick<QueryInput, "filters" | "sort" | "q">;
  /** Sloupce v pořadí; bez nich se vezmou výchozí viditelné. Skryté (bez oprávnění) a neznámé sloupce se odmítnou. */
  columns?: readonly string[];
  maxRows?: number;
};
```

### ExportFormat

type · `packages/core/src/export/spec.ts`

_Bez popisu._

```ts
type ExportFormat = (typeof EXPORT_FORMATS)[number];
```

### ExportHeader

type · `packages/core/src/export/pdf-table.ts`

Hlavička exportu: název systému klienta a údaje o firmě.

```ts
type ExportHeader = {
  brand: string;
  /** Řádky pod názvem (firma, IČO, adresa). */
  lines?: readonly string[];
};
```

### ExportRuntime

type · `packages/core/src/export/runtime.ts`

Služby exportů: web a worker je skládají každý po svém (stejný kód, jiné spojení). Export se vždy provádí s právy
uživatele, ve jménu kterého běží (`loadActor`), nikdy s právy systému.

```ts
type ExportRuntime = {
  db: Db;
  registry: EntityRegistry;
  storage: StorageDriver;
  /** Katalog oprávnění zapnutých modulů (aktér se z něj načítá v úloze na pozadí). */
  catalog: ReadonlySet<string>;
  settings: SettingsService;
  queue: Pick<QueueClient, "send">;
  cipher: Cipher;
  baseURL: string;
  config: ClientConfig["exports"];
  brand: () => Promise<string>;
};
```

### ExportSource

type · `packages/core/src/export/runs.ts`

_Bez popisu._

```ts
type ExportSource = "manual" | "schedule" | "dashboard";
```

### ExportSpec

type · `packages/core/src/export/spec.ts`

_Bez popisu._

```ts
type ExportSpec = z.output<typeof exportSpecSchema>;
```

### ExportSpecInput

type · `packages/core/src/export/spec.ts`

_Bez popisu._

```ts
type ExportSpecInput = z.input<typeof exportSpecSchema>;
```

### Frequency

type · `packages/core/src/export/schedules.ts`

_Bez popisu._

```ts
type Frequency = "daily" | "weekly" | "monthly";
```

### PdfTableColumn

type · `packages/core/src/export/pdf-table.ts`

_Bez popisu._

```ts
type PdfTableColumn = {
  header: string;
  align?: "left" | "right";
  /** Relativní šířka sloupce (výchozí 1). */
  weight?: number;
};
```

### PdfTableInput

type · `packages/core/src/export/pdf-table.ts`

_Bez popisu._

```ts
type PdfTableInput = {
  title: string;
  header: ExportHeader;
  /** Popis výběru: filtry, období, počet záznamů. */
  notes?: readonly string[];
  columns: readonly PdfTableColumn[];
  rows: readonly (readonly string[])[];
  /** Řádek součtů pod tabulkou (hodnoty podle sloupců, `null` = prázdná buňka). */
  totals?: readonly (string | null)[];
  generatedAt: string;
};
```

### PreparedExport

type · `packages/core/src/export/entity-export.ts`

_Bez popisu._

```ts
type PreparedExport = {
  filename: string;
  mime: string;
  /** Počet exportovaných záznamů. */
  count: number;
  chunks: AsyncGenerator<Buffer>;
};
```

### QueuedRunValues

type · `packages/core/src/export/runs.ts`

_Bez popisu._

```ts
type QueuedRunValues = {
  userId: string;
  source: ExportSource;
  templateId: string | null;
  scheduleId?: string | null;
  periodKey?: string | null;
  entityType: string;
  label: string;
  spec: ExportSpec;
  fileName: string;
  deliverEmail: boolean;
};
```

### RunSummary

type · `packages/core/src/export/runs.ts`

_Bez popisu._

```ts
type RunSummary = {
  id: string;
  label: string;
  format: string;
  fileName: string;
  source: string;
  status: string;
  rowCount: number | null;
  sizeBytes: number | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  expiresAt: string | null;
  downloadable: boolean;
  userName: string;
  mine: boolean;
};
```

### ScheduleInfo

type · `packages/core/src/export/schedules.ts`

_Bez popisu._

```ts
type ScheduleInfo = {
  id: string;
  name: string;
  entity: string;
  entityLabel: string;
  spec: ExportSpec;
  templateId: string | null;
  frequency: Frequency;
  weekday: number | null;
  monthDay: number | null;
  timeLocal: string;
  recipients: { id: string; name: string }[];
  deliver: Deliver;
  active: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  ownerName: string;
  mine: boolean;
  /** Jsem příjemce (smím se odhlásit). */
  subscribed: boolean;
};
```

### ScheduleInput

type · `packages/core/src/export/schedules.ts`

_Bez popisu._

```ts
type ScheduleInput = z.input<typeof scheduleInput>;
```

### ScheduleTiming

type · `packages/core/src/export/schedules.ts`

_Bez popisu._

```ts
type ScheduleTiming = {
  frequency: Frequency;
  /** 1 = pondělí … 7 = neděle (týdně). */
  weekday: number | null;
  /** 1–28, nebo 0 = poslední den měsíce (měsíčně). */
  monthDay: number | null;
  /** `HH:MM` v místním čase (Europe/Prague). */
  timeLocal: string;
};
```

### StartedExport

type · `packages/core/src/export/runs.ts`

_Bez popisu._

```ts
type StartedExport =
  | { mode: "stream"; runId: string; prepared: PreparedExport }
  | { mode: "queued"; runId: string; rows: number };
```

### TemplateInfo

type · `packages/core/src/export/templates.ts`

_Bez popisu._

```ts
type TemplateInfo = {
  id: string;
  name: string;
  entity: string;
  entityLabel: string;
  shared: boolean;
  mine: boolean;
  ownerName: string;
  spec: ExportSpec;
};
```

### TemplateInput

type · `packages/core/src/export/templates.ts`

_Bez popisu._

```ts
type TemplateInput = z.input<typeof templateInput>;
```

### XlsxColumn

type · `packages/core/src/export/xlsx.ts`

_Bez popisu._

```ts
type XlsxColumn = {
  header: string;
  type: XlsxColumnType;
  /** Šířka sloupce ve znacích (výchozí podle typu). */
  width?: number;
};
```

### XlsxColumnType

type · `packages/core/src/export/xlsx.ts`

Streamovaný zápis XLSX (OOXML) bez závislostí: řádky se serializují a komprimují postupně, takže export
velké tabulky nenačítá celou sadu do paměti. Texty jsou `inlineStr` (nikdy se nevyhodnotí jako vzorec),
čísla jsou čísla, data mají datový formát, peníze formát měny.

```ts
type XlsxColumnType = "text" | "number" | "money" | "date" | "percent" | "bool";
```

### XlsxSheet

type · `packages/core/src/export/xlsx.ts`

_Bez popisu._

```ts
type XlsxSheet = {
  /** Název listu (Excel: nejvýš 31 znaků, bez `[]:*?/\`). */
  name: string;
  columns: readonly XlsxColumn[];
  /**
   * Řádky; hodnoty podle typu sloupce: `text` řetězec, `number` číslo, `money` číslo v haléřích (zapíše se jako koruny
   * s formátem měny), `date` řetězec `YYYY-MM-DD` nebo `Date`, `percent` číslo v procentech (12,5 = 12,5 %), `bool` boolean.
   * `null` a `undefined` = prázdná buňka.
   */
  rows: AsyncIterable<readonly unknown[]> | Iterable<readonly unknown[]>;
  /** Řádek s popisem nad hlavičkou (období, filtr…); nepovinné. */
  title?: string;
  /** Řádek součtů pod daty: hodnoty podle sloupců (`money` v haléřích). */
  totals?: readonly unknown[];
};
```

### ZipEntry

type · `packages/core/src/export/zip.ts`

Minimální streamovaný zápis ZIP (deflate, bez ZIP64; soubor do 4 GB, nejvýš 65 535 položek).
Data se komprimují a odesílají po částech, takže se celý archiv ani celá položka nedrží v paměti.
Použití: balík faktur pro účetní, soubory XLSX (OOXML je ZIP).

```ts
type ZipEntry = {
  /** Cesta v archivu, lomítka `/`, bez úvodního lomítka. */
  name: string;
  data: Buffer | string | AsyncIterable<Buffer | string> | Iterable<Buffer | string>;
  /** Čas změny (výchozí: teď). */
  modified?: Date;
};
```
