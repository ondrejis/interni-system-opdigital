import { describe, expect, it } from "vitest";
import { parseQuickTask } from "./quick-parse";

// Středa 14. 10. 2026, 9:00 pražského času (CEST = UTC+2)
const NOW = new Date("2026-10-14T07:00:00Z");
const TYPES = [
  { key: "task", name: "Úkol" },
  { key: "call", name: "Hovor" },
  { key: "meeting", name: "Schůzka" },
  { key: "email", name: "E-mail" },
  { key: "deadline", name: "Termín" },
  { key: "visit", name: "Návštěva" },
];

type Case = {
  text: string;
  title: string;
  type?: string;
  date?: string | null;
  time?: string | null;
  duration?: number | null;
  priority?: string;
};

const CASES: Case[] = [
  // příklad ze spec
  {
    text: "zavolat Novákovi zítra 10:00",
    title: "Zavolat Novákovi",
    type: "call",
    date: "2026-10-15",
    time: "10:00",
  },
  // základní data
  {
    text: "poslat nabídku dnes",
    title: "Poslat nabídku",
    type: "task",
    date: "2026-10-14",
    time: null,
  },
  { text: "poslat nabídku zítra", title: "Poslat nabídku", date: "2026-10-15", time: null },
  { text: "poslat nabídku pozítří", title: "Poslat nabídku", date: "2026-10-16" },
  { text: "poslat nabidku zitra", title: "Poslat nabidku", date: "2026-10-15" },
  // dny v týdnu: vždy nejbližší po dnešku (dnes je středa)
  { text: "kontrola webu v pátek", title: "Kontrola webu", date: "2026-10-16" },
  { text: "kontrola webu v pondělí", title: "Kontrola webu", date: "2026-10-19" },
  { text: "kontrola webu ve středu", title: "Kontrola webu", date: "2026-10-21" },
  { text: "kontrola webu ve čtvrtek", title: "Kontrola webu", date: "2026-10-15" },
  { text: "kontrola webu v úterý", title: "Kontrola webu", date: "2026-10-20" },
  { text: "kontrola webu v neděli", title: "Kontrola webu", date: "2026-10-18" },
  { text: "kontrola webu do pátku", title: "Kontrola webu", date: "2026-10-16" },
  { text: "kontrola webu příští pondělí", title: "Kontrola webu", date: "2026-10-19" },
  { text: "kontrola webu příští pátek", title: "Kontrola webu", date: "2026-10-23" },
  { text: "kontrola webu v pá", title: "Kontrola webu", date: "2026-10-16" },
  // relativní
  { text: "ozvat se klientovi za 3 dny", title: "Ozvat se klientovi", date: "2026-10-17" },
  { text: "ozvat se klientovi za tři dny", title: "Ozvat se klientovi", date: "2026-10-17" },
  { text: "ozvat se klientovi za týden", title: "Ozvat se klientovi", date: "2026-10-21" },
  { text: "ozvat se klientovi za 2 týdny", title: "Ozvat se klientovi", date: "2026-10-28" },
  { text: "ozvat se klientovi za měsíc", title: "Ozvat se klientovi", date: "2026-11-14" },
  { text: "fakturace příští týden", title: "Fakturace", date: "2026-10-19" },
  { text: "report do konce týdne", title: "Report", date: "2026-10-16" },
  { text: "report do konce měsíce", title: "Report", date: "2026-10-31" },
  // absolutní data
  { text: "podklady 20.10.", title: "Podklady", date: "2026-10-20" },
  { text: "podklady 20. 10.", title: "Podklady", date: "2026-10-20" },
  { text: "podklady do 20.10.2026", title: "Podklady", date: "2026-10-20" },
  { text: "podklady 20. října", title: "Podklady", date: "2026-10-20" },
  { text: "podklady 3. ledna", title: "Podklady", date: "2027-01-03" },
  { text: "podklady 3.1.", title: "Podklady", date: "2027-01-03" },
  { text: "podklady 14.10.", title: "Podklady", date: "2026-10-14" },
  { text: "podklady 2026-11-05", title: "Podklady", date: "2026-11-05" },
  { text: "podklady 31.2.", title: "Podklady 31.2.", date: null },
  { text: "podklady 20. listopadu 2027", title: "Podklady", date: "2027-11-20" },
  // čas
  {
    text: "schůzka s Dvořákem zítra 14:30",
    title: "Schůzka s Dvořákem",
    type: "meeting",
    date: "2026-10-15",
    time: "14:30",
  },
  {
    text: "schůzka s Dvořákem zítra v 15",
    title: "Schůzka s Dvořákem",
    type: "meeting",
    date: "2026-10-15",
    time: "15:00",
  },
  {
    text: "schůzka zítra ve 3",
    title: "Schůzka",
    type: "meeting",
    date: "2026-10-15",
    time: "15:00",
  },
  { text: "schůzka zítra v 9", title: "Schůzka", date: "2026-10-15", time: "09:00" },
  { text: "schůzka zítra 14 hod", title: "Schůzka", date: "2026-10-15", time: "14:00" },
  { text: "schůzka zítra v 14.30", title: "Schůzka", date: "2026-10-15", time: "14:30" },
  { text: "schůzka zítra půl 3", title: "Schůzka", date: "2026-10-15", time: "14:30" },
  { text: "schůzka zítra půl 10", title: "Schůzka", date: "2026-10-15", time: "09:30" },
  { text: "schůzka zítra ráno", title: "Schůzka", date: "2026-10-15", time: "08:00" },
  { text: "schůzka zítra dopoledne", title: "Schůzka", date: "2026-10-15", time: "10:00" },
  { text: "schůzka zítra v poledne", title: "Schůzka", date: "2026-10-15", time: "12:00" },
  { text: "schůzka zítra odpoledne", title: "Schůzka", date: "2026-10-15", time: "14:00" },
  { text: "schůzka zítra večer", title: "Schůzka", date: "2026-10-15", time: "18:00" },
  { text: "schůzka zítra v 3 ráno", title: "Schůzka", date: "2026-10-15", time: "03:00" },
  { text: "schůzka zítra v 8 večer", title: "Schůzka", date: "2026-10-15", time: "20:00" },
  { text: "schůzka zítra 3:30", title: "Schůzka", date: "2026-10-15", time: "03:30" },
  // jen čas: dnes, když ještě nenastal (je 9:00), jinak zítra
  {
    text: "zavolat Novákovi 10:00",
    title: "Zavolat Novákovi",
    type: "call",
    date: "2026-10-14",
    time: "10:00",
  },
  {
    text: "zavolat Novákovi 8:00",
    title: "Zavolat Novákovi",
    type: "call",
    date: "2026-10-15",
    time: "08:00",
  },
  // za hodinu
  {
    text: "zavolat Novákovi za hodinu",
    title: "Zavolat Novákovi",
    date: "2026-10-14",
    time: "10:00",
  },
  {
    text: "zavolat Novákovi za 30 minut",
    title: "Zavolat Novákovi",
    date: "2026-10-14",
    time: "09:30",
  },
  {
    text: "zavolat Novákovi za 2 hodiny",
    title: "Zavolat Novákovi",
    date: "2026-10-14",
    time: "11:00",
  },
  // délka
  {
    text: "schůzka zítra 10:00 na 30 min",
    title: "Schůzka",
    date: "2026-10-15",
    time: "10:00",
    duration: 30,
  },
  { text: "schůzka zítra 10:00 na hodinu", title: "Schůzka", time: "10:00", duration: 60 },
  { text: "schůzka zítra 10:00 na 1,5 h", title: "Schůzka", time: "10:00", duration: 90 },
  { text: "schůzka zítra 10:00 na půl hodiny", title: "Schůzka", time: "10:00", duration: 30 },
  { text: "schůzka zítra 10:00 na 2 hodiny", title: "Schůzka", time: "10:00", duration: 120 },
  { text: "workshop 45 minut", title: "Workshop", duration: 45, date: null },
  // priorita
  { text: "opravit odkaz na webu !", title: "Opravit odkaz na webu", priority: "medium" },
  { text: "opravit odkaz na webu !!", title: "Opravit odkaz na webu", priority: "high" },
  { text: "opravit odkaz na webu !!!", title: "Opravit odkaz na webu", priority: "urgent" },
  { text: "urgentní opravit odkaz", title: "Opravit odkaz", priority: "urgent" },
  { text: "důležité: poslat smlouvu", title: "Poslat smlouvu", priority: "high" },
  // typy
  {
    text: "napsat e-mail Svobodovi zítra",
    title: "Napsat e-mail Svobodovi",
    type: "email",
    date: "2026-10-15",
  },
  { text: "poslat mail s nabídkou", title: "Poslat mail s nabídkou", type: "email" },
  { text: "e-mail Svobodovi", title: "E-mail Svobodovi", type: "email" },
  { text: "napsat nabídku pro Svobodu", title: "Napsat nabídku pro Svobodu", type: "task" },
  { text: "domluvit schůzku s Novákem", title: "Domluvit schůzku s Novákem", type: "task" },
  {
    text: "sejít se s Novákem v pátek 10:00",
    title: "Sejít se s Novákem",
    type: "meeting",
    date: "2026-10-16",
    time: "10:00",
  },
  {
    text: "termín: předání webu 30.10.",
    title: "Předání webu",
    type: "deadline",
    date: "2026-10-30",
  },
  {
    text: "deadline pro texty v pátek",
    title: "Deadline pro texty",
    type: "deadline",
    date: "2026-10-16",
  },
  {
    text: "Hovor: Novák zítra 9:00",
    title: "Novák",
    type: "call",
    date: "2026-10-15",
    time: "09:00",
  },
  {
    text: "Návštěva u klienta v pátek 11:00",
    title: "Návštěva u klienta",
    type: "visit",
    date: "2026-10-16",
    time: "11:00",
  },
  { text: "Návštěva: kancelář Plzeň", title: "Kancelář Plzeň", type: "visit" },
  // čísla v názvu nejsou čas ani datum
  {
    text: "faktura 12 pro Nováka",
    title: "Faktura 12 pro Nováka",
    type: "task",
    date: null,
    time: null,
  },
  { text: "web má 5 stránek", title: "Web má 5 stránek", date: null, time: null },
  { text: "objednat 10 kusů vizitek", title: "Objednat 10 kusů vizitek", date: null, time: null },
  // celé dohromady
  {
    text: "Zavolat Novákovi zítra v 10:00 na 15 min !!",
    title: "Zavolat Novákovi",
    type: "call",
    date: "2026-10-15",
    time: "10:00",
    duration: 15,
    priority: "high",
  },
  // okraje
  { text: "", title: "", type: "task", date: null, time: null },
  { text: "zítra 10:00", title: "", date: "2026-10-15", time: "10:00" },
  { text: "   zavolat   Novákovi   ", title: "Zavolat Novákovi", type: "call" },
];

describe("parseQuickTask", () => {
  it.each(CASES)("$text", (c) => {
    const r = parseQuickTask(c.text, NOW, TYPES);
    expect(r.title).toBe(c.title);
    if (c.type !== undefined) expect(r.typeKey).toBe(c.type);
    if (c.date !== undefined) expect(r.dueDate).toBe(c.date);
    if (c.time !== undefined) expect(r.dueTime).toBe(c.time);
    if (c.duration !== undefined) expect(r.durationMin).toBe(c.duration);
    if (c.priority !== undefined) expect(r.priority).toBe(c.priority);
  });

  it("vrací rozpoznané části pro náhled (typ, datum, čas, délka, priorita)", () => {
    const r = parseQuickTask("zavolat Novákovi zítra 10:00 na 15 min !!", NOW, TYPES);
    expect(r.recognized.map((t) => [t.kind, t.text])).toEqual(
      expect.arrayContaining([
        ["type", "zavolat"],
        ["priority", "!!"],
        ["duration", "na 15 min"],
        ["date", "zítra"],
        ["time", "10:00"],
      ]),
    );
    expect(r.recognized.find((t) => t.kind === "date")?.label).toBe("zítra (čt 15. 10.)");
    expect(r.recognized.find((t) => t.kind === "type")?.label).toBe("Hovor");
  });

  it("typ, který v nastavení není (smazaný vlastní, vypnutý), se nepoužije", () => {
    const r = parseQuickTask("zavolat Novákovi", NOW, [{ key: "task", name: "Úkol" }]);
    expect(r.typeKey).toBe("task");
  });

  it("výchozí typy se použijí, když volající seznam nepředá", () => {
    expect(parseQuickTask("zavolat Novákovi", NOW).typeKey).toBe("call");
  });

  it("počítá v pražském čase: večer před půlnocí UTC je už zítra", () => {
    // 14. 10. 2026 23:30 UTC = 15. 10. 01:30 pražského času
    const r = parseQuickTask("poslat zítra", new Date("2026-10-14T23:30:00Z"), TYPES);
    expect(r.dueDate).toBe("2026-10-16");
  });

  it("přechod na zimní čas (25. 10. 2026) nerozhodí den v týdnu ani čas", () => {
    const r = parseQuickTask("schůzka v pondělí 9:00", new Date("2026-10-23T10:00:00Z"), TYPES);
    expect(r.dueDate).toBe("2026-10-26");
    expect(r.dueTime).toBe("09:00");
  });
});
