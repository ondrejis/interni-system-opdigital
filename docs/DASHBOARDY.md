# Vlastní nástěnky

Každý klient i každý uživatel chce data zobrazit jinak. Nástěnka je stránka, kterou si uživatel s právem `dashboards.write` poskládá z **widgetů**: číslo (KPI) s porovnáním s předchozím obdobím,
graf (sloupcový, skládaný, čárový, časová řada, koláč, donut), tabulka (top N), seznam (moje úkoly, blížící se termíny), souhrn podle stavu (např. zakázky podle stavu) a měřidlo vůči cíli.
Rozhodnutí a jejich důvody jsou v [ADR 025](adr/025-vlastni-nastenky.md); exporty z nástěnek v [EXPORTY](EXPORTY.md).

## 1. Jak se nástěnky používají

- **Úvodní stránka** (`/`) má nahoře přepínač: klasický **Přehled** (beze změny) a nástěnky, které uživatel vidí. Vybraná nástěnka a filtry jsou v adrese (`?board=…&obdobi=this_month&zakazka=…&osoba=…`), takže jdou sdílet záložkou.
- **Filtry nahoře** (období, zakázka, osoba) se propisují do widgetů: období podle datumového atributu widgetu, zakázka a osoba podle atributu zakázky / uživatele, který se rozpozná sám (nebo ho určí autor widgetu).
- **Úpravy** (tlačítko Upravit, autor nebo správce): přidat widget, přetáhnout (myš, dotyk, klávesnice: Mezerník, šipky), změnit velikost (rukojeť v rohu, šipky na rukojeti, nebo výběr šířky a výšky v dialogu), upravit, odebrat, přejmenovat, Uložit.
  Uložení hlídá souběžnou změnu („Nástěnku mezitím někdo změnil“). Na telefonu je mřížka jeden sloupec a velikost se volí v dialogu.
- **Další akce**: klonování do mých nástěnek, sdílení s rolemi a lidmi, smazání, **Stáhnout PDF** (snímek pro poradu), **Stáhnout obrázek (PNG)**, **Celá obrazovka (TV)** (`/tv/<id>`: bez navigace, hodiny, data se obnovují každou minutu).
- **Widget**: nabídka ⋯ má Obnovit a **Stáhnout data (CSV, XLSX)**. Chyba jednoho widgetu (chybějící oprávnění, vypnutý modul, příliš dlouhý dotaz) se ukáže v jeho kartě česky a ostatní nerozbije.
- **Pořadí v přepínači** je osobní (tlačítko Pořadí).
- Správa všech nástěnek, výchozí nástěnky rolí a sdílení: **Nastavení → Nástěnky** (`dashboards.manage`).

## 2. Oprávnění a viditelnost dat

| Oprávnění           | Co dovoluje                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `dashboards.write`  | skládat vlastní nástěnky, klonovat, sdílet své (výchozí: kancelář, mistr, účetní; majitel má vše)      |
| `dashboards.manage` | výchozí nástěnky pro role, cizí a sdílené nástěnky, otevřít cizí nástěnku (kontrola výchozí sady role) |

Nástěnku vidí její autor, ten, s kým (nebo s jehož rolí) je sdílená, a členové role, pro kterou je výchozí. **Sdílení neodemyká data**: každý vidí ve widgetech jen to, na co má sám oprávnění.
Data se filtrují **na serveru, v datové vrstvě**: rozsah „jen moje“ zúží řádky (mistr vidí součty jen za své zakázky), atribut skrytý oprávněním (ceny, marže: `zakazky.economics`) pro aktéra neexistuje,
takže ho nesečte ani úpravou definice widgetu. Metrika bez všech svých oprávnění se nevyhodnotí a v nabídce není. Testy: `tests/dashboards.int.test.ts`, `tests/dashboard-metrics.int.test.ts`.

## 3. Datový zdroj widgetu

Žádné SQL od uživatele. Widget čerpá z jednoho ze zdrojů (`packages/core/src/dashboards/types.ts`):

| Zdroj     | Co je                                                                                                                                                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entity`  | entita z registru → filtry (stejné jako v seznamech) → agregace (počet, součet, průměr, minimum, maximum) → seskupení (atribut, nebo období den/týden/měsíc/čtvrtletí/rok) → řazení a limit; u skládaného grafu rozpad podle druhého atributu |
| `records` | seznam záznamů entity (sloupce, řazení, limit): top N, nejbližší termíny                                                                                                                                                                      |
| `metric`  | pojmenovaná metrika modulu (viz níže)                                                                                                                                                                                                         |
| `builtin` | Vyžaduje pozornost, dlaždice modulů, moje úkoly                                                                                                                                                                                               |

Kombinace typu widgetu a zdroje hlídá zod (`widgetSchema`): KPI a měřidlo = `entity` bez seskupení nebo skalární metrika, graf = seskupení nebo řadová metrika, souhrn podle stavu = seskupení podle stavu atd.
Limity: 24 widgetů na nástěnku, 25 nástěnek na uživatele, nejvýš 100 skupin a 50 řádků, dotaz nejdéle 8 s, výsledek se na uživatele 30 s pamatuje.

### Seskupení po obdobích a časové pásmo

Období a koše (den, týden od pondělí, měsíc, čtvrtletí, rok) se počítají v české zóně. Datumový atribut nad sloupcem s časem se porovnává a seskupuje podle **místního dne** (`at time zone 'Europe/Prague'`),
takže 31. 10. 23:30 je ještě říjen a přechod letního času den neposune (testy: `dashboards.test.ts`, `tests/dashboards.int.test.ts`). Srovnání „proti předchozímu období“: celý měsíc / čtvrtletí / rok proti předchozímu kalendářnímu, jinak stejně dlouhé období; „proti loňsku“ posune o 12 měsíců.

## 4. Jak přidat metriku z modulu

Metrika je výpočet, který nejde složit z jedné entity (marže, nevyfakturováno, využití strojů). Modul ji deklaruje v serverové části (`dashboardMetrics`), ne v manifestu (manifest jde do prohlížeče):

```ts
// packages/modules/<modul>/src/metrics.ts
import { defineDashboardMetric } from "@rebar/core/module-server";

export const dashboardMetrics = [
  defineDashboardMetric({
    key: "fakturace.overdue", // <id modulu>.<metrika>
    label: "Po splatnosti",
    description: "Neuhrazený zůstatek vydaných faktur po splatnosti.",
    format: "money", // money = haléře, minutes, hours, percent, number
    shape: "scalar", // scalar = KPI/měřidlo; series = grafy a tabulka
    permissions: ["fakturace.read"], // potřeba VŠECH; bez nich metrika pro aktéra neexistuje
    supports: { period: true, job: true, person: false, bucket: false },
    params: [
      {
        key: "days",
        label: "Počet dní",
        type: "select",
        choices: [{ value: "14", label: "14 dní" }],
        default: "14",
      },
    ],
    compute: async (ctx, input, deps) => {
      // input: from/to (období nebo null), jobId, userId, bucket, limit, params, today
      // data čti přes entity a datovou vrstvu (queryRecords, aggregateRecords), ne mimo rozsah aktéra
      return { kind: "scalar", value: 123_00 };
    },
  }),
];
```

Do `defineModuleServer` / `mergeServers` přidej `dashboardMetrics`. Pravidla: klíč začíná id modulu; `compute` nikdy nevrací víc, než smí aktér (použij `scopedEntity` z `@rebar/core/dashboards` nebo `queryRecords`);
parametry validuj whitelistem; počítej s limity (`input.limit`); u metrik s `supports.period` jádro volá `compute` i pro předchozí období (srovnání). Test: vyhodnoť widget přes `evaluateWidget` jako majitel a jako mistr (viz `tests/dashboard-metrics.int.test.ts`).
Vypnutý modul metriky nemá a widget, který na ni odkazuje, ukáže „Tato metrika není v systému dostupná (vypnutý modul)“.

### Metriky, které jádro dodává se moduly

| Klíč                                                                        | Co počítá                                                                                              | Oprávnění                            |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| `zakazky.margin`, `zakazky.margin_total`, `zakazky.margin_pct`              | marže po zakázkách (TOP N), celková a vážená v % (smluvní cena − náklady)                              | `zakazky.read` + `zakazky.economics` |
| `zakazky.unbilled`, `zakazky.unbilled_by_job`                               | nevyfakturováno (smluvní cena − fakturováno u zakázek od realizace)                                    | totéž                                |
| `fakturace.overdue`, `fakturace.overdue_by_customer`                        | zůstatek vydaných faktur po splatnosti                                                                 | `fakturace.read`                     |
| `fakturace.cashflow_plan`                                                   | po měsících/týdnech: plán příjmů (splatnosti), skutečné příjmy (úhrady), plán výdajů (přijaté faktury) | `fakturace.read`                     |
| `fakturace.due_soon`, `fakturace.received_open(_count)`, `fakturace.issued` | splatné do N dní, přijaté k úhradě, vystaveno bez DPH (se srovnáním)                                   | `fakturace.read`                     |
| `dochazka.hours`, `dochazka.hours_by`                                       | odpracované minuty (podle osoby, zakázky, času); bez peněz                                             | `dochazka.read`                      |
| `dochazka.utilization`                                                      | využití lidí v % fondu pracovní doby                                                                   | `dochazka.read`                      |
| `dochazka.labour_cost`                                                      | hodiny × hodinový náklad                                                                               | `dochazka.read` + `employees.read`   |
| `stroje.utilization`, `stroje.service_due`                                  | využití strojů v % dostupných hodin; počet strojů s blížícím se STK/servisem                           | `stroje.read`                        |
| `poptavky.conversion`                                                       | podíl vyhraných z uzavřených poptávek                                                                  | `poptavky.read`                      |
| `poptavky.pipeline_value`, `poptavky.pipeline_weighted`                     | hodnota (cena nabídky) a vážená hodnota otevřených obchodů (poptávka, nabídka; bez archivovaných)      | `zakazky.read` + `zakazky.economics` |
| `poptavky.rotting`, `poptavky.no_next_activity`                             | počet zhnilých otevřených obchodů; počet otevřených obchodů bez naplánované aktivity                   | `zakazky.read`                       |
| `sklad.stock_value`                                                         | hodnota aktivních skladových karet                                                                     | `sklad.read` + `sklad.write`         |

Přesné definice a zjednodušení jsou v `description` metrik a v souborech `packages/modules/*/src/metrics.ts`.

## 5. Jak nastavit klienta

V `clients/<slug>/config.ts`:

```ts
dashboards: { enabled: true, defaults: standardDashboards(MODULES) },
```

- `enabled: false` nástěnky vypne (přepínač, Nastavení → Nástěnky, trasy).
- `standardDashboards(moduly)` dodá čtyři výchozí sady pro role: **Majitel** (marže, nevyfakturováno, faktury po splatnosti, cashflow proti plánu, využití lidí a strojů, zakázky podle stavu), **Kancelář** (poptávky, zakázky k fakturaci,
  faktury po splatnosti, pozornost, úkoly), **Mistr** (dnešní stavby, úkoly, docházka týmu bez cen, otevřené vady) a **Účetní** (přijaté a vydané faktury, splatnosti; role `accountant` je `ACCOUNTANT_ROLE` v `@rebar/core/seed`, klient ji přidá do seedu).
  Widgety modulů, které klient nemá zapnuté, se vynechají. Žádná sada se neotevírá na úvodní stránce, takže výchozí Přehled zůstává.
- Vlastní sada: `seedDashboard({ key, name, role, home?, defaultPeriod?, widgets: [...] })` (typované, `id` a rozměry se doplní). `home: true` otevře nástěnku roli na úvodní stránce místo Přehledu.
- Sady se zakládají jednou při instalaci a aktualizaci (`pnpm db:seed`, klíč sady je `seed_key`); co správce upravil nebo smazal, se nepřepisuje. Chybějící role se přeskočí.

Ukázka vlastního widgetu v sadě:

```ts
seedDashboard({
  key: "provoz-tyden",
  name: "Provoz",
  role: "office",
  defaultPeriod: "this_week",
  widgets: [
    {
      type: "kpi",
      title: "Nové faktury",
      source: { kind: "entity", entity: "invoice", dateAttr: "issueDate", agg: { fn: "count" } },
      options: { compare: "previous_period" },
    },
    {
      type: "chart",
      title: "Faktury podle stavu",
      w: 6,
      h: 3,
      source: {
        kind: "entity",
        entity: "invoice",
        agg: { fn: "sum", attr: "gross" },
        groupBy: { attr: "state" },
      },
      options: { chart: "donut" },
    },
  ],
});
```

## 6. Verze definice a migrace

Definice je JSON s `schemaVersion` (dnes 1). Při čtení ji `migrateDefinition` převede krok za krokem (`DEFINITION_MIGRATIONS`: verze `n` → `n + 1`) a ověří zodem; novější verzi, než umí systém, odmítne větou.
Při změně tvaru: zvyš `DEFINITION_VERSION`, přidej převod a test, který projde všechny starší verze.

## 7. Výkon

Widgety se načítají souběžně a samostatně (`POST /api/dashboards/evaluate`), dotazy jsou nad indexovanými sloupci s limitem a časovým limitem. `pnpm perf:check` měří agregace (≈ 7 ms), výchozí sadu majitele (≈ 20 ms) a export všech zakázek (viz [PERFORMANCE](PERFORMANCE.md)).
