# ADR 028: OPSYS z jádra `rebar`

- Stav: přijato (2026-10-15)
- Kontext: zadání a rozbory v `docs/opsys/` (00-ZADANI, A–D), nahrazuje ADR 015, 016, 023 a 027, doplňuje ADR 006, 007, 012

## Kontext

Agentura OP Digital potřebuje interní systém pro dva společníky (vlastník Ondřej, partner Patrik): klienti, obchody, zakázky, úkoly, kalendář, hodiny, finance mezi společníky,
reklama a šablony e-mailů. Původní jádro `rebar` mělo stavební moduly (zakázka s pevným životním cyklem, fakturace, sklad, terminál řemeslníka, CRM nad zakázkou). Nic není nasazeno.

## Rozhodnutí

1. **Z jádra, ne od nuly.** Architektura jádra (Next.js, Drizzle, PostgreSQL, registr entit, data-driven UI, pg-boss) se nemění. Stavební moduly a věci, které spec nechce (rozpočty, schvalování, sdílení s investorem,
   terminál, upozornění, vystavování faktur), jsou odstraněny; platforma upozornění a push zůstává v jádru nevyužitá. Obor balíčků zůstává `@rebar/*` (jdou přebírat změny z jádra), viditelný název je `OPSYS` z `branding.name`.
2. **Třináct modulů** v pořadí závislostí (`MODULE_IDS`): kontakty, klienti, disk, zakázky, obchody, úkoly, kalendář, hodiny, finance, reklama, šablony e-mailů, Můj prostor, přehled. Jedna instance, klient `opsys`.
3. **Obchod a zakázka jsou dvě entity.** `deal` (modul `obchody`) je příležitost v pipeline; výhra vytvoří klienta (stav, `client_since`) a zakázky. `job` (modul `zakazky`) má typ (Web, Marketing, Systémy),
   fáze `job_phase` ze šablon, tým a marketingovou etapu (úvodní fáze, retainer, ukončeno). Pevný životní cyklus z ADR 015/016 odpadá. Úkol a CRM aktivita jsou jedna entita `task` s typem.
4. **Soukromé záznamy se vynucují centrálně v jádru.** Entita deklaruje `visibility` (zámek `is_private`, rodiče, děti); engine přidává predikát do seznamů, součtů, hledání, exportů, historie, realtime a webhooků,
   zámek se dědí na děti a platba bez zakázky je vždy soukromá. Vlastník (`private.read`, nepřidělitelné žádné jiné roli) vidí vše, partner nikdy nic soukromého. Dotazy mimo registr entit používají `privateScope`
   a každá taková cesta je v `privatePaths`, kterou prochází canary test (`tests/private-paths.int.test.ts`, matice `tests/private-matrix.int.test.ts`).
5. **Moduly spolupracují přes kontrakty v jádru** (`packages/core/src/contracts`), ne přímými importy: služby (`ServiceMap`, jediný vlastník každé), příspěvky (karta klienta, proměnné e-mailů)
   a doménové události (`DomainEventMap`, handlery běží v transakci emitenta). Katalog kontraktů mění jen architekt/integrátor. Sloty a `recordActions/recordTabs/recordOverview` skládají UI.
6. **Integrace přes n8n a adaptéry.** Google Disk (složky) a Meta leady jdou přes podepsané webhooky ven (`drive.*`, `deal.*`…) a podepsané `POST /api/ingest/<zdroj>` dovnitř (idempotence, záznam `inbound_event`,
   limit 512 kB). Google Kalendář, Meta Ads, ARES a Fakturoid jsou adaptéry s rozhraním a falešným klientem pro testy; tajemství jsou šifrovaná v databázi, nikdy v repu.
7. **Žádné DPH a žádné notifikace.** Peníze jsou minor units v `CZK`; nikdo není plátce. Upozornění jsou jen vizuální (odznaky, červené řádky); jediná událost jádra (`comment.mention`) je v konfiguraci vypnutá.
8. **Migrace.** Každý balíček má vlastní přírůstkové migrace (jádro `0013_opsys` a dál, moduly `0000_init`…); `drizzle-kit generate` nehlásí změny. Squash se záměrně neprovedl (riziko ručních SQL v jádru); nic není nasazeno,
   takže ho lze udělat před prvním nasazením.
9. **2FA pro všechny**, relace 30 dní s prodlužováním (strop 90), pozvánka 48 hodin.

## Důsledky

- Dokumentace ADR 015–018, 023 a 027 je historická; platné jsou moduly `docs/moduly/obchody.md` a `docs/moduly/zakazky.md`.
- Nový modul se přidává podle `docs/CUSTOMIZATION.md` a plánu `docs/opsys/D-plan-a-kontrakty.md`; rozšíření kontraktů (služby, události) vyžaduje změnu `contracts/` a `SERVICE_OWNERS`.
- Co zbývá a co je neověřené: `docs/opsys/F-otevrene-body.md`.
