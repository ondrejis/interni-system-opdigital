# @rebar/fakturace/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/fakturace/server` (soubor `packages/modules/fakturace/src/server.ts`). Exportů: 59, z toho s popisem 32.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`allocateByRate`](#allocatebyrate) | function | Rozdělí základ na sazby DPH podle vah (poměr základů ve skupinách). Zbytek po zaokrouhlení jde do největší skupiny, takže součet vždy sedí. Bez vah jedna skupina s výchozí sazbou. |  |
| [`buildAccountingPackage`](#buildaccountingpackage) | function | Měsíční balík pro účetní (ZIP s PDF a souhrnem); route handler ho posílá jako stream. |  |
| [`buildInvoiceDoc`](#buildinvoicedoc) | function | Podklad pro PDF. Vystavený doklad se tiskne z uložených údajů (nezmění se, ani když firma změní adresu); koncept z živých. |  |
| [`buildIsdocExport`](#buildisdocexport) | function | ZIP s ISDOC vydaných a/nebo přijatých faktur za období (stream). |  |
| [`buildSingleIsdoc`](#buildsingleisdoc) | function | ISDOC jednoho dokladu (vydaného i přijatého, rozliší se podle id). Vyžaduje `fakturace.export` a přístup k záznamu (rozsah „jen moje“ se respektuje). Zapíše se do auditu. |  |
| [`buildVatReport`](#buildvatreport) | function | Podklady pro přiznání DPH za období (CSV nebo XLSX, stream). |  |
| [`documentTotals`](#documenttotals) | function |  |  |
| [`effectiveRateBp`](#effectiveratebp) | function | Sazba řádku v daném režimu: při přenesené daňové povinnosti vždy 0. |  |
| [`lineNetMinor`](#linenetminor) | function | Základ řádku: množství (3 desetinná místa) × cena za jednotku, zaokrouhleno na haléře půl od nuly. |  |
| [`lineTotals`](#linetotals) | function | Součty řádku pro zobrazení (DPH řádku je orientační; závazné jsou součty po sazbách). |  |
| [`markOverdueInvoices`](#markoverdueinvoices) | function | Faktury, kterým včera uplynula splatnost, se označí a fakturanti dostanou upozornění (jednou za fakturu). |  |
| [`netByRole`](#netbyrole) | function | Součet základů řádků dané role (v haléřích). |  |
| [`notifyInvoicesDueSoon`](#notifyinvoicesduesoon) | function | Pracovní den ráno upozorní na vydané neuhrazené faktury, jejichž splatnost nastává do `DUE_SOON_DAYS` dní. Okno sahá od dneška, takže faktura splatná o víkendu se ohlásí v pátek; opakování téhož dne ani dalšího dne nic nezdvojí (jednou za fakturu a datum splatnosti, takže po posunu splatnosti přijde nové upozornění). |  |
| [`notifyReceivedOverdue`](#notifyreceivedoverdue) | function | Přijaté faktury, kterým včera uplynula splatnost a nejsou uhrazené. |  |
| [`paymentState`](#paymentstate) | function | Stav úhrady z celkové částky a součtu plateb (kladná faktura; dobropis se neplatí). |  |
| [`renderInvoicePdf`](#renderinvoicepdf) | function |  |  |
| [`retentionBaseGroups`](#retentionbasegroups) | function | Základ zádržného po sazbách DPH (u PDP jediná skupina se sazbou 0). Záporné základy se nezapočítají. |  |
| [`retentionGroups`](#retentiongroups) | function | Zádržné z dokladu: pro každou sazbu DPH samostatně `základ × retentionBp / 10 000` (setiny procenta), zaokrouhleno na haléře. Vrací kladné částky `retainMinor` (kolik se zadrží) a `basisMinor`. Skupiny bez kladného základu se vynechají. |  |
| [`retentionPct`](#retentionpct) | function | Procento ze setin procenta pro zobrazení: 500 → „5“, 250 → „2,5“. |  |
| [`retentionTotal`](#retentiontotal) | function |  |  |
| [`syncDispatches`](#syncdispatches) | function | Srovná evidenci odeslání se stavem e-mailů ve frontě (`email_log`): přenese stav a důvod selhání, přepočte u faktury datum odeslání a počet upomínek a autorovi selhání pošle upozornění. Idempotentní; volá ji úloha každou minutu i čtení evidence (aby byl stav na dokladu aktuální hned). |  |
| [`vatOf`](#vatof) | function |  |  |
| [`EXPORT_ADAPTERS`](#export_adapters) | const |  |  |
| [`KINDS`](#kinds) | const | Společné pomocné funkce vydaných faktur (sdílí `server.ts` a oblast „billing“; nic odtud neimportuje `server.ts`). |  |
| [`REVERSE_CHARGE_TEXT`](#reverse_charge_text) | const | Povinný text na dokladu v režimu přenesené daňové povinnosti. |  |
| [`addPayment`](#addpayment) | const |  |  |
| [`createCreditNote`](#createcreditnote) | const |  |  |
| [`createFromJob`](#createfromjob) | const | Záloha, dílčí a konečná faktura z rozpočtu zakázky. |  |
| [`createFromStatement`](#createfromstatement) | const |  |  |
| [`dueSoonJob`](#duesoonjob) | const | Pracovní dny ráno: vystavené neuhrazené faktury, kterým splatnost nastává do tří dnů. |  |
| [`entities`](#entities) | const |  |  |
| [`exportAdapters`](#exportadapters) | const |  |  |
| [`exportInvoices`](#exportinvoices) | const |  |  |
| [`fakturaceSetting`](#fakturacesetting) | const | Nastavení fakturace a šablony dokladů (texty na PDF, QR platba, e-maily s fakturou a upomínkou). Mění ho správce v Nastavení, platí pro nově vystavené i tištěné doklady. |  |
| [`finalSettlement`](#finalsettlement) | const | Podklady konečné faktury (rekapitulace s odečty); nic nezakládá. |  |
| [`getInvoice`](#getinvoice) | const |  |  |
| [`getSettings`](#getsettings) | const |  |  |
| [`invoice`](schema.md#invoice) | const | Faktura. Koncept nemá číslo (přidělí se při vystavení, aby v řadě nevznikaly díry). Stav: `draft` → `issued` → `partial` (část uhrazena) → `paid`; `credited` = zrušeno dobropisem. Součty jsou v haléřích a počítají se při uložení z položek. | v `@rebar/fakturace/schema` |
| [`invoiceEntity`](#invoiceentity) | const |  |  |
| [`invoiceLine`](schema.md#invoiceline) | const |  | v `@rebar/fakturace/schema` |
| [`issue`](#issue) | const |  |  |
| [`jobSummary`](#jobsummary) | const | Přehled fakturace zakázky: čísla, zádržné, zálohy, soupisy k fakturaci (pro záložku Faktury). |  |
| [`overdueJob`](#overduejob) | const | Denně ráno: faktury, kterým včera uplynula splatnost, se označí a fakturanti dostanou upozornění. |  |
| [`payment`](schema.md#payment) | const | Úhrada faktury; částečné úhrady jsou povolené. | v `@rebar/fakturace/schema` |
| [`releaseRetention`](#releaseretention) | const |  |  |
| [`removePayment`](#removepayment) | const |  |  |
| [`reopen`](#reopen) | const | Výjimečné vrácení vystaveného dokladu do konceptu (oprava hned po vystavení). Smí to držitel oprávnění „schvaluje doklady bez limitu“, doklad nesmí mít úhrady ani dobropis a nesmí být odečtený jinde. Číslo z řady zůstává dokladu (v řadě nevzniká díra) a zapíše se do auditu i s důvodem. Běžná oprava je dobropis. |  |
| [`saveDraft`](#savedraft) | const |  |  |
| [`saveSettings`](#savesettings) | const |  |  |
| [`server`](#server) | const | Základ modulu (vydané faktury) a oblasti ADR 015, každá ve své složce se svým vlastníkem. |  |
| [`InvoiceKind`](#invoicekind) | type |  |  |
| [`IsdocExportOptions`](#isdocexportoptions) | type |  |  |
| [`LineInput`](#lineinput) | type |  |  |
| [`LineRole`](#linerole) | type | Role řádku: `work` (plnění), `previous` (odpočet už fakturovaných prací), `advance` (odpočet zaplacené zálohy), `retention` (strženo zádržné, záporný základ), `release` (uvolněné zádržné). |  |
| [`LineTotals`](#linetotals) | type |  |  |
| [`PackageOptions`](#packageoptions) | type |  |  |
| [`VatGroup`](#vatgroup) | type |  |  |
| [`VatMode`](#vatmode) | type | Režim DPH dokladu: běžný, nebo přenesená daňová povinnost (doklad bez DPH, daň odvede zákazník). |  |
| [`VatReportOptions`](#vatreportoptions) | type |  |  |

### allocateByRate

function · `packages/modules/fakturace/src/totals.ts`

Rozdělí základ na sazby DPH podle vah (poměr základů ve skupinách). Zbytek po zaokrouhlení jde do největší
skupiny, takže součet vždy sedí. Bez vah jedna skupina s výchozí sazbou.

```ts
function allocateByRate(totalMinor: number, weights: readonly { vatRateBp: number; weight: number }[], fallbackRateBp: number): { vatRateBp: number; netMinor: number }[]
```

### buildAccountingPackage

function · `packages/modules/fakturace/src/server.ts`

Měsíční balík pro účetní (ZIP s PDF a souhrnem); route handler ho posílá jako stream.

```ts
function buildAccountingPackage(ctx: Ctx, deps: ModuleDeps, opts: PackageOptions): Promise<import("./export/package").PreparedPackage>
```

### buildInvoiceDoc

function · `packages/modules/fakturace/src/server.ts`

Podklad pro PDF. Vystavený doklad se tiskne z uložených údajů (nezmění se, ani když firma změní adresu); koncept z živých.

```ts
async function buildInvoiceDoc(ctx: Ctx, deps: ModuleDeps, id: string): Promise<InvoiceDoc>
```

### buildIsdocExport

function · `packages/modules/fakturace/src/server.ts`

ZIP s ISDOC vydaných a/nebo přijatých faktur za období (stream).

```ts
function buildIsdocExport(ctx: Ctx, deps: ModuleDeps, opts: IsdocExportOptions): Promise<import("./export/accounting").PreparedIsdocExport>
```

### buildSingleIsdoc

function · `packages/modules/fakturace/src/export/accounting.ts`

ISDOC jednoho dokladu (vydaného i přijatého, rozliší se podle id). Vyžaduje `fakturace.export` a přístup k záznamu
(rozsah „jen moje“ se respektuje). Zapíše se do auditu.

```ts
async function buildSingleIsdoc(ctx: Ctx, deps: ModuleDeps, id: string): Promise<{ filename: string; xml: string }>
```

### buildVatReport

function · `packages/modules/fakturace/src/server.ts`

Podklady pro přiznání DPH za období (CSV nebo XLSX, stream).

```ts
function buildVatReport(ctx: Ctx, deps: ModuleDeps, opts: VatReportOptions): Promise<import("./export/accounting").PreparedVatReport>
```

### documentTotals

function · `packages/modules/fakturace/src/totals.ts`

_Bez popisu._

```ts
function documentTotals(lines: readonly LineInput[], opts: { vatMode?: VatMode } = {}): { groups: VatGroup[]; netMinor: number; vatMinor: number; grossMinor: number; }
```

### effectiveRateBp

function · `packages/modules/fakturace/src/totals.ts`

Sazba řádku v daném režimu: při přenesené daňové povinnosti vždy 0.

```ts
function effectiveRateBp(rateBp: number, mode: VatMode = "standard"): number
```

### lineNetMinor

function · `packages/modules/fakturace/src/totals.ts`

Základ řádku: množství (3 desetinná místa) × cena za jednotku, zaokrouhleno na haléře půl od nuly.

```ts
function lineNetMinor(quantity: string | number, unitPriceMinor: number): number
```

### lineTotals

function · `packages/modules/fakturace/src/totals.ts`

Součty řádku pro zobrazení (DPH řádku je orientační; závazné jsou součty po sazbách).

```ts
function lineTotals(l: LineInput, mode: VatMode = "standard"): LineTotals
```

### markOverdueInvoices

function · `packages/modules/fakturace/src/due.ts`

Faktury, kterým včera uplynula splatnost, se označí a fakturanti dostanou upozornění (jednou za fakturu).

```ts
async function markOverdueInvoices(db: Executor, now = new Date()): Promise<number>
```

### netByRole

function · `packages/modules/fakturace/src/totals.ts`

Součet základů řádků dané role (v haléřích).

```ts
function netByRole(lines: readonly LineInput[]): Record<LineRole, number>
```

### notifyInvoicesDueSoon

function · `packages/modules/fakturace/src/due.ts`

Pracovní den ráno upozorní na vydané neuhrazené faktury, jejichž splatnost nastává do `DUE_SOON_DAYS` dní.
Okno sahá od dneška, takže faktura splatná o víkendu se ohlásí v pátek; opakování téhož dne ani dalšího dne
nic nezdvojí (jednou za fakturu a datum splatnosti, takže po posunu splatnosti přijde nové upozornění).

```ts
async function notifyInvoicesDueSoon(db: Executor, now = new Date()): Promise<number>
```

### notifyReceivedOverdue

function · `packages/modules/fakturace/src/due.ts`

Přijaté faktury, kterým včera uplynula splatnost a nejsou uhrazené.

```ts
async function notifyReceivedOverdue(db: Executor, now = new Date()): Promise<number>
```

### paymentState

function · `packages/modules/fakturace/src/totals.ts`

Stav úhrady z celkové částky a součtu plateb (kladná faktura; dobropis se neplatí).

```ts
function paymentState(grossMinor: number, paidMinor: number): "issued" | "partial" | "paid"
```

### renderInvoicePdf

function · `packages/modules/fakturace/src/server.ts`

_Bez popisu._

```ts
async function renderInvoicePdf(ctx: Ctx, deps: ModuleDeps, id: string): Promise<{ filename: string; buffer: Buffer<ArrayBufferLike>; }>
```

### retentionBaseGroups

function · `packages/modules/fakturace/src/totals.ts`

Základ zádržného po sazbách DPH (u PDP jediná skupina se sazbou 0). Záporné základy se nezapočítají.

```ts
function retentionBaseGroups(lines: readonly LineInput[], mode: VatMode = "standard"): { vatRateBp: number; netMinor: number }[]
```

### retentionGroups

function · `packages/modules/fakturace/src/totals.ts`

Zádržné z dokladu: pro každou sazbu DPH samostatně `základ × retentionBp / 10 000` (setiny procenta), zaokrouhleno
na haléře. Vrací kladné částky `retainMinor` (kolik se zadrží) a `basisMinor`. Skupiny bez kladného základu se vynechají.

```ts
function retentionGroups(lines: readonly LineInput[], retentionBp: number, mode: VatMode = "standard"): { vatRateBp: number; basisMinor: number; retainMinor: number }[]
```

### retentionPct

function · `packages/modules/fakturace/src/totals.ts`

Procento ze setin procenta pro zobrazení: 500 → „5“, 250 → „2,5“.

```ts
function retentionPct(bp: number): string
```

### retentionTotal

function · `packages/modules/fakturace/src/totals.ts`

_Bez popisu._

```ts
function retentionTotal(lines: readonly LineInput[], retentionBp: number, mode: VatMode = "standard"): number
```

### syncDispatches

function · `packages/modules/fakturace/src/dispatch/service.ts`

Srovná evidenci odeslání se stavem e-mailů ve frontě (`email_log`): přenese stav a důvod selhání, přepočte
u faktury datum odeslání a počet upomínek a autorovi selhání pošle upozornění. Idempotentní; volá ji úloha
každou minutu i čtení evidence (aby byl stav na dokladu aktuální hned).

```ts
async function syncDispatches(db: Executor, invoiceId?: string): Promise<number>
```

### vatOf

function · `packages/modules/fakturace/src/totals.ts`

_Bez popisu._

```ts
function vatOf(netMinor: number, rateBp: number): number
```

### EXPORT_ADAPTERS

const · `packages/modules/fakturace/src/exports.ts`

_Bez popisu._

```ts
const EXPORT_ADAPTERS: readonly ExportAdapter[]
```

### KINDS

const · `packages/modules/fakturace/src/billing/core.ts`

Společné pomocné funkce vydaných faktur (sdílí `server.ts` a oblast „billing“; nic odtud neimportuje `server.ts`).

```ts
const KINDS: readonly ["proforma", "partial", "final", "credit_note", "retention"]
```

### REVERSE_CHARGE_TEXT

const · `packages/modules/fakturace/src/totals.ts`

Povinný text na dokladu v režimu přenesené daňové povinnosti.

```ts
const REVERSE_CHARGE_TEXT: "Daň odvede zákazník (§ 92a zákona č. 235/2004 Sb., o DPH)"
```

### addPayment

const · `packages/modules/fakturace/src/server.ts`

_Bez popisu._

```ts
const addPayment: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ invoiceId: z.ZodUUID; date: z.ZodISODate; amountMinor: z.ZodNumber; method: z.ZodOptional<z.ZodNullable<z.ZodString>>; note: z.ZodOptional<z.ZodNullable<z.ZodString>>; }, z.core.…
```

### createCreditNote

const · `packages/modules/fakturace/src/server.ts`

_Bez popisu._

```ts
const createCreditNote: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ invoiceId: z.ZodUUID; }, z.core.$strip>, { id: string; }>
```

### createFromJob

const · `packages/modules/fakturace/src/billing/commands.ts`

Záloha, dílčí a konečná faktura z rozpočtu zakázky.

```ts
const createFromJob: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodUUID; kind: z.ZodEnum<{ partial: "partial"; proforma: "proforma"; final: "final"; }>; percent: z.ZodOptional<z.ZodNumber>; amountMinor: z.ZodOptional<z.ZodNumber>; },…
```

### createFromStatement

const · `packages/modules/fakturace/src/billing/commands.ts`

_Bez popisu._

```ts
const createFromStatement: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ statementId: z.ZodUUID; }, z.core.$strip>, { id: string; }>
```

### dueSoonJob

const · `packages/modules/fakturace/src/server.ts`

Pracovní dny ráno: vystavené neuhrazené faktury, kterým splatnost nastává do tří dnů.

```ts
const dueSoonJob: import("@rebar/core/module-server").ModuleJob
```

### entities

const · `packages/modules/fakturace/src/server.ts`

_Bez popisu._

```ts
const entities: import("@rebar/core/entities").EntityDef[]
```

### exportAdapters

const · `packages/modules/fakturace/src/server.ts`

_Bez popisu._

```ts
const exportAdapters: import("@rebar/core/module-server").CommandDef<z.ZodObject<{}, z.core.$strip>, { key: string; label: string; description: string; }[]>
```

### exportInvoices

const · `packages/modules/fakturace/src/server.ts`

_Bez popisu._

```ts
const exportInvoices: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ adapter: z.ZodString; from: z.ZodISODate; to: z.ZodISODate; }, z.core.$strip>, { filename: string; mime: string; content: string; encoding: "base64" | "utf8"; count: number; }>
```

### fakturaceSetting

const · `packages/modules/fakturace/src/settings.ts`

Nastavení fakturace a šablony dokladů (texty na PDF, QR platba, e-maily s fakturou a upomínkou).
Mění ho správce v Nastavení, platí pro nově vystavené i tištěné doklady.

```ts
const fakturaceSetting: import("@rebar/core/settings").SettingDef<{ dueDays: number; introText: string; footerText: string; showQr: boolean; vatPayer: boolean | null; reverseChargeCpa: string; termsText: string; notesText: string; footerContact: boolean; mailCc: …
```

### finalSettlement

const · `packages/modules/fakturace/src/billing/commands.ts`

Podklady konečné faktury (rekapitulace s odečty); nic nezakládá.

```ts
const finalSettlement: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodUUID; }, z.core.$strip>, import("./api").FinalSettlement>
```

### getInvoice

const · `packages/modules/fakturace/src/server.ts`

_Bez popisu._

```ts
const getInvoice: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ id: z.ZodUUID; }, z.core.$strip>, { id: string; number: string | null; title: string; kind: string; state: string; jobId: string | null; companyId: string; personId: string | nul…
```

### getSettings

const · `packages/modules/fakturace/src/server.ts`

_Bez popisu._

```ts
const getSettings: import("@rebar/core/module-server").CommandDef<z.ZodObject<{}, z.core.$strip>, { offer: typeof offerTemplateSetting.default; dueDays: number; introText: string; footerText: string; showQr: boolean; vatPayer: boolean | null; reverseChargeCp…
```

### invoiceEntity

const · `packages/modules/fakturace/src/server.ts`

_Bez popisu._

```ts
const invoiceEntity: import("@rebar/core/entities").EntityDef
```

### issue

const · `packages/modules/fakturace/src/server.ts`

_Bez popisu._

```ts
const issue: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ id: z.ZodUUID; issueDate: z.ZodOptional<z.ZodISODate>; taxableDate: z.ZodOptional<z.ZodISODate>; dueDate: z.ZodOptional<z.ZodISODate>; }, z.core.$strip>, { number: string; }>
```

### jobSummary

const · `packages/modules/fakturace/src/billing/commands.ts`

Přehled fakturace zakázky: čísla, zádržné, zálohy, soupisy k fakturaci (pro záložku Faktury).

```ts
const jobSummary: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodUUID; }, z.core.$strip>, { currency: string; phase: string; vatMode: string; retentionBp: number; contractMinor: number; originalContractMinor: number; extraChangesMi…
```

### overdueJob

const · `packages/modules/fakturace/src/server.ts`

Denně ráno: faktury, kterým včera uplynula splatnost, se označí a fakturanti dostanou upozornění.

```ts
const overdueJob: import("@rebar/core/module-server").ModuleJob
```

### releaseRetention

const · `packages/modules/fakturace/src/billing/commands.ts`

_Bez popisu._

```ts
const releaseRetention: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodUUID; amountMinor: z.ZodOptional<z.ZodNumber>; }, z.core.$strip>, { id: string; }>
```

### removePayment

const · `packages/modules/fakturace/src/server.ts`

_Bez popisu._

```ts
const removePayment: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ id: z.ZodUUID; }, z.core.$strip>, void>
```

### reopen

const · `packages/modules/fakturace/src/billing/commands.ts`

Výjimečné vrácení vystaveného dokladu do konceptu (oprava hned po vystavení). Smí to držitel oprávnění
„schvaluje doklady bez limitu“, doklad nesmí mít úhrady ani dobropis a nesmí být odečtený jinde. Číslo z řady
zůstává dokladu (v řadě nevzniká díra) a zapíše se do auditu i s důvodem. Běžná oprava je dobropis.

```ts
const reopen: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ id: z.ZodUUID; reason: z.ZodString; }, z.core.$strip>, { number: string | null; grossMinor: string; }>
```

### saveDraft

const · `packages/modules/fakturace/src/server.ts`

_Bez popisu._

```ts
const saveDraft: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ id: z.ZodUUID; title: z.ZodOptional<z.ZodString>; companyId: z.ZodOptional<z.ZodUUID>; personId: z.ZodOptional<z.ZodNullable<z.ZodUUID>>; issueDate: z.ZodOptional<z.ZodNullable<z…
```

### saveSettings

const · `packages/modules/fakturace/src/server.ts`

_Bez popisu._

```ts
const saveSettings: import("@rebar/core/module-server").CommandDef<z.ZodIntersection<z.ZodType<{ dueDays: number; introText: string; footerText: string; showQr: boolean; vatPayer: boolean | null; reverseChargeCpa: string; termsText: string; notesText: string;…
```

### server

const · `packages/modules/fakturace/src/server.ts`

Základ modulu (vydané faktury) a oblasti ADR 015, každá ve své složce se svým vlastníkem.

```ts
const server: import("@rebar/core/module-server").ModuleServer
```

### InvoiceKind

type · `packages/modules/fakturace/src/billing/core.ts`

_Bez popisu._

```ts
type InvoiceKind = (typeof KINDS)[number];
```

### IsdocExportOptions

type · `packages/modules/fakturace/src/export/accounting.ts`

_Bez popisu._

```ts
type IsdocExportOptions = {
  from: string;
  to: string;
  /** Podle čeho se doklady vybírají do období (výchozí datum vystavení). */
  basis?: PeriodBasis;
  /** Které doklady (výchozí obojí). */
  kind?: "issued" | "received" | "all";
};
```

### LineInput

type · `packages/modules/fakturace/src/totals.ts`

_Bez popisu._

```ts
type LineInput = {
  quantity: string | number;
  unitPriceMinor: number;
  vatRateBp: number;
  role?: LineRole;
};
```

### LineRole

type · `packages/modules/fakturace/src/totals.ts`

Role řádku: `work` (plnění), `previous` (odpočet už fakturovaných prací), `advance` (odpočet zaplacené zálohy),
`retention` (strženo zádržné, záporný základ), `release` (uvolněné zádržné).

```ts
type LineRole = "work" | "previous" | "advance" | "retention" | "release";
```

### LineTotals

type · `packages/modules/fakturace/src/totals.ts`

_Bez popisu._

```ts
type LineTotals = { netMinor: number; vatMinor: number; grossMinor: number };
```

### PackageOptions

type · `packages/modules/fakturace/src/export/package.ts`

_Bez popisu._

```ts
type PackageOptions = {
  from: string;
  to: string;
  /** Souhrn jako XLSX (jeden sešit s listy), nebo dva CSV soubory. */
  format: "xlsx" | "csv";
  /** Přibalit skeny přijatých faktur (výchozí ano). */
  receivedFiles?: boolean;
  /** Přibalit složku `isdoc/` s ISDOC vydaných a přijatých faktur (výchozí ne). */
  isdoc?: boolean;
  /** Přibalit `dph-podklady` (stejný formát jako souhrn) se stejnými doklady jako balík (výchozí ne). */
  vatReport?: boolean;
  /** Formát CSV (oddělovač), výchozí středník; týká se souhrnu v CSV i podkladů DPH. */
  csv?: CsvFormat;
  /** Podle čeho se doklady vybírají do období (výchozí datum vystavení). */
  basis?: PeriodBasis;
};
```

### VatGroup

type · `packages/modules/fakturace/src/totals.ts`

_Bez popisu._

```ts
type VatGroup = {
  vatRateBp: number;
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
};
```

### VatMode

type · `packages/modules/fakturace/src/totals.ts`

Režim DPH dokladu: běžný, nebo přenesená daňová povinnost (doklad bez DPH, daň odvede zákazník).

```ts
type VatMode = "standard" | "reverse_charge";
```

### VatReportOptions

type · `packages/modules/fakturace/src/export/accounting.ts`

_Bez popisu._

```ts
type VatReportOptions = {
  from: string;
  to: string;
  format: "csv" | "xlsx";
  /** Výchozí je DUZP (datum zdanitelného plnění), podle kterého se DPH přiznává. */
  basis?: PeriodBasis;
  /** Formát CSV (oddělovač); výchozí středník. */
  csv?: CsvFormat;
};
```
