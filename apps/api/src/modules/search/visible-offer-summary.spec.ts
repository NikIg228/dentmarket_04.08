import { describe, expect, it } from "vitest";
import { visibleOfferSummary } from "./visible-offer-summary";
describe("admitted visible offer aggregates", () => {
  it("does not report cached availability or prices when no admitted offer remains", () => {
    expect(visibleOfferSummary([])).toEqual({ minNormalizedPriceMinor: null, maxNormalizedPriceMinor: null, isAvailable: false });
  });
  it("preserves exact decimal money and summarizes only eligible offers", () => {
    expect(visibleOfferSummary([{ normalizedPriceMinor: "9007199254740993.25", available: false }, { normalizedPriceMinor: "9007199254740992.75", available: true }])).toEqual({ minNormalizedPriceMinor: "9007199254740992.75", maxNormalizedPriceMinor: "9007199254740993.25", isAvailable: true });
  });
});
