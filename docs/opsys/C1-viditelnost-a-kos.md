# C1: viditelnost (zámek), koš, štítky, role: API pro moduly

Autor: agent C1. Závazný kontrakt je D §5; tady je stav implementace a to, co moduly potřebují vědět.

## Zámek shared/private
- Entita deklaruje `visibility: { parents?, ownLock?, defaultPrivate?, privateWithoutParent? }` a `children`; tabulka má `...visibilityColumns()`. `createEntityRegistry` ověří sloupce a vazby při startu.
- Vynucuje engine (`engine.ts`): `whereOf` (seznam, součty, skupiny, `visibleIds`, agregace, export), `getRecord`/`updateRecord`/`deleteRecord`/`restoreRecord` (cizí soukromý = `NotFoundError`), `assertEntityAccess` (komentáře, soubory, aktivita; vrací i `isPrivate`), `searchAll` (sloupec `search_document.is_private`), popisky odkazů (`Soukromý záznam`, v historii vždy zamaskované), `recordTitles(ctx, …)`, `visibleRecordTitles`, historie (`auditReadScope(ctx)` pro každý dotaz na `audit_log`).
- Zámek je i atribut `isPrivate` (+ `visibilitySource`): jen pro čtení a jen s `private.read` (pro partnera neexistují), takže jde filtrovat, řadit, exportovat a zobrazit sloupec.
- Funkce pro moduly (`@rebar/core/entities`): `canSeePrivate(ctx)`, `privateScope(ctx, table)` (povinné v ručních dotazech), `notPrivateRecord(ctx, typCol, idCol)`, `isPrivateRecord`, `setVisibility(ctx, registry, key, id, isPrivate)`, `assertAssignable(ctx, key, id, userId)` (`PrivateAssignmentError`, kód `private_assign`), `visibilityForInsert(...)` pro řádky zakládané přímým `insert`, `syncPrivateRecord`.
- Pravidla: tvůrce bez `private.read` zakládá jen sdílené (soukromý = `UserError`); dítě soukromého rodiče (jakéhokoli z `parents`, přísněji než „první nenulový“) je `true/inherited`; zveřejnění rodiče zveřejní jen `inherited` děti; `ownLock: false` (hodiny) zámek jen dědí; platba bez zakázky je vždy soukromá (klíč `payment`, nebo `privateWithoutParent`); změna rodiče přes `updateRecord` přepočte zděděný zámek; změna zámku jde do historie (`visibility_changed`, hodnota po změně) a emituje `visibility.changed`.
- Audit: `recordAudit` přijímá `category`, `isPrivate`, `entityTitle`, `context`; bez `isPrivate` se zjistí z `private_record`. Vedlejší záznamy soukromého záznamu (komentář, soubor) musí předat `isPrivate` + `context: { entityType, entityId }` (core to dělá). Autor mimo uživatele: `sourceCtx(db, "n8n"|"google"|"meta"|"job"|"system", label)` z `@rebar/core/rbac`.
- UI: `VisibilityLock` (hlavička záznamu; moduly s vlastním `recordHeader` ho přidají samy), přepínač Sdílené/Soukromé v „Nový…“ (`entity.visibility.lockable`), hromadné Zamknout/Zveřejnit, dialog „Zveřejnit a přiřadit“ při `private_assign`. `EntityApi.setVisibility`, server action `setEntityVisibility`.

## Koš (30 dní)
`deleteRecord` smaže záznam i `children` jednou dávkou (`deleted_batch` = id kořene, `deleted_by`); `restoreRecord` vrátí dávku (podřízený záznam nejde obnovit před smazaným rodičem). `@rebar/core/trash`: `listTrash` (partner jen své nesoukromé, vlastník vše), `purgeRecord` (`trash.purge`), `purgeExpiredTrash` (úloha `core.trash.purge` denně 3:40). Stránka `/kos`, toast „Vrátit“ 10 s. `private_record` zůstává i pro smazaný záznam, dokud ho nesmaže úklid.

## Štítky, pole, role
- Štítky: číselník `tag` (`lookup_item.scopes`), `@rebar/core/tags`, `/nastaveni/stitky` (`settings.tags`); atribut `lookup: "tag"` + `lookupScope`; archivované štítky se nenabízejí (`Choice.archived`).
- Vlastní pole: `longtext`, `showInForm` (pole v „Nový…“), archivace (`options.hidden`, hodnoty zůstanou), stačí `settings.custom_fields`; pipeline stačí `settings.pipelines`.
- Role: jedna role na uživatele; `private.read` nejde přidělit žádné roli (server odmítne, UI ho nenabízí); uložení oprávnění vyžaduje potvrzení a zapíše se jako `security`; `ensureRoles` existující roli jen doplní o nová oprávnění ze seedu (marker `rbac.seeded.<role>`), nic neodebere.
- Core `task` zrušen (tabulka, `collab/tasks.ts`, `/ukoly` jádra, `tasks.*`, ranní přehled úkolů).

## Testy
`tests/private-matrix.int.test.ts` (9 entit × cesty + kaskáda, fixture `tests/support/fixture.ts`, canary `tests/support/canary.ts`), `tests/trash.int.test.ts`, `tests/c1-config.int.test.ts`. Spouštět s `REBAR_TEST_DB_NAME=rebar_test_c1`.
