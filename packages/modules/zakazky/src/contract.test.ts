import { describe, expect, it } from "vitest";
import {
  createInput,
  jobFromDealRow,
  phasesEditInput,
  retainerSetup,
  setPhaseInput,
  templatePayload,
} from "./contract";

const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";

describe("obsah šablony", () => {
  it("prázdný obsah se doplní výchozími hodnotami", () => {
    expect(templatePayload.parse({})).toEqual({ v: 1, phases: [], tasks: [], payments: [] });
  });

  it("úkol dostane výchozí typ, prioritu a řešitele", () => {
    const p = templatePayload.parse({ phases: [{ name: "A" }], tasks: [{ title: "Zavolat" }] });
    expect(p.tasks[0]).toMatchObject({
      phaseIndex: 0,
      typeKey: "task",
      priority: "medium",
      assignee: { rule: "owner" },
      dueOffsetDays: null,
    });
  });

  it("odmítne úkol s neexistující fází, řešitele „uživatel“ bez uživatele a dvě stejné role", () => {
    expect(
      templatePayload.safeParse({ phases: [{ name: "A" }], tasks: [{ title: "x", phaseIndex: 3 }] })
        .success,
    ).toBe(false);
    expect(
      templatePayload.safeParse({
        phases: [{ name: "A" }],
        tasks: [{ title: "x", assignee: { rule: "user" } }],
      }).success,
    ).toBe(false);
    expect(
      templatePayload.safeParse({
        phases: [
          { name: "A", role: "retainer" },
          { name: "B", role: "retainer" },
        ],
      }).success,
    ).toBe(false);
  });

  it("platba musí mít kladnou částku a fakturujícího", () => {
    expect(
      templatePayload.safeParse({ payments: [{ description: "x", amountMinor: 0 }] }).success,
    ).toBe(false);
    expect(
      templatePayload.safeParse({
        payments: [{ description: "x", amountMinor: 100, issuer: { rule: "user" } }],
      }).success,
    ).toBe(false);
    expect(
      templatePayload.safeParse({ payments: [{ description: "x", amountMinor: 100 }] }).success,
    ).toBe(true);
  });
});

describe("vstupy příkazů", () => {
  it("založení zakázky: výchozí členové, nepovinná šablona", () => {
    const i = createInput.parse({ title: "Web", type: "web", companyId: U1, ownerId: U2 });
    expect(i.memberIds).toEqual([]);
    expect(i.templateId).toBeUndefined();
    expect(
      createInput.safeParse({ title: " ", type: "web", companyId: U1, ownerId: U2 }).success,
    ).toBe(false);
    expect(
      createInput.safeParse({ title: "x", type: "stavba", companyId: U1, ownerId: U2 }).success,
    ).toBe(false);
    expect(
      createInput.safeParse({
        title: "x",
        type: "web",
        companyId: U1,
        ownerId: U2,
        startDate: "14.10.2026",
      }).success,
    ).toBe(false);
  });

  it("řádek dialogu po výhře potřebuje šablonu (nebo null), start, vlastníka a členy", () => {
    const row = {
      type: "marketing",
      templateId: null,
      title: "Novák – Marketing",
      startDate: "2026-10-14",
      ownerId: U1,
      memberIds: [],
    };
    expect(jobFromDealRow.safeParse(row).success).toBe(true);
    expect(jobFromDealRow.safeParse({ ...row, startDate: undefined }).success).toBe(false);
  });

  it("nastavení retaineru: den vystavení 1–28, kladná částka, měsíc RRRR-MM", () => {
    const ok = {
      amountMinor: 1_500_000,
      fromMonth: "2026-12",
      issueDay: 5,
      issuerMode: "alternate",
      issuerId: U1,
      split: [],
    };
    expect(retainerSetup.safeParse(ok).success).toBe(true);
    expect(retainerSetup.safeParse({ ...ok, issueDay: 29 }).success).toBe(false);
    expect(retainerSetup.safeParse({ ...ok, fromMonth: "2026-13" }).success).toBe(false);
    expect(retainerSetup.safeParse({ ...ok, amountMinor: 0 }).success).toBe(false);
  });

  it("nastavení fáze: právě jedno z phaseId a phaseName", () => {
    expect(setPhaseInput.safeParse({ jobId: U1, phaseId: U2 }).success).toBe(true);
    expect(setPhaseInput.safeParse({ jobId: U1, phaseName: "Vývoj" }).success).toBe(true);
    expect(setPhaseInput.safeParse({ jobId: U1 }).success).toBe(false);
    expect(setPhaseInput.safeParse({ jobId: U1, phaseId: U2, phaseName: "x" }).success).toBe(false);
  });

  it("úprava fází: aspoň jedna fáze", () => {
    expect(phasesEditInput.safeParse({ jobId: U1, phases: [] }).success).toBe(false);
    expect(phasesEditInput.safeParse({ jobId: U1, phases: [{ name: "A" }] }).success).toBe(true);
  });
});
