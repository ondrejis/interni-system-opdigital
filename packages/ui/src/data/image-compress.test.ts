import { describe, expect, it } from "vitest";
import { fitWithin } from "./image-compress";

describe("fitWithin", () => {
  it("zmenší na nejdelší stranu a drží poměr", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(1000, 1000, 1600)).toEqual({ width: 1000, height: 1000 });
    expect(fitWithin(1600, 900, 1600)).toEqual({ width: 1600, height: 900 });
  });
  it("nikdy nevrátí nulový rozměr", () => {
    expect(fitWithin(10_000, 1, 1600)).toEqual({ width: 1600, height: 1 });
  });
});
