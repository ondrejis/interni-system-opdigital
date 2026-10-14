# Úpravy pro klienta

Jak systém přizpůsobit konkrétní firmě a jak ho rozšiřovat. Pro vývojáře a správce agentury; kapitoly 1 a 2 přečte i technicky zdatný klient.
Architektura je v [ARCHITECTURE](ARCHITECTURE.md), provoz v [RUNBOOK](RUNBOOK.md).

## 1. Čtyři úrovně úprav (vždy od nejlevnější)

| Úroveň | Co                                           | Kdo a kde                                                          | Potřebuje nové vydání? |
| ------ | -------------------------------------------- | ------------------------------------------------------------------ | ---------------------- |
| 1      | **Konfigurace** bez kódu                     | správce klienta v administraci (Nastavení); agentura v `config.ts` | v administraci ne      |
| 2      | **Vlastní pole**                             | správce v administraci                                             | ne                     |
| 3      | **Rozšíření** v `clients/<slug>/extensions/` | agentura, kód napojený jen na veřejné události jádra               | ano (image klienta)    |
| 4      | **Změna jádra**                              | agentura, jen pokud je zobecnitelná pro všechny klienty            | ano (nová verze jádra) |

Postup: nejdřív zkus úroveň 1, pak 2, 3 a až nakonec 4. Co jde vyřešit nastavením, se nikdy neprogramuje.

**Tvrdé pravidlo:** v jádru (`packages/*`, `apps/web`) nesmí být žádná podmínka na konkrétního klienta (`if (slug === …)`, jméno klienta v kódu).
Hlídá to `tests/guards.test.ts`. Co je specifické pro klienta, patří do `clients/<slug>/`.

### Úroveň 1: konfigurace

**V administraci** (Nastavení; každá sekce je vidět jen roli s příslušným oprávněním):

| Sekce Nastavení                        | Co se tu nastavuje                                                                                                                                 | Oprávnění         |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Firma a vzhled                         | údaje na dokladech, název systému, akcentová barva, logo (přepisují hodnoty z `config.ts`)                                                         | `settings.manage` |
| E-maily                                | odesílání e-mailů (SMTP): server, port, uživatel, heslo (šifrované v DB), odesílatel, zkušební e-mail                                              | `settings.manage` |
| Uživatelé                              | pozvánky, role uživatelů, deaktivace, odhlášení zařízení, odkaz pro obnovu hesla, historie přihlášení                                              | `users.manage`    |
| Role a oprávnění                       | vlastní role, matice oprávnění s rozsahem „vše / jen moje“                                                                                         | `roles.manage`    |
| Stavy a pipeline                       | stavy poptávek a zakázek: název, barva, pořadí, druh (otevřený / vyhraný / ztracený / hotový), u zakázek fáze                                      | `settings.manage` |
| Číselníky                              | seznamy hodnot (např. důvody prohry)                                                                                                               | `settings.manage` |
| Vlastní pole                           | vlastní pole entit (úroveň 2)                                                                                                                      | `settings.manage` |
| Číselné řady                           | vzor čísel dokladů, např. `FV-{YYYY}-{NNNN}`                                                                                                       | `settings.manage` |
| Sazby DPH                              | sazby s platností od data a výchozí sazba (nové doklady)                                                                                           | `settings.manage` |
| Pravidla upozornění                    | které události systém hlásí, komu, kudy a jakým textem; povinné události, tiché hodiny, doručování za 24 hodin ([NOTIFICATIONS](NOTIFICATIONS.md)) | `settings.manage` |
| Moduly                                 | přehled modulů a toho, co je zapnuté; zapnutí a vypnutí **není přepínač za běhu**, je v `config.ts` (viz níže)                                     | `settings.manage` |
| Můj účet, Upozornění, Zabezpečení účtu | každý uživatel u sebe (jméno a telefon, změna hesla, přihlášená zařízení, push, 2FA a záložní kódy)                                                | každý přihlášený  |

Šablony dokladů a texty e-mailů s fakturami mají vlastní nastavení u příslušných modulů (Fakturace → Nastavení). Žádná z těchto změn nevyžaduje nové vydání a každá se zapisuje do auditu.

**V `clients/<slug>/config.ts`** (typované, validované Zodem při startu; změna znamená nové sestavení image):

```ts
import { defineClientConfig } from "@rebar/core";

export default defineClientConfig({
  slug: "novy-klient",

  branding: {
    name: "Název systému klienta", // název systému, jak ho uvidí uživatelé klienta
    shortName: "Systém",
    accentColor: "#2563eb",
    // logo: "logo.svg", // soubor v branding/
    // supportEmail: "podpora@klient.cz",
  },

  // Zapnuté moduly (závislosti se kontrolují při startu).
  modules: ["kontakty", "zakazky", "kalendar"],

  // notifications: { quietHours: { enabled: true, start: "20:00", end: "06:00" }, events: { "task.assigned": { mandatory: true } } }, // upozornění, viz NOTIFICATIONS.md
  // security: { idleTimeoutMinutes: 480, require2faRoles: ["owner", "admin"] },
  // agency: { serviceAccess: "off" },
});
```

- **Moduly** se zapínají a vypínají polem `modules`. Vypnutý modul nezanechá stopu v navigaci, oprávněních ani UI. Změna se projeví po novém sestavení a nasazení image;
  migrace se spouštějí jen pro zapnuté moduly a **tabulky vypnutého modulu se nemažou** (data zůstanou pro případné zapnutí zpět).
- **Branding:** `branding.name` je viditelný název systému (UI, e-maily, PDF, manifest PWA). Nesmí obsahovat interní pracovní název jádra; kontrola je v konfiguraci i v nastavení Vzhled.
  Logo se dá nahrát v administraci; soubory značky patří do `clients/<slug>/branding/`.
- **Upozornění:** `notifications` (tiché hodiny, časy shrnutí a pravidla jednotlivých událostí: zapnutí, povinnost, závažnost, kanály, příjemci, text) jsou výchozí hodnoty firmy, které správce přepíše v Nastavení → Pravidla upozornění
  a každý uživatel doplní vlastními předvolbami. Klíče událostí, příjemci a parametry textu: [NOTIFICATIONS](NOTIFICATIONS.md) §2 až §4; neznámý klíč nebo příjemce je chyba při startu (`pnpm config:check`).
- **Zabezpečení:** `security.idleTimeoutMinutes` (odhlášení po neaktivitě, 5–1440 min), `security.require2faRoles` (role s povinným 2FA, výchozí `owner` a `admin`).
- **Výchozí data klienta** jsou v `clients/<slug>/seed/index.ts` (`defineSeed`): role (`DEFAULT_ROLES` je jen systémová role vlastníka; další role a jejich oprávnění definuje klient), případně pipeline, číselníky a řady.
  Seed se spouští při instalaci i po každé aktualizaci (`pnpm db:seed`, v produkci služba `seed`), **je idempotentní a nepřepisuje, co správce změnil v administraci**.

Ověření konfigurace všech klientů bez spuštění aplikace: `pnpm config:check`.

### Úroveň 2: vlastní pole

Správce je zakládá v Nastavení → Vlastní pole (bez kódu, zapisuje se do auditu; [ADR 019](adr/019-konfigurace-v-administraci.md)). Definice pole (`custom_field_def`) patří entitě (`entityType`), hodnoty jsou v JSONB sloupci `custom` na záznamu. Typy: text, číslo, měna, datum, výběr, multivýběr, uživatel,
odkaz na záznam, checkbox, URL, telefon, e-mail. Pole funguje v tabulce, filtrech, řazení, detailu, hledání i exportu bez dalšího kódu; povinnost a hodnoty se validují na serveru
(`packages/core/src/custom-fields/`). Klíč pole: malá písmena, číslice a podtržítko, začíná písmenem (`^[a-z][a-z0-9_]{1,40}$`). Smazání nebo skrytí pole hodnoty v záznamech nesmaže, jen je přestane zobrazovat; výchozí hodnotu pole lze nastavit v definici.

### Úroveň 3: rozšíření

Viz kapitola 2.

### Úroveň 4: změna jádra

Jen když je změna užitečná pro všechny klienty (nová funkce, nová událost, nový slot, oprava). Pravidla:

1. žádná podmínka na klienta, klientská věc patří do `clients/<slug>/`;
2. nová databázová struktura = migrace, **jen dopředná a zpětně kompatibilní** (expand → contract, [ADR 009](adr/009-fronta-uloh-a-migrace.md));
3. oprávnění v datové vrstvě a test oprávnění pro dotčené role ([ADR 007](adr/007-opravneni-v-datove-vrstve.md));
4. testy (jednotkové a integrační), `pnpm check` musí projít;
5. architektonické rozhodnutí = nový ADR v `docs/adr/`;
6. řádek do `CHANGELOG.md` (sekce Unreleased) a Conventional Commit (`feat(zakazky): …`).

### Nástěnky a exporty v konfiguraci klienta

V `config.ts` (úroveň 1): `dashboards: { enabled, defaults }` (výchozí nástěnky rolí složené přes `seedDashboard({...})`) a `exports: { enabled, csvDelimiter, scheduled, syncMaxRows, retentionDays }`.
Role pro nástěnky definuj v seedu klienta (`roles: [...DEFAULT_ROLES, { key: "partner", … }]`). Metriku z vlastního modulu přidáš přes `dashboardMetrics`. Podrobně [DASHBOARDY](DASHBOARDY.md) a [EXPORTY](EXPORTY.md).

## 2. Jak napsat rozšíření (úroveň 3)

Rozšíření je kód klienta v `clients/<slug>/extensions/`. Vkompiluje se do image klienta (alias `@client/extensions`, [ADR 001](adr/001-klientske-instance.md)) a s jádrem
mluví **jen přes veřejné události**. Nesmí importovat interní soubory jádra ani modulů.

### Co jádro dnes nabízí

Veřejné rozhraní je v `packages/core/src/extensions/` (exportuje se z `@rebar/core`):

| Co                                     | Význam                                                               |
| -------------------------------------- | -------------------------------------------------------------------- |
| `defineExtension({ id, on })`          | deklaruje rozšíření: unikátní `id` (kebab-case) a reakce na události |
| `EventMap`                             | seznam událostí a tvar jejich dat                                    |
| `zakazky.created` — `{ id }`           | vznikla zakázka (ručně, z kanbanu, z převodu poptávky…)              |
| `poptavky.converted` — `{ id, jobId }` | poptávka byla převedena na zakázku                                   |

Zatím to jsou **jediné** body rozšíření. Rozšíření dnes umí reagovat na událost (poslat e-mail, zavolat cizí API, zapsat do vlastní tabulky přes službu jádra, poslat úlohu do fronty).
**Neumí** přidat vlastní stránku, vlastní export ani vlastní záložku na detailu; ty vyžadují nový slot v jádru (úroveň 4). Seznam událostí roste podle potřeb klientů.

Chování oznamování (`packages/core/src/extensions/events.ts`):

- rozšíření se volají postupně v pořadí v `extensions/index.ts`;
- událost se oznamuje **uvnitř transakce** akce, která ji vyvolala; háček proto nesmí dělat nic pomalého. Pro delší práci pošli úlohu do fronty;
- **chyba rozšíření se zachytí** (jde do error trackingu jako `extension:<id>:<událost>`) a akci, která událost vyvolala, nezruší;
- ve workeru a v testech bez registrovaného oznamovače se události zahodí.

### Příklad (je ve šabloně klienta)

`clients/_template/extensions/example.ts`:

```ts
import { defineExtension } from "@rebar/core";

/** Příklad háčku: reakce na vytvoření zakázky. Smaž nebo nahraď vlastním rozšířením. */
export const exampleExtension = defineExtension({
  id: "example",
  on: {
    "zakazky.created": async ({ id }) => {
      console.info(`[example] vznikla zakázka ${id}`);
    },
  },
});
```

`clients/_template/extensions/index.ts` rozšíření zaregistruje:

```ts
import type { ClientExtension } from "@rebar/core";
import { exampleExtension } from "./example";

/** Rozšíření tohoto klienta. Připojují se jen přes veřejné události a sloty jádra. */
export const extensions: ClientExtension[] = [exampleExtension];
```

Že příklad **opravdu funguje**, ověřuje `tests/extensions.int.test.ts` (integrační test proti PostgreSQL): vytvoří zakázku přes entitní engine a ověří, že háček ze šablony dostal její id,
že chyba jednoho rozšíření zakázku nezruší a další rozšíření se zavolá. Test je vzor pro testy vlastních rozšíření:

```ts
setEventEmitter(createEventEmitter(templateExtensions, () => {}));
const { row } = await newJob();
expect(info).toHaveBeenCalledWith(`[example] vznikla zakázka ${String(row.id)}`);
```

### Postup

1. Vytvoř soubor `clients/<slug>/extensions/<nazev>.ts` s `defineExtension` (id v kebab-case, unikátní v rámci klienta; duplicitní id aplikace při startu odmítne).
2. Přidej ho do pole v `clients/<slug>/extensions/index.ts`.
3. Napiš test podle vzoru výše (`createEventEmitter` + `setEventEmitter`).
4. `pnpm check`, pak vydání nové verze (image klienta se sestaví v CI, [DEPLOYMENT](DEPLOYMENT.md)).

### Jak přidat novou událost (úroveň 4, malá změna jádra)

1. Přidej ji do `EventMap` (`packages/core/src/extensions/types.ts`) s jejím tvarem dat.
2. Oznam ji tam, kde se děj stane: v příkazu modulu `await deps.emit("modul.udalost", { … })`,
   v hooku entity (`afterCreate`, `afterUpdate`) `await emitEvent("modul.udalost", { … })` z `@rebar/core/module-server` (viz `zakazky.created` v `packages/modules/zakazky/src/lifecycle/transitions.ts`).
3. Přidej test, že se událost oznámí (vzor: `tests/extensions.int.test.ts`).
4. Zapiš do tabulky výše a do `CHANGELOG.md`.

## 3. Jak přidat modul

Modul je balíček v `packages/modules/<id>`. Vzor, který lze zkopírovat: modul `kalendar` (`packages/modules/kalendar`) nebo `kontakty` (jen data a entity).
Níže jsou všechny kroky, v tomto pořadí. Označení modulu je `<id>` (kebab-case, bez diakritiky; názvy tabulek a sloupců anglicky, texty rozhraní česky).

1. **Balíček.** `packages/modules/<id>/package.json` (jméno `@rebar/<id>`, `exports`: `.`, `./schema`, `./server`, případně `./ui`; závislosti `@rebar/core`, `@rebar/ui`, `drizzle-orm`, `zod`…),
   `tsconfig.json` (`{ "extends": "../../../tsconfig.base.json", "include": ["src"] }`) a `drizzle.config.ts`:

   ```ts
   import { defineConfig } from "drizzle-kit";

   export default defineConfig({
     dialect: "postgresql",
     schema: "./src/schema.ts",
     out: "./drizzle",
     strict: true,
   });
   ```

   Závislost na jiném modulu přidej do `dependencies` (např. `"@rebar/kontakty": "workspace:*"`) **a** do `dependsOn` v manifestu; test `apps/web/src/modules.test.ts` kontroluje, že odpovídají.

2. **Manifest** (`src/index.ts`) — id, název, ikona, navigace, stránky, oprávnění `<id>.<akce>`, klíče entit, případně `dependsOn` a `seed`. Ukázka (zkráceno z dnes odstraněného modulu stroje, vzor zůstává platný):

   ```ts
   import { defineModule } from "@rebar/core";

   export const manifest = defineModule({
     id: "stroje",
     name: "Stroje a vozidla",
     description:
       "Evidence strojů a vozidel, kniha jízd, tankování, servis, rezervace a závady z terénu.",
     icon: "truck",
     nav: [
       {
         label: "Stroje a vozidla",
         href: "/stroje",
         icon: "truck",
         permission: "stroje.read",
         group: "Provoz",
       },
     ],
     pages: [{ path: "/stroje", title: "Stroje a vozidla", permission: "stroje.read" }],
     permissions: [
       { key: "stroje.read", label: "Vidí stroje a vozidla" },
       { key: "stroje.write", label: "Spravuje vozový park" },
     ],
     entities: ["asset", "asset_defect"],
   });
   ```

   Každá položka navigace musí mít `href` začínající `/<id>` a oprávnění, které modul skutečně definuje (hlídá `modules.test.ts`).

3. **Schéma** (`src/schema.ts`) — tabulky Drizzle podle [ADR 002](adr/002-konvence-datoveho-modelu.md) a [ADR 003](adr/003-penize-a-mnozstvi.md): `pk()` (UUID v7), `...audit()` (sloupce `created_*`, `updated_*`, `deleted_at`),
   peníze `minor()` v haléřích, `custom jsonb` s GIN indexem pro vlastní pole, indexy na vše, podle čeho se filtruje. Vzor: `packages/modules/kontakty/src/schema.ts`.

4. **Migrace.** `pnpm --filter @rebar/<id> db:generate` vytvoří SQL v `packages/modules/<id>/drizzle/`. Migrace musí být **jen dopředné a zpětně kompatibilní**. Spouštějí se jen pro zapnuté moduly
   (`pnpm db:migrate`); nový modul tedy musí být ve výsledné konfiguraci klienta, jinak se jeho tabulky nevytvoří.

5. **Server** (`src/server.ts`) — `defineModuleServer({ entities, commands, … })`:
   - entity přes `defineEntity` (atributy, oprávnění, `ownerColumns` pro rozsah „jen moje“, `search`, `url`), vzor `kontakty/src/server.ts`;
   - příkazy `<id>.<akce>` přes `defineCommand` (oprávnění příkazu + Zod schéma vstupu, handler `(ctx, input, deps)` vynucuje oprávnění k datům a zapisuje v transakci s auditem). Ukázka z `kalendar`:

     ```ts
     export const options = defineCommand({
       name: "kalendar.options",
       permission: "kalendar.read",
       input: z.object({}),
       handler: async (ctx) => ({
         resources: await ctx.db
           .select({
             id: calendarResource.id,
             name: calendarResource.name,
             kind: calendarResource.kind,
           })
           .from(calendarResource)
           .where(and(isNull(calendarResource.deletedAt), eq(calendarResource.active, true)))
           .orderBy(asc(calendarResource.name)),
         me: { id: ctx.actor.userId, name: null as string | null },
       }),
     });
     ```

   - poskytovatele (`costProviders`, `attention`, `widgets`, `calendarLayers`…) a úlohy (`defineModuleJob`) podle potřeby; modul **nikdy nevolá jiný modul přímo** ([ADR 006](adr/006-vrstvy-balicku.md), [ADR 012](adr/012-moduly-prikazy-a-poskytovatele.md)).

6. **UI** (`src/ui.tsx`, volitelné) — `defineModuleUi({ recordTabs, recordActions, recordOverview, pages })`. Seznam a detail každé entity vzniká sám z registru na adrese `listPath`,
   vlastní stránka nebo záložka na cizí entitě (např. `job`) je jen doplněk. `ui.tsx` nesmí importovat serverový kód (databáze, Node); hlídá to `tests/modules.test.ts`. Ukázka z dnes odstraněného modulu stroje (`tab(…)` je pomocná funkce toho souboru):

   ```ts
   export const ui = defineModuleUi({
     recordTabs: {
       asset: [tab("kniha", "Kniha jízd", AssetLogTab), tab("servis", "Servis", AssetServiceTab)],
       job: [{ ...tab("stroje", "Stroje", JobFleetTab), group: "naklady", order: 30 }],
     },
     recordActions: { asset: assetActions, asset_defect: defectActions },
     pages: [{ path: "/stroje", render: ({ rest }) => <FleetPage rest={rest} /> }],
   });
   ```

7. **Zapojení do aplikace** — všechna místa, kde se modul musí objevit:

   | Soubor                                    | Co přidat                                                                        |
   | ----------------------------------------- | -------------------------------------------------------------------------------- |
   | `packages/core/src/modules/ids.ts`        | id do `MODULE_IDS` — **v pořadí závislostí** (v tomto pořadí se spouští migrace) |
   | `apps/web/src/modules.ts`                 | manifest do `ALL_MODULES`                                                        |
   | `apps/web/src/server/modules-server.ts`   | `server` do `SERVERS`                                                            |
   | `apps/web/src/modules-ui.ts`              | `ui` do `MODULE_UI` (má-li modul UI)                                             |
   | `apps/web/package.json`                   | závislost `"@rebar/<id>": "workspace:*"`                                         |
   | `apps/web/next.config.ts`                 | balíček do `transpilePackages`                                                   |
   | `eslint.config.mjs`                       | id do pole `MODULES` (pravidla vrstev)                                           |
   | `tests/package.json`                      | závislost, aby šel modul testovat v `tests/`                                     |
   | `packages/core/src/seed/default-roles.ts` | nová oprávnění do výchozích rolí (jinak je dostane jen systémová role `owner`)   |
   | `clients/<slug>/config.ts`                | id do `modules` u klientů, kteří ho mají mít                                     |

   Pak `pnpm install`. Test `apps/web/src/modules.test.ts` pozná zapomenuté zapojení do `ALL_MODULES`, špatné pořadí závislostí a rozpor mezi `package.json` a `dependsOn`; `tests/modules.test.ts` kontroluje i sestavu modulů a čistotu `ui.tsx`.

8. **Testy.**
   - čistá logika bez databáze: `src/*.test.ts` (jednotkové, `pnpm test:unit`);
   - databázová část včetně oprávnění pro každou roli a souběhu: `src/*.int.test.ts` proti skutečnému PostgreSQL (`pnpm db:up`, pak `pnpm test`);
     pomůcky `connectAppDb` a `makeUser` z `@rebar/core/testing`, vzor `packages/modules/zakazky/src/entities.int.test.ts`;
   - testy napříč moduly v `tests/*.int.test.ts` (vzor `tests/kalendar.int.test.ts`).

9. **Dokumentace.** Řádek do `CHANGELOG.md`, případně ADR; modul se objeví v tabulce balíčků v README a v [ARCHITECTURE](ARCHITECTURE.md).

Rychlá kontrola na konci: `pnpm check` (formát, lint, typy, testy, `config:check`).

## 4. Jak založit nového klienta

```bash
pnpm client:new stavby-novak --name "Stavby Novák"
pnpm install
# upravit clients/stavby-novak/config.ts (moduly, branding, zabezpečení) a seed/index.ts
pnpm config:check
CLIENT=stavby-novak pnpm build
```

`pnpm client:new <slug> [--name "Název systému"]` zkopíruje `clients/_template` do `clients/<slug>`, nastaví `slug`, název a krátký název v `config.ts` a jméno balíčku `@client/<slug>`.
Slug je kebab-case (`[a-z0-9]+(-[a-z0-9]+)*`); existující klient se nepřepíše. Pak:

1. v `config.ts` vyber `modules` a `branding` (barva, e-mail podpory); logo patří do `branding/`;
2. v `seed/index.ts` uprav výchozí role a případně pipeline a číselníky;
3. případné rozšíření do `extensions/`;
4. `pnpm config:check` ověří všechny klienty včetně šablony;
5. image klienta vznikne v CI při vydání verze (tag `vX.Y.Z`), nasazení viz [DEPLOYMENT](DEPLOYMENT.md).

Viditelný název systému je vždy z konfigurace klienta. Interní název jádra nesmí v nastavení klienta, UI, e-mailech, PDF ani URL být.

## 5. Souhrn pravidel

1. Nejdřív konfigurace, pak vlastní pole, pak rozšíření, jádro až naposled.
2. Žádná klientská podmínka v jádru; klient je `clients/<slug>/` a nic jiného.
3. Rozšíření se k jádru připojuje jen veřejnými událostmi (`EventMap`), nikdy importem interních souborů.
4. Modul neimportuje jiný modul (kromě `dependsOn`); spolupráce jde přes poskytovatele, sloty a události.
5. Oprávnění se kontrolují v datové vrstvě; UI je jen zobrazuje.
6. Každý zápis má audit ve stejné transakci; peníze jsou v haléřích.
7. Migrace jsou jen dopředné a zpětně kompatibilní.
8. Novou funkci doprovází test (včetně oprávnění pro role) a řádek v `CHANGELOG.md`.
