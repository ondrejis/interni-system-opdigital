"use client";

import { defineModuleUi, type RecordAction } from "@rebar/ui";
import type { EmailEntityType } from "./contract";
import { EmailFromTemplate } from "./ui/compose-dialog";
import { TemplateEditorTab } from "./ui/editor-tab";

/**
 * Akce „E-mail ze šablony“ v hlavičce záznamu (D §2.5): výběr šablony → náhled s daty záznamu → Otevřít v Gmailu nebo
 * Kopírovat. Hostitel (kontakt, organizace/klient, obchod, zakázka) o modulu neví, akce se k němu přidá sama.
 */
function emailAction(entityType: EmailEntityType): RecordAction {
  return {
    id: "sablony-emailu.email",
    label: "E-mail ze šablony",
    permission: "sablony-emailu.read",
    // pořadí v hlavičce klienta (`CLIENT_ACTIONS.email`; konstanty jádra se do prohlížeče netáhnou)
    order: 30,
    dialog: {
      title: "E-mail ze šablony",
      render: ({ id, close }) => (
        <EmailFromTemplate entityType={entityType} id={id} onClose={close} />
      ),
    },
  };
}

/**
 * UI modulu „sablony-emailu“: editor šablony s proměnnými a živým náhledem (záložka na detailu šablony), akce „E-mail ze
 * šablony“ u kontaktu, organizace (klienta), obchodu a zakázky a položka v paletě. Seznam šablon dodává generická trasa
 * entity `email_template`.
 */
export const ui = defineModuleUi({
  recordTabs: {
    email_template: [
      {
        id: "text",
        label: "Text e-mailu",
        icon: "mail-template",
        order: 5,
        permission: "sablony-emailu.read",
        render: ({ id, row }) => <TemplateEditorTab id={id} row={row} />,
      },
    ],
  },
  recordActions: {
    company: [emailAction("company")],
    person: [emailAction("person")],
    deal: [emailAction("deal")],
    job: [emailAction("job")],
  },
  paletteActions: [
    {
      id: "sablony-emailu.list",
      label: "Šablony e-mailů",
      keywords: "email e-mail šablona sablony follow-up nabídka gmail",
      icon: "mail-template",
      permission: "sablony-emailu.read",
      href: "/sablony-emailu",
    },
  ],
});
