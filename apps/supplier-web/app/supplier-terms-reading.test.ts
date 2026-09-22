import { describe, expect, it } from "vitest";
import { addViewedRange, viewedEntireDocument } from "./supplier-terms-reading";

describe("supplier legal document reading", () => {
  it("does not count a jump to the end as reading the omitted middle", () => {
    const ranges = addViewedRange(addViewedRange([], 0, 400), 1600, 2000);
    expect(viewedEntireDocument(ranges, 2000)).toBe(false);
    expect(viewedEntireDocument(addViewedRange(ranges, 390, 1610), 2000)).toBe(true);
  });
  it("handles overlapping keyboard/touch viewports and reverse scrolling", () => {
    let ranges = addViewedRange([], 600, 1000);
    ranges = addViewedRange(ranges, 300, 700);
    ranges = addViewedRange(ranges, 0, 400);
    expect(viewedEntireDocument(ranges, 1000)).toBe(true);
  });
  it("does not accept an empty document or an unviewed beginning", () => {
    expect(viewedEntireDocument([], 0)).toBe(false);
    expect(viewedEntireDocument([[200, 900]], 900)).toBe(false);
  });
});
