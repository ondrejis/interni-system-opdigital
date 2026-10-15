import { defineModuleServer } from "@rebar/core/module-server";
import { commands } from "./commands";
import { entities } from "./entities";
import { privatePaths } from "./private";
import { emailTemplatesService } from "./service";

/**
 * Serverová část modulu „sablony-emailu“: entita `email_template`, příkazy (náhled, e-mail ze šablony, počítadlo, zápis
 * aktivity, uložení textu), privatePaths a služba `emailTemplates` (přesun textů s knihovnou v Můj prostor).
 */
export const server = defineModuleServer({
  entities,
  commands,
  privatePaths,
  services: { emailTemplates: emailTemplatesService },
});

export { emailTemplateEntity, entities } from "./entities";
export { emailTemplate } from "./schema";
export { emailTemplatesService } from "./service";
