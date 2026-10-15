import { createRecord, deleteRecord, resolveEntity } from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { NotFoundError, UserError, inTx } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { loadLibraryItem } from "./data";
import { docToText, textToDoc } from "./logic";
import { emailTemplatesPort } from "./preview";
import type { LibraryMoveResult } from "./types";

/** Zpráva, když služba sdílených šablon (modul „Šablony e-mailů“) není k dispozici. */
const NO_TEMPLATES = "Sdílené šablony e-mailů nejsou zapnuté, text se nedá přesunout.";

/**
 * Přesun (nebo kopie) textu z knihovny do sdílených šablon (KNI-02) přes službu modulu `sablony-emailu`. Šablona i smazání
 * původní položky (do koše) proběhnou v jedné transakci.
 */
export async function moveToTemplates(
  ctx: Ctx,
  deps: ModuleDeps,
  input: {
    id: string;
    language?: "cs" | "sk" | "en" | undefined;
    keepSource?: boolean | undefined;
  },
): Promise<LibraryMoveResult> {
  const port = emailTemplatesPort(deps);
  const def = deps.registry.get("email_library_item");
  if (!port || !def) throw new UserError(NO_TEMPLATES);
  return inTx(ctx, async (c) => {
    const item = await loadLibraryItem(c, input.id);
    const created = await port.importText(c, {
      name: item.title,
      category: item.category,
      language: input.language ?? "cs",
      subject: item.subject,
      bodyText: item.bodyText,
      bodyJson: textToDoc(item.bodyText),
      tags: [],
    });
    if (!input.keepSource) await deleteRecord(c, await resolveEntity(c.db, def), item.id);
    return {
      direction: "toTemplates",
      id: created.id,
      href: created.href,
      kept: !!input.keepSource,
    };
  });
}

/** Přesun (nebo kopie) sdílené šablony do knihovny; formátování šablony se zploští na prostý text. */
export async function moveFromTemplate(
  ctx: Ctx,
  deps: ModuleDeps,
  input: { id: string; keepSource?: boolean | undefined },
): Promise<LibraryMoveResult> {
  const port = emailTemplatesPort(deps);
  const def = deps.registry.get("email_library_item");
  if (!port || !def) throw new UserError(NO_TEMPLATES);
  return inTx(ctx, async (c) => {
    const tpl = await port.exportText(c, input.id);
    if (!tpl) throw new NotFoundError("Šablona nenalezena.");
    const entity = await resolveEntity(c.db, def);
    const values = {
      title: tpl.name,
      category: tpl.category,
      subject: tpl.subject,
      body: tpl.bodyText.trim() ? tpl.bodyText : docToText(tpl.bodyJson),
    };
    let created;
    try {
      created = await createRecord(c, deps.registry, entity, { ...values, tags: tpl.tags });
    } catch (e) {
      // štítek šablony nemusí platit pro knihovnu (rozsah štítků): text se přesune bez štítků
      if (!(e instanceof UserError) || !tpl.tags.length) throw e;
      created = await createRecord(c, deps.registry, entity, values);
    }
    if (!input.keepSource) await port.remove(c, input.id);
    return {
      direction: "fromTemplate",
      id: created.row.id,
      href: def.url(created.row.id),
      kept: !!input.keepSource,
    };
  });
}
