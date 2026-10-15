import { describe, expect, it } from "vitest";
import { leadIngestPayload } from "../contract";
import {
  buildMetrics,
  cplMinor,
  ctrPct,
  fillDaily,
  leadDealTitle,
  leadsFromActions,
  normalizeFieldKey,
  parseLead,
  parseLeadTime,
  periodFromPreset,
  ratioMinor,
  rewriteWindow,
  sumMetricsInputs,
  toCount,
  toMinor,
} from "./logic";

const payload = (extra: Record<string, unknown>) =>
  leadIngestPayload.parse({ leadgenId: "L1", formId: "F1", ...extra });

describe("metriky", () => {
  it("CPL = útrata / leady Meta, CPL OPSYS = útrata / obchody, náklad na výhru = útrata / výhry", () => {
    const m = buildMetrics({
      spendMinor: 1_000_000,
      impressions: 50_000,
      clicks: 1_000,
      leadsMeta: 20,
      leadsOpsys: 16,
      wonDeals: 2,
    });
    expect(m.cplMinor).toBe(50_000);
    expect(m.cplOpsysMinor).toBe(62_500);
    expect(m.costPerWonMinor).toBe(500_000);
    expect(m.leadsLost).toBe(4);
    expect(m.ctrPct).toBe(2);
  });

  it("bez leadů, výher a zobrazení jsou podíly null, ne nekonečno", () => {
    const m = buildMetrics({
      spendMinor: 5_000,
      impressions: 0,
      clicks: 0,
      leadsMeta: 0,
      leadsOpsys: 0,
      wonDeals: 0,
    });
    expect([m.cplMinor, m.cplOpsysMinor, m.costPerWonMinor, m.ctrPct]).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(cplMinor(100, 0)).toBeNull();
  });

  it("zaokrouhluje na haléře a CTR na dvě desetinná místa", () => {
    expect(ratioMinor(100, 3)).toBe(33);
    expect(ratioMinor(200, 3)).toBe(67);
    expect(ctrPct(1, 3)).toBe(33.33);
  });

  it("rozdíl Meta vs. OPSYS může být záporný (víc obchodů než leadů Meta)", () => {
    expect(
      buildMetrics({
        spendMinor: 0,
        impressions: 0,
        clicks: 0,
        leadsMeta: 1,
        leadsOpsys: 3,
        wonDeals: 0,
      }).leadsLost,
    ).toBe(-2);
  });

  it("sečte součty", () => {
    const a = {
      spendMinor: 1,
      impressions: 2,
      clicks: 3,
      leadsMeta: 4,
      leadsOpsys: 5,
      wonDeals: 6,
    };
    expect(sumMetricsInputs([a, a, a])).toEqual({
      spendMinor: 3,
      impressions: 6,
      clicks: 9,
      leadsMeta: 12,
      leadsOpsys: 15,
      wonDeals: 18,
    });
    expect(sumMetricsInputs([]).spendMinor).toBe(0);
  });

  it("doplní dny bez dat nulami a zahodí řádky mimo období", () => {
    const rows = fillDaily(
      [
        {
          date: "2026-10-02",
          spendMinor: 100,
          impressions: 10,
          clicks: 1,
          leadsMeta: 1,
          leadsOpsys: 0,
        },
        {
          date: "2026-10-02",
          spendMinor: 50,
          impressions: 5,
          clicks: 0,
          leadsMeta: 0,
          leadsOpsys: 1,
        },
        {
          date: "2026-09-01",
          spendMinor: 999,
          impressions: 0,
          clicks: 0,
          leadsMeta: 0,
          leadsOpsys: 0,
        },
      ],
      "2026-10-01",
      "2026-10-03",
    );
    expect(rows.map((r) => r.date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(rows[1]).toMatchObject({ spendMinor: 150, leadsMeta: 1, leadsOpsys: 1 });
    expect(rows[0]!.spendMinor).toBe(0);
  });
});

describe("období", () => {
  it("předvolby 7, 30, 90 dní a měsíc", () => {
    expect(periodFromPreset("7d", "2026-10-15")).toEqual({ from: "2026-10-09", to: "2026-10-15" });
    expect(periodFromPreset("30d", "2026-10-15")).toEqual({ from: "2026-09-16", to: "2026-10-15" });
    expect(periodFromPreset("90d", "2026-10-15")).toEqual({ from: "2026-07-18", to: "2026-10-15" });
    expect(periodFromPreset("month", "2026-10-15")).toEqual({
      from: "2026-10-01",
      to: "2026-10-15",
    });
  });
  it("vlastní období; neplatné se nahradí 30 dny", () => {
    expect(
      periodFromPreset("custom", "2026-10-15", { from: "2026-01-01", to: "2026-01-31" }),
    ).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
    });
    expect(
      periodFromPreset("custom", "2026-10-15", { from: "2026-02-01", to: "2026-01-01" }),
    ).toEqual({
      from: "2026-09-16",
      to: "2026-10-15",
    });
  });
  it("okno přepisu je dnešek a 7 předchozích dní", () => {
    expect(rewriteWindow("2026-10-15")).toEqual({ from: "2026-10-08", to: "2026-10-15" });
    expect(rewriteWindow("2026-03-02")).toEqual({ from: "2026-02-23", to: "2026-03-02" });
  });
});

describe("převody z Meta API", () => {
  it("částka v měně účtu na haléře bez chyb pohyblivé čárky", () => {
    expect(toMinor("123.45")).toBe(12_345);
    expect(toMinor("0.29")).toBe(29);
    expect(toMinor("19.999")).toBe(2_000);
    expect(toMinor("5")).toBe(500);
    expect(toMinor(1.1)).toBe(110);
    expect(toMinor("abc")).toBe(0);
    expect(toMinor("-3")).toBe(0);
    expect(toMinor(undefined)).toBe(0);
  });
  it("počty", () => {
    expect(toCount("1234")).toBe(1234);
    expect(toCount("x")).toBe(0);
    expect(toCount(-1)).toBe(0);
  });
  it("leady z `actions`: první nalezený typ, bez sčítání duplicit", () => {
    expect(
      leadsFromActions([
        { action_type: "link_click", value: "40" },
        { action_type: "lead", value: "3" },
        { action_type: "onsite_conversion.lead_grouped", value: "3" },
      ]),
    ).toBe(3);
    expect(leadsFromActions([{ action_type: "link_click", value: "40" }])).toBe(0);
    expect(leadsFromActions(undefined)).toBe(0);
  });
});

describe("rozbor leadu z n8n", () => {
  it("formát Meta `fieldData` s českými názvy polí", () => {
    const p = payload({
      fieldData: [
        { name: "Jméno a příjmení", values: ["Jan Novák"] },
        { name: "E-mail", values: ["jan@firma.cz"] },
        { name: "Telefonní číslo", values: ["+420 777 123 456"] },
        { name: "Název firmy", values: ["Firma s.r.o."] },
        { name: "IČO", values: ["27082440"] },
      ],
    });
    expect(parseLead(p)).toEqual({
      name: "Jan Novák",
      email: "jan@firma.cz",
      phone: "+420 777 123 456",
      companyName: "Firma s.r.o.",
      ico: "27082440",
    });
  });
  it("anglická pole Meta a složení jména z křestního a příjmení", () => {
    const p = payload({
      fieldData: [
        { name: "first_name", values: ["Eva"] },
        { name: "last_name", values: ["Svobodová"] },
        { name: "email", values: ["eva@x.cz"] },
        { name: "phone_number", values: ["777111222"] },
      ],
    });
    expect(parseLead(p)).toMatchObject({
      name: "Eva Svobodová",
      email: "eva@x.cz",
      phone: "777111222",
    });
  });
  it("přímá pole mají přednost před `fields` a ta před `fieldData`", () => {
    const p = payload({
      email: "primo@x.cz",
      fields: { email: "fields@x.cz", phone: "111" },
      fieldData: [
        { name: "email", values: ["data@x.cz"] },
        { name: "phone", values: ["222"] },
      ],
    });
    expect(parseLead(p)).toMatchObject({ email: "primo@x.cz", phone: "111" });
  });
  it("bez jména se použije e-mail, pak telefon, jinak „Neznámý kontakt“", () => {
    expect(parseLead(payload({ email: "a@b.cz" })).name).toBe("a@b.cz");
    expect(parseLead(payload({ phone: "777" })).name).toBe("777");
    expect(parseLead(payload({})).name).toBe("Neznámý kontakt");
  });
  it("ID z n8n mohou být čísla; prázdné hodnoty se ignorují", () => {
    const p = payload({ leadgenId: 123456789, formId: 42, campaignId: 7, fields: { email: "  " } });
    expect(p.leadgenId).toBe("123456789");
    expect(p.formId).toBe("42");
    expect(p.campaignId).toBe("7");
    expect(parseLead(p).email).toBeUndefined();
  });
  it("tělo bez leadgenId nebo formId neprojde", () => {
    expect(leadIngestPayload.safeParse({ formId: "1" }).success).toBe(false);
    expect(leadIngestPayload.safeParse({ leadgenId: "1" }).success).toBe(false);
    expect(leadIngestPayload.safeParse({ leadgenId: "  ", formId: "1" }).success).toBe(false);
  });
  it("normalizace názvu pole a čas vytvoření", () => {
    expect(normalizeFieldKey("Telefonní číslo")).toBe("telefonni_cislo");
    expect(normalizeFieldKey(" E-mail ")).toBe("e_mail");
    expect(parseLeadTime("2026-10-14T10:00:00+0200")?.toISOString()).toBe(
      "2026-10-14T08:00:00.000Z",
    );
    expect(parseLeadTime(1_760_000_000)?.getUTCFullYear()).toBe(2025);
    expect(parseLeadTime("nesmysl")).toBeNull();
    expect(parseLeadTime(null)).toBeNull();
  });
  it("název obchodu: formulář, jinak kampaň, jinak Meta lead", () => {
    expect(leadDealTitle("Jan", { formName: "Web zdarma", campaignName: "K1" })).toBe(
      "Jan – Web zdarma",
    );
    expect(leadDealTitle("Jan", { formName: null, campaignName: "K1" })).toBe("Jan – K1");
    expect(leadDealTitle("Jan", {})).toBe("Jan – Meta lead");
    expect(leadDealTitle("x".repeat(300), {}).length).toBe(160);
  });
});
