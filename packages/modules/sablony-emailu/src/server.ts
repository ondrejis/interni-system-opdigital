import { defineModuleServer } from "@rebar/core/module-server";
import { commands } from "./commands";
import { entities } from "./entities";
import { privatePaths } from "./private";

/**
 * Serverová část modulu „sablony-emailu“: entita `email_template`, příkazy (náhled, e-mail ze šablony, počítadlo, zápis
 * aktivity, uložení textu) a privatePaths. Služba `emailTemplates` pro přesun textů s knihovnou (Můj prostor) je hotová v `service.ts`, ale zatím
 * se neregistruje: klíč není v `ServiceMap`/`SERVICE_OWNERS` (zmrazené, viz ZADOSTI).
 */
export const server = defineModuleServer({
  entities,
  commands,
  privatePaths,
});

export { emailTemplateEntity, entities } from "./entities";
export { emailTemplate } from "./schema";
export { emailTemplatesService } from "./service";
