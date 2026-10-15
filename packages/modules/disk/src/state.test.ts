import { describe, expect, it } from "vitest";
import {
  applyRequestSignal,
  deriveFolderState,
  driveButtonModel,
  isOverdue,
  planClientFolder,
  type RequestSignal,
} from "./state";
import type { DriveFolderInfo, DriveRequestState } from "./types";

describe("stavový automat požadavku", () => {
  const t = (s: DriveRequestState, sig: RequestSignal) => applyRequestSignal(s, sig).state;

  it("pending → sent po doručení do n8n, jinak se nic nemění", () => {
    expect(t("pending", "delivered")).toBe("sent");
    expect(t("sent", "delivered")).toBe("sent");
    expect(applyRequestSignal("sent", "delivered").changed).toBe(false);
  });

  it("odpověď n8n: ok → done, chyba → error", () => {
    expect(t("pending", "ok")).toBe("done");
    expect(t("sent", "ok")).toBe("done");
    expect(t("sent", "error")).toBe("error");
    expect(t("pending", "error")).toBe("error");
  });

  it("vypršení času platí jen pro otevřené požadavky", () => {
    expect(t("pending", "timeout")).toBe("timeout");
    expect(t("sent", "timeout")).toBe("timeout");
    expect(t("done", "timeout")).toBe("done");
    expect(t("error", "timeout")).toBe("error");
  });

  it("pozdní odpověď po vypršení nebo chybě stále platí", () => {
    expect(t("timeout", "ok")).toBe("done");
    expect(t("error", "ok")).toBe("done");
    expect(t("timeout", "error")).toBe("error");
  });

  it("hotový požadavek už žádný signál nezmění (chyba nepřepíše hotovou složku)", () => {
    for (const sig of ["delivered", "ok", "error", "timeout", "delivery_failed"] as const)
      expect(applyRequestSignal("done", sig)).toEqual({ state: "done", changed: false });
  });

  it("selhání doručení do n8n je chyba", () => {
    expect(t("pending", "delivery_failed")).toBe("error");
    expect(t("sent", "delivery_failed")).toBe("error");
  });
});

describe("vypršení po 10 minutách", () => {
  const sent = new Date("2026-10-14T10:00:00Z");
  const req = (over: Partial<Parameters<typeof isOverdue>[0]> = {}) => ({
    state: "sent" as const,
    requestedAt: sent,
    sentAt: sent,
    blockedBy: null,
    ...over,
  });

  it("do 10 minut ne, po 10 minutách ano", () => {
    expect(isOverdue(req(), new Date("2026-10-14T10:09:59Z"))).toBe(false);
    expect(isOverdue(req(), new Date("2026-10-14T10:10:01Z"))).toBe(true);
  });

  it("hotový a neúspěšný požadavek nevyprší", () => {
    const late = new Date("2026-10-14T12:00:00Z");
    expect(isOverdue(req({ state: "done" }), late)).toBe(false);
    expect(isOverdue(req({ state: "error" }), late)).toBe(false);
  });

  it("požadavek čekající na jiný ještě neodešel a nevyprší", () => {
    expect(isOverdue(req({ blockedBy: "x", sentAt: null }), new Date("2026-10-14T13:00:00Z"))).toBe(
      false,
    );
  });

  it("čas se počítá od odeslání, ne od vzniku", () => {
    const later = new Date("2026-10-14T10:08:00Z");
    expect(
      isOverdue(req({ requestedAt: sent, sentAt: later }), new Date("2026-10-14T10:15:00Z")),
    ).toBe(false);
    expect(
      isOverdue(req({ requestedAt: sent, sentAt: null }), new Date("2026-10-14T10:15:00Z")),
    ).toBe(true);
  });
});

describe("stav složky", () => {
  const f = (over: Partial<Parameters<typeof deriveFolderState>[0]> = {}) =>
    deriveFolderState({ hasFolder: false, createOpen: false, latestCreate: null, ...over });

  it("bez složky a bez požadavku: none", () => expect(f()).toBe("none"));
  it("zakládá se: pending", () => expect(f({ createOpen: true })).toBe("pending"));
  it("existující složka je ready i při neúspěšné pozdější úpravě", () =>
    expect(f({ hasFolder: true, latestCreate: { state: "error" } })).toBe("ready"));
  it("neúspěšné založení: error a timeout", () => {
    expect(f({ latestCreate: { state: "error" } })).toBe("error");
    expect(f({ latestCreate: { state: "timeout" } })).toBe("timeout");
  });
  it("hotový požadavek bez uložené složky je chyba, ne none", () =>
    expect(f({ latestCreate: { state: "done" } })).toBe("error"));
});

describe("změna stavu klienta → akce na Disku (DRV-02)", () => {
  const none = { known: false, archived: false };
  const known = { known: true, archived: false };
  const archived = { known: true, archived: true };
  const plan = (
    to: Parameters<typeof planClientFolder>[0]["to"],
    folder = none,
    isPrivate = false,
  ) => planClientFolder({ to, isPrivate, folder });

  it("Lead a Aktivní bez složky založí složku", () => {
    expect(plan("lead")).toBe("create");
    expect(plan("active")).toBe("create");
  });

  it("Aktivní se složkou nedělá nic (složka už existuje nebo se zakládá)", () => {
    expect(plan("active", known)).toBe("none");
  });

  it("Pozastavený nedělá nic", () => {
    expect(plan("paused")).toBe("none");
    expect(plan("paused", known)).toBe("none");
  });

  it("Bývalý přesune existující složku do Archivu, bez složky nic", () => {
    expect(plan("former", known)).toBe("archive");
    expect(plan("former")).toBe("none");
    expect(plan("former", archived)).toBe("none");
  });

  it("návrat z Bývalého vrátí složku z Archivu", () => {
    expect(plan("active", archived)).toBe("restore");
    expect(plan("lead", archived)).toBe("restore");
    expect(plan("paused", archived)).toBe("restore");
  });

  it("zrušený stav nedělá nic", () => {
    expect(plan(null, known)).toBe("none");
  });

  it("R-13: soukromý klient složku sám nezakládá, ale existující archivuje a obnovuje", () => {
    expect(plan("active", none, true)).toBe("none");
    expect(plan("lead", none, true)).toBe("none");
    expect(plan("former", known, true)).toBe("archive");
    expect(plan("active", archived, true)).toBe("restore");
  });
});

describe("tlačítko Otevřít Disk (DRV-05)", () => {
  const info = (
    over: Partial<DriveFolderInfo>,
  ): Pick<DriveFolderInfo, "state" | "url" | "isPrivate" | "issue"> => ({
    state: "none",
    url: null,
    isPrivate: false,
    issue: null,
    ...over,
  });

  it("složka existuje: Otevřít Disk s odkazem", () => {
    const m = driveButtonModel(
      info({ state: "ready", url: "https://drive.google.com/drive/folders/abc" }),
      true,
    );
    expect(m).toMatchObject({
      kind: "open",
      label: "Otevřít Disk",
      href: "https://drive.google.com/drive/folders/abc",
      disabled: false,
      showIssue: false,
    });
  });

  it("zakládá se: Vytváří se… a nejde stisknout", () => {
    expect(driveButtonModel(info({ state: "pending" }), true)).toMatchObject({
      kind: "wait",
      label: "Vytváří se…",
      disabled: true,
    });
  });

  it("chyba i vypršení času: Zkusit znovu", () => {
    for (const state of ["error", "timeout"] as const)
      expect(driveButtonModel(info({ state }), true)).toMatchObject({
        kind: "retry",
        label: "Zkusit znovu",
        disabled: false,
      });
  });

  it("bez složky: Vytvořit složku; u soukromého záznamu s varováním", () => {
    expect(driveButtonModel(info({ state: "none" }), true)).toMatchObject({
      kind: "create",
      label: "Vytvořit složku",
      needsPrivateWarning: false,
    });
    expect(driveButtonModel(info({ state: "none", isPrivate: true }), true)).toMatchObject({
      kind: "create",
      needsPrivateWarning: true,
    });
  });

  it("bez oprávnění zapisovat jsou akce neaktivní, otevření ne", () => {
    expect(driveButtonModel(info({ state: "none" }), false).disabled).toBe(true);
    expect(driveButtonModel(info({ state: "error" }), false).disabled).toBe(true);
    expect(
      driveButtonModel(
        info({ state: "ready", url: "https://drive.google.com/drive/folders/a" }),
        false,
      ).disabled,
    ).toBe(false);
  });

  it("existující složka s neúspěšnou úpravou ukáže upozornění", () => {
    const issue = {
      requestId: "r",
      event: "client.rename" as const,
      state: "error" as const,
      message: "x",
      at: "2026-10-14T10:00:00Z",
    };
    expect(
      driveButtonModel(
        info({ state: "ready", url: "https://drive.google.com/drive/folders/a", issue }),
        true,
      ).showIssue,
    ).toBe(true);
  });
});
