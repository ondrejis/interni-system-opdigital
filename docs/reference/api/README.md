# API reference

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (TSDoc komentáře a deklarace exportů ve zdrojích (TypeScript compiler API)). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Reference exportovaných funkcí, tříd a typů po balíčcích a vstupních bodech (`exports` v `package.json`). Každý export má popis z JSDoc nad deklarací; export bez popisu je označen „Bez popisu“ a hlídá ho ratchet (`pnpm docs:coverage`, [ADR 022](../../adr/022-dokumentace-z-kodu.md)). Export, který balíček nabízí přes více vstupních bodů, je popsán jednou (v konkrétním podbodu, ne v hlavním vstupu).

| Vstupní bod | Exportů | S popisem | Pokrytí | Soubor |
| --- | --- | --- | --- | --- |
| [`@rebar/core`](core/index.md) | 28 | 12 | 43 % | `packages/core/src/index.ts` |
| [`@rebar/core/actions`](core/actions.md) | 5 | 1 | 20 % | `packages/core/src/actions/index.ts` |
| [`@rebar/core/admin`](core/admin.md) | 16 | 12 | 75 % | `packages/core/src/admin/index.ts` |
| [`@rebar/core/audit`](core/audit.md) | 7 | 5 | 71 % | `packages/core/src/audit/index.ts` |
| [`@rebar/core/auth`](core/auth.md) | 35 | 20 | 57 % | `packages/core/src/auth/index.ts` |
| [`@rebar/core/collab`](core/collab.md) | 20 | 10 | 50 % | `packages/core/src/collab/index.ts` |
| [`@rebar/core/config-data`](core/config-data.md) | 35 | 25 | 71 % | `packages/core/src/config-data/index.ts` |
| [`@rebar/core/custom-fields`](core/custom-fields.md) | 12 | 8 | 67 % | `packages/core/src/custom-fields/index.ts` |
| [`@rebar/core/dashboards`](core/dashboards.md) | 117 | 63 | 54 % | `packages/core/src/dashboards/index.ts` |
| [`@rebar/core/dashboards-shared`](core/dashboards-shared.md) | 60 | 23 | 38 % | `packages/core/src/dashboards/shared.ts` |
| [`@rebar/core/db`](core/db.md) | 13 | 7 | 54 % | `packages/core/src/db/index.ts` |
| [`@rebar/core/employees`](core/employees.md) | 3 | 1 | 33 % | `packages/core/src/employees/index.ts` |
| [`@rebar/core/entities`](core/entities.md) | 65 | 38 | 58 % | `packages/core/src/entities/index.ts` |
| [`@rebar/core/export`](core/export.md) | 77 | 43 | 56 % | `packages/core/src/export/index.ts` |
| [`@rebar/core/files`](core/files.md) | 22 | 15 | 68 % | `packages/core/src/files/index.ts` |
| [`@rebar/core/health`](core/health.md) | 5 | 2 | 40 % | `packages/core/src/health/index.ts` |
| [`@rebar/core/http`](core/http.md) | 3 | 3 | 100 % | `packages/core/src/http/index.ts` |
| [`@rebar/core/jobs`](core/jobs.md) | 15 | 10 | 67 % | `packages/core/src/jobs/index.ts` |
| [`@rebar/core/mail`](core/mail.md) | 17 | 9 | 53 % | `packages/core/src/mail/index.ts` |
| [`@rebar/core/manifest`](core/manifest.md) | 13 | 6 | 46 % | `packages/core/src/modules/public.ts` |
| [`@rebar/core/migrations`](core/migrations.md) | 7 | 6 | 86 % | `packages/core/src/db/migrations.ts` |
| [`@rebar/core/module-server`](core/module-server.md) | 30 | 18 | 60 % | `packages/core/src/modules/server.ts` |
| [`@rebar/core/notifications`](core/notifications.md) | 87 | 46 | 53 % | `packages/core/src/notifications/index.ts` |
| [`@rebar/core/numbering`](core/numbering.md) | 12 | 9 | 75 % | `packages/core/src/numbering/index.ts` |
| [`@rebar/core/numbering-pattern`](core/numbering-pattern.md) | 3 | 2 | 67 % | `packages/core/src/numbering/pattern.ts` |
| [`@rebar/core/observability`](core/observability.md) | 6 | 5 | 83 % | `packages/core/src/observability/index.ts` |
| [`@rebar/core/pdf`](core/pdf.md) | 1 | 1 | 100 % | `packages/core/src/pdf/index.ts` |
| [`@rebar/core/push`](core/push.md) | 25 | 12 | 48 % | `packages/core/src/push/index.ts` |
| [`@rebar/core/rbac`](core/rbac.md) | 24 | 15 | 63 % | `packages/core/src/rbac/index.ts` |
| [`@rebar/core/security`](core/security.md) | 5 | 1 | 20 % | `packages/core/src/security/index.ts` |
| [`@rebar/core/seed`](core/seed.md) | 6 | 4 | 67 % | `packages/core/src/seed/index.ts` |
| [`@rebar/core/settings`](core/settings.md) | 9 | 5 | 56 % | `packages/core/src/settings/index.ts` |
| [`@rebar/core/shared`](core/shared.md) | 25 | 13 | 52 % | `packages/core/src/entities/shared.ts` |
| [`@rebar/core/terminal`](core/terminal.md) | 35 | 25 | 71 % | `packages/core/src/terminal/index.ts` |
| [`@rebar/core/testing`](core/testing.md) | 13 | 8 | 62 % | `packages/core/src/testing/index.ts` |
| [`@rebar/core/time`](core/time.md) | 22 | 16 | 73 % | `packages/core/src/time/index.ts` |
| [`@rebar/core/views`](core/views.md) | 8 | 4 | 50 % | `packages/core/src/views/index.ts` |
| [`@rebar/dochazka`](dochazka/index.md) | 1 | 0 | 0 % | `packages/modules/dochazka/src/index.ts` |
| [`@rebar/dochazka/schema`](dochazka/schema.md) | 2 | 2 | 100 % | `packages/modules/dochazka/src/schema.ts` |
| [`@rebar/dochazka/server`](dochazka/server.md) | 49 | 23 | 47 % | `packages/modules/dochazka/src/server.ts` |
| [`@rebar/dochazka/ui`](dochazka/ui.md) | 2 | 1 | 50 % | `packages/modules/dochazka/src/ui.tsx` |
| [`@rebar/fakturace`](fakturace/index.md) | 1 | 0 | 0 % | `packages/modules/fakturace/src/index.ts` |
| [`@rebar/fakturace/schema`](fakturace/schema.md) | 7 | 6 | 86 % | `packages/modules/fakturace/src/schema.ts` |
| [`@rebar/fakturace/server`](fakturace/server.md) | 59 | 32 | 54 % | `packages/modules/fakturace/src/server.ts` |
| [`@rebar/fakturace/ui`](fakturace/ui.md) | 1 | 0 | 0 % | `packages/modules/fakturace/src/ui.tsx` |
| [`@rebar/kalendar`](kalendar/index.md) | 1 | 0 | 0 % | `packages/modules/kalendar/src/index.ts` |
| [`@rebar/kalendar/schema`](kalendar/schema.md) | 6 | 5 | 83 % | `packages/modules/kalendar/src/schema.ts` |
| [`@rebar/kalendar/server`](kalendar/server.md) | 33 | 22 | 67 % | `packages/modules/kalendar/src/server.ts` |
| [`@rebar/kalendar/ui`](kalendar/ui.md) | 1 | 0 | 0 % | `packages/modules/kalendar/src/ui.tsx` |
| [`@rebar/kontakty`](kontakty/index.md) | 1 | 0 | 0 % | `packages/modules/kontakty/src/index.ts` |
| [`@rebar/kontakty/schema`](kontakty/schema.md) | 4 | 4 | 100 % | `packages/modules/kontakty/src/schema.ts` |
| [`@rebar/kontakty/server`](kontakty/server.md) | 11 | 6 | 55 % | `packages/modules/kontakty/src/server.ts` |
| [`@rebar/kontakty/ui`](kontakty/ui.md) | 1 | 1 | 100 % | `packages/modules/kontakty/src/ui.tsx` |
| [`@rebar/poptavky`](poptavky/index.md) | 1 | 0 | 0 % | `packages/modules/poptavky/src/index.ts` |
| [`@rebar/poptavky/schema`](poptavky/schema.md) | 7 | 7 | 100 % | `packages/modules/poptavky/src/schema.ts` |
| [`@rebar/poptavky/server`](poptavky/server.md) | 23 | 14 | 61 % | `packages/modules/poptavky/src/server.ts` |
| [`@rebar/poptavky/ui`](poptavky/ui.md) | 1 | 1 | 100 % | `packages/modules/poptavky/src/ui.tsx` |
| [`@rebar/realizace`](realizace/index.md) | 1 | 0 | 0 % | `packages/modules/realizace/src/index.ts` |
| [`@rebar/realizace/schema`](realizace/schema.md) | 5 | 4 | 80 % | `packages/modules/realizace/src/schema.ts` |
| [`@rebar/realizace/server`](realizace/server.md) | 51 | 32 | 63 % | `packages/modules/realizace/src/server.ts` |
| [`@rebar/realizace/ui`](realizace/ui.md) | 1 | 0 | 0 % | `packages/modules/realizace/src/ui.tsx` |
| [`@rebar/sklad`](sklad/index.md) | 1 | 0 | 0 % | `packages/modules/sklad/src/index.ts` |
| [`@rebar/sklad/schema`](sklad/schema.md) | 9 | 6 | 67 % | `packages/modules/sklad/src/schema.ts` |
| [`@rebar/sklad/server`](sklad/server.md) | 39 | 19 | 49 % | `packages/modules/sklad/src/server.ts` |
| [`@rebar/sklad/ui`](sklad/ui.md) | 3 | 0 | 0 % | `packages/modules/sklad/src/ui.tsx` |
| [`@rebar/stroje`](stroje/index.md) | 1 | 0 | 0 % | `packages/modules/stroje/src/index.ts` |
| [`@rebar/stroje/schema`](stroje/schema.md) | 7 | 4 | 57 % | `packages/modules/stroje/src/schema.ts` |
| [`@rebar/stroje/server`](stroje/server.md) | 48 | 22 | 46 % | `packages/modules/stroje/src/server.ts` |
| [`@rebar/stroje/ui`](stroje/ui.md) | 5 | 0 | 0 % | `packages/modules/stroje/src/ui.tsx` |
| [`@rebar/ui`](ui/index.md) | 263 | 169 | 64 % | `packages/ui/src/index.ts` |
| [`@rebar/zakazky`](zakazky/index.md) | 33 | 19 | 58 % | `packages/modules/zakazky/src/index.ts` |
| [`@rebar/zakazky/phases`](zakazky/phases.md) | 22 | 12 | 55 % | `packages/modules/zakazky/src/lifecycle/phases.ts` |
| [`@rebar/zakazky/schema`](zakazky/schema.md) | 21 | 19 | 90 % | `packages/modules/zakazky/src/schema.ts` |
| [`@rebar/zakazky/server`](zakazky/server.md) | 22 | 11 | 50 % | `packages/modules/zakazky/src/server.ts` |
| [`@rebar/zakazky/ui`](zakazky/ui.md) | 1 | 0 | 0 % | `packages/modules/zakazky/src/ui.tsx` |
