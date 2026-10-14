# @rebar/obchody/api

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/obchody/api` (soubor `packages/modules/obchody/src/api.ts`). Exportů: 2, z toho s popisem 2.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`createDealFromLead`](#createdealfromlead) | function | Založí obchod z příchozího leadu (idempotentně podle `meta.leadgenId`): `created=false`, když obchod pro stejný lead už existuje. Volá `reklama` z ingestu `leads`. |  |
| [`CreateDealFromLeadInput`](#createdealfromleadinput) | type | Vstup `createDealFromLead`: lead z Meta formuláře a mapování formuláře na pipeline. |  |

### createDealFromLead

function · `packages/modules/obchody/src/api.ts`

Založí obchod z příchozího leadu (idempotentně podle `meta.leadgenId`): `created=false`, když obchod
pro stejný lead už existuje. Volá `reklama` z ingestu `leads`.

```ts
async function createDealFromLead(_ctx: Ctx, _deps: ModuleDeps, _input: CreateDealFromLeadInput): Promise<{ dealId: string; created: boolean }>
```

### CreateDealFromLeadInput

type · `packages/modules/obchody/src/api.ts`

Vstup `createDealFromLead`: lead z Meta formuláře a mapování formuláře na pipeline.

```ts
type CreateDealFromLeadInput = {
  title: string;
  companyId: string;
  personId: string;
  source: "meta";
  meta: { campaignId?: string; adsetId?: string; adId?: string; leadgenId: string; formId: string };
  formMapping: { pipelineId: string; stageId: string; ownerId: string; services: ServiceType[] };
};
```
