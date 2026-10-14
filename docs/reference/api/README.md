# API reference

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (TSDoc komentáře a deklarace exportů ve zdrojích (TypeScript compiler API)). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Reference exportovaných funkcí, tříd a typů po balíčcích a vstupních bodech (`exports` v `package.json`). Každý export má popis z JSDoc nad deklarací; export bez popisu je označen „Bez popisu“ a hlídá ho ratchet (`pnpm docs:coverage`, [ADR 022](../../adr/022-dokumentace-z-kodu.md)). Export, který balíček nabízí přes více vstupních bodů, je popsán jednou (v konkrétním podbodu, ne v hlavním vstupu).

| Vstupní bod | Exportů | S popisem | Pokrytí | Soubor |
| --- | --- | --- | --- | --- |
| [`@rebar/core`](core/index.md) | 27 | 11 | 41 % | `packages/core/src/index.ts` |
| [`@rebar/core/actions`](core/actions.md) | 5 | 1 | 20 % | `packages/core/src/actions/index.ts` |
| [`@rebar/core/admin`](core/admin.md) | 16 | 12 | 75 % | `packages/core/src/admin/index.ts` |
| [`@rebar/core/audit`](core/audit.md) | 7 | 5 | 71 % | `packages/core/src/audit/index.ts` |
| [`@rebar/core/auth`](core/auth.md) | 35 | 20 | 57 % | `packages/core/src/auth/index.ts` |
| [`@rebar/core/collab`](core/collab.md) | 20 | 10 | 50 % | `packages/core/src/collab/index.ts` |
| [`@rebar/core/config-data`](core/config-data.md) | 35 | 25 | 71 % | `packages/core/src/config-data/index.ts` |
| [`@rebar/core/contracts`](core/contracts.md) | 46 | 46 | 100 % | `packages/core/src/contracts/index.ts` |
| [`@rebar/core/custom-fields`](core/custom-fields.md) | 12 | 8 | 67 % | `packages/core/src/custom-fields/index.ts` |
| [`@rebar/core/dashboards`](core/dashboards.md) | 116 | 62 | 53 % | `packages/core/src/dashboards/index.ts` |
| [`@rebar/core/dashboards-shared`](core/dashboards-shared.md) | 59 | 22 | 37 % | `packages/core/src/dashboards/shared.ts` |
| [`@rebar/core/db`](core/db.md) | 15 | 9 | 60 % | `packages/core/src/db/index.ts` |
| [`@rebar/core/employees`](core/employees.md) | 3 | 1 | 33 % | `packages/core/src/employees/index.ts` |
| [`@rebar/core/entities`](core/entities.md) | 73 | 46 | 63 % | `packages/core/src/entities/index.ts` |
| [`@rebar/core/events`](core/events.md) | 8 | 8 | 100 % | `packages/core/src/events/index.ts` |
| [`@rebar/core/export`](core/export.md) | 77 | 43 | 56 % | `packages/core/src/export/index.ts` |
| [`@rebar/core/files`](core/files.md) | 22 | 15 | 68 % | `packages/core/src/files/index.ts` |
| [`@rebar/core/health`](core/health.md) | 5 | 2 | 40 % | `packages/core/src/health/index.ts` |
| [`@rebar/core/http`](core/http.md) | 3 | 3 | 100 % | `packages/core/src/http/index.ts` |
| [`@rebar/core/jobs`](core/jobs.md) | 15 | 10 | 67 % | `packages/core/src/jobs/index.ts` |
| [`@rebar/core/mail`](core/mail.md) | 17 | 9 | 53 % | `packages/core/src/mail/index.ts` |
| [`@rebar/core/manifest`](core/manifest.md) | 12 | 5 | 42 % | `packages/core/src/modules/public.ts` |
| [`@rebar/core/migrations`](core/migrations.md) | 7 | 6 | 86 % | `packages/core/src/db/migrations.ts` |
| [`@rebar/core/module-server`](core/module-server.md) | 30 | 21 | 70 % | `packages/core/src/modules/server.ts` |
| [`@rebar/core/notifications`](core/notifications.md) | 87 | 46 | 53 % | `packages/core/src/notifications/index.ts` |
| [`@rebar/core/numbering`](core/numbering.md) | 12 | 9 | 75 % | `packages/core/src/numbering/index.ts` |
| [`@rebar/core/numbering-pattern`](core/numbering-pattern.md) | 3 | 2 | 67 % | `packages/core/src/numbering/pattern.ts` |
| [`@rebar/core/observability`](core/observability.md) | 6 | 5 | 83 % | `packages/core/src/observability/index.ts` |
| [`@rebar/core/pdf`](core/pdf.md) | 1 | 1 | 100 % | `packages/core/src/pdf/index.ts` |
| [`@rebar/core/push`](core/push.md) | 25 | 12 | 48 % | `packages/core/src/push/index.ts` |
| [`@rebar/core/rbac`](core/rbac.md) | 24 | 15 | 63 % | `packages/core/src/rbac/index.ts` |
| [`@rebar/core/security`](core/security.md) | 5 | 1 | 20 % | `packages/core/src/security/index.ts` |
| [`@rebar/core/seed`](core/seed.md) | 5 | 3 | 60 % | `packages/core/src/seed/index.ts` |
| [`@rebar/core/settings`](core/settings.md) | 9 | 5 | 56 % | `packages/core/src/settings/index.ts` |
| [`@rebar/core/shared`](core/shared.md) | 25 | 13 | 52 % | `packages/core/src/entities/shared.ts` |
| [`@rebar/core/testing`](core/testing.md) | 16 | 11 | 69 % | `packages/core/src/testing/index.ts` |
| [`@rebar/core/time`](core/time.md) | 22 | 16 | 73 % | `packages/core/src/time/index.ts` |
| [`@rebar/core/views`](core/views.md) | 8 | 4 | 50 % | `packages/core/src/views/index.ts` |
| [`@rebar/disk`](disk/index.md) | 1 | 0 | 0 % | `packages/modules/disk/src/index.ts` |
| [`@rebar/disk/api`](disk/api.md) | 0 | 0 |  | `packages/modules/disk/src/api.ts` |
| [`@rebar/disk/schema`](disk/schema.md) | 0 | 0 |  | `packages/modules/disk/src/schema.ts` |
| [`@rebar/disk/server`](disk/server.md) | 1 | 1 | 100 % | `packages/modules/disk/src/server.ts` |
| [`@rebar/disk/ui`](disk/ui.md) | 1 | 1 | 100 % | `packages/modules/disk/src/ui.tsx` |
| [`@rebar/finance`](finance/index.md) | 1 | 0 | 0 % | `packages/modules/finance/src/index.ts` |
| [`@rebar/finance/api`](finance/api.md) | 0 | 0 |  | `packages/modules/finance/src/api.ts` |
| [`@rebar/finance/schema`](finance/schema.md) | 0 | 0 |  | `packages/modules/finance/src/schema.ts` |
| [`@rebar/finance/server`](finance/server.md) | 1 | 1 | 100 % | `packages/modules/finance/src/server.ts` |
| [`@rebar/finance/ui`](finance/ui.md) | 1 | 1 | 100 % | `packages/modules/finance/src/ui.tsx` |
| [`@rebar/hodiny`](hodiny/index.md) | 1 | 0 | 0 % | `packages/modules/hodiny/src/index.ts` |
| [`@rebar/hodiny/api`](hodiny/api.md) | 0 | 0 |  | `packages/modules/hodiny/src/api.ts` |
| [`@rebar/hodiny/schema`](hodiny/schema.md) | 0 | 0 |  | `packages/modules/hodiny/src/schema.ts` |
| [`@rebar/hodiny/server`](hodiny/server.md) | 1 | 1 | 100 % | `packages/modules/hodiny/src/server.ts` |
| [`@rebar/hodiny/ui`](hodiny/ui.md) | 1 | 1 | 100 % | `packages/modules/hodiny/src/ui.tsx` |
| [`@rebar/kalendar`](kalendar/index.md) | 1 | 0 | 0 % | `packages/modules/kalendar/src/index.ts` |
| [`@rebar/kalendar/api`](kalendar/api.md) | 0 | 0 |  | `packages/modules/kalendar/src/api.ts` |
| [`@rebar/kalendar/schema`](kalendar/schema.md) | 6 | 5 | 83 % | `packages/modules/kalendar/src/schema.ts` |
| [`@rebar/kalendar/server`](kalendar/server.md) | 33 | 22 | 67 % | `packages/modules/kalendar/src/server.ts` |
| [`@rebar/kalendar/ui`](kalendar/ui.md) | 1 | 0 | 0 % | `packages/modules/kalendar/src/ui.tsx` |
| [`@rebar/klienti`](klienti/index.md) | 1 | 0 | 0 % | `packages/modules/klienti/src/index.ts` |
| [`@rebar/klienti/api`](klienti/api.md) | 0 | 0 |  | `packages/modules/klienti/src/api.ts` |
| [`@rebar/klienti/schema`](klienti/schema.md) | 0 | 0 |  | `packages/modules/klienti/src/schema.ts` |
| [`@rebar/klienti/server`](klienti/server.md) | 1 | 1 | 100 % | `packages/modules/klienti/src/server.ts` |
| [`@rebar/klienti/ui`](klienti/ui.md) | 1 | 1 | 100 % | `packages/modules/klienti/src/ui.tsx` |
| [`@rebar/kontakty`](kontakty/index.md) | 1 | 0 | 0 % | `packages/modules/kontakty/src/index.ts` |
| [`@rebar/kontakty/api`](kontakty/api.md) | 29 | 29 | 100 % | `packages/modules/kontakty/src/api.ts` |
| [`@rebar/kontakty/schema`](kontakty/schema.md) | 4 | 4 | 100 % | `packages/modules/kontakty/src/schema.ts` |
| [`@rebar/kontakty/server`](kontakty/server.md) | 19 | 14 | 74 % | `packages/modules/kontakty/src/server.ts` |
| [`@rebar/kontakty/ui`](kontakty/ui.md) | 1 | 1 | 100 % | `packages/modules/kontakty/src/ui.tsx` |
| [`@rebar/muj-prostor`](muj-prostor/index.md) | 1 | 0 | 0 % | `packages/modules/muj-prostor/src/index.ts` |
| [`@rebar/muj-prostor/api`](muj-prostor/api.md) | 0 | 0 |  | `packages/modules/muj-prostor/src/api.ts` |
| [`@rebar/muj-prostor/schema`](muj-prostor/schema.md) | 0 | 0 |  | `packages/modules/muj-prostor/src/schema.ts` |
| [`@rebar/muj-prostor/server`](muj-prostor/server.md) | 1 | 1 | 100 % | `packages/modules/muj-prostor/src/server.ts` |
| [`@rebar/muj-prostor/ui`](muj-prostor/ui.md) | 1 | 1 | 100 % | `packages/modules/muj-prostor/src/ui.tsx` |
| [`@rebar/obchody`](obchody/index.md) | 1 | 0 | 0 % | `packages/modules/obchody/src/index.ts` |
| [`@rebar/obchody/api`](obchody/api.md) | 2 | 2 | 100 % | `packages/modules/obchody/src/api.ts` |
| [`@rebar/obchody/schema`](obchody/schema.md) | 0 | 0 |  | `packages/modules/obchody/src/schema.ts` |
| [`@rebar/obchody/server`](obchody/server.md) | 1 | 1 | 100 % | `packages/modules/obchody/src/server.ts` |
| [`@rebar/obchody/ui`](obchody/ui.md) | 1 | 1 | 100 % | `packages/modules/obchody/src/ui.tsx` |
| [`@rebar/prehled`](prehled/index.md) | 1 | 0 | 0 % | `packages/modules/prehled/src/index.ts` |
| [`@rebar/prehled/api`](prehled/api.md) | 0 | 0 |  | `packages/modules/prehled/src/api.ts` |
| [`@rebar/prehled/schema`](prehled/schema.md) | 0 | 0 |  | `packages/modules/prehled/src/schema.ts` |
| [`@rebar/prehled/server`](prehled/server.md) | 1 | 1 | 100 % | `packages/modules/prehled/src/server.ts` |
| [`@rebar/prehled/ui`](prehled/ui.md) | 1 | 1 | 100 % | `packages/modules/prehled/src/ui.tsx` |
| [`@rebar/reklama`](reklama/index.md) | 1 | 0 | 0 % | `packages/modules/reklama/src/index.ts` |
| [`@rebar/reklama/api`](reklama/api.md) | 0 | 0 |  | `packages/modules/reklama/src/api.ts` |
| [`@rebar/reklama/schema`](reklama/schema.md) | 0 | 0 |  | `packages/modules/reklama/src/schema.ts` |
| [`@rebar/reklama/server`](reklama/server.md) | 1 | 1 | 100 % | `packages/modules/reklama/src/server.ts` |
| [`@rebar/reklama/ui`](reklama/ui.md) | 1 | 1 | 100 % | `packages/modules/reklama/src/ui.tsx` |
| [`@rebar/sablony-emailu`](sablony-emailu/index.md) | 1 | 0 | 0 % | `packages/modules/sablony-emailu/src/index.ts` |
| [`@rebar/sablony-emailu/api`](sablony-emailu/api.md) | 0 | 0 |  | `packages/modules/sablony-emailu/src/api.ts` |
| [`@rebar/sablony-emailu/schema`](sablony-emailu/schema.md) | 0 | 0 |  | `packages/modules/sablony-emailu/src/schema.ts` |
| [`@rebar/sablony-emailu/server`](sablony-emailu/server.md) | 1 | 1 | 100 % | `packages/modules/sablony-emailu/src/server.ts` |
| [`@rebar/sablony-emailu/ui`](sablony-emailu/ui.md) | 1 | 1 | 100 % | `packages/modules/sablony-emailu/src/ui.tsx` |
| [`@rebar/ui`](ui/index.md) | 230 | 145 | 63 % | `packages/ui/src/index.ts` |
| [`@rebar/ukoly`](ukoly/index.md) | 1 | 0 | 0 % | `packages/modules/ukoly/src/index.ts` |
| [`@rebar/ukoly/api`](ukoly/api.md) | 0 | 0 |  | `packages/modules/ukoly/src/api.ts` |
| [`@rebar/ukoly/schema`](ukoly/schema.md) | 0 | 0 |  | `packages/modules/ukoly/src/schema.ts` |
| [`@rebar/ukoly/server`](ukoly/server.md) | 1 | 1 | 100 % | `packages/modules/ukoly/src/server.ts` |
| [`@rebar/ukoly/ui`](ukoly/ui.md) | 1 | 1 | 100 % | `packages/modules/ukoly/src/ui.tsx` |
| [`@rebar/zakazky`](zakazky/index.md) | 9 | 6 | 67 % | `packages/modules/zakazky/src/index.ts` |
| [`@rebar/zakazky/api`](zakazky/api.md) | 10 | 10 | 100 % | `packages/modules/zakazky/src/api.ts` |
| [`@rebar/zakazky/schema`](zakazky/schema.md) | 5 | 5 | 100 % | `packages/modules/zakazky/src/schema.ts` |
| [`@rebar/zakazky/server`](zakazky/server.md) | 12 | 6 | 50 % | `packages/modules/zakazky/src/server.ts` |
| [`@rebar/zakazky/ui`](zakazky/ui.md) | 1 | 0 | 0 % | `packages/modules/zakazky/src/ui.tsx` |
