# @rebar/core/notifications

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/notifications` (soubor `packages/core/src/notifications/index.ts`). Exportů: 87, z toho s popisem 46.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`actorHas`](#actorhas) | function | Má aktér oprávnění? Vlastník (systémová role) má vždy všechna; u rozsahu `own` rozhodují vlastníci záznamu. Nezávisí na katalogu oprávnění, takže funguje i pro aktéra načteného bez něj. |  |
| [`cleanupNotifications`](#cleanupnotifications) | function | Úklid: stará upozornění a technická zkušební zpráva. Doručení mizí s upozorněním (cascade). |  |
| [`collectNotificationEvents`](#collectnotificationevents) | function | Události z manifestů zapnutých modulů. |  |
| [`configureNotifications`](#configurenotifications) | function | Nastaví katalog (události jádra + zapnutých modulů) a výchozí pravidla klienta. Volá se při startu webu a workeru. Neplatná definice vyhodí chybu, aby špatně napsaná událost nenastartovala. |  |
| [`countOf`](#countof) | function | „3 úkoly“. |  |
| [`defineNotificationEvent`](manifest.md#definenotificationevent) | function |  | v `@rebar/core/manifest` |
| [`describeRecipient`](#describerecipient) | function | Skupina příjemců čitelně: „Ten, komu je úkol přidělen“, „Všichni s oprávněním …“. |  |
| [`dispatchDue`](#dispatchdue) | function | Zpracuje všechna doručení, jejichž čas nadešel. Bezpečné spouštět souběžně (každý řádek zpracuje jen jeden běh) i opakovaně. Řádky, které zůstaly „sending“ po pádu workeru, se po pěti minutách zpracují znovu. |  |
| [`getAdminRules`](#getadminrules) | function | Pravidla pro Nastavení → Pravidla upozornění. Jen správce. |  |
| [`getDeliveryStats`](#getdeliverystats) | function | Souhrn doručování pro správce (diagnostika „push nechodí“). Bez textů upozornění. |  |
| [`getDeliveryStatus`](#getdeliverystatus) | function | Stav jednoho doručení přihlášeného (cizí doručení se tváří jako neexistující). |  |
| [`getEventDef`](#geteventdef) | function |  |  |
| [`getMyPreferences`](#getmypreferences) | function | Předvolby přihlášeného uživatele spolu s popisem událostí, které se ho týkají. |  |
| [`getNotificationRuntime`](#getnotificationruntime) | function |  |  |
| [`inQuietHours`](#inquiethours) | function | Je okamžik v tichých hodinách? Okno může přecházet přes půlnoc (20:00–06:00). |  |
| [`listEventDefs`](#listeventdefs) | function |  |  |
| [`listMyDeliveries`](#listmydeliveries) | function | Poslední doručení upozornění přihlášeného (pro hledání, proč mu push nechodí). Bez tajemství. |  |
| [`loadRules`](#loadrules) | function | Neplatný uložený JSON (ruční zásah do databáze) nesmí zastavit doručování: bere se jako „bez úprav“. |  |
| [`nextDailyTime`](#nextdailytime) | function | Nejbližší z denních časů (`HH:MM`) striktně po okamžiku. |  |
| [`notify`](#notify) | function | Vyvolá událost z katalogu. Volá se uvnitř transakce změny, která událost způsobila: upozornění vznikne s ní (nebo vůbec), doručení do zařízení řeší až worker po potvrzení transakce (outbox). Funkce nikdy neodesílá a nepřipojuje se k žádné push službě, takže volající transakci nezdrží ani neshodí. |  |
| [`planDelivery`](#plandelivery) | function | Rozhodne, kudy a kdy se upozornění uživateli doručí. Čistá funkce (čas dostává parametrem), proto jde snadno testovat. |  |
| [`plural`](#plural) | function | České skloňování podle počtu: `plural(2, "úkol", "úkoly", "úkolů")` → „úkoly“. |  |
| [`queueTestNotification`](#queuetestnotification) | function | Zkušební upozornění sobě („Pošli mi zkušební upozornění“). Jde stejnou cestou jako ostatní: zapíše se do fronty a odešle ho worker, stav se pak čte přes `getDeliveryStatus`. Víc než jedno za 10 sekund se odmítne. |  |
| [`quietEnd`](#quietend) | function | Kdy tiché hodiny, ve kterých okamžik je, skončí. Mimo ně vrací `at`. |  |
| [`resetNotifications`](#resetnotifications) | function | Pro testy: vrátí výchozí stav. |  |
| [`resolveEvent`](#resolveevent) | function | Pořadí vrstev: katalog → konfigurace klienta → úpravy správce (nejvyšší přednost). |  |
| [`saveAdminRules`](#saveadminrules) | function | Uloží úpravy správce (celý dokument). Pravidlo shodné s výchozím se předem odstraní (zadá volající). |  |
| [`saveMyPreferences`](#savemypreferences) | function | Uloží předvolby přihlášeného. Neznámé události se zahodí; hodnoty shodné s výchozími se neukládají (pozdější změna výchozího chování klienta se pak projeví i tomu, kdo nic neměnil). |  |
| [`sendTaskDigests`](#sendtaskdigests) | function | Ranní přehled úkolů: každému, kdo má úkoly s dnešním termínem nebo po termínu, přijde jedno upozornění. Idempotentní (událost má `dedupe: "day"`), takže opakované spuštění ve stejný den nic nezdvojí; o víkendech a státních svátcích se neposílá. |  |
| [`snoozeNotification`](#snoozenotification) | function | Odložení upozornění (akce „Odložit“ na push): stejné upozornění se za zadanou dobu připomene znovu. Smí jen majitel upozornění. Vrací, zda bylo odloženo. |  |
| [`stripMoney`](#stripmoney) | function | Text bez částek: „VP-1 Odsávání: +52 000 Kč“ → „VP-1 Odsávání“, „K fakturaci 393 960 Kč“ → „K fakturaci“. |  |
| [`tagOf`](#tagof) | function |  |  |
| [`usersWithPermission`](collab.md#userswithpermission) | function | Aktivní uživatelé, kteří mají dané oprávnění (v kterémkoli rozsahu), a majitelé (systémová role má vždy všechna). Pro upozornění typu „schválená platba → fakturace“. | v `@rebar/core/collab` |
| [`usersWithRole`](#userswithrole) | function | Aktivní uživatelé s danou rolí (podle klíče role). |  |
| [`validateEventDefs`](#validateeventdefs) | function | Zkontroluje definice událostí (klíče, parametry v šablonách, příjemci). Vrací seznam problémů. |  |
| [`validateNotificationsConfig`](#validatenotificationsconfig) | function | Zkontroluje sekci `notifications` v konfiguraci klienta proti katalogu (neznámá událost, příjemce, parametr v textu). |  |
| [`validateRule`](#validaterule) | function | Zkontroluje úpravu události (konfigurace klienta i Nastavení): příjemci a parametry v textu musí existovat. |  |
| [`validateRules`](#validaterules) | function | Zkontroluje všechny úpravy proti katalogu (neznámá událost = chyba). |  |
| [`EmailNotConfiguredError`](#emailnotconfigurederror) | class | Odesílání e-mailů není nastavené (SMTP): doručení se přeskočí, neopakuje. |  |
| [`NotificationCatalogError`](#notificationcatalogerror) | class |  |  |
| [`CHANNELS`](#channels) | const |  |  |
| [`CHANNEL_LABELS`](#channel_labels) | const |  |  |
| [`COMMENT_MENTION`](#comment_mention) | const |  |  |
| [`CORE_NOTIFICATION_EVENTS`](#core_notification_events) | const |  |  |
| [`DEFAULT_DIGEST_TIMES`](#default_digest_times) | const |  |  |
| [`DEFAULT_QUIET_HOURS`](#default_quiet_hours) | const |  |  |
| [`MAX_ATTEMPTS`](#max_attempts) | const |  |  |
| [`MONEY_PERMISSIONS`](#money_permissions) | const | Oprávnění, kterému patří peníze v textech upozornění: kdo nemá žádné z nich (mistr, montér), částky neuvidí. Jádro nezná moduly: peníze patří oprávnění `finance.read` (modul Finance); dokud neexistuje, vidí částky jen vlastník. |  |
| [`NOTIFY_CHANNEL`](#notify_channel) | const | Kanál, na který worker poslouchá (LISTEN), aby odeslal čerstvá upozornění hned, ne až při minutovém průchodu. |  |
| [`RETRY_BACKOFF_SECONDS`](#retry_backoff_seconds) | const | Po každém neúspěšném pokusu se čeká déle; po posledním je doručení „failed“. |  |
| [`SEVERITY_LABELS`](#severity_labels) | const |  |  |
| [`SYSTEM_TEST`](#system_test) | const | Zkušební upozornění z Nastavení: obchází tiché hodiny a shrnutí a nezobrazuje se v Inboxu. |  |
| [`TASK_ASSIGNED`](#task_assigned) | const | Události platformy. Moduly přidávají své přes `notifications` v manifestu. |  |
| [`TASK_DONE`](#task_done) | const |  |  |
| [`TASK_DUE_CHANGED`](#task_due_changed) | const |  |  |
| [`TASK_DUE_TODAY`](#task_due_today) | const |  |  |
| [`eventRuleSchema`](#eventruleschema) | const | Úprava jedné události; vynechané položky zůstávají podle katalogu. |  |
| [`notificationRulesSchema`](#notificationrulesschema) | const | Úpravy správce v Nastavení (všechno volitelné, doplňuje se do konfigurace klienta). |  |
| [`notificationRulesSetting`](#notificationrulessetting) | const | Úpravy správce klienta (Nastavení → Pravidla upozornění). Čte je jádro přímo z tabulky `setting`, bez šifrování. |  |
| [`notificationsConfigSchema`](#notificationsconfigschema) | const | Sekce `notifications` v konfiguraci klienta. |  |
| [`userPrefsSchema`](#userprefsschema) | const |  |  |
| [`AdminEventView`](#admineventview) | type |  |  |
| [`AdminRulesView`](#adminrulesview) | type |  |  |
| [`AnyEventDef`](manifest.md#anyeventdef) | type | Zkratka pro libovolnou definici (pole, mapy). | v `@rebar/core/manifest` |
| [`Channel`](#channel) | type | `bell` = zvoneček (Inbox v aplikaci), `push` = upozornění do zařízení, `email` = e-mail. |  |
| [`DeliveryLogRow`](#deliverylogrow) | type |  |  |
| [`DeliveryStats`](#deliverystats) | type |  |  |
| [`DeliveryStatus`](#deliverystatus) | type |  |  |
| [`DispatchDeps`](#dispatchdeps) | type |  |  |
| [`DispatchResult`](#dispatchresult) | type |  |  |
| [`EmailMessage`](#emailmessage) | type |  |  |
| [`EventRule`](#eventrule) | type |  |  |
| [`EventView`](#eventview) | type |  |  |
| [`MyPreferences`](#mypreferences) | type |  |  |
| [`NotificationEventDef`](manifest.md#notificationeventdef) | type |  | v `@rebar/core/manifest` |
| [`NotificationRules`](#notificationrules) | type |  |  |
| [`NotificationRuntime`](#notificationruntime) | type |  |  |
| [`NotificationsConfig`](#notificationsconfig) | type |  |  |
| [`NotificationsConfigInput`](#notificationsconfiginput) | type |  |  |
| [`NotifyInput`](#notifyinput) | type |  |  |
| [`NotifyResult`](#notifyresult) | type |  |  |
| [`ParamDef`](#paramdef) | type |  |  |
| [`PushMode`](#pushmode) | type |  |  |
| [`QuietHours`](#quiethours) | type |  |  |
| [`Severity`](#severity) | type | `urgent` prosadí tiché hodiny i shrnutí a má vyšší prioritu u push služby. |  |
| [`UserEventPref`](#usereventpref) | type |  |  |
| [`UserPrefs`](#userprefs) | type |  |  |

### actorHas

function · `packages/core/src/notifications/recipients.ts`

Má aktér oprávnění? Vlastník (systémová role) má vždy všechna; u rozsahu `own` rozhodují vlastníci záznamu.
Nezávisí na katalogu oprávnění, takže funguje i pro aktéra načteného bez něj.

```ts
function actorHas(actor: Actor, permission: string, owners?: { ownerIds: ReadonlyArray<string | null | undefined> }): boolean
```

### cleanupNotifications

function · `packages/core/src/notifications/dispatch.ts`

Úklid: stará upozornění a technická zkušební zpráva. Doručení mizí s upozorněním (cascade).

```ts
async function cleanupNotifications(db: Executor, now = new Date()): Promise<{ removed: number }>
```

### collectNotificationEvents

function · `packages/core/src/notifications/catalog.ts`

Události z manifestů zapnutých modulů.

```ts
function collectNotificationEvents(modules: readonly { notifications?: readonly AnyEventDef[] | undefined }[]): AnyEventDef[]
```

### configureNotifications

function · `packages/core/src/notifications/catalog.ts`

Nastaví katalog (události jádra + zapnutých modulů) a výchozí pravidla klienta. Volá se při startu webu a workeru.
Neplatná definice vyhodí chybu, aby špatně napsaná událost nenastartovala.

```ts
function configureNotifications(opts: { events: readonly AnyEventDef[]; config?: NotificationsConfig | undefined; timezone?: string | undefined; }): NotificationRuntime
```

### countOf

function · `packages/core/src/notifications/text.ts`

„3 úkoly“.

```ts
function countOf(n: number, one: string, few: string, many: string): string
```

### describeRecipient

function · `packages/core/src/notifications/validate.ts`

Skupina příjemců čitelně: „Ten, komu je úkol přidělen“, „Všichni s oprávněním …“.

```ts
function describeRecipient(def: AnyEventDef, token: string): string
```

### dispatchDue

function · `packages/core/src/notifications/dispatch.ts`

Zpracuje všechna doručení, jejichž čas nadešel. Bezpečné spouštět souběžně (každý řádek zpracuje jen jeden běh)
i opakovaně. Řádky, které zůstaly „sending“ po pádu workeru, se po pěti minutách zpracují znovu.

```ts
async function dispatchDue(deps: DispatchDeps): Promise<DispatchResult>
```

### getAdminRules

function · `packages/core/src/notifications/service.ts`

Pravidla pro Nastavení → Pravidla upozornění. Jen správce.

```ts
async function getAdminRules(ctx: Ctx): Promise<AdminRulesView>
```

### getDeliveryStats

function · `packages/core/src/notifications/service.ts`

Souhrn doručování pro správce (diagnostika „push nechodí“). Bez textů upozornění.

```ts
async function getDeliveryStats(ctx: Ctx): Promise<DeliveryStats>
```

### getDeliveryStatus

function · `packages/core/src/notifications/service.ts`

Stav jednoho doručení přihlášeného (cizí doručení se tváří jako neexistující).

```ts
async function getDeliveryStatus(ctx: Ctx, id: string): Promise<DeliveryStatus | null>
```

### getEventDef

function · `packages/core/src/notifications/catalog.ts`

_Bez popisu._

```ts
function getEventDef(key: string): AnyEventDef | undefined
```

### getMyPreferences

function · `packages/core/src/notifications/service.ts`

Předvolby přihlášeného uživatele spolu s popisem událostí, které se ho týkají.

```ts
async function getMyPreferences(ctx: Ctx): Promise<MyPreferences>
```

### getNotificationRuntime

function · `packages/core/src/notifications/catalog.ts`

_Bez popisu._

```ts
function getNotificationRuntime(): NotificationRuntime
```

### inQuietHours

function · `packages/core/src/notifications/times.ts`

Je okamžik v tichých hodinách? Okno může přecházet přes půlnoc (20:00–06:00).

```ts
function inQuietHours(at: Date, quiet: QuietHours, tz: string): boolean
```

### listEventDefs

function · `packages/core/src/notifications/catalog.ts`

_Bez popisu._

```ts
function listEventDefs(): AnyEventDef[]
```

### listMyDeliveries

function · `packages/core/src/notifications/service.ts`

Poslední doručení upozornění přihlášeného (pro hledání, proč mu push nechodí). Bez tajemství.

```ts
async function listMyDeliveries(ctx: Ctx, limit = 15): Promise<DeliveryLogRow[]>
```

### loadRules

function · `packages/core/src/notifications/store.ts`

Neplatný uložený JSON (ruční zásah do databáze) nesmí zastavit doručování: bere se jako „bez úprav“.

```ts
async function loadRules(db: Executor): Promise<NotificationRules>
```

### nextDailyTime

function · `packages/core/src/notifications/times.ts`

Nejbližší z denních časů (`HH:MM`) striktně po okamžiku.

```ts
function nextDailyTime(at: Date, times: readonly string[], tz: string): Date
```

### notify

function · `packages/core/src/notifications/notify.ts`

Vyvolá událost z katalogu. Volá se uvnitř transakce změny, která událost způsobila: upozornění vznikne s ní
(nebo vůbec), doručení do zařízení řeší až worker po potvrzení transakce (outbox). Funkce nikdy neodesílá
a nepřipojuje se k žádné push službě, takže volající transakci nezdrží ani neshodí.

Příjemce určují pravidla události (výchozí z katalogu, přepsaná klientem), obsah se skládá zvlášť pro každého
příjemce podle jeho oprávnění a předvoleb.

```ts
async function notify<D extends AnyEventDef>(db: Executor, def: D, input: NotifyInput<D>): Promise<NotifyResult>
```

### planDelivery

function · `packages/core/src/notifications/rules.ts`

Rozhodne, kudy a kdy se upozornění uživateli doručí. Čistá funkce (čas dostává parametrem), proto jde snadno testovat.

- Vypnutá událost se nedoručí vůbec (řeší volající). Povinná událost ignoruje vypnutí a shrnutí z předvoleb.
- Naléhavé upozornění prosadí tiché hodiny i shrnutí.
- V tichých hodinách se push zdrží do jejich konce (nezahodí se); zvoneček a e-mail jdou hned.

```ts
function planDelivery(eff: EffectiveEvent, prefs: UserPrefs | null | undefined, ctx: PlanContext): DeliveryPlan
```

### plural

function · `packages/core/src/notifications/text.ts`

České skloňování podle počtu: `plural(2, "úkol", "úkoly", "úkolů")` → „úkoly“.

```ts
function plural(n: number, one: string, few: string, many: string): string
```

### queueTestNotification

function · `packages/core/src/notifications/service.ts`

Zkušební upozornění sobě („Pošli mi zkušební upozornění“). Jde stejnou cestou jako ostatní: zapíše se do fronty
a odešle ho worker, stav se pak čte přes `getDeliveryStatus`. Víc než jedno za 10 sekund se odmítne.

```ts
async function queueTestNotification(ctx: Ctx): Promise<{ deliveryId: string | null }>
```

### quietEnd

function · `packages/core/src/notifications/times.ts`

Kdy tiché hodiny, ve kterých okamžik je, skončí. Mimo ně vrací `at`.

```ts
function quietEnd(at: Date, quiet: QuietHours, tz: string): Date
```

### resetNotifications

function · `packages/core/src/notifications/catalog.ts`

Pro testy: vrátí výchozí stav.

```ts
function resetNotifications(): void
```

### resolveEvent

function · `packages/core/src/notifications/rules.ts`

Pořadí vrstev: katalog → konfigurace klienta → úpravy správce (nejvyšší přednost).

```ts
function resolveEvent(def: AnyEventDef, fromConfig?: EventRule, fromAdmin?: EventRule): EffectiveEvent
```

### saveAdminRules

function · `packages/core/src/notifications/service.ts`

Uloží úpravy správce (celý dokument). Pravidlo shodné s výchozím se předem odstraní (zadá volající).

```ts
async function saveAdminRules(ctx: Ctx, settings: SettingsService, rules: NotificationRules): Promise<void>
```

### saveMyPreferences

function · `packages/core/src/notifications/service.ts`

Uloží předvolby přihlášeného. Neznámé události se zahodí; hodnoty shodné s výchozími se neukládají
(pozdější změna výchozího chování klienta se pak projeví i tomu, kdo nic neměnil).

```ts
async function saveMyPreferences(ctx: Ctx, raw: unknown): Promise<void>
```

### sendTaskDigests

function · `packages/core/src/notifications/scheduled.ts`

Ranní přehled úkolů: každému, kdo má úkoly s dnešním termínem nebo po termínu, přijde jedno upozornění.
Idempotentní (událost má `dedupe: "day"`), takže opakované spuštění ve stejný den nic nezdvojí; o víkendech
a státních svátcích se neposílá.

```ts
async function sendTaskDigests(db: Executor, now = new Date()): Promise<{ users: number; created: number }>
```

### snoozeNotification

function · `packages/core/src/notifications/dispatch.ts`

Odložení upozornění (akce „Odložit“ na push): stejné upozornění se za zadanou dobu připomene znovu.
Smí jen majitel upozornění. Vrací, zda bylo odloženo.

```ts
async function snoozeNotification(db: Executor, userId: string, notificationId: string, minutes = 60, now = new Date()): Promise<boolean>
```

### stripMoney

function · `packages/core/src/notifications/money.ts`

Text bez částek: „VP-1 Odsávání: +52 000 Kč“ → „VP-1 Odsávání“, „K fakturaci 393 960 Kč“ → „K fakturaci“.

```ts
function stripMoney(text: string): string
```

### tagOf

function · `packages/core/src/notifications/dispatch.ts`

_Bez popisu._

```ts
function tagOf(n: { id: string; collapseKey: string | null }): string
```

### usersWithRole

function · `packages/core/src/notifications/recipients.ts`

Aktivní uživatelé s danou rolí (podle klíče role).

```ts
async function usersWithRole(db: Executor, roleKey: string): Promise<string[]>
```

### validateEventDefs

function · `packages/core/src/notifications/catalog.ts`

Zkontroluje definice událostí (klíče, parametry v šablonách, příjemci). Vrací seznam problémů.

```ts
function validateEventDefs(defs: readonly AnyEventDef[]): string[]
```

### validateNotificationsConfig

function · `packages/core/src/notifications/catalog.ts`

Zkontroluje sekci `notifications` v konfiguraci klienta proti katalogu (neznámá událost, příjemce, parametr v textu).

```ts
function validateNotificationsConfig(config: NotificationsConfig, events: readonly AnyEventDef[]): string[]
```

### validateRule

function · `packages/core/src/notifications/validate.ts`

Zkontroluje úpravu události (konfigurace klienta i Nastavení): příjemci a parametry v textu musí existovat.

```ts
function validateRule(def: AnyEventDef, rule: EventRule): string[]
```

### validateRules

function · `packages/core/src/notifications/service.ts`

Zkontroluje všechny úpravy proti katalogu (neznámá událost = chyba).

```ts
function validateRules(events: Record<string, EventRule>): string[]
```

### EmailNotConfiguredError

class · `packages/core/src/notifications/dispatch.ts`

Odesílání e-mailů není nastavené (SMTP): doručení se přeskočí, neopakuje.

```ts
class EmailNotConfiguredError extends Error {
  constructor();
}
```

### NotificationCatalogError

class · `packages/core/src/notifications/catalog.ts`

_Bez popisu._

```ts
class NotificationCatalogError extends Error {
  constructor(public readonly problems: string[]);
}
```

### CHANNELS

const · `packages/core/src/notifications/types.ts`

_Bez popisu._

```ts
const CHANNELS: readonly ["push", "bell", "email"]
```

### CHANNEL_LABELS

const · `packages/core/src/notifications/types.ts`

_Bez popisu._

```ts
const CHANNEL_LABELS: Record<Channel, string>
```

### COMMENT_MENTION

const · `packages/core/src/notifications/catalog.ts`

_Bez popisu._

```ts
const COMMENT_MENTION: import("./types").NotificationEventDef<"comment.mention", "author" | "excerpt", "mentioned">
```

### CORE_NOTIFICATION_EVENTS

const · `packages/core/src/notifications/catalog.ts`

_Bez popisu._

```ts
const CORE_NOTIFICATION_EVENTS: readonly AnyEventDef[]
```

### DEFAULT_DIGEST_TIMES

const · `packages/core/src/notifications/config.ts`

_Bez popisu._

```ts
const DEFAULT_DIGEST_TIMES: readonly string[]
```

### DEFAULT_QUIET_HOURS

const · `packages/core/src/notifications/config.ts`

_Bez popisu._

```ts
const DEFAULT_QUIET_HOURS: QuietHours
```

### MAX_ATTEMPTS

const · `packages/core/src/notifications/dispatch.ts`

_Bez popisu._

```ts
const MAX_ATTEMPTS: number
```

### MONEY_PERMISSIONS

const · `packages/core/src/notifications/money.ts`

Oprávnění, kterému patří peníze v textech upozornění: kdo nemá žádné z nich (mistr, montér), částky neuvidí.
Jádro nezná moduly: peníze patří oprávnění `finance.read` (modul Finance); dokud neexistuje, vidí částky jen vlastník.

```ts
const MONEY_PERMISSIONS: readonly string[]
```

### NOTIFY_CHANNEL

const · `packages/core/src/notifications/pipeline.ts`

Kanál, na který worker poslouchá (LISTEN), aby odeslal čerstvá upozornění hned, ne až při minutovém průchodu.

```ts
const NOTIFY_CHANNEL: "notification_new"
```

### RETRY_BACKOFF_SECONDS

const · `packages/core/src/notifications/dispatch.ts`

Po každém neúspěšném pokusu se čeká déle; po posledním je doručení „failed“.

```ts
const RETRY_BACKOFF_SECONDS: readonly [30, 120, 600, 1800, 7200, 21600]
```

### SEVERITY_LABELS

const · `packages/core/src/notifications/types.ts`

_Bez popisu._

```ts
const SEVERITY_LABELS: Record<Severity, string>
```

### SYSTEM_TEST

const · `packages/core/src/notifications/catalog.ts`

Zkušební upozornění z Nastavení: obchází tiché hodiny a shrnutí a nezobrazuje se v Inboxu.

```ts
const SYSTEM_TEST: import("./types").NotificationEventDef<"system.test", never, "self">
```

### TASK_ASSIGNED

const · `packages/core/src/notifications/catalog.ts`

Události platformy. Moduly přidávají své přes `notifications` v manifestu.

```ts
const TASK_ASSIGNED: import("./types").NotificationEventDef<"task.assigned", "title" | "author" | "due", "assignee">
```

### TASK_DONE

const · `packages/core/src/notifications/catalog.ts`

_Bez popisu._

```ts
const TASK_DONE: import("./types").NotificationEventDef<"task.done", "title", "author">
```

### TASK_DUE_CHANGED

const · `packages/core/src/notifications/catalog.ts`

_Bez popisu._

```ts
const TASK_DUE_CHANGED: import("./types").NotificationEventDef<"task.due_changed", "title" | "due" | "previous", "assignee">
```

### TASK_DUE_TODAY

const · `packages/core/src/notifications/catalog.ts`

_Bez popisu._

```ts
const TASK_DUE_TODAY: import("./types").NotificationEventDef<"task.due_today", "list" | "summary", "assignee">
```

### eventRuleSchema

const · `packages/core/src/notifications/config.ts`

Úprava jedné události; vynechané položky zůstávají podle katalogu.

```ts
const eventRuleSchema: z.ZodObject<{ enabled: z.ZodOptional<z.ZodBoolean>; mandatory: z.ZodOptional<z.ZodBoolean>; severity: z.ZodOptional<z.ZodEnum<{ normal: "normal"; urgent: "urgent"; }>>; channels: z.ZodOptional<z.ZodObject<{ push: z.ZodOptional<z.ZodBoolean…
```

### notificationRulesSchema

const · `packages/core/src/notifications/config.ts`

Úpravy správce v Nastavení (všechno volitelné, doplňuje se do konfigurace klienta).

```ts
const notificationRulesSchema: z.ZodObject<{ events: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{ enabled: z.ZodOptional<z.ZodBoolean>; mandatory: z.ZodOptional<z.ZodBoolean>; severity: z.ZodOptional<z.ZodEnum<{ normal: "normal"; urgent: "urgent"; }>>; channels: …
```

### notificationRulesSetting

const · `packages/core/src/notifications/store.ts`

Úpravy správce klienta (Nastavení → Pravidla upozornění). Čte je jádro přímo z tabulky `setting`, bez šifrování.

```ts
const notificationRulesSetting: import("../settings").SettingDef<{ events: Record<string, { enabled?: boolean | undefined; mandatory?: boolean | undefined; severity?: "normal" | "urgent" | undefined; channels?: { push?: boolean | undefined; bell?: boolean | undefined; em…
```

### notificationsConfigSchema

const · `packages/core/src/notifications/config.ts`

Sekce `notifications` v konfiguraci klienta.

```ts
const notificationsConfigSchema: z.ZodObject<{ events: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{ enabled: z.ZodOptional<z.ZodBoolean>; mandatory: z.ZodOptional<z.ZodBoolean>; severity: z.ZodOptional<z.ZodEnum<{ normal: "normal"; urgent: "urgent"; }>>; channels: …
```

### userPrefsSchema

const · `packages/core/src/notifications/config.ts`

_Bez popisu._

```ts
const userPrefsSchema: z.ZodObject<{ events: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{ push: z.ZodOptional<z.ZodEnum<{ off: "off"; instant: "instant"; digest: "digest"; }>>; bell: z.ZodOptional<z.ZodBoolean>; email: z.ZodOptional<z.ZodBoolean>; }, z.co…
```

### AdminEventView

type · `packages/core/src/notifications/service.ts`

_Bez popisu._

```ts
type AdminEventView = {
  key: string;
  label: string;
  description: string;
  group: string;
  scheduled: boolean;
  audiences: Record<string, string>;
  params: { name: string; label: string; example: string; sensitive: boolean }[];
  /** Co platí po složení katalogu, konfigurace a úprav. */
  effective: {
    enabled: boolean;
    mandatory: boolean;
    severity: "normal" | "urgent";
    channels: Record<Channel, boolean>;
    recipients: { token: string; label: string }[];
    title: string;
    body: string;
  };
  /** Co by platilo bez úprav správce (katalog + konfigurace klienta): základ, nad který se skládají úpravy. */
  base: {
    enabled: boolean;
    mandatory: boolean;
    severity: "normal" | "urgent";
    channels: Record<Channel, boolean>;
    recipients: string[];
    title: string;
    body: string;
  };
  /** Text podle katalogu (pro „Vrátit výchozí text“). */
  catalog: { title: string; body: string };
  /** Úprava uložená správcem v Nastavení. */
  adminRule: EventRule;
  /** Změněno v konfiguraci klienta (soubor). */
  configured: boolean;
};
```

### AdminRulesView

type · `packages/core/src/notifications/service.ts`

_Bez popisu._

```ts
type AdminRulesView = {
  events: AdminEventView[];
  quietHours: QuietHours;
  digestTimes: string[];
  /** Výchozí z konfigurace klienta. */
  configQuietHours: QuietHours;
  configDigestTimes: string[];
  timezone: string;
};
```

### Channel

type · `packages/core/src/notifications/types.ts`

`bell` = zvoneček (Inbox v aplikaci), `push` = upozornění do zařízení, `email` = e-mail.

```ts
type Channel = (typeof CHANNELS)[number];
```

### DeliveryLogRow

type · `packages/core/src/notifications/service.ts`

_Bez popisu._

```ts
type DeliveryLogRow = {
  id: string;
  title: string;
  kind: string;
  channel: "push" | "email";
  status: string;
  mode: string;
  reason: string | null;
  attempts: number;
  createdAt: Date;
  sentAt: Date | null;
  devices: number | null;
};
```

### DeliveryStats

type · `packages/core/src/notifications/service.ts`

_Bez popisu._

```ts
type DeliveryStats = {
  /** Za posledních 24 hodin podle stavu a důvodu. */
  counts: { channel: string; status: string; reason: string | null; n: number }[];
  /** Nejnovější selhání bez obsahu (kdo, událost, důvod). */
  failures: {
    at: Date;
    kind: string;
    channel: string;
    reason: string | null;
    error: string | null;
    attempts: number;
  }[];
  devices: number;
  pending: number;
};
```

### DeliveryStatus

type · `packages/core/src/notifications/service.ts`

_Bez popisu._

```ts
type DeliveryStatus = {
  id: string;
  status: string;
  reason: string | null;
  devices: number | null;
  error: string | null;
};
```

### DispatchDeps

type · `packages/core/src/notifications/dispatch.ts`

_Bez popisu._

```ts
type DispatchDeps = {
  db: Executor;
  /** `null` = klíče VAPID nejsou nastavené, push se přeskakuje. */
  push: PushSender | null;
  /** Odešle e-mail s upozorněním (zařadí do fronty e-mailů); `null` = SMTP není nastavené. */
  email?: ((mail: EmailMessage) => Promise<void>) | null | undefined;
  now?: Date;
  /** Zpracovat jen doručení těchto uživatelů (testy, ruční odeslání). */
  userIds?: readonly string[] | undefined;
};
```

### DispatchResult

type · `packages/core/src/notifications/dispatch.ts`

_Bez popisu._

```ts
type DispatchResult = {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  retried: number;
  deferred: number;
};
```

### EmailMessage

type · `packages/core/src/notifications/dispatch.ts`

_Bez popisu._

```ts
type EmailMessage = { to: string; subject: string; body: string; url: string | null };
```

### EventRule

type · `packages/core/src/notifications/config.ts`

_Bez popisu._

```ts
type EventRule = z.output<typeof eventRuleSchema>;
```

### EventView

type · `packages/core/src/notifications/service.ts`

_Bez popisu._

```ts
type EventView = {
  key: string;
  label: string;
  description: string;
  group: string;
  severity: "normal" | "urgent";
  scheduled: boolean;
  mandatory: boolean;
  /** Výchozí chování po zohlednění klienta. */
  defaults: { push: PushMode; bell: boolean; email: boolean };
  /** Co si uživatel nastavil sám (chybějící = výchozí). */
  pref: { push?: PushMode; bell?: boolean; email?: boolean };
};
```

### MyPreferences

type · `packages/core/src/notifications/service.ts`

_Bez popisu._

```ts
type MyPreferences = {
  events: EventView[];
  quiet: QuietHours;
  /** Tiché hodiny si uživatel nastavil sám (jinak platí výchozí klienta). */
  quietCustom: boolean;
  clientQuiet: QuietHours;
  digestTimes: string[];
  digestCustom: boolean;
  clientDigestTimes: string[];
  timezone: string;
};
```

### NotificationRules

type · `packages/core/src/notifications/config.ts`

_Bez popisu._

```ts
type NotificationRules = z.output<typeof notificationRulesSchema>;
```

### NotificationRuntime

type · `packages/core/src/notifications/catalog.ts`

_Bez popisu._

```ts
type NotificationRuntime = {
  events: ReadonlyMap<string, AnyEventDef>;
  config: NotificationsConfig;
  timezone: string;
};
```

### NotificationsConfig

type · `packages/core/src/notifications/config.ts`

_Bez popisu._

```ts
type NotificationsConfig = z.output<typeof notificationsConfigSchema>;
```

### NotificationsConfigInput

type · `packages/core/src/notifications/config.ts`

_Bez popisu._

```ts
type NotificationsConfigInput = z.input<typeof notificationsConfigSchema>;
```

### NotifyInput

type · `packages/core/src/notifications/types.ts`

_Bez popisu._

```ts
type NotifyInput<D extends AnyEventDef> = {
  params: Record<ParamsOf<D>, ParamValue>;
  /** Příjemci podle skupin události (`audiences`); prázdné a chybějící hodnoty se přeskočí. */
  to?: { [K in AudiencesOf<D>]?: readonly (string | null | undefined)[] };
  /** Záznam, kterého se událost týká; podle něj se ověřuje přístup, skládá odkaz (`{entityId}`) a klíč sloučení. */
  record?: { type?: string; id: string } | null;
  /** Přepíše odkaz ze šablony (celá cesta v aplikaci). */
  url?: string;
  /** Kdo změnu udělal: tomu se upozornění neposílá. */
  actorId?: string | null;
  /** Doplní klíč idempotence (např. datum nebo verze), kterým se rozliší opakování téže události. */
  dedupe?: string;
  /** Okamžik události (testy, plánované úlohy); výchozí teď. */
  at?: Date;
};
```

### NotifyResult

type · `packages/core/src/notifications/notify.ts`

_Bez popisu._

```ts
type NotifyResult = InsertResult & {
  /** Kolik lidí událost mohla dostat podle pravidel (před kontrolou přístupu). */
  candidates: number;
  /** Příjemci bez práva na záznam nebo na událost; upozornění nedostali. */
  noAccess: number;
};
```

### ParamDef

type · `packages/core/src/notifications/types.ts`

_Bez popisu._

```ts
type ParamDef = {
  /** Co hodnota znamená (ukáže se správci při úpravě textu). */
  label: string;
  /** Ukázková hodnota do náhledu šablony. */
  example: string;
  /**
   * Citlivá hodnota: dostane ji jen příjemce s oprávněním. `"money"` = částky (oprávnění viz `MONEY_PERMISSIONS`),
   * pole = stačí kterékoli z uvedených oprávnění. Ostatním se z textu vynechá i s okolním oddělovačem.
   */
  sensitive?: "money" | readonly string[];
};
```

### PushMode

type · `packages/core/src/notifications/config.ts`

_Bez popisu._

```ts
type PushMode = z.output<typeof pushModeSchema>;
```

### QuietHours

type · `packages/core/src/notifications/config.ts`

_Bez popisu._

```ts
type QuietHours = z.output<typeof quietHoursSchema>;
```

### Severity

type · `packages/core/src/notifications/types.ts`

`urgent` prosadí tiché hodiny i shrnutí a má vyšší prioritu u push služby.

```ts
type Severity = "normal" | "urgent";
```

### UserEventPref

type · `packages/core/src/notifications/config.ts`

_Bez popisu._

```ts
type UserEventPref = z.output<typeof userEventPrefSchema>;
```

### UserPrefs

type · `packages/core/src/notifications/config.ts`

_Bez popisu._

```ts
type UserPrefs = z.output<typeof userPrefsSchema>;
```
