import { defineNotificationEvent } from "@rebar/core/manifest";

/*
  Upozornění kalendáře. Pozvánka a změna termínu jdou jen pozvaným (organizátor se neupozorňuje na vlastní změnu).
  Přístup k události hlídá politika entity `event`: do jejích vlastníků patří organizátor i všichni pozvaní, takže pozvaný
  s právem číst kalendář událost vždy vidí. U zrušené události už záznam neexistuje (je smazaný), proto zrušení záznam
  nenese a místo politiky hlídá právo číst kalendář.
*/

export const KALENDAR_INVITE = defineNotificationEvent({
  key: "kalendar.invite",
  label: "Pozvánka na událost",
  description: "Někdo vás přidal mezi účastníky události v kalendáři.",
  group: "Kalendář",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { attendee: "Nově pozvaný účastník" },
  recipients: ["attendee"],
  params: {
    title: { label: "Název události", example: "Kontrolní den na stavbě" },
    when: { label: "Kdy to je", example: "12. 10. 2026 09:00" },
    location: { label: "Místo", example: "Plzeň, Americká 12" },
    organizer: { label: "Kdo pozval", example: "Petr Mistr" },
  },
  template: {
    title: "Pozvánka: {title}",
    body: "{when}\n{location}\nPozval vás {organizer}",
    url: "/kalendar/udalosti/{entityId}",
  },
  entity: "event",
});

export const KALENDAR_CHANGED = defineNotificationEvent({
  key: "kalendar.changed",
  label: "Změna termínu události",
  description:
    "Organizátor přesunul událost, na kterou jste pozvaní. Opakované úpravy se slučují do jednoho upozornění.",
  group: "Kalendář",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { attendee: "Účastník, který byl pozvaný už dřív" },
  recipients: ["attendee"],
  params: {
    title: { label: "Název události", example: "Kontrolní den na stavbě" },
    when: { label: "Nový termín", example: "13. 10. 2026 11:00" },
    previous: { label: "Původní termín", example: "12. 10. 2026 09:00" },
  },
  template: {
    title: "Změna termínu: {title}",
    body: "{when}\nPůvodně {previous}",
    url: "/kalendar/udalosti/{entityId}",
  },
  entity: "event",
  mergeWindowSeconds: 600,
  debounceSeconds: 30,
});

export const KALENDAR_CANCELLED = defineNotificationEvent({
  key: "kalendar.cancelled",
  label: "Zrušená událost",
  description: "Organizátor zrušil událost, na kterou jste byli pozvaní.",
  group: "Kalendář",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { attendee: "Pozvaný účastník" },
  recipients: ["attendee"],
  params: {
    title: { label: "Název události", example: "Kontrolní den na stavbě" },
    when: { label: "Kdy se měla konat", example: "12. 10. 2026 09:00" },
  },
  template: { title: "Zrušeno: {title}", body: "{when}", url: "/kalendar" },
  access: "kalendar.read",
});

export const KALENDAR_REMINDER = defineNotificationEvent({
  key: "kalendar.reminder",
  label: "Připomenutí události",
  description:
    "Před začátkem události (podle připomenutí u události) dostane upozornění organizátor i všichni pozvaní.",
  group: "Kalendář",
  severity: "normal",
  channels: { push: true, bell: true },
  audiences: { participant: "Organizátor a pozvaní účastníci" },
  recipients: ["participant"],
  params: {
    title: { label: "Název události", example: "Kontrolní den na stavbě" },
    when: { label: "Kdy to začíná", example: "dnes v 9:00" },
    location: { label: "Místo", example: "Plzeň, Americká 12" },
  },
  template: {
    title: "{title} {when}",
    body: "{location}",
    url: "/kalendar/udalosti/{entityId}",
  },
  entity: "event",
  ttlSeconds: 600,
  snooze: true,
  scheduled: true,
});

export const KALENDAR_NOTIFICATIONS = [
  KALENDAR_INVITE,
  KALENDAR_CHANGED,
  KALENDAR_CANCELLED,
  KALENDAR_REMINDER,
];
