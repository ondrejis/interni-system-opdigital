# @rebar/core/mail

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/mail` (soubor `packages/core/src/mail/index.ts`). Exportů: 17, z toho s popisem 9.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`createQueuedMailer`](#createqueuedmailer) | function | `Mailer` pro autentizaci a další služby: zapíše záznam do logu (bez těla) a předá odeslání frontě. Tajný odkaz je ve frontě jen zašifrovaný, v logu není vůbec. |  |
| [`enqueueDocumentMail`](#enqueuedocumentmail) | function | Krok 2 (po potvrzení transakce): uloží přílohy a zařadí odeslání do fronty. Při chybě frontu i úložiště uklidí, záznam v logu označí jako selhaný a chybu vyhodí dál, ať ji volající zapíše do evidence. |  |
| [`logDocumentMail`](#logdocumentmail) | function | Krok 1: záznam v `email_log` (volá se v transakci příkazu, ať je evidence atomická se zápisem u dokladu). |  |
| [`queueNotificationMail`](#queuenotificationmail) | function | E-mail s upozorněním (kanál „e-mail“ katalogu upozornění): záznam v logu a zařazení do fronty. Odkaz je jen cesta v aplikaci, k adrese systému ji dosadí volající. |  |
| [`renderMail`](#rendermail) | function | Šablony systémových e-mailů v češtině. Název systému je vždy název klienta (branding), nikdy interní název jádra. |  |
| [`smtpTransport`](#smtptransport) | function | Odesílání přes SMTP (nastavení v administraci, heslo zašifrované v DB). |  |
| [`verifySmtp`](#verifysmtp) | function | Ověří spojení se serverem bez odeslání zprávy. |  |
| [`sendMailJob`](#sendmailjob) | const | Úloha „odeslat e-mail“. Opakuje se s prodlevou; stav a poslední chyba jsou v `email_log` (bez těla zprávy). |  |
| [`DocumentMail`](#documentmail) | type | E-mail s dokladem: předmět a text jsou hotové (šablona s dosazenými proměnnými), přílohy jdou přes úložiště. |  |
| [`DocumentMailDeps`](#documentmaildeps) | type |  |  |
| [`MailAttachment`](#mailattachment) | type |  |  |
| [`MailDeps`](#maildeps) | type |  |  |
| [`MailTemplateName`](#mailtemplatename) | type |  |  |
| [`MailTransport`](#mailtransport) | type |  |  |
| [`OutgoingMail`](#outgoingmail) | type |  |  |
| [`RenderedMail`](#renderedmail) | type |  |  |
| [`SmtpConfig`](#smtpconfig) | type |  |  |

### createQueuedMailer

function · `packages/core/src/mail/service.ts`

`Mailer` pro autentizaci a další služby: zapíše záznam do logu (bez těla) a předá odeslání frontě.
Tajný odkaz je ve frontě jen zašifrovaný, v logu není vůbec.

```ts
function createQueuedMailer(opts: { db: Db; queue: Pick<QueueClient, "send">; cipher: Cipher; brand: () => Promise<string>; }): Mailer
```

### enqueueDocumentMail

function · `packages/core/src/mail/service.ts`

Krok 2 (po potvrzení transakce): uloží přílohy a zařadí odeslání do fronty. Při chybě frontu i úložiště uklidí,
záznam v logu označí jako selhaný a chybu vyhodí dál, ať ji volající zapíše do evidence.

```ts
async function enqueueDocumentMail(deps: DocumentMailDeps & { db: Executor }, logId: string, mail: DocumentMail): Promise<void>
```

### logDocumentMail

function · `packages/core/src/mail/service.ts`

Krok 1: záznam v `email_log` (volá se v transakci příkazu, ať je evidence atomická se zápisem u dokladu).

```ts
async function logDocumentMail(db: Executor, mail: DocumentMail): Promise<string>
```

### queueNotificationMail

function · `packages/core/src/mail/service.ts`

E-mail s upozorněním (kanál „e-mail“ katalogu upozornění): záznam v logu a zařazení do fronty. Odkaz je jen
cesta v aplikaci, k adrese systému ji dosadí volající.

```ts
async function queueNotificationMail(opts: { db: Db; queue: Pick<QueueClient, "send">; cipher: Cipher; baseURL: string; }, mail: { to: string; subject: string; body: string; url: string | null }): Promise<void>
```

### renderMail

function · `packages/core/src/mail/templates.ts`

Šablony systémových e-mailů v češtině. Název systému je vždy název klienta (branding),
nikdy interní název jádra.

```ts
function renderMail(template: MailTemplateName, vars: Record<string, string>, brand: string): RenderedMail
```

### smtpTransport

function · `packages/core/src/mail/transport.ts`

Odesílání přes SMTP (nastavení v administraci, heslo zašifrované v DB).

```ts
function smtpTransport(cfg: SmtpConfig): MailTransport
```

### verifySmtp

function · `packages/core/src/mail/transport.ts`

Ověří spojení se serverem bez odeslání zprávy.

```ts
async function verifySmtp(cfg: SmtpConfig): Promise<{ ok: true } | { ok: false; error: string }>
```

### sendMailJob

const · `packages/core/src/mail/service.ts`

Úloha „odeslat e-mail“. Opakuje se s prodlevou; stav a poslední chyba jsou v `email_log` (bez těla zprávy).

```ts
const sendMailJob: JobDef<typeof sendPayload, MailDeps>
```

### DocumentMail

type · `packages/core/src/mail/service.ts`

E-mail s dokladem: předmět a text jsou hotové (šablona s dosazenými proměnnými), přílohy jdou přes úložiště.

```ts
type DocumentMail = {
  to: string;
  cc?: readonly string[];
  replyTo?: string | undefined;
  subject: string;
  body: string;
  attachments?: readonly { name: string; mime: string; data: Buffer }[];
  /** Záznam, ke kterému e-mail patří (faktura); ukáže se v logu odeslaných e-mailů. */
  entity?: { type: string; id: string };
};
```

### DocumentMailDeps

type · `packages/core/src/mail/service.ts`

_Bez popisu._

```ts
type DocumentMailDeps = {
  queue: Pick<QueueClient, "send">;
  cipher: Cipher;
  storage: StorageDriver;
};
```

### MailAttachment

type · `packages/core/src/mail/transport.ts`

_Bez popisu._

```ts
type MailAttachment = { filename: string; content: Buffer; contentType: string };
```

### MailDeps

type · `packages/core/src/mail/service.ts`

_Bez popisu._

```ts
type MailDeps = {
  db: Db;
  cipher: Cipher;
  /** Vybere dopravu podle aktuálního nastavení; `null` = odesílání není nastavené. */
  resolveTransport: () => Promise<{ transport: MailTransport; from: string } | null>;
  /** Název systému klienta pro šablony. */
  brand: () => Promise<string>;
  /** Úložiště příloh (e-maily s doklady); bez něj se e-mail s přílohou neodešle. */
  storage?: StorageDriver | undefined;
};
```

### MailTemplateName

type · `packages/core/src/mail/templates.ts`

_Bez popisu._

```ts
type MailTemplateName =
  "invitation" | "password-reset" | "test" | "document" | "notification";
```

### MailTransport

type · `packages/core/src/mail/transport.ts`

_Bez popisu._

```ts
type MailTransport = { send(mail: OutgoingMail): Promise<void> };
```

### OutgoingMail

type · `packages/core/src/mail/transport.ts`

_Bez popisu._

```ts
type OutgoingMail = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Kopie (e-maily dokladů). */
  cc?: string[];
  /** Adresa pro odpověď (kontakt firmy klienta). */
  replyTo?: string;
  attachments?: MailAttachment[];
};
```

### RenderedMail

type · `packages/core/src/mail/templates.ts`

_Bez popisu._

```ts
type RenderedMail = { subject: string; text: string; html: string };
```

### SmtpConfig

type · `packages/core/src/mail/transport.ts`

_Bez popisu._

```ts
type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string | null;
  from: string;
};
```
