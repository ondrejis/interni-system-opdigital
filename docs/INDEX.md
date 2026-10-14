# Rozcestník dokumentace

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (seznam souborů `docs/` a jejich nadpisy). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Rozcestník ke všemu v `docs/`. Každý dokument je tu uveden; test `tests/docs.test.ts` hlídá, že nic nechybí a že odkazy vedou na existující soubory a kotvy.

## Začínáme a architektura

Co systém je, jak je postavený a jak se upravuje pro klienta.

- [OPSYS: interní systém agentury OP Digital](../README.md) (`README.md`)
- [Architektura](ARCHITECTURE.md) (`docs/ARCHITECTURE.md`)
- [Úpravy pro klienta](CUSTOMIZATION.md) (`docs/CUSTOMIZATION.md`)

## OPSYS: zadání, rozbor jádra a rozběh

Pracovní dokumenty projektu OPSYS (interní systém agentury): zadání, analýzy jádra a modulů, digest specifikace, plán a log rozběhu. Specifikace od zadavatele je v `docs/specifikace/`.

- [OPSYS — společné zadání pro všechny agenty (čti jako první)](opsys/00-ZADANI.md) (`docs/opsys/00-ZADANI.md`)
- [A: Inventura jádra pro OPSYS](opsys/A-core-inventura.md) (`docs/opsys/A-core-inventura.md`)
- [OPSYS – B: audit modulů jádra Rebar vůči specifikaci](opsys/B-audit-modulu.md) (`docs/opsys/B-audit-modulu.md`)
- [OPSYS – digest specifikace (C)](opsys/C-digest-specifikace.md) (`docs/opsys/C-digest-specifikace.md`)
- [D – Plán, kontrakty a rozdělení práce OPSYS (ZÁVAZNÉ)](opsys/D-plan-a-kontrakty.md) (`docs/opsys/D-plan-a-kontrakty.md`)
- [OPSYS – E: log rozběhu (odstranění stavebních modulů, klient opsys, lokální vývoj)](opsys/E-rozbehovy-log.md) (`docs/opsys/E-rozbehovy-log.md`)

## Provoz a bezpečnost

Nasazení, provoz, zálohy, bezpečnost a výkon.

- [Nasazení](DEPLOYMENT.md) (`docs/DEPLOYMENT.md`)
- [Provozní příručka (runbook)](RUNBOOK.md) (`docs/RUNBOOK.md`)
- [Bezpečnost](SECURITY.md) (`docs/SECURITY.md`)
- [Podklad pro SECURITY.md (kostra faktů)](security-notes.md) (`docs/security-notes.md`)
- [Výkon](PERFORMANCE.md) (`docs/PERFORMANCE.md`)

## Vývoj dokumentace

Jak se udržuje dokumentace přesná a aktuální.

- [Proces dokumentace](DOCS-PROCES.md) (`docs/DOCS-PROCES.md`)

## Stav, audity a otevřené otázky

Pracovní a historické dokumenty.

- [AUDIT dema — fáze 0 (podklad pro core „rebar“)](AUDIT.md) (`docs/AUDIT.md`)
- [Otevřené otázky](OPEN-QUESTIONS.md) (`docs/OPEN-QUESTIONS.md`)
- [Zakázka jako kořen: pracovní smlouva oblastí](ZAKAZKA.md) (`docs/ZAKAZKA.md`)
- [Systém mezer a rytmu (UI)](UI-SPACING.md) (`docs/UI-SPACING.md`)
- [Changelog](../CHANGELOG.md) (`CHANGELOG.md`)

## Moduly (vyprávěcí dokumentace)

Jak každý modul funguje: účel, role, toky, stavy, pravidla, integrace a omezení. Kostry s nedopsanými sekcemi se postupně doplňují (`pnpm docs:status` je vypíše).

- [Šablona vyprávěcí dokumentace modulu](moduly/_sablona.md) (`docs/moduly/_sablona.md`)
- [Kontakty](moduly/kontakty.md) (`docs/moduly/kontakty.md`)
- [Zakázky](moduly/zakazky.md) (`docs/moduly/zakazky.md`)
- [Poptávky](moduly/poptavky.md) (`docs/moduly/poptavky.md`)
- [Docházka](moduly/dochazka.md) (`docs/moduly/dochazka.md`)
- [Kalendář](moduly/kalendar.md) (`docs/moduly/kalendar.md`)

## Reference (generovaná z kódu)

Přesné seznamy, které vznikají z kódu a nikdy se neupravují ručně (`pnpm docs:generate`, kontrola `pnpm docs:check`).

- [Přehled reference](reference/README.md)

- [Moduly](reference/moduly/README.md)
- [Entity a pole](reference/entity/README.md)
- [Serverové příkazy](reference/prikazy/README.md)
- [Oprávnění a výchozí role](reference/opravneni.md)
- [Proměnné prostředí a konfigurace](reference/prostredi.md)
- [Databáze a migrace](reference/databaze/README.md)
- [Události, upozornění a úlohy](reference/udalosti-a-ulohy.md)
- [Trasy aplikace](reference/trasy.md)
- [Exporty a importy](reference/exporty-a-importy.md)
- [API reference (TSDoc)](reference/api/README.md)

## Architektonická rozhodnutí (ADR)

Proč je věc udělaná tak, jak je. Každé rozhodnutí má vlastní číslované ADR.

- [ADR 001: Klientské instance — image per klient](adr/001-klientske-instance.md) (`docs/adr/001-klientske-instance.md`)
- [ADR 002: Konvence datového modelu](adr/002-konvence-datoveho-modelu.md) (`docs/adr/002-konvence-datoveho-modelu.md`)
- [ADR 003: Peníze a množství](adr/003-penize-a-mnozstvi.md) (`docs/adr/003-penize-a-mnozstvi.md`)
- [ADR 004: Klientská cache dat (TanStack Query)](adr/004-klientska-cache-dat.md) (`docs/adr/004-klientska-cache-dat.md`)
- [ADR 005: TypeScript 7 pro tsc, TypeScript 6 API pro nástroje](adr/005-typescript-7-a-eslint.md) (`docs/adr/005-typescript-7-a-eslint.md`)
- [ADR 006: Vrstvy balíčků a nezávislost modulů](adr/006-vrstvy-balicku.md) (`docs/adr/006-vrstvy-balicku.md`)
- [ADR 007: Oprávnění v datové vrstvě](adr/007-opravneni-v-datove-vrstve.md) (`docs/adr/007-opravneni-v-datove-vrstve.md`)
- [ADR 008: Audit a nakládání s tajemstvími](adr/008-audit-a-tajemstvi.md) (`docs/adr/008-audit-a-tajemstvi.md`)
- [ADR 009: Fronta úloh a migrace pod samostatným uživatelem](adr/009-fronta-uloh-a-migrace.md) (`docs/adr/009-fronta-uloh-a-migrace.md`)
- [ADR 010: Registr entit a data-driven UI](adr/010-registr-entit-a-ui.md) (`docs/adr/010-registr-entit-a-ui.md`)
- [ADR 011: Design system a vzhled](adr/011-design-system.md) (`docs/adr/011-design-system.md`)
- [ADR 012: Moduly, příkazy a poskytovatelé](adr/012-moduly-prikazy-a-poskytovatele.md) (`docs/adr/012-moduly-prikazy-a-poskytovatele.md`)
- [ADR 013: Push upozornění, PWA a nahrávání z terénu](adr/013-push-a-pwa.md) (`docs/adr/013-push-a-pwa.md`)
- [ADR 014: Nasazení a provoz](adr/014-nasazeni-a-provoz.md) (`docs/adr/014-nasazeni-a-provoz.md`)
- [ADR 015: Zakázka jako kořen systému](adr/015-zakazka-jako-koren.md) (`docs/adr/015-zakazka-jako-koren.md`)
- [ADR 016: Životní cyklus zakázky: fáze, přechody a seznam](adr/016-zivotni-cyklus-faze-prechody.md) (`docs/adr/016-zivotni-cyklus-faze-prechody.md`)
- [ADR 017: Fakturace zakázky: zálohy, zádržné, přenesená daňová povinnost, konečné vyúčtování](adr/017-fakturace-zadrzne-zalohy-pdp.md) (`docs/adr/017-fakturace-zadrzne-zalohy-pdp.md`)
- [ADR 018: Detail zakázky, stavební deník a odkaz pro investora](adr/018-detail-zakazky-denik-investor.md) (`docs/adr/018-detail-zakazky-denik-investor.md`)
- [ADR 019: Konfigurace v administraci (stavy, číselníky, vlastní pole, řady, DPH, moduly)](adr/019-konfigurace-v-administraci.md) (`docs/adr/019-konfigurace-v-administraci.md`)
- [ADR 020: Exporty (XLSX, balík pro účetní) a odesílání faktur e-mailem](adr/020-exporty-a-odesilani-faktur.md) (`docs/adr/020-exporty-a-odesilani-faktur.md`)
- [ADR 021: Průřezová kontrola rolí, mobilu a přístupnosti](adr/021-kontrola-roli-mobilu-a-pristupnosti.md) (`docs/adr/021-kontrola-roli-mobilu-a-pristupnosti.md`)
- [ADR 022: Dokumentace z kódu, kontrola driftu a povinné popisy exportů](adr/022-dokumentace-z-kodu.md) (`docs/adr/022-dokumentace-z-kodu.md`)
- [ADR 023: Mobilní terminál řemeslníka](adr/023-terminal-remeslnika.md) (`docs/adr/023-terminal-remeslnika.md`)
- [ADR 024: Katalog událostí upozornění a spolehlivé doručování](adr/024-katalog-upozorneni.md) (`docs/adr/024-katalog-upozorneni.md`)
- [ADR 025: Vlastní nástěnky: datový model a bezpečnostní model dotazů](adr/025-vlastni-nastenky.md) (`docs/adr/025-vlastni-nastenky.md`)
- [ADR 026: Exporty: serverový export seznamů, fronta, šablony a plány](adr/026-exporty-fronta-plany.md) (`docs/adr/026-exporty-fronta-plany.md`)
- [ADR 027: CRM nad zakázkou (nástěnka ve stylu Pipedrive)](adr/027-crm-nad-zakazkou.md) (`docs/adr/027-crm-nad-zakazkou.md`)

## Ostatní dokumenty

- [CRM: pracovní smlouva oblastí](CRM.md) (`docs/CRM.md`)
- [Vlastní nástěnky](DASHBOARDY.md) (`docs/DASHBOARDY.md`)
- [Exporty](EXPORTY.md) (`docs/EXPORTY.md`)
- [Upozornění: push, zvoneček a e-mail](NOTIFICATIONS.md) (`docs/NOTIFICATIONS.md`)
- [OPSIS – Logická specifikace funkcí](specifikace/00-logicka-specifikace-funkci.md) (`docs/specifikace/00-logicka-specifikace-funkci.md`)
- [OPSIS 00 – Přehled, rozhodnutí a fáze](specifikace/10-prehled-rozhodnuti-faze.md) (`docs/specifikace/10-prehled-rozhodnuti-faze.md`)
- [OPSIS 01 – Architektura a tech stack](specifikace/11-architektura-tech-stack.md) (`docs/specifikace/11-architektura-tech-stack.md`)
- [OPSIS 02 – Datový model](specifikace/12-datovy-model.md) (`docs/specifikace/12-datovy-model.md`)
- [OPSIS 03 – Funkční specifikace](specifikace/13-funkcni-specifikace.md) (`docs/specifikace/13-funkcni-specifikace.md`)
- [OPSIS 04 – Design systém](specifikace/14-design-system.md) (`docs/specifikace/14-design-system.md`)
