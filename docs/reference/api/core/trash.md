# @rebar/core/trash

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/trash` (soubor `packages/core/src/trash/index.ts`). Exportů: 8, z toho s popisem 8.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`deleteTree`](#deletetree) | function | Soft-delete záznamu a všeho podřízeného (`children`, `visibility.parents` jiných entit). Všechny řádky dostanou stejnou dávku `deleted_batch` = id kořene, takže koš ukáže jen kořen a obnova vrátí celou dávku. Záznam je odebrán z hledání, do historie se zapíše smazání kořene i každého podřízeného záznamu entity. Volat v transakci (`inTx`). Vrací počet smazaných podřízených řádků. |  |
| [`listTrash`](#listtrash) | function | Kořeny smazaných záznamů pro koš. Vlastník (`private.read`) vidí všechny, ostatní jen záznamy, které sami smazali a které nejsou soukromé (`trash.read`). Filtr `entity` (typ) a `q` (v názvu); řazeno od nejnověji smazaných. |  |
| [`purgeExpiredTrash`](#purgeexpiredtrash) | function | Úklid koše: smaže natrvalo kořeny smazané před více než 30 dny (nejdřív děti). Selhání jednoho záznamu (vazba z cizí tabulky) neshodí ostatní. Vrací počet smazaných kořenů. |  |
| [`purgeRecord`](#purgerecord) | function | Trvale smaže záznam z koše (včetně podřízených). Jen s `trash.purge` a jen záznam, který v koši je; historie změn zůstává (s názvem záznamu). UI před voláním vyžaduje potvrzení. |  |
| [`purgeTree`](#purgetree) | function | Natvrdo smaže záznam a všechno podřízené (nejdřív děti). Volat v transakci; vrací počet smazaných řádků. |  |
| [`restoreTree`](#restoretree) | function | Obnoví smazaný záznam a podřízené řádky smazané stejnou dávkou. Nejdřív musí být obnovený smazaný rodič (jinak by záznam visel pod smazaným záznamem). `reindex` znovu zapíše záznamy do hledání (engine předá správně rozřešenou entitu s vlastními poli). Vrací počet obnovených řádků včetně kořene. |  |
| [`TRASH_RETENTION_DAYS`](#trash_retention_days) | const | Jak dlouho zůstane smazaný záznam v koši, než ho úklidová úloha smaže natrvalo. |  |
| [`TrashItem`](#trashitem) | type | Položka koše: smazaný záznam (kořen dávky) a kolik podřízených záznamů smazal s sebou. |  |

### deleteTree

function · `packages/core/src/trash/tree.ts`

Soft-delete záznamu a všeho podřízeného (`children`, `visibility.parents` jiných entit). Všechny řádky dostanou
stejnou dávku `deleted_batch` = id kořene, takže koš ukáže jen kořen a obnova vrátí celou dávku. Záznam je odebrán
z hledání, do historie se zapíše smazání kořene i každého podřízeného záznamu entity. Volat v transakci (`inTx`).
Vrací počet smazaných podřízených řádků.

```ts
async function deleteTree(c: Ctx, registry: LinkRegistry, def: EntityDef, id: string): Promise<number>
```

### listTrash

function · `packages/core/src/trash/trash.ts`

Kořeny smazaných záznamů pro koš. Vlastník (`private.read`) vidí všechny, ostatní jen záznamy, které sami smazali a
které nejsou soukromé (`trash.read`). Filtr `entity` (typ) a `q` (v názvu); řazeno od nejnověji smazaných.

```ts
async function listTrash(ctx: Ctx, registry: EntityRegistry, opts: { entity?: string; q?: string; limit?: number; offset?: number } = {}): Promise<{ items: TrashItem[]; total: number }>
```

### purgeExpiredTrash

function · `packages/core/src/trash/trash.ts`

Úklid koše: smaže natrvalo kořeny smazané před více než 30 dny (nejdřív děti). Selhání jednoho záznamu (vazba z cizí
tabulky) neshodí ostatní. Vrací počet smazaných kořenů.

```ts
async function purgeExpiredTrash(ctx: Ctx, registry: EntityRegistry, now = new Date()): Promise<number>
```

### purgeRecord

function · `packages/core/src/trash/trash.ts`

Trvale smaže záznam z koše (včetně podřízených). Jen s `trash.purge` a jen záznam, který v koši je; historie změn
zůstává (s názvem záznamu). UI před voláním vyžaduje potvrzení.

```ts
async function purgeRecord(ctx: Ctx, registry: EntityRegistry, entityType: string, id: string): Promise<void>
```

### purgeTree

function · `packages/core/src/trash/trash.ts`

Natvrdo smaže záznam a všechno podřízené (nejdřív děti). Volat v transakci; vrací počet smazaných řádků.

```ts
async function purgeTree(c: Ctx, registry: EntityRegistry, def: EntityDef, id: string, depth = 0): Promise<number>
```

### restoreTree

function · `packages/core/src/trash/tree.ts`

Obnoví smazaný záznam a podřízené řádky smazané stejnou dávkou. Nejdřív musí být obnovený smazaný rodič (jinak by
záznam visel pod smazaným záznamem). `reindex` znovu zapíše záznamy do hledání (engine předá správně rozřešenou
entitu s vlastními poli). Vrací počet obnovených řádků včetně kořene.

```ts
async function restoreTree(c: Ctx, registry: LinkRegistry, def: EntityDef, id: string, reindex?: (def: EntityDef, row: Row) => Promise<void>): Promise<number>
```

### TRASH_RETENTION_DAYS

const · `packages/core/src/trash/tree.ts`

Jak dlouho zůstane smazaný záznam v koši, než ho úklidová úloha smaže natrvalo.

```ts
const TRASH_RETENTION_DAYS: 30
```

### TrashItem

type · `packages/core/src/trash/trash.ts`

Položka koše: smazaný záznam (kořen dávky) a kolik podřízených záznamů smazal s sebou.

```ts
type TrashItem = {
  entityType: string;
  entityLabel: string;
  id: string;
  title: string;
  deletedAt: string;
  deletedBy: string | null;
  deletedByName: string | null;
  /** Kolik podřízených záznamů se smazalo spolu s ním (obnova je vrátí). */
  children: number;
  /** Kolik dní zbývá do trvalého smazání. */
  daysLeft: number;
  isPrivate: boolean;
};
```
