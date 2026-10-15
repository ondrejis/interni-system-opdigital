import { defineModuleServer } from "@rebar/core/module-server";
import { commands } from "./commands";
import { entities } from "./entities";
import { privatePaths } from "./private";
import { emailTemplatesService } from "./service";

/**
 * Serverová část modulu „sablony-emailu“: entita `email_template`, příkazy (náhled, e-mail ze šablony, počítadlo, zápis
 * aktivity, uložení textu) a služba `emailTemplates` pro přesun textů mezi knihovnou (Můj prostor) a šablonami.
 */
export const server = defineModuleServer({
  entities,
  commands,
  // klíč `emailTemplates` zatím není v `ServiceMap` (kontrakty jsou zmrazené; ZADOSTI): za běhu se skládá obecně
  services: { emailTemplates: emailTemplatesService } as never,
  privatePaths,
});

export { emailTemplateEntity, entities } from "./entities";
export { emailTemplate } from "./schema";
export { emailTemplatesService } from "./service";
