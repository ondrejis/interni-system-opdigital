import { defineNotificationEvent } from "@rebar/core/manifest";

/** Skladové karty: příjemci jsou ti, kdo sklad spravují (`sklad.write`); správce klienta je v Nastavení může změnit. */
export const SKLAD_LOW = defineNotificationEvent({
  key: "sklad.low",
  label: "Materiál pod minimem",
  description:
    "Po výdeji, převodu nebo inventuře klesla zásoba skladové karty pod minimum. Nejvýš jednou denně za kartu.",
  group: "Sklad",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: {},
  recipients: ["perm:sklad.write"],
  params: {
    name: { label: "Název materiálu", example: "Sádrokarton 12,5 mm" },
    code: { label: "Kód skladové karty", example: "SDK-125" },
    onHand: { label: "Skladem", example: "12 ks" },
    minimum: { label: "Minimum", example: "50 ks" },
  },
  template: {
    title: "Pod minimem: {name}",
    body: "{code} · skladem {onHand}, minimum {minimum}",
    url: "/sklad/karty/{entityId}",
  },
  entity: "stock_item",
  dedupe: "day",
});

export const SKLAD_NOTIFICATIONS = [SKLAD_LOW];
