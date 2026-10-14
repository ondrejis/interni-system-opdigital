import { defineNotificationEvent } from "@rebar/core/manifest";
import { CRM_ACTIVITY_NOTIFICATIONS } from "./crm/activities/notifications";

/*
  Upozornění poptávek. Příjemce musí poptávku smět číst (politika entity `inquiry`): obchodník s rozsahem „jen moje“
  nedostane novou poptávku, která ještě nemá vlastníka, dokud mu ji někdo nepřidělí.
*/

export const INQUIRY_NEW = defineNotificationEvent({
  key: "inquiry.new",
  label: "Nová poptávka",
  description:
    "Přišla nová poptávka (z webu, formulářem nebo ručně založená). Dostanou ji ti, kdo poptávky spravují.",
  group: "Poptávky",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: {},
  recipients: ["perm:poptavky.write"],
  params: {
    title: { label: "Název poptávky", example: "Poptávka: Stavby Novák" },
    contact: { label: "Kdo se ozval", example: "Jan Novák · Stavby Novák" },
    message: { label: "Začátek zprávy", example: "Chci novou střechu na rodinný dům…" },
  },
  template: {
    title: "Nová poptávka: {title}",
    body: "{contact}\n{message}",
    url: "/poptavky/{entityId}",
  },
  entity: "inquiry",
  dedupe: "record",
});

export const INQUIRY_ASSIGNED = defineNotificationEvent({
  key: "inquiry.assigned",
  label: "Přidělena poptávka",
  description: "Někdo vám přidělil poptávku (nebo ji převzal od jiného obchodníka).",
  group: "Poptávky",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { owner: "Obchodník, kterému je poptávka přidělena" },
  recipients: ["owner"],
  params: {
    title: { label: "Název poptávky", example: "Poptávka: Stavby Novák" },
    contact: { label: "Kdo se ozval", example: "Jan Novák · Stavby Novák" },
    nextStep: { label: "Další krok", example: "Zavolat do pátku" },
  },
  template: {
    title: "Přidělena poptávka: {title}",
    body: "{contact}\nDalší krok: {nextStep}",
    url: "/poptavky/{entityId}",
  },
  entity: "inquiry",
});

export const POPTAVKY_NOTIFICATIONS = [
  INQUIRY_NEW,
  INQUIRY_ASSIGNED,
  ...CRM_ACTIVITY_NOTIFICATIONS,
];
