import { describe, expect, it } from "vitest";
import { canSubmitProductCorrection } from "./product-corrections-validation";

describe("canSubmitProductCorrection", () => {
  const valid = {
    busy: false,
    productId: "product-1",
    proposedValue: "Новая редакция",
    reason: "Есть подтверждение производителя",
  };

  it("allows a complete correction", () => {
    expect(canSubmitProductCorrection(valid)).toBe(true);
  });

  it("keeps submit disabled while request is running", () => {
    expect(canSubmitProductCorrection({ ...valid, busy: true })).toBe(false);
  });

  it("requires a product, proposed value and meaningful reason", () => {
    expect(canSubmitProductCorrection({ ...valid, productId: "" })).toBe(false);
    expect(canSubmitProductCorrection({ ...valid, proposedValue: " " })).toBe(false);
    expect(canSubmitProductCorrection({ ...valid, reason: "коротко" })).toBe(false);
  });
});
