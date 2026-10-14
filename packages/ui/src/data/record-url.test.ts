import { describe, expect, it } from "vitest";
import { readRecordParam, withRecordParam } from "./record-url";

const ID = "3f2c1a90-1111-4222-8333-444455556666";

describe("readRecordParam", () => {
  it("přečte id záznamu z adresy", () => {
    expect(readRecordParam(`?record=${ID}`)).toBe(ID);
    expect(readRecordParam(`?pohled=x&record=${ID}`)).toBe(ID);
  });

  it("bez parametru nebo s prázdným vrátí null", () => {
    expect(readRecordParam("")).toBeNull();
    expect(readRecordParam("?pohled=x")).toBeNull();
    expect(readRecordParam("?record=")).toBeNull();
    expect(readRecordParam("?record=%20")).toBeNull();
  });
});

describe("withRecordParam", () => {
  it("přidá record a zachová ostatní parametry", () => {
    expect(withRecordParam("/crm?pohled=abc", ID)).toBe(`/crm?pohled=abc&record=${ID}`);
    expect(withRecordParam("/crm", ID)).toBe(`/crm?record=${ID}`);
  });

  it("změna záznamu přepíše id a zahodí záložku předchozího", () => {
    expect(withRecordParam(`/crm?record=old&tab=aktivita&sub=x`, ID)).toBe(`/crm?record=${ID}`);
  });

  it("zavření odebere record i záložku, filtr zůstane", () => {
    expect(withRecordParam(`/crm?pohled=abc&record=${ID}&tab=rozpocet`, null)).toBe(
      "/crm?pohled=abc",
    );
    expect(withRecordParam(`/crm?record=${ID}`, null)).toBe("/crm");
  });

  it("keepTab zachová záložku (otevření přímým odkazem)", () => {
    expect(withRecordParam(`/crm?tab=aktivita`, ID, { keepTab: true })).toBe(
      `/crm?tab=aktivita&record=${ID}`,
    );
  });

  it("zachová hash", () => {
    expect(withRecordParam("/crm#top", ID)).toBe(`/crm?record=${ID}#top`);
  });
});
