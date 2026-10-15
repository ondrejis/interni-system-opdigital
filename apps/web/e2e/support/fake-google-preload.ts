/*
  Předspuštění pro e2e Kalendáře (KAL-B, AS-13): do procesu webového serveru podstrčí `fake-google` místo skutečného
  Googlu (`globalThis.__kalendarGoogleClient`, viz `kalendar/src/google/env.ts`). Účet `ondrej@opdigital.test` má dvě
  události na zítřek a pozítří (jedna s odkazem na Meet a účastníkem `jan.novak@kalendar-e2e.test`, který si test
  založí jako kontakt v CRM). Spuštění: `NODE_OPTIONS="--import tsx --import <tento soubor>" next dev`.
  Žádné klíče ani skutečný Google; soubor se do produkce nikdy nenačítá.
*/
import { createFakeGoogle } from "../../../../packages/modules/kalendar/src/google/fake-google";

export const E2E_GOOGLE_EMAIL = "ondrej@opdigital.test";
export const E2E_CONTACT_EMAIL = "jan.novak@kalendar-e2e.test";

const g = globalThis as { __kalendarGoogleClient?: unknown; __kalendarFake?: unknown };
if (!g.__kalendarGoogleClient) {
  const fake = createFakeGoogle();
  fake.addAccount(E2E_GOOGLE_EMAIL, "Ondřej");
  const day = (plus: number) => {
    const d = new Date(Date.now() + plus * 86_400_000);
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(d);
  };
  const at = (plus: number, time: string) => ({
    dateTime: `${day(plus)}T${time}:00`,
    timeZone: "Europe/Prague",
  });
  fake.putEvent(E2E_GOOGLE_EMAIL, E2E_GOOGLE_EMAIL, {
    id: "e2e-konzultace",
    summary: "Konzultace s Novákem",
    location: "Plzeň, Americká 1",
    start: at(1, "10:00"),
    end: at(1, "11:00"),
    hangoutLink: "https://meet.google.com/e2e-test-meet",
    attendees: [
      { email: E2E_GOOGLE_EMAIL, self: true, responseStatus: "accepted" },
      { email: E2E_CONTACT_EMAIL, displayName: "Jan Novák", responseStatus: "needsAction" },
    ],
  });
  fake.putEvent(E2E_GOOGLE_EMAIL, E2E_GOOGLE_EMAIL, {
    id: "e2e-obed",
    summary: "Oběd s dodavatelem",
    start: at(2, "12:00"),
    end: at(2, "13:00"),
  });
  g.__kalendarGoogleClient = fake.client;
  g.__kalendarFake = fake;
}
